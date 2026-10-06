"""Bounded head-only continual updates using the existing six-head model and masks."""
import argparse,csv,hashlib,json,os,random,time
from pathlib import Path
import torch
from torch import nn
from feature_extraction.clothing_config import CLASS_NAMES,HEAD_NAMES
from feature_extraction.prediction_policy import mask_logits,UNSUPPORTED_CLASSES
from feature_extraction.inference_service import ImageInferenceService
from feature_extraction.preprocessing import preprocess_image_bytes
from feature_extraction.training.engine import save_checkpoint

def digest(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def encode(record):
    targets={};masks={}
    for head in HEAD_NAMES:
        label=record.get('labels',{}).get(head);valid=record.get('valid',{}).get(head) is True
        if head=='color':
            valid=valid and isinstance(label,list) and bool(label) and all(c in CLASS_NAMES[head] for c in label)
            targets[head]=torch.tensor([float(c in (label or [])) for c in CLASS_NAMES[head]]) if valid else torch.zeros(len(CLASS_NAMES[head]))
        else:
            valid=valid and label in CLASS_NAMES[head] and label not in UNSUPPORTED_CLASSES.get(head,[])
            targets[head]=torch.tensor(CLASS_NAMES[head].index(label) if valid else -100)
        masks[head]=torch.tensor(valid)
    return targets,masks

def masked_loss(logits,targets,masks):
    losses=[]
    for h in HEAD_NAMES:
        valid=masks[h].bool()
        if not valid.any():continue
        if h=='color':losses.append(nn.functional.binary_cross_entropy_with_logits(logits[h][valid],targets[h][valid].float()))
        else:losses.append(nn.functional.cross_entropy(mask_logits(h,logits[h][valid]),targets[h][valid]))
    return sum(losses) if losses else None

def replay_records(manifest,dataset_root,limit):
    if not limit or not Path(manifest).is_file():return []
    root=Path(dataset_root).resolve();pool=[]
    with Path(manifest).open(encoding='utf-8-sig',newline='') as stream:
        for row in csv.DictReader(stream):
            if row['split']!='train':continue
            p=(root/row['image_path']).resolve()
            if not p.is_relative_to(root) or not p.is_file():continue
            labels={h:row[h] for h in HEAD_NAMES};valid={h:row[h+'_valid']=='1' for h in HEAD_NAMES}
            if valid['color']:labels['color']=[c.strip() for c in str(labels['color']).split(',') if c.strip()]
            pool.append({'image_path':str(p),'sha256':row['image_sha256'],'labels':labels,'valid':valid})
    random.Random(42).shuffle(pool);selected=[];seen=set();covered=set()
    # First cover available trusted head/classes, then fill a small deterministic replay set.
    for record in pool:
        keys={(h,str(record['labels'][h])) for h in HEAD_NAMES if record['valid'][h]}
        if not keys-covered:continue
        selected.append(record);seen.add(record['sha256']);covered|=keys
        if len(selected)>=limit:return selected
    for record in pool:
        if record['sha256'] not in seen:selected.append(record);seen.add(record['sha256'])
        if len(selected)>=limit:break
    return selected

def validated(path,expected):
    service=ImageInferenceService(str(path),expected)
    if not service.load_checkpoint():raise ValueError('Checkpoint validation failed')
    return service

def run(job):
    started=time.monotonic();torch.set_num_threads(max(1,min(2,int(job['threads']))));torch.manual_seed(42)
    output=Path(job['output']);parent=Path(job['parent_path'])
    if output.resolve()==parent.resolve():raise ValueError('Cannot overwrite parent checkpoint')
    if output.is_file():
        # Recovery after candidate write: validate rather than repeat optimization.
        service=validated(output,digest(output));checkpoint=torch.load(output,map_location='cpu',weights_only=True)
        if checkpoint.get('training_metadata',{}).get('continual_learning',{}).get('job_id')!=job['job_id']:raise ValueError('Wrong candidate job')
        result=checkpoint['training_metadata']['continual_learning']['result'];result={**result,'sha256':digest(output)}
        Path(job['result']).write_text(json.dumps(result),encoding='utf-8');return result
    parent_service=validated(parent,job['parent_sha256']);model=parent_service._model
    unsupported_before={h:{kind:model.state_dict()[f'heads.{h}.{kind}'][[CLASS_NAMES[h].index(c) for c in names]].clone() for kind in ['weight','bias']} for h,names in UNSUPPORTED_CLASSES.items()}
    before={k:v.clone() for k,v in model.state_dict().items() if k.startswith('backbone.')}
    model.backbone.requires_grad_(False);model.backbone.eval();model.heads.requires_grad_(True)
    records=job['records']+replay_records(job['replay_manifest'],job['dataset_root'],int(job['replay_limit']))
    loaded=[];seen={};rejected=0;new_rows=[]
    for record_index,record in enumerate(records):
        try:
            if digest(record['image_path'])!=record['sha256']:raise ValueError('Image changed')
            targets,masks=encode(record)
            if not any(v.item() for v in masks.values()):continue
            if record['sha256'] in seen:
                # Conflicting duplicates cannot silently contribute incompatible targets.
                previous=seen[record['sha256']]
                for h in HEAD_NAMES:
                    if masks[h] and previous[2][h] and not torch.equal(targets[h],previous[1][h]):masks[h]=torch.tensor(False);previous[2][h]=torch.tensor(False)
                rejected+=1;continue
            row=(preprocess_image_bytes(Path(record['image_path']).read_bytes()),targets,masks)
            loaded.append(row);new_rows.append(record_index<len(job['records']));seen[record['sha256']]=row
        except (OSError,ValueError):rejected+=1
    if not loaded or not any(is_new and any(m.item() for m in row[2].values()) for is_new,row in zip(new_rows,loaded)):raise ValueError('No usable newly confirmed images')
    # Extract frozen features once; no BN or backbone update during optimization.
    features=[]
    with torch.inference_mode():
        for start in range(0,len(loaded),job['batch_size']):features.append(model.extract_features(torch.stack([r[0] for r in loaded[start:start+job['batch_size']]])))
    feature_matrix=torch.cat(features).clone();targets={h:torch.stack([r[1][h] for r in loaded]) for h in HEAD_NAMES};masks={h:torch.stack([r[2][h] for r in loaded]) for h in HEAD_NAMES}
    optimizer=torch.optim.Adam(model.heads.parameters(),lr=float(job['learning_rate']),weight_decay=0)
    steps=0;losses=[]
    for epoch in range(min(3,int(job['epochs']))):
        order=torch.randperm(len(loaded))
        for start in range(0,len(loaded),job['batch_size']):
            idx=order[start:start+job['batch_size']];optimizer.zero_grad(set_to_none=True)
            logits={h:model.heads[h](feature_matrix[idx]) for h in HEAD_NAMES}
            loss=masked_loss(logits,{h:targets[h][idx] for h in HEAD_NAMES},{h:masks[h][idx] for h in HEAD_NAMES})
            if loss is None:continue
            if not torch.isfinite(loss):raise ValueError('Nonfinite training loss')
            loss.backward();nn.utils.clip_grad_norm_(model.heads.parameters(),1);optimizer.step();steps+=1;losses.append(loss.item())
            if steps>=min(16,int(job['max_steps'])):break
        if steps>=min(16,int(job['max_steps'])):break
    if steps==0:raise ValueError('No supervised optimization steps')
    if any(not torch.equal(v,model.state_dict()[k]) for k,v in before.items()):raise ValueError('Frozen backbone changed')
    for h,names in UNSUPPORTED_CLASSES.items():
        for kind,values in unsupported_before[h].items():
            if not torch.equal(values,model.state_dict()[f'heads.{h}.{kind}'][[CLASS_NAMES[h].index(c) for c in names]]):raise ValueError('Unsupported output row changed')
    checkpoint=torch.load(parent,map_location='cpu',weights_only=True)
    result={'job_id':job['job_id'],'runtime_seconds':time.monotonic()-started,'new_records':len(job['records']),'new_usable_images':sum(is_new and any(m.item() for m in row[2].values()) for is_new,row in zip(new_rows,loaded)),'replay_records_selected':len(records)-len(job['records']),'usable_images':len(loaded),'rejected_or_duplicate_images':rejected,'steps':steps,'mean_training_loss':sum(losses)/len(losses),'head_label_counts':{h:int(masks[h].sum()) for h in HEAD_NAMES},'device':'cpu','threads':torch.get_num_threads(),'quality_status':'technical_validation_only_not_accuracy_verified'}
    checkpoint['state_dict']={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
    checkpoint['training_metadata']={**checkpoint.get('training_metadata',{}),'continual_learning':{'job_id':job['job_id'],'parent_sha256':job['parent_sha256'],'base_sha256':job['base_sha256'],'configuration':{'epochs':job['epochs'],'max_steps':job['max_steps'],'learning_rate':job['learning_rate'],'batch_size':job['batch_size'],'backbone_frozen':True,'weight_decay':0},'result':result}}
    save_checkpoint(checkpoint,output);validated(output,digest(output));result['sha256']=digest(output)
    # The result file is a durable completion marker for crash recovery.
    temporary=Path(str(job['result'])+'.tmp');temporary.write_text(json.dumps(result),encoding='utf-8');os.replace(temporary,job['result'])
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--job',required=True);args=p.parse_args()
    try:run(json.loads(Path(args.job).read_text(encoding='utf-8')))
    except Exception as error:
        print(json.dumps({'status':'failed','error_type':type(error).__name__}),flush=True);raise SystemExit(1)

if __name__=='__main__':main()
