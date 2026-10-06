"""Immutable-checkpoint final evaluation. No training, tuning or integration code."""
import argparse
from collections import Counter
import csv
import io
import json
import platform
from pathlib import Path
import stat
import time
import zipfile

import torch
import torchvision
from PIL import Image, __version__ as pillow_version
from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES, COLOR_THRESHOLD, ARCHITECTURE, FORMAT_VERSION, HEAD_TASKS
from feature_extraction.prediction_policy import PREDICTION_POLICY, mask_logits
from feature_extraction.inference_service import ImageInferenceService
from feature_extraction.preprocessing import preprocess_image, preprocess_image_bytes
from feature_extraction.training.phase3_manifest import load_manifest,csv_rows
from feature_extraction.training.phase3_kaggle_bundle import safe_entry
from feature_extraction.training.phase3_runner import (sha,seed_everything,source_path,encode_rows,metrics_for,
    evaluate_cached,gate_metrics)
from feature_extraction.training.phase3_stage_a import CheckpointGate

ALLOWED={'phase3_stage_a_best.pt','result.json','configuration.json','epochs.jsonl','baseline_relocation_check.json'}

def inspect_archive(path):
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if len(set(n.casefold() for n in names))!=len(names):raise ValueError('Duplicate archive entry')
        if not {'phase3_stage_a_best.pt','result.json','configuration.json','epochs.jsonl'}.issubset(names):raise ValueError('Missing checkpoint/audit files')
        for item in z.infolist():
            safe_entry(item.filename)
            if item.filename not in ALLOWED:raise ValueError('Unexpected archive content')
            if stat.S_ISLNK(item.external_attr>>16) or item.is_dir():raise ValueError('Links/directories not accepted')
            if item.flag_bits & 1 or item.file_size>64*1024*1024:raise ValueError('Encrypted/oversized entry')
        if sum(i.file_size for i in z.infolist())>128*1024*1024:raise ValueError('Oversized archive')
        if z.testzip() is not None:raise ValueError('Archive CRC failure')
        return [{'name':i.filename,'bytes':i.file_size} for i in z.infolist()]

def safe_extract(path,destination):
    entries=inspect_archive(path);destination=Path(destination).resolve()
    if destination.exists():raise FileExistsError('Never overwrite an extraction directory')
    destination.mkdir(parents=True)
    with zipfile.ZipFile(path) as z:
        for item in entries:
            target=destination/item['name']
            if not target.resolve().is_relative_to(destination):raise ValueError('Escaping extraction path')
            with target.open('xb') as f:f.write(z.read(item['name']))
    return entries

def add_color_accuracy(metrics,logits,cohort):
    mask=cohort['masks']['color'];m=metrics['heads']['color']
    pred=logits['color'][mask].sigmoid()>=COLOR_THRESHOLD;truth=cohort['targets']['color'][mask].bool()
    m.update(accuracy=float((pred==truth).all(1).float().mean()) if mask.any() else None,
             accuracy_definition='exact match of all 12 atomic color labels',
             hamming_accuracy=float((pred==truth).float().mean()) if mask.any() else None)
    return metrics

def score_rows(model,rows,cohort_name,prediction_file,batch_size=16):
    outputs={h:[] for h in HEAD_NAMES};started=time.monotonic()
    with prediction_file.open('x',newline='',encoding='utf-8') as f:
        writer=csv.writer(f);writer.writerow(['cohort','source_id','image_sha256','split','head','ground_truth','valid','predicted','unsupported_ground_truth'])
        with torch.inference_mode():
            for start in range(0,len(rows),batch_size):
                batch=rows[start:start+batch_size];images=[]
                for row in batch:
                    if sha(row['image_path'])!=row['sha256']:raise ValueError('Evaluation image changed: '+row['uid'])
                    with Image.open(row['image_path']) as image:images.append(preprocess_image(image))
                logits=model(torch.stack(images))
                for h in HEAD_NAMES:outputs[h].append(logits[h].cpu())
                for i,row in enumerate(batch):
                    for h in HEAD_NAMES:
                        label=row['labels'][h]
                        if h=='color':pred='|'.join(CLASS_NAMES[h][j] for j in (logits[h][i].sigmoid()>=COLOR_THRESHOLD).nonzero().flatten().tolist())
                        else:pred=CLASS_NAMES[h][mask_logits(h,logits[h][i]).argmax().item()]
                        unsupported=label in PREDICTION_POLICY['unsupported_classes'].get(h,[])
                        writer.writerow([cohort_name,row['uid'],row['sha256'],row['split'],h,'' if label is None else label,int(label is not None),pred,int(unsupported)])
                f.flush()
                if start%128==0:print(cohort_name,min(start+batch_size,len(rows)),len(rows),flush=True)
    targets,masks=encode_rows(rows);cohort=dict(ids=[r['uid'] for r in rows],targets=targets,masks=masks)
    logits={h:torch.cat(v) for h,v in outputs.items()}
    result=add_color_accuracy(metrics_for(logits,cohort),logits,cohort)
    result.update(split=rows[0]['split'],unique_image_hashes=len({r['sha256'] for r in rows}),runtime_seconds=time.monotonic()-started)
    return result,logits

def original_holdout(root,split):
    path=root/'artifacts/phase2_training_seed42/splits.json';assignments=json.loads(path.read_text())
    manifest=root/'artifacts/phase2_full_v2/phase2_manifest.csv'
    if sha(manifest)!=assignments['manifest_sha256']:raise ValueError('Original Phase2 labels changed')
    raw=csv_rows(manifest);rows=[]
    for a in assignments['assignments']:
        if a['split']!=split:continue
        row=raw[a['row']-1];labels={h:row[h] if row[h+'_valid']=='1' else None for h in HEAD_NAMES}
        # Do not reinterpret an unavailable legacy category as current skirt.
        if labels['category']=='kurti':raise ValueError('Legacy kurti ground truth requires an explicit legacy-label evaluator')
        rows.append(dict(uid=f"phase2:{a['row']}:{a['image_sha256']}",image_path=str(source_path(root,row['image_path'])),
                         sha256=a['image_sha256'],split=split,labels=labels))
    return rows,assignments

def verify_checkpoint(path,root):
    started=time.monotonic();payload=torch.load(path,map_location='cpu',weights_only=True)
    if payload.get('prediction_policy')!=PREDICTION_POLICY:raise ValueError('Unsupported deployment mask metadata')
    meta=payload['training_metadata']
    if meta['active_heads']!=['occasion','season'] or meta['protected_category_rows']!=list(range(12)):raise ValueError('Wrong Stage A provenance')
    if meta['prediction_policy']!=PREDICTION_POLICY or not meta['regression_gate']['eligible']:raise ValueError('Checkpoint not accepted under matching gate')
    service=ImageInferenceService(str(path.resolve()))
    if not service.load_checkpoint():raise ValueError('Inference structural validation failed: '+str(service.not_ready_reason))
    model=service._model;source=root/'ai-service/feature_extraction/phase2_pakistani_best.pt'
    old=torch.load(source,map_location='cpu',weights_only=True)
    if set(payload['state_dict'])!=set(old['state_dict']):raise ValueError('Full six-head tensor inventory differs')
    if meta['source_checkpoint_sha256']!=sha(source):raise ValueError('Phase2 source hash differs')
    if payload['format_version']!=FORMAT_VERSION or payload['architecture']!=ARCHITECTURE or payload['head_tasks']!=HEAD_TASKS:raise ValueError('Architecture/config mismatch')
    if {h:tuple(v) for h,v in payload['class_names'].items()}!=CLASS_NAMES:raise ValueError('Taxonomy mismatch')
    frozen=[];changed=[]
    for key,value in payload['state_dict'].items():
        if value.shape!=old['state_dict'][key].shape or value.dtype!=old['state_dict'][key].dtype:raise ValueError('Tensor shape/dtype differs: '+key)
        matches=torch.equal(value,old['state_dict'][key])
        if key.startswith(('heads.occasion.','heads.season.')):
            if not matches:changed.append(key)
        else:
            if not matches:raise ValueError('Frozen tensor changed: '+key)
            frozen.append(key)
    if not changed:raise ValueError('No evidence of updated occasion/season parameters')
    cache_root=root/'artifacts/phase3_occasion_season_v1/baseline'
    baseline=json.loads((cache_root/'baseline.json').read_text())
    cache_path=cache_root/'validation_features.pt'
    if sha(cache_path)!=baseline['validation_cache_sha256']:raise ValueError('Local baseline cache changed')
    cache=torch.load(cache_path,map_location='cpu',weights_only=True)
    if cache['prediction_policy']!=PREDICTION_POLICY:raise ValueError('Baseline support mismatch')
    metrics,candidate,changes,identical=evaluate_cached(model,cache)
    decision=CheckpointGate(cache['gate']).consider(candidate,identical,changes==0)
    if not decision['eligible']:raise ValueError('Recomputed validation gate failed: '+str(decision))
    # Checkpoint metadata describes the bundle-remapped CSV, not the local original.
    with zipfile.ZipFile(root/'artifacts/rewearx_phase3_occasion_season_v1.zip') as z:
        bundled_manifest=__import__('hashlib').sha256(z.read('artifacts/phase3_finalization/phase3_manifest.csv')).hexdigest()
    if meta['manifest_sha256']!=bundled_manifest:raise ValueError('Training selection provenance differs')
    result=dict(checkpoint_sha256=sha(path),phase2_checkpoint_sha256=sha(source),format_version=payload['format_version'],architecture=payload['architecture'],
        class_names=payload['class_names'],prediction_policy=PREDICTION_POLICY,trained=payload['trained'],accepted_epoch=meta['epochs'],
        frozen_tensor_count=len(frozen),frozen_tensors=frozen,changed_tensors=changed,all_category_rows_exact=True,
        old_category_predictions_changed=changes,frozen_validation_logits_identical=identical,recomputed_validation_gate=decision,
        phase2_validation_category_accuracy=metrics['phase2']['heads']['category']['accuracy'],
        phase3_validation_only={h:{k:m.get(k) for k in ('accuracy','macro_f1_supported','labeled_samples')} for h,m in metrics['phase3']['heads'].items()},
        checkpoint_load_and_validation_seconds=time.monotonic()-started,
        legacy_row8='Original kurti parameters preserved and inert; never trained skirt weights.')
    # Recalculate color accuracy on cached regression holdout with a stated multilabel definition.
    from feature_extraction.training.phase3_runner import linear_logits
    old_logits=linear_logits(model,cache['cohorts']['phase2']['features'])
    validation=add_color_accuracy(metrics['phase2'],old_logits,cache['cohorts']['phase2'])
    validation.update(split='val',role='used in checkpoint selection; regression check, NOT test accuracy')
    return model,service,result,validation

def latency(service,rows):
    chosen=sorted(rows,key=lambda r:r['uid'])[:50]
    for _ in range(3):service.predict(preprocess_image_bytes(Path(chosen[0]['image_path']).read_bytes()))
    times=[]
    for row in chosen:
        start=time.perf_counter();service.predict(preprocess_image_bytes(Path(row['image_path']).read_bytes()));times.append(1000*(time.perf_counter()-start))
    x=torch.tensor(times,dtype=torch.float64)
    return dict(device='CPU',batch_size=1,threads=torch.get_num_threads(),samples=len(times),warmup_calls=3,
                includes='file read, decode, EXIF/RGB, official preprocessing, six-head forward and API prediction decoding',
                excludes='HTTP/network, route upload verification and cold checkpoint load',mean_ms=float(x.mean()),
                p50_ms=float(x.quantile(.5)),p90_ms=float(x.quantile(.9)),p95_ms=float(x.quantile(.95)),minimum_ms=float(x.min()),maximum_ms=float(x.max()))

def export_metrics(out,cohorts):
    with (out/'per_class.csv').open('x',newline='',encoding='utf-8') as f:
        w=csv.writer(f);w.writerow(['cohort','split','head','class','support','recall','f1','status'])
        for name,report in cohorts.items():
            for h,m in report['heads'].items():
                for i,label in enumerate(m['class_names']):
                    support=m.get('support',m.get('positive_support'))[i]
                    status='unsupported' if label in m['unsupported_classes'] else 'no_ground_truth' if not support else 'evaluated'
                    w.writerow([name,report['split'],h,label,support,m['recall'][i],m['f1'][i],status])
    matrices={name:{h:m.get('confusion_matrix',m.get('binary_confusions')) for h,m in c['heads'].items()} for name,c in cohorts.items()}
    (out/'confusion_matrices.json').write_text(json.dumps(matrices,indent=2))

def run(root,archive,output):
    started=time.monotonic();root=Path(root).resolve();archive=Path(archive).resolve();out=Path(output).resolve()
    if out.exists():raise FileExistsError('Use a fresh evaluation output directory')
    entries=inspect_archive(archive)
    manifest=root/'artifacts/phase3_finalization/phase3_manifest.csv'
    protected=[archive,manifest,root/'ai-service/feature_extraction/phase1_deepfashion_best.pt',root/'ai-service/feature_extraction/phase2_pakistani_best.pt',
               root/'artifacts/phase2_full_v2/phase2_manifest.csv',root/'artifacts/phase2_training_seed42/splits.json',root/'artifacts/phase3_occasion_season_v1/baseline/validation_features.pt']
    snapshots={str(p):sha(p) for p in protected}
    previous=json.loads((root/'artifacts/phase3_finalization/phase3_manifest.audit.json').read_text())
    if sha(manifest)!=previous['manifest_sha256']:raise ValueError('Final test selection changed')
    for name,expected in previous['checkpoint_hashes'].items():
        if sha(root/'ai-service/feature_extraction'/name)!=expected:raise ValueError('Original checkpoint changed')
    seed_everything(42);out.mkdir(parents=True)
    safe_extract(archive,out/'kaggle_output')
    model,service,verification,validation=verify_checkpoint(out/'kaggle_output/phase3_stage_a_best.pt',root)
    (out/'checkpoint_verification.json').write_text(json.dumps(verification,indent=2))
    result_log=json.loads((out/'kaggle_output/result.json').read_text());config=json.loads((out/'kaggle_output/configuration.json').read_text())
    if result_log['status']!='ACCEPTED_SUPPORTED_CLASS_CHECKPOINT' or result_log['test_evaluated']:raise ValueError('Training result provenance unexpected')
    if config!=json.loads((root/'ai-service/feature_extraction/training/phase3_stage_a_config.json').read_text()):raise ValueError('Kaggle training configuration differs')
    epochs=[json.loads(line) for line in (out/'kaggle_output/epochs.jsonl').read_text().splitlines() if line.strip()]
    accepted=[e for e in epochs if e['epoch']==verification['accepted_epoch']]
    if len(accepted)!=1 or not accepted[0]['checkpoint_gate']['eligible'] or accepted[0]['old_phase2_category_predictions_changed'] or not accepted[0]['frozen_validation_logits_identical']:raise ValueError('Accepted epoch audit missing or inconsistent')
    selected=load_manifest(manifest,root/'datasets');p3=[r for r in selected if r['split']=='test']
    p2,assignments=original_holdout(root,'test')
    if len(p3)!=744 or len(p2)!=990:raise ValueError('Test count differs from locked splits')
    p3_trainval={r['sha256'] for r in selected if r['split']!='test'}
    p2_trainval={r['image_sha256'] for r in assignments['assignments'] if r['split']!='test'}
    p3_hash={r['sha256'] for r in p3};p2_hash={r['sha256'] for r in p2}
    if p3_hash & p2_trainval or p2_hash & p3_trainval:raise ValueError('Cross-phase test versus train/validation leakage')
    if any(r['split']!='test' for r in p3+p2):raise ValueError('Non-test record in final test cohort')
    p3_metrics,_=score_rows(model,p3,'phase3_test',out/'phase3_test_predictions.csv')
    p2_metrics,_=score_rows(model,p2,'original_phase2_test',out/'phase2_test_predictions.csv')
    cohorts=dict(phase3_test=p3_metrics,original_phase2_test=p2_metrics,original_phase2_validation_regression=validation)
    export_metrics(out,cohorts)
    timing=latency(service,p3)
    for p,h in snapshots.items():
        if sha(p)!=h:raise ValueError('Protected input modified: '+p)
    report=dict(status='FINAL_READ_ONLY_EVALUATION_COMPLETE',checkpoint=verification,cohorts=cohorts,latency=timing,
        split_integrity=dict(phase3_manifest_group_source_id_exact_hash_checks=True,cross_phase_test_trainval_hash_conflicts=0,
            overlap_between_two_test_cohorts=len(p3_hash & p2_hash),original_phase2_test_records=len(p2),original_phase2_test_unique_images=len(p2_hash),
            phase2_original_split='image-hash 80/10/10; product/person/event independence not established',
            phase3_groups='Known source/group/perceptual exclusions preserved; full person/event independence not established',cohorts_not_pooled=True),
        unavailable=dict(phase1_holdout='Original Phase1 split snapshot unavailable; historical validation metadata is not a fresh holdout test.',
            phase3_color='No ground-truth color labels',unsupported=PREDICTION_POLICY['unsupported_classes']),
        inference_configuration=dict(preprocessing='official EfficientNet_B0 IMAGENET1K_V1 transforms, EXIF/RGB, bicubic resize256/center224/ImageNet normalization',
            color_threshold=COLOR_THRESHOLD,prediction_policy=PREDICTION_POLICY,batch_size=16,device='CPU float32',seed=42,threads=torch.get_num_threads()),
        environment=dict(python=platform.python_version(),torch=str(torch.__version__),torchvision=str(torchvision.__version__),pillow=pillow_version,platform=platform.platform(),processor=platform.processor()),
        archive_entries=entries,protected_input_sha256=snapshots,all_protected_inputs_unchanged=True,training_started=False,model_integrated=False,
        thresholds_or_labels_changed=False,runtime_seconds=time.monotonic()-started)
    (out/'evaluation.json').write_text(json.dumps(report,indent=2));print(json.dumps(dict(status=report['status'],phase3_test=p3_metrics,original_phase2_test=p2_metrics,latency=timing,runtime_seconds=report['runtime_seconds']),indent=2))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',default='..');p.add_argument('--archive',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();run(a.root,a.archive,a.output)

if __name__=='__main__':main()
