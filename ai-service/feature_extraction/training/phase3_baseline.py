"""Read-only original Phase 2 validation baseline; never evaluates test images."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import time
import torch
from PIL import Image
from feature_extraction.model import ClothingModel
from feature_extraction.preprocessing import preprocess_image
from feature_extraction.training.checkpoints import load_training_checkpoint
from feature_extraction.training.phase3_stage_a import classification_metrics
from feature_extraction.clothing_config import COLOR_THRESHOLD

def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',default='..');parser.add_argument('--output',default='../artifacts/phase3_quality_review/phase2_baseline.json');args=parser.parse_args()
    root=Path(args.root).resolve();out=Path(args.output).resolve()
    if out.exists():raise FileExistsError(out)
    started=time.monotonic();torch.set_num_threads(4);torch.manual_seed(42)
    checkpoint=root/'ai-service/feature_extraction/phase2_pakistani_best.pt';before=sha(checkpoint)
    payload=torch.load(checkpoint,map_location='cpu',weights_only=True)
    model=ClothingModel(backbone_weights=None);fresh={k:v.clone() for k,v in model.state_dict().items() if k.startswith('heads.category.')}
    load=load_training_checkpoint(model,checkpoint);model.eval()
    for k,v in model.state_dict().items():
        if k in fresh:
            rows=[i for i in range(12) if i!=8]
            assert torch.equal(v[rows],payload['state_dict'][k][rows]) and torch.equal(v[8],fresh[k][8])
        else:assert torch.equal(v,payload['state_dict'][k])
    manifest=root/'artifacts/phase2_full_v2/phase2_manifest.csv';splitfile=root/'artifacts/phase2_training_seed42/splits.json'
    assignments=json.loads(splitfile.read_text());assert sha(manifest)==assignments['manifest_sha256']
    with manifest.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    val=[]
    for assignment in assignments['assignments']:
        if assignment['split']!='val':continue
        row=rows[assignment['row']-1];path=Path(row['image_path']).resolve()
        if not path.is_relative_to(root/'datasets/pakistani_fashion'):raise ValueError('Unsafe original image path')
        assert sha(path)==assignment['image_sha256'];val.append((row,path))
    assert len(val)==1073
    matrices={kind:{h:torch.zeros(len(payload['class_names'][h]),len(payload['class_names'][h]),dtype=torch.long) for h in ('category','pattern')} for kind in ('original_phase2','migrated_phase3')}
    color_tp=torch.zeros(12);color_fp=torch.zeros(12);color_fn=torch.zeros(12);positive=torch.zeros(12);color_samples=0
    predictions_changed=0
    with torch.inference_mode():
        for start in range(0,len(val),16):
            batch=val[start:start+16];images=[]
            for row,path in batch:
                with Image.open(path) as im:images.append(preprocess_image(im))
            features=model.extract_features(torch.stack(images));logits={h:layer(features) for h,layer in model.heads.items()}
            oldcat=torch.nn.functional.linear(features,payload['state_dict']['heads.category.weight'],payload['state_dict']['heads.category.bias'])
            predictions_changed+=int((oldcat.argmax(1)!=logits['category'].argmax(1)).sum())
            for i,(row,path) in enumerate(batch):
                for h in ('category','pattern'):
                    if row[h+'_valid']!='1':continue
                    target=payload['class_names'][h].index(row[h])
                    # Old kurti ground truth must not be reinterpreted as skirt.
                    for kind in matrices:
                        if kind=='migrated_phase3' and h=='category' and target==8:continue
                        pred=int((oldcat if kind=='original_phase2' and h=='category' else logits[h])[i].argmax())
                        matrices[kind][h][target,pred]+=1
                if row['color_valid']=='1':
                    actual=torch.tensor([c in row['color'].split('|') for c in payload['class_names']['color']]);pred=logits['color'][i].sigmoid()>=COLOR_THRESHOLD
                    color_tp+=(pred&actual);color_fp+=(pred&~actual);color_fn+=(~pred&actual);positive+=actual;color_samples+=1
            if start%160==0:print('Validation only',min(start+16,len(val)),'/',len(val),flush=True)
    result={'split':'val','images':len(val),'cohort_sha256':sha(splitfile),'manifest_sha256':sha(manifest),
      'checkpoint_sha256':before,'original_and_migrated_color_logits_identical_by_exact_tensor_and_backbone_equality':True,
      'category_predictions_changed_by_fresh_skirt':predictions_changed,'phase3_validation_status':'BLOCKED: reviewed final manifest not available',
      'phase1_holdout_status':'Previous local source directory absent; restore original holdout before adapting frozen sleeves/pattern/backbone.',
      'loading':{'loaded':len(load['loaded_keys']),'partial':load['partially_loaded_keys'],'skipped':load['skipped_keys']},'metrics':{}}
    for kind,heads in matrices.items():
        result['metrics'][kind]={h:dict(classification_metrics(c),class_names=list(model.class_names[h] if kind=='migrated_phase3' else payload['class_names'][h])) for h,c in heads.items()}
    supported=positive>0;den=2*color_tp+color_fp+color_fn;f1=torch.where(den>0,2*color_tp/den,torch.zeros_like(den))
    result['color']={'samples':color_samples,'class_names':payload['class_names']['color'],'positive_support':positive.long().tolist(),
      'recall':[float(color_tp[i]/positive[i]) if positive[i]>0 else None for i in range(12)],
      'f1':[float(f1[i]) if positive[i]>0 else None for i in range(12)],
      'macro_f1_supported':float(f1[supported].mean()),'micro_f1':float(2*color_tp.sum()/den.sum()),
      'binary_confusions':{'tp':color_tp.long().tolist(),'fp':color_fp.long().tolist(),'fn':color_fn.long().tolist(),'tn':(color_samples-color_tp-color_fp-color_fn).long().tolist()}}
    assert sha(checkpoint)==before and sha(manifest)==assignments['manifest_sha256']
    result['checkpoint_unchanged']=True;result['runtime_seconds']=time.monotonic()-started
    with out.open('x',encoding='utf-8') as f:json.dump(result,f,indent=2)
    print(json.dumps({k:result[k] for k in ('images','category_predictions_changed_by_fresh_skirt','color','runtime_seconds')}))

if __name__=='__main__':main()
