"""Read-only source and validation audits. No training, collection or checkpoint writes."""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import time
from PIL import Image, ImageDraw, ImageOps
import torch
from feature_extraction.training.phase3_baseline import sha
from feature_extraction.training.phase3_fashion4events_wedding import read_labels, LocalImages, photo_group, EVENT_CLASSES, ANNOTATION_SCHEMA
from feature_extraction.training.phase3_stage_a import classification_metrics
from feature_extraction.training.phase3_skirt_initialization import initialize_skirt_below_existing
from feature_extraction.training.checkpoints import load_training_checkpoint
from feature_extraction.model import ClothingModel
from feature_extraction.preprocessing import preprocess_image


def wedding(root,out):
    label=root/'datasets/fashion4events/valid.txt'; before=sha(label)
    images=LocalImages(root/'datasets/fashion4events/valid')
    events=Counter();garments=Counter();groups=defaultdict(set);hashes=defaultdict(list)
    missing=[];invalid=[];conflicts=[];selected=[];folder_mismatch=[]
    source_digests={};rows=list(read_labels(label))
    for r in rows:
        event=r['source_event_class'];events[event]+=1;garments[r['source_garment_class']]+=1
        source=Path(r['source_path']);group=photo_group(source);groups[group].add(event)
        if source.parent.name != str(event):folder_mismatch.append(r)
        if event!=7:continue
        p=images.resolve(r['source_path'])
        if p is None:missing.append(r);continue
        digest=sha(p);source_digests[str(p)]=digest
        try:
            with Image.open(p) as im: im.load();size=im.size
        except (OSError,ValueError) as e:invalid.append(dict(r,error=str(e)));continue
        hashes[digest].append(str(p))
        selected.append(dict(r,path=str(p),sha256=digest,photo_group=group,size=size))
    # Diverse deterministic contact sheet across all observed garment IDs.
    sample=[]
    for g in sorted({r['source_garment_class'] for r in selected}):
        pool=sorted((r for r in selected if r['source_garment_class']==g),key=lambda r:hashlib.sha256(('42:'+r['source_path']).encode()).hexdigest())
        sample.extend(pool[:3])
    for start in range(0,len(sample),20):
        canvas=Image.new('RGB',(1200,1200),'white');d=ImageDraw.Draw(canvas)
        for i,r in enumerate(sample[start:start+20]):
            x=(i%5)*240;y=(i//5)*300
            with Image.open(r['path']) as im:canvas.paste(ImageOps.contain(im.convert('RGB'),(235,240)),(x,y))
            d.text((x+2,y+242),f"event={r['source_event_class']} garment={r['source_garment_class']}",fill='black')
            d.text((x+2,y+258),Path(r['path']).name[:31],fill='black')
        canvas.save(out/f'wedding_schema_sample_{start//20+1}.jpg')
    result=dict(annotation_schema=ANNOTATION_SCHEMA,event_classes=EVENT_CLASSES,annotation_sha256=before,
        total_rows=len(rows),event_counts=dict(events),garment_counts=dict(garments),
        wedding_annotation_rows=events[7],readable_wedding_rows=len(selected),unique_readable_hashes=len(hashes),
        unique_photo_groups=len({r['photo_group'] for r in selected}),missing=missing,invalid=invalid,
        duplicate_bytes=len(selected)-len(hashes),event_folder_mismatches=folder_mismatch,
        photo_groups_with_conflicting_events={g:sorted(e) for g,e in groups.items() if 7 in e and len(e)>1},
        visual_sample=sample,training_approved=False,quarantine_released=False,
        caveat='Source-annotated wedding crops, not human-verified wedding clothing. Photo groups do not establish event/person independence.',
        official_class_source='https://github.com/fedebecat/Fashion4Events',
        schema_evidence='Annotation values: second field 0..13 matches 14 official events; third 0..12 varies across crops of same photo, consistent with 13 garment detections in source paper. Folder agreement is a cross-check, not label source.')
    result['same_photo_multiple_garment_labels']=sum(len({r['source_garment_class'] for r in selected if r['photo_group']==g})>1 for g in {r['photo_group'] for r in selected})
    assert sha(label)==before
    assert all(sha(p)==h for p,h in source_digests.items())
    result['source_bytes_unchanged']=True
    (out/'wedding_audit.json').write_text(json.dumps(result,indent=2))
    print({k:result[k] for k in ('total_rows','wedding_annotation_rows','readable_wedding_rows','unique_readable_hashes','unique_photo_groups','duplicate_bytes','same_photo_multiple_garment_labels')},flush=True)


def category(root,out):
    start=time.monotonic();torch.set_num_threads(4);torch.manual_seed(42)
    checkpoint=root/'ai-service/feature_extraction/phase2_pakistani_best.pt';before=sha(checkpoint)
    payload=torch.load(checkpoint,map_location='cpu',weights_only=True)
    model=ClothingModel(backbone_weights=None);loading=load_training_checkpoint(model,checkpoint);model.eval()
    initial={k:v.clone() for k,v in model.state_dict().items()}
    manifest=root/'artifacts/phase2_full_v2/phase2_manifest.csv';splitfile=root/'artifacts/phase2_training_seed42/splits.json'
    assignments=json.loads(splitfile.read_text());assert sha(manifest)==assignments['manifest_sha256']
    with manifest.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    val=[];targets=[]
    for a in assignments['assignments']:
        if a['split']!='val':continue
        r=rows[a['row']-1];p=Path(r['image_path']).resolve()
        if not p.is_relative_to(root/'datasets/pakistani_fashion'):raise ValueError('Unsafe validation path')
        assert sha(p)==a['image_sha256'];val.append((r,p))
        targets.append(payload['class_names']['category'].index(r['category']) if r['category_valid']=='1' else -1)
    assert len(val)==1073
    features=[]
    with torch.inference_mode():
        for i in range(0,len(val),16):
            batch=[]
            for _,p in val[i:i+16]:
                with Image.open(p) as im:batch.append(preprocess_image(im))
            features.append(model.extract_features(torch.stack(batch)))
            if i%160==0:print('Validation features',min(i+16,len(val)),len(val),flush=True)
    x=torch.cat(features);target=torch.tensor(targets);valid=target>=0
    old=torch.nn.functional.linear(x,payload['state_dict']['heads.category.weight'],payload['state_dict']['heads.category.bias'])
    fresh=torch.nn.functional.linear(x,initial['heads.category.weight'],initial['heads.category.bias'])
    keep=[i for i in range(12) if i!=8];best=fresh[:,keep].max(1).values
    variants={'original_phase2':old,'random_seed42':fresh}
    # Diagnostics only: calibrating on this validation set is not independent evidence.
    calibrated=fresh.clone();shift=max(0,float((fresh[:,8]-best).max())+.05);calibrated[:,8]-=shift
    variants['random_bias_calibrated_on_val']=calibrated
    zero=fresh.clone();zero[:,8]=-10.;variants['zero_weight_bias_minus10']=zero
    initialization=initialize_skirt_below_existing(model,margin=1.)
    with torch.inference_mode():variants['mean_preserved_minus1']=model.heads['category'](x)
    for k,v in model.state_dict().items():
        if k.startswith('heads.category.'):
            assert torch.equal(v[keep],initial[k][keep])
        else:assert torch.equal(v,initial[k])
    metrics={};oldpred=old.argmax(1)
    for name,logits in variants.items():
        mask=valid if name=='original_phase2' else valid & (target!=8)
        pred=logits.argmax(1);cm=torch.bincount(12*target[mask]+pred[mask],minlength=144).reshape(12,12)
        metrics[name]=dict(classification_metrics(cm),accuracy=float(cm.diag().sum()/cm.sum()),
            labeled_samples=int(mask.sum()),all_validation_predictions_changed=int((pred!=oldpred).sum()),
            skirt_or_kurti_top1=int((pred==8).sum()),max_new_row_over_preserved=float((logits[:,8]-best).max()))
    affected=valid & (fresh.argmax(1)!=oldpred)
    result=dict(split='val',images=len(val),category_labeled=int(valid.sum()),class_names=list(model.class_names['category']),
        original_row8_label='kurti',old_kurti_top1=int((oldpred==8).sum()),old_kurti_ground_truth=int((target==8).sum()),
        metrics=metrics,random_interference_by_true_class={model.class_names['category'][i]:int((affected & (target==i)).sum()) for i in keep},
        calibration_bias_shift=shift,calibration_warning='Bias-fit result uses validation scores; not an independent generalization estimate.',
        recommended_initialization=initialization,protected_tensors_exact=True,loading=loading,
        checkpoint_sha256=before,cohort_sha256=sha(splitfile),manifest_sha256=sha(manifest),
        validation_features_sha256=hashlib.sha256(x.numpy().tobytes()).hexdigest(),test_used=False,
        runtime_seconds=time.monotonic()-start)
    assert sha(checkpoint)==before;result['checkpoint_unchanged']=True
    (out/'category_audit.json').write_text(json.dumps(result,indent=2))
    with (out/'category_validation_predictions.csv').open('x',newline='') as f:
        writer=csv.writer(f);writer.writerow(['source_path','target']+list(variants))
        predictions={k:v.argmax(1).tolist() for k,v in variants.items()}
        for i,(_,p) in enumerate(val):writer.writerow([str(p),targets[i]]+[predictions[k][i] for k in variants])
    print({k:{m:v[m] for m in ('accuracy','all_validation_predictions_changed','skirt_or_kurti_top1')} for k,v in metrics.items()},flush=True)


def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['wedding','category']);p.add_argument('--root',default='..');p.add_argument('--output',required=True);a=p.parse_args()
    out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=False)
    globals()[a.mode](Path(a.root).resolve(),out)

if __name__=='__main__':main()
