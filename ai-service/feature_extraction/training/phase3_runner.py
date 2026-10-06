"""Explicit Stage A baseline/training CLI. Importing this module never trains."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import random
import time

import torch
from torch.utils.data import DataLoader
from PIL import Image

from feature_extraction.model import ClothingModel
from feature_extraction.clothing_config import CLASS_NAMES,HEAD_NAMES,COLOR_THRESHOLD
from feature_extraction.preprocessing import preprocess_image
from feature_extraction.training.dataset import PartialLabelDataset,encode_color
from feature_extraction.training.checkpoints import load_training_checkpoint
from feature_extraction.training.engine import build_checkpoint,save_checkpoint
from feature_extraction.prediction_policy import mask_logits,supported_targets,PREDICTION_POLICY,UNSUPPORTED_CLASSES
from feature_extraction.training.phase3_manifest import load_manifest,csv_rows
from feature_extraction.training.phase3_stage_a import StageAProtection,masked_loss,train_class_weights,classification_metrics,CheckpointGate,stage_a_batches,ACTIVE_HEADS,SOURCE_QUOTAS

def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def seed_everything(seed):
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG',':4096:8')
    random.seed(seed);torch.manual_seed(seed);torch.set_num_threads(4)
    torch.backends.cudnn.benchmark=False;torch.backends.cudnn.deterministic=True
    torch.use_deterministic_algorithms(True)

def source_path(root,original):
    value=str(original).replace('\\','/')
    if '/datasets/' not in value:raise ValueError('Unknown Phase 2 original image root')
    candidate=(Path(root)/'datasets'/value.split('/datasets/',1)[1]).resolve()
    if not candidate.is_relative_to((Path(root)/'datasets').resolve()):raise ValueError('Escaping source path')
    return candidate

def encode_rows(rows):
    targets={h:torch.zeros(len(rows),len(CLASS_NAMES[h])) if h=='color' else torch.full((len(rows),),-100,dtype=torch.long) for h in HEAD_NAMES}
    masks={h:torch.zeros(len(rows),dtype=torch.bool) for h in HEAD_NAMES}
    for i,r in enumerate(rows):
        for h in HEAD_NAMES:
            value=r['labels'].get(h)
            if value is not None:
                targets[h][i]=torch.tensor(encode_color(value)) if h=='color' else CLASS_NAMES[h].index(value)
                masks[h][i]=True
    return targets,masks

def extract_validation(model,rows,batch_size=16):
    if any(r['split']!='val' for r in rows):raise ValueError('Only validation features may be cached')
    features=[];model.eval()
    with torch.inference_mode():
        for start in range(0,len(rows),batch_size):
            images=[]
            for r in rows[start:start+batch_size]:
                if sha(r['image_path'])!=r['sha256']:raise ValueError('Validation image hash changed')
                with Image.open(r['image_path']) as im:images.append(preprocess_image(im))
            features.append(model.extract_features(torch.stack(images)).cpu())
            if start%160==0:print('Validation features',min(start+batch_size,len(rows)),len(rows),flush=True)
    targets,masks=encode_rows(rows)
    return dict(features=torch.cat(features),targets=targets,masks=masks,ids=[r['uid'] for r in rows],hashes=[r['sha256'] for r in rows])

def linear_logits(model,features):
    # CPU float32 reference is identical before/after training. No GPU rounding
    # drift is mistaken for weight regression, and this never mutates the model.
    return {h:torch.nn.functional.linear(features,layer.weight.detach().cpu(),layer.bias.detach().cpu()) for h,layer in model.heads.items()}

def metrics_for(logits,cohort):
    result={};n=len(cohort['ids'])
    for h in HEAD_NAMES:
        mask=cohort['masks'][h].clone()
        if h!='color':mask &= supported_targets(h,cohort['targets'][h])
        truth=cohort['targets'][h][mask];predictions=logits[h][mask]
        if h=='color':
            positive=truth.bool();pred=predictions.sigmoid()>=COLOR_THRESHOLD
            tp=(positive & pred).sum(0);fp=(~positive & pred).sum(0);fn=(positive & ~pred).sum(0);support=positive.sum(0)
            f1=[float(2*tp[i]/(2*tp[i]+fp[i]+fn[i])) if support[i]>0 else None for i in range(len(support))]
            recall=[float(tp[i]/support[i]) if support[i]>0 else None for i in range(len(support))]
            denominator=2*tp.sum()+fp.sum()+fn.sum()
            result[h]=dict(labeled_samples=int(mask.sum()),positive_support=support.tolist(),recall=recall,f1=f1,
                macro_f1_supported=sum(v for v in f1 if v is not None)/sum(v is not None for v in f1) if any(v is not None for v in f1) else None,
                micro_f1=float(2*tp.sum()/denominator) if denominator>0 else None,
                binary_confusions=dict(tp=tp.tolist(),fp=fp.tolist(),fn=fn.tolist(),tn=(int(mask.sum())-tp-fp-fn).tolist()))
        else:
            size=len(CLASS_NAMES[h]);p=mask_logits(h,predictions).argmax(1)
            cm=torch.bincount(truth*size+p,minlength=size*size).reshape(size,size)
            result[h]=dict(classification_metrics(cm),labeled_samples=int(mask.sum()))
        result[h]['class_names']=list(CLASS_NAMES[h])
        result[h]['unsupported_classes']=UNSUPPORTED_CLASSES.get(h,[])
        result[h]['excluded_unsupported_ground_truth']=int(cohort['masks'][h].sum()-mask.sum())
    return dict(samples=n,heads=result)

def gate_metrics(phase2,phase3,cohort_hash):
    new=dict(occasion=phase3['heads']['occasion']['macro_f1_supported'],season=phase3['heads']['season']['macro_f1_supported'])
    protected={}
    for name,metrics in [('phase2',phase2),('phase3',phase3)]:
        cat=metrics['heads']['category']
        if name=='phase2':
            protected['phase2_category_accuracy']=cat['accuracy'];protected['phase2_category_macro_f1']=cat['macro_f1_supported']
        for i,v in enumerate(cat['recall']):
            if i!=8 and v is not None:protected[name+'_category_recall_'+CLASS_NAMES['category'][i]]=v
    for h in ('color','pattern','sleeve_length'):
        m=phase2['heads'][h]
        if m['macro_f1_supported'] is not None:protected['phase2_'+h+'_macro_f1']=m['macro_f1_supported']
    # Preserve any measured legacy supervision on the two trainable heads too.
    for h in ('occasion','season'):
        m=phase2['heads'][h]
        if m['accuracy'] is not None:
            protected['phase2_'+h+'_accuracy']=m['accuracy']
            protected['phase2_'+h+'_macro_f1']=m['macro_f1_supported']
            for i,recall in enumerate(m['recall']):
                if recall is not None:protected['phase2_'+h+'_recall_'+CLASS_NAMES[h][i]]=recall
    return dict(split='val',cohort_sha256=cohort_hash,new=new,protected=protected)

def init_model(checkpoint):
    model=ClothingModel(backbone_weights=None);loading=load_training_checkpoint(model,checkpoint)
    if loading['skipped_keys'] or set(loading['partially_loaded_keys'])!={'heads.category.weight','heads.category.bias'}:raise ValueError('Expected verified Phase 2 migration')
    # Keep ALL legacy category parameters byte-identical; row 8 stays inert
    # behind the deployment mask and is never interpreted as trained skirt.
    payload=torch.load(checkpoint,map_location='cpu',weights_only=True)
    with torch.no_grad():
        model.heads.category.weight.copy_(payload['state_dict']['heads.category.weight'])
        model.heads.category.bias.copy_(payload['state_dict']['heads.category.bias'])
    model.initialization_report=dict(loading=loading,category='all Phase2 rows preserved; legacy row 8 inert and masked',prediction_policy=PREDICTION_POLICY)
    return model

def baseline(root,manifest,checkpoint,output):
    root=Path(root).resolve();manifest=Path(manifest).resolve();checkpoint=Path(checkpoint).resolve();out=Path(output).resolve()
    if out.exists():raise FileExistsError('Baseline output already exists')
    started=time.monotonic();seed_everything(42);checkpoint_hash=sha(checkpoint)
    p2manifest=root/'artifacts/phase2_full_v2/phase2_manifest.csv';splitfile=root/'artifacts/phase2_training_seed42/splits.json'
    assignments=json.loads(splitfile.read_text());raw=csv_rows(p2manifest)
    if sha(p2manifest)!=assignments['manifest_sha256']:raise ValueError('Original Phase 2 manifest changed')
    p2rows=[]
    for a in assignments['assignments']:
        if a['split']!='val':continue
        row=raw[a['row']-1];labels={h:row[h] if row[h+'_valid']=='1' else None for h in HEAD_NAMES}
        if labels['category']=='kurti':raise ValueError('Legacy kurti validation targets require a separately preserved legacy evaluator; never relabel as skirt')
        p2rows.append(dict(uid='phase2:'+a['image_sha256'],split='val',image_path=str(source_path(root,row['image_path'])),sha256=a['image_sha256'],labels=labels))
    if len(p2rows)!=1073:raise ValueError('Original validation cohort changed')
    p3rows=load_manifest(manifest,root/'datasets',split='val')
    if len(p3rows)!=727:raise ValueError('Phase 3 validation cohort changed')
    model=init_model(checkpoint);model.eval();cohorts={'phase2':extract_validation(model,p2rows),'phase3':extract_validation(model,p3rows)}
    with torch.inference_mode():
        logits={name:linear_logits(model,c['features']) for name,c in cohorts.items()}
        payload=torch.load(checkpoint,map_location='cpu',weights_only=True)
        original=dict(logits['phase2']);original['category']=torch.nn.functional.linear(cohorts['phase2']['features'],payload['state_dict']['heads.category.weight'],payload['state_dict']['heads.category.bias'])
        oldpred=mask_logits('category',original['category']).argmax(1);newpred=mask_logits('category',logits['phase2']['category']).argmax(1)
        original_metrics=metrics_for(original,cohorts['phase2']);p2=metrics_for(logits['phase2'],cohorts['phase2']);p3=metrics_for(logits['phase3'],cohorts['phase3'])
        original_metrics['heads']['category']['class_names']=list(payload['class_names']['category'])
    if not torch.equal(oldpred,newpred):raise ValueError('Initial category migration changed old predictions')
    if abs(original_metrics['heads']['category']['accuracy']-331/415)>1e-6:raise ValueError('Original 79.76% baseline was not reproduced')
    preserved=[]
    for k,v in model.state_dict().items():
        source=payload['state_dict'][k]
        exact=torch.equal(v,source)
        if not exact:raise ValueError('Protected tensor changed: '+k)
        preserved.append(k)
    cohort_hash=hashlib.sha256((sha(splitfile)+sha(manifest)+'|official_preprocess_cpu_float32').encode()).hexdigest()
    gate=gate_metrics(p2,p3,cohort_hash);CheckpointGate(gate)
    report=dict(split='val',manifest_sha256=sha(manifest),checkpoint_sha256=checkpoint_hash,phase2_split_sha256=sha(splitfile),phase2_manifest_sha256=sha(p2manifest),
        original_phase2=original_metrics,migrated_phase2=p2,phase3=p3,old_category_predictions_changed=int((oldpred!=newpred).sum()),protected_tensors_exact=preserved,
        original_category_class_names=payload['class_names']['category'],loading=model.initialization_report,gate_baseline=gate,
        inference_configuration=dict(backbone='EfficientNet-B0',feature_dim=1280,image_size=224,resize_shorter_edge=256,interpolation='bicubic',crop='center',normalization_mean=[.485,.456,.406],normalization_std=[.229,.224,.225],color_threshold=COLOR_THRESHOLD,classification='raw-logit argmax',color='sigmoid multilabel',evaluation_device='CPU float32 fixed-backbone validation feature cache',torch_version=str(torch.__version__),class_names=CLASS_NAMES),
        phase1_holdout_gap='Original Phase 1 holdout source unavailable. Do not unfreeze sleeves/pattern/backbone without restoring it or accepting a separately justified later-stage validation plan.',
        training_started=False,test_evaluated=False,runtime_seconds=time.monotonic()-started)
    cache=dict(prediction_policy=PREDICTION_POLICY,original_phase2_raw_predictions=original['category'].argmax(1),cohorts=cohorts,baseline_logits=logits,original_phase2_predictions=oldpred,gate=gate,manifest_sha256=sha(manifest),checkpoint_sha256=checkpoint_hash,class_names={h:list(v) for h,v in CLASS_NAMES.items()})
    if sha(checkpoint)!=checkpoint_hash:raise ValueError('Source checkpoint changed')
    out.mkdir(parents=True);torch.save(cache,out/'validation_features.pt')
    report['validation_cache_sha256']=sha(out/'validation_features.pt')
    (out/'baseline.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(dict(phase2_category=original_metrics['heads']['category']['accuracy'],migrated_category=p2['heads']['category']['accuracy'],phase3=p3,old_predictions_changed=report['old_category_predictions_changed'],runtime_seconds=report['runtime_seconds']),indent=2));return report

def evaluate_cached(model,cache):
    with torch.inference_mode():
        logits={name:linear_logits(model,c['features']) for name,c in cache['cohorts'].items()}
        metrics={name:metrics_for(logits[name],c) for name,c in cache['cohorts'].items()}
        gate=gate_metrics(metrics['phase2'],metrics['phase3'],cache['gate']['cohort_sha256'])
        changes=int((mask_logits('category',logits['phase2']['category']).argmax(1)!=cache['original_phase2_predictions']).sum())
        if 'original_phase2_raw_predictions' in cache:changes+=int((logits['phase2']['category'].argmax(1)!=cache['original_phase2_raw_predictions']).sum())
        frozen_identical=all(torch.equal(logits[name][h],cache['baseline_logits'][name][h]) for name in logits for h in ('color','category','sleeve_length','pattern'))
    return metrics,gate,changes,frozen_identical

def establish_local_reference(model,cache):
    """Allow harmless CPU-library rounding when relocating Windows -> Kaggle.

    Never refit weights or alter labels/baseline metrics. Require unchanged metrics
    and old argmax, and bounded numerical drift, then compare exact frozen logits
    against this same-machine reference throughout training.
    """
    metrics,local_gate,changes,_=evaluate_cached(model,cache)
    if changes or local_gate!=cache['gate']:raise ValueError('Relocated baseline predictions/metrics changed')
    reference={name:linear_logits(model,c['features']) for name,c in cache['cohorts'].items()}
    drift=0.
    for name,heads in reference.items():
        for h,value in heads.items():
            previous=cache['baseline_logits'][name][h]
            if not torch.allclose(value,previous,atol=1e-5,rtol=1e-5):raise ValueError('Relocated baseline numerical drift exceeds tolerance')
            drift=max(drift,float((value-previous).abs().max()))
    cache['baseline_logits']=reference
    return dict(max_absolute_reference_logit_drift=drift,old_predictions_changed=changes,baseline_metrics_unchanged=True)

def checkpoint_validation(metrics):
    # Preserve the established six-head checkpoint schema; absent losses stay None.
    heads={}
    for h,m in metrics['heads'].items():
        heads[h]=dict(m,loss=None,accuracy=m.get('accuracy'),per_class={c:dict(labeled_samples=m.get('support',m.get('positive_support',[0]*len(CLASS_NAMES[h])))[i],recall=m['recall'][i],f1=m['f1'][i]) for i,c in enumerate(CLASS_NAMES[h])})
    return dict(samples=metrics['samples'],total_loss=0.,heads=heads)

def train(args):
    started=time.monotonic();seed_everything(42)
    config=json.loads(Path(args.config).read_text());manifest=Path(args.manifest);checkpoint=Path(args.checkpoint);base=Path(args.baseline);out=Path(args.output).resolve()
    if out.exists():raise FileExistsError('Use a new Stage A run directory')
    if config['stage']!='A' or config['source_quotas']!=SOURCE_QUOTAS or config['batch_size']!=32 or config['seed']!=42:raise ValueError('Unsupported Stage A config')
    if config.get('prediction_policy')!=PREDICTION_POLICY or config['frozen_heads']!=['color','category','sleeve_length','pattern']:raise ValueError('Unsafe deployment support config')
    if config['backbone_trainable'] or config['weight_decay']!=0 or config['category_trainable_rows']!=[]:raise ValueError('Unsafe Stage A config')
    if config['batchnorm_updates'] or config['active_heads']!=list(ACTIVE_HEADS) or config['max_epochs']<1 or config['patience']<1 or config['batches_per_epoch']!=48:raise ValueError('Unsafe Stage A schedule')
    report=json.loads((base/'baseline.json').read_text());cache_path=base/'validation_features.pt'
    if sha(cache_path)!=report['validation_cache_sha256']:raise ValueError('Baseline cache changed')
    cache=torch.load(cache_path,map_location='cpu',weights_only=True)
    if sha(manifest)!=cache['manifest_sha256'] or sha(checkpoint)!=cache['checkpoint_sha256']:raise ValueError('Baseline input mismatch')
    if cache.get('prediction_policy')!=PREDICTION_POLICY:raise ValueError('Baseline prediction policy mismatch')
    if cache['class_names']!={h:list(v) for h,v in CLASS_NAMES.items()}:raise ValueError('Baseline taxonomy mismatch')
    rows=load_manifest(manifest,args.data_root,split='train')
    for r in rows:
        if sha(r['image_path'])!=r['sha256']:raise ValueError('Training image hash changed')
    eligible=[r for r in rows if r['source'] in SOURCE_QUOTAS and any(r['valid'][h] for h in ACTIVE_HEADS)]
    # Preflight every planned epoch before an optimizer update or checkpoint write.
    for epoch in range(config['max_epochs']):list(stage_a_batches(eligible,epoch=epoch,batches=config['batches_per_epoch']))
    weights=train_class_weights(eligible,CLASS_NAMES)
    model=init_model(checkpoint);device=torch.device(args.device)
    if device.type=='cuda' and not torch.cuda.is_available():raise ValueError('CUDA unavailable')
    model.to(device);protection=StageAProtection(model,lr=config['learning_rate']);gate=CheckpointGate(cache['gate'],patience=config['patience'])
    weights={h:w.to(device) for h,w in weights.items()}
    relocation=establish_local_reference(model,cache)
    initial_metrics,_,changes,frozen=evaluate_cached(model,cache)
    if changes or not frozen:raise ValueError('Initial regression check failed')
    dataset=PartialLabelDataset([(r['image_path'],r['labels']) for r in eligible],'train')
    out.mkdir(parents=True);(out/'configuration.json').write_text(json.dumps(config,indent=2));(out/'baseline_relocation_check.json').write_text(json.dumps(relocation,indent=2));accepted=None
    for epoch in range(config['max_epochs']):
        protection.train_mode();torch.manual_seed(42+epoch)
        batches=list(stage_a_batches(eligible,epoch=epoch,batches=config['batches_per_epoch']))
        loader=DataLoader(dataset,batch_sampler=batches,num_workers=args.workers,pin_memory=device.type=='cuda',generator=torch.Generator().manual_seed(42+epoch))
        loss_total=0.;updates=0
        for images,targets,masks in loader:
            images=images.to(device);targets={h:t.to(device) for h,t in targets.items()};masks={h:m.to(device) for h,m in masks.items()}
            loss=masked_loss(model(images),targets,masks,weights)
            if loss is not None:protection.step(loss);loss_total+=float(loss.detach());updates+=1
        protection.assert_preserved();metrics,candidate,changes,frozen=evaluate_cached(model,cache);decision=gate.consider(candidate,frozen,changes==0)
        record=dict(epoch=epoch+1,training_loss=loss_total/max(1,updates),updates=updates,metrics=metrics,old_phase2_category_predictions_changed=changes,frozen_validation_logits_identical=frozen,checkpoint_gate=decision)
        with (out/'epochs.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(record)+'\n');f.flush()
        print(json.dumps(record),flush=True)
        if decision['eligible']:
            payload=build_checkpoint(model,epoch+1,checkpoint_validation(metrics['phase3']),'phase3_stage_a',config,active_heads=ACTIVE_HEADS,phase='phase3',class_weights=weights)
            payload['trained']=True  # Only after the measured validation/regression gate passes.
            payload['prediction_policy']=PREDICTION_POLICY
            payload['training_metadata'].update(baseline=report,regression_gate=decision,original_phase2_validation=metrics['phase2'],validation_metrics=metrics['phase3'],manifest_sha256=sha(manifest),initialization=model.initialization_report,source_checkpoint_sha256=cache['checkpoint_sha256'],protected_category_rows=list(range(12)),prediction_policy=PREDICTION_POLICY,unsupported_classes=UNSUPPORTED_CLASSES,source_balancing=SOURCE_QUOTAS)
            accepted=out/'phase3_stage_a_best.pt';save_checkpoint(payload,accepted)
        if decision['early_stop']:break
    best_metrics=None
    if accepted:
        payload=torch.load(accepted,map_location=device,weights_only=True);model.load_state_dict(payload['state_dict'],strict=True);protection.assert_preserved()
        best_metrics,_,changes,frozen=evaluate_cached(model,cache)
        if changes or not frozen:raise RuntimeError('Accepted checkpoint failed final regression check')
    if sha(checkpoint)!=cache['checkpoint_sha256']:raise RuntimeError('Original checkpoint changed')
    result=dict(status='ACCEPTED_SUPPORTED_CLASS_CHECKPOINT' if accepted else 'NO_CHECKPOINT_PASSED_REGRESSION_GATE',checkpoint=str(accepted) if accepted else None,final_best_validation=best_metrics,original_checkpoint_unchanged=True,test_evaluated=False,runtime_seconds=time.monotonic()-started,max_cuda_memory_allocated_bytes=torch.cuda.max_memory_allocated() if device.type=='cuda' else None)
    (out/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)

def deferred_baseline(root,output):
    started=time.monotonic();root=Path(root).resolve();out=Path(output).resolve()
    if out.exists():raise FileExistsError('New baseline directory required')
    old=root/'artifacts/phase3_finalization/baseline'
    previous=json.loads((old/'baseline.json').read_text());cache_path=old/'validation_features.pt'
    if sha(cache_path)!=previous['validation_cache_sha256']:raise ValueError('Original cache changed')
    cache=torch.load(cache_path,map_location='cpu',weights_only=True)
    checkpoint=root/'ai-service/feature_extraction/phase2_pakistani_best.pt'
    manifest=root/'artifacts/phase3_finalization/phase3_manifest.csv'
    if sha(checkpoint)!=cache['checkpoint_sha256'] or sha(manifest)!=cache['manifest_sha256']:raise ValueError('Original inputs changed')
    seed_everything(42);model=init_model(checkpoint);model.eval()
    payload=torch.load(checkpoint,map_location='cpu',weights_only=True)
    if any(not torch.equal(v,payload['state_dict'][k]) for k,v in model.state_dict().items()):raise ValueError('Phase2 state not preserved exactly')
    with torch.inference_mode():
        logits={n:linear_logits(model,c['features']) for n,c in cache['cohorts'].items()}
        metrics={n:metrics_for(logits[n],c) for n,c in cache['cohorts'].items()}
        raw=logits['phase2']['category'].argmax(1)
        pred=mask_logits('category',logits['phase2']['category']).argmax(1)
    if not torch.equal(raw,cache['original_phase2_predictions']) or not torch.equal(pred,raw):raise ValueError('Legacy category baseline predictions changed under support mask')
    if abs(metrics['phase2']['heads']['category']['accuracy']-331/415)>1e-6:raise ValueError('79.76% baseline changed')
    cohort_hash=hashlib.sha256((cache['gate']['cohort_sha256']+json.dumps(PREDICTION_POLICY,sort_keys=True)).encode()).hexdigest()
    gate=gate_metrics(metrics['phase2'],metrics['phase3'],cohort_hash);CheckpointGate(gate)
    fresh=dict(cache,baseline_logits=logits,original_phase2_predictions=pred,original_phase2_raw_predictions=raw,gate=gate,prediction_policy=PREDICTION_POLICY)
    report=dict(previous,original_phase2=metrics['phase2'],migrated_phase2=metrics['phase2'],phase3=metrics['phase3'],gate_baseline=gate,
                loading=model.initialization_report,prediction_policy=PREDICTION_POLICY,all_phase2_tensors_exact=True,
                old_category_predictions_changed=0,original_baseline_sha256=sha(old/'baseline.json'),runtime_seconds=time.monotonic()-started)
    report['inference_configuration']=dict(previous['inference_configuration'],prediction_policy=PREDICTION_POLICY)
    out.mkdir(parents=True);torch.save(fresh,out/'validation_features.pt');report['validation_cache_sha256']=sha(out/'validation_features.pt')
    (out/'baseline.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(dict(phase2_category_accuracy=metrics['phase2']['heads']['category']['accuracy'],old_predictions_changed=0,all_phase2_tensors_exact=True,gate=gate,phase3=metrics['phase3']),indent=2))

def main():
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
    b=sub.add_parser('baseline');b.add_argument('--root',default='..');b.add_argument('--manifest',required=True);b.add_argument('--checkpoint',required=True);b.add_argument('--output',required=True)
    d=sub.add_parser('deferred-baseline');d.add_argument('--root',default='..');d.add_argument('--output',required=True)
    t=sub.add_parser('train');t.add_argument('--manifest',required=True);t.add_argument('--data-root',required=True);t.add_argument('--checkpoint',required=True);t.add_argument('--baseline',required=True);t.add_argument('--config',required=True);t.add_argument('--output',required=True);t.add_argument('--device',default='cuda');t.add_argument('--workers',type=int,default=2)
    a=p.parse_args()
    if a.command=='baseline':baseline(a.root,a.manifest,a.checkpoint,a.output)
    elif a.command=='deferred-baseline':deferred_baseline(a.root,a.output)
    else:train(a)

if __name__=='__main__':main()
