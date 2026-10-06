"""Finalize the approved selection without copying images or changing source data."""
import argparse
from collections import Counter,defaultdict
import csv
import hashlib
import json
from pathlib import Path,PurePosixPath
import sqlite3

from PIL import Image
from feature_extraction.clothing_config import HEAD_NAMES,CLASS_NAMES
from feature_extraction.training.adapters.deepfashion_attribute import DeepFashionAttributeAdapter,CATEGORY_MAP
from feature_extraction.training.phase3_hf_fashion import labels_for
from feature_extraction.training.phase3_imaterialist_sleeves import SLEEVE_MAP
from feature_extraction.training.phase3_fashion4events_wedding import read_labels,LocalImages,photo_group
from feature_extraction.review.phase3_quality import digest

EXPECTED_SPLITS={'train':5824,'val':727,'test':744}
EXPECTED_SOURCES={'df':5555,'hf':461,'imat':586,'wedding':436,'party':257}
FIELDS=('canonical_id','image_path','source','source_dataset','source_id','image_sha256','split','group_id',
        'source_group_id','group_identity_basis',*HEAD_NAMES,*[h+'_valid' for h in HEAD_NAMES],
        'label_provenance','original_label_provenance','human_reviewed','review_status','review_timestamp',
        'source_needs_manual_review','pseudo_label_model','source_annotation_json','review_provenance_json')

def csv_rows(path):
    with Path(path).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))

def canonical_path(path,root,cache):
    """Resolve actual spelling, including Windows case aliases, for Linux portability."""
    path=Path(path).resolve();root=Path(root).resolve()
    if not path.is_relative_to(root/'datasets'):raise ValueError('Image escapes datasets: '+str(path))
    current=root
    for part in path.relative_to(root).parts:
        if current not in cache:
            values=list(current.iterdir());cache[current]={x.name.casefold():x.name for x in values}
            if len(cache[current])!=len(values):raise ValueError('Ambiguous case aliases in '+str(current))
        spelling=cache[current].get(part.casefold())
        if spelling is None:raise FileNotFoundError(path)
        current=current/spelling
        if current.is_symlink():raise ValueError('Image links are not portable: '+str(current))
    return current

def df_selected_labels(adapter,wanted):
    """Parse official vectors only for selected names; never infer negative attributes."""
    found={}
    with (adapter.annotation_root/'list_attr_img.txt').open(encoding='utf-8-sig') as f:
        declared=int(next(f));header=next(f).split()
        if header!=['image_name','attribute_labels']:raise ValueError('Invalid attribute header')
        seen=0
        for line in f:
            seen+=1;name,raw=line.split(maxsplit=1)
            if name not in wanted:continue
            if name in found:raise ValueError('Duplicate annotation '+name)
            values=raw.split()
            if len(values)!=len(adapter.attributes) or set(values)-{'-1','0','1'}:raise ValueError('Invalid attributes')
            labels=dict.fromkeys(HEAD_NAMES)
            labels['category']=CATEGORY_MAP.get(adapter.categories[adapter.category_labels[name]-1]['name'])
            candidates={'sleeve_length':set(),'pattern':set()}
            for value,mapping in zip(values,adapter.attribute_mappings):
                if value=='1':
                    for h in candidates:
                        v=mapping[h]
                        if v:candidates[h].update([v] if isinstance(v,str) else v)
            labels.update({h:next(iter(v)) if len(v)==1 else None for h,v in candidates.items()})
            found[name]=labels
        if seen!=declared or set(found)!=wanted:raise ValueError('Selected attributes missing/count mismatch')
    return found

def check_records(rows,expected_splits=None,expected_sources=None):
    for key in ('uid','sha256'):
        values=[r[key] for r in rows]
        if len(values)!=len(set(values)):raise ValueError('Duplicate '+key)
    for key in ('proposed_group_id','source_key','native_group'):
        groups=defaultdict(set)
        for r in rows:groups[r[key]].add(r['split'])
        if any(len(s)>1 for s in groups.values()):raise ValueError('Cross-split '+key)
    if expected_splits is not None and dict(Counter(r['split'] for r in rows))!=expected_splits:raise ValueError('Split counts changed')
    if expected_sources is not None and dict(Counter(r['source'] for r in rows))!=expected_sources:raise ValueError('Source counts changed')
    for r in rows:
        if r['split'] not in EXPECTED_SPLITS:raise ValueError('Unknown split')
        if set(r['labels'])!=set(HEAD_NAMES):raise ValueError('Six label slots required')
        for h,v in r['labels'].items():
            if r['valid'][h]!=(v is not None):raise ValueError('Mask mismatch')
            if v is not None and v not in CLASS_NAMES[h]:raise ValueError('Unknown label')
        if r['source']=='party' and (r['labels']['occasion']!='party' or any(v is not None for h,v in r['labels'].items() if h!='occasion')):raise ValueError('PARTY masks changed')

def finalize(root,plan,output):
    root=Path(root).resolve();plan=Path(plan).resolve();output=Path(output).resolve()
    report_path=output.with_suffix('.audit.json')
    if output.exists() or report_path.exists():raise FileExistsError('Final manifest/audit already exists')
    rows=json.loads((plan/'retained_audit_records.json').read_text())
    protected=json.loads((plan/'preservation_verification.json').read_text())['checkpoints']
    before={root/'ai-service/feature_extraction'/n:h for n,h in protected.items()}
    source_hashes=json.loads((root/'artifacts/phase3_practical_audit_v3/audit.json').read_text())['input_hashes']
    before.update({Path(p):h for p,h in source_hashes.items()})
    for p,h in before.items():
        if digest(p)!=h:raise ValueError('Protected source changed: '+str(p))
    reconciliation=json.loads((root/'artifacts/phase3_finalization/deepfashion_reconciliation.json').read_text())
    if (reconciliation['original_present_policy_count'],reconciliation['current_is_file_policy_count'])!=(564,563):raise ValueError('DeepFashion discrepancy not reconciled')
    adapter=DeepFashionAttributeAdapter(root/'datasets/deepfashion_attribute')
    official=df_selected_labels(adapter,{'img/'+r['source_id'] for r in rows if r['source']=='df'})
    metadata={}
    for name in ('hf_fashion_manifest.csv','imaterialist_sleeves_manifest.csv'):
        for r in csv_rows(root/'datasets/phase3_rewearx'/name):metadata[r['source_dataset']+':'+r['source_id']]=r
    party={r['source_dataset']+':'+r['source_id']:r for r in csv_rows(root/'datasets/phase3_rewearx/party_reviewed/party_reviewed_manifest.csv')}
    p2=json.loads((root/'artifacts/phase2_training_seed42/splits.json').read_text());p2split={r['image_sha256']:r['split'] for r in p2['assignments']}
    wedding={r['source_path']:r for r in read_labels(root/'datasets/fashion4events/valid.txt')};local=LocalImages(root/'datasets/fashion4events/valid')
    decision_path=root/'artifacts/phase3_quality_review_v2/decisions.sqlite3';before[decision_path]=digest(decision_path)
    con=sqlite3.connect(decision_path.as_uri()+'?mode=ro',uri=True)
    decisions={x[0]:dict(status=x[1],groups=json.loads(x[3]),timestamp=x[5]) for x in con.execute('select * from decisions')};con.close()
    review_path=root/'artifacts/party_fashionclip_review/review.sqlite3';before[review_path]=digest(review_path)
    review=sqlite3.connect(review_path.as_uri()+'?mode=ro',uri=True)
    exclusions=set()
    base=json.loads((root/'artifacts/phase3_selection_audit_v1/final_selection_audit.json').read_text())
    for pair in base['duplicate_and_similarity_pairs']:
        for k in ('a','b'):
            if pair[k+'_excluded']:exclusions.add(pair[k])
    quarantine=json.loads((root/'artifacts/phase3_quality_review/quarantine.json').read_text())
    exclusions.update(r['uid'] for r in quarantine['records'])
    current_quarantine=json.loads((root/'artifacts/phase3_practical_plan_v1/sample_issue_quarantine_overlay.json').read_text())
    exclusions.update(r['uid'] for r in current_quarantine)
    queue={r['uid']:r for r in json.loads((root/'artifacts/phase3_quality_review_v2/queue.json').read_text())['items']}
    cache={};manifest=[];groups=defaultdict(set);case_fixes=[]
    for i,r in enumerate(rows):
        r.setdefault('source_dataset',r['uid'].split(':',1)[0])
        if r['uid'] in exclusions:raise ValueError('Quarantined record selected: '+r['uid'])
        expected=dict.fromkeys(HEAD_NAMES);provenance={};review_provenance={}
        source=r['source']
        if source=='df':
            name='img/'+r['source_id'];expected=official[name]
            if adapter.partitions[name]!=r['split']:raise ValueError('Official DF split changed')
            provenance=dict(annotation_image_name=name,source_category_id=adapter.category_labels[name],annotation_root='deepfashion_attribute/Anno_coarse')
        elif source in ('hf','imat'):
            m=metadata[r['uid']];provenance=m
            expected.update(labels_for(dict(season=m['source_season'],usage=m['source_usage'])) if source=='hf' else {'sleeve_length':SLEEVE_MAP.get(m['source_sleeve'])})
            if m['image_sha256']!=r['sha256'] or queue[r['uid']]['split']!=r['split']:raise ValueError('Source hash/inherited split changed')
        elif source=='wedding':
            m=wedding[r['source_path']];provenance=m
            if m['source_event_class']!=7 or m['source_garment_class']!=r['source_garment_class']:raise ValueError('Incorrect wedding annotation')
            if local.resolve(m['source_path'])!=Path(r['image_path']):raise ValueError('Wedding source path mismatch')
            expected['occasion']='wedding'
        elif source=='party':
            m=party[r['uid']];provenance=m;expected['occasion']='party'
            if m['review_status']!='approved' or m['human_reviewed']!='1':raise ValueError('PARTY not human-approved')
            if m['image_sha256']!=r['sha256'] or digest(m['source_path'])!=r['sha256']:raise ValueError('PARTY provenance hash changed')
            for table in ('reviews','actions'):
                if not review.execute('SELECT 1 FROM '+table+" WHERE image_name=? AND status='approved' AND timestamp=?",(m['original_image_name'],m['review_timestamp'])).fetchone():raise ValueError('Missing PARTY review history')
            inherited=adapter.partitions['img/'+m['source_id']] if m['source_dataset']=='deepfashion_attribute' else p2split[r['sha256']]
            if inherited!=r['split']:raise ValueError('PARTY inherited split changed')
            review_provenance=dict(original_image_name=m['original_image_name'],timestamp=m['review_timestamp'],original_manifest='phase3_rewearx/party_reviewed/party_reviewed_manifest.csv')
        else:raise ValueError('Unknown source')
        if r['labels']!=expected:raise ValueError('Source labels differ: '+r['uid'])
        d=decisions.get(r['uid']) if source!='party' else None
        if d and d['status'] in ('rejected','unsure'):raise ValueError('Existing human hold conflicts with selection: '+r['uid'])
        status=d['status'] if d else r['human_review_status'];human=status=='approved'
        for tag in set(r.get('groups',[])) | set(d.get('groups',[]) if d else []):groups[tag].add(r['split'])
        path=canonical_path(r['image_path'],root,cache)
        if str(path)!=str(Path(r['image_path'])):case_fixes.append(dict(uid=r['uid'],annotation_path=r['image_path'],runtime_path=str(path)))
        if digest(path)!=r['sha256']:raise ValueError('Image hash changed: '+r['uid'])
        with Image.open(path) as im:im.load()
        r['source_key']=r['source_dataset']+':'+r['source_id'];r['native_group']=r['source_dataset']+':'+(r.get('photo_group') or r['source_id'])
        if r['sha256'] in p2split and p2split[r['sha256']]!=r['split']:raise ValueError('Prior Phase 2 split exposure conflict')
        item=dict(canonical_id=r['uid'],image_path=path.relative_to(root/'datasets').as_posix(),source=source,source_dataset=r['source_dataset'],source_id=r['source_id'],image_sha256=r['sha256'],split=r['split'],group_id=r['proposed_group_id'],source_group_id=r['native_group'],group_identity_basis='photo/native ID + explicit tags + conservative similarity/prefix constraints; not certified person/event identity',label_provenance='human_reviewed' if human else 'source_labeled',original_label_provenance=r.get('original_label_origin','source_labeled'),human_reviewed=int(human),review_status=status,review_timestamp=(d['timestamp'] if d else r.get('human_review_timestamp')) or '',source_needs_manual_review=r.get('source_needs_manual_review',''),pseudo_label_model=r.get('pseudo_label_model',''),source_annotation_json=json.dumps(provenance,sort_keys=True),review_provenance_json=json.dumps(review_provenance,sort_keys=True))
        item.update({h:r['labels'][h] or '' for h in HEAD_NAMES});item.update({h+'_valid':int(r['valid'][h]) for h in HEAD_NAMES});manifest.append(item)
        if i%1000==0:print('Verified selected records',i,flush=True)
    review.close();check_records(rows,EXPECTED_SPLITS,EXPECTED_SOURCES)
    if any(len(s)>1 for s in groups.values()):raise ValueError('Explicit human group crosses splits')
    selected={r['uid'] for r in rows}
    if len(selected & set(party))!=257:raise ValueError('All approved PARTY records required')
    for file in (root/'artifacts/phase3_selection_audit_v1/final_selection_audit.json',root/'artifacts/phase3_practical_audit_v3/leakage_pairs.json'):
        data=json.loads(file.read_text());pairs=data['duplicate_and_similarity_pairs'] if isinstance(data,dict) else data
        if any(p['a'] in selected and p['b'] in selected for p in pairs):raise ValueError('Known duplicate/similarity pair retained')
    if any(digest(p)!=h for p,h in before.items()):raise ValueError('Source or human decisions changed during verification')
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('x',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=FIELDS);writer.writeheader();writer.writerows(sorted(manifest,key=lambda r:r['canonical_id']))
    result=dict(total=len(rows),splits=EXPECTED_SPLITS,sources=EXPECTED_SOURCES,class_names=CLASS_NAMES,
        class_counts={s:{h:{c:sum(r['split']==s and r['labels'][h]==c for r in rows) for c in CLASS_NAMES[h]} for h in HEAD_NAMES} for s in EXPECTED_SPLITS},
        manifest_sha256=digest(output),manifest=str(output),case_corrections=case_fixes,known_duplicate_conflicts=0,known_group_conflicts=0,party_canonical_count=257,party_deepfashion_count=207,
        checkpoint_hashes=protected,sources_and_human_decisions_unchanged=True,source_snapshot={str(p):h for p,h in before.items()},
        identity_caveat='No full person/event independence claim; preserve sampled quality limitations.',training_started=False)
    with report_path.open('x',encoding='utf-8') as f:json.dump(result,f,indent=2)
    print(json.dumps({k:result[k] for k in ('total','splits','manifest_sha256')},indent=2));return result

def load_manifest(path,data_root,split=None):
    root=Path(data_root).resolve();rows=[]
    for raw in csv_rows(path):
        if split is not None and raw['split']!=split:continue
        rel=PurePosixPath(raw['image_path'])
        if rel.is_absolute() or '..' in rel.parts or '\\' in raw['image_path'] or ':' in raw['image_path']:raise ValueError('Nonportable image path')
        labels=dict.fromkeys(HEAD_NAMES);valid={}
        for h in HEAD_NAMES:
            if raw[h+'_valid'] not in ('0','1'):raise ValueError('Invalid mask')
            valid[h]=raw[h+'_valid']=='1'
            if valid[h]:
                if raw[h] not in CLASS_NAMES[h]:raise ValueError('Invalid label')
                labels[h]=raw[h]
            elif raw[h]:raise ValueError('Masked label must be empty')
        image=(root/rel).resolve()
        if not image.is_relative_to(root) or not image.is_file():raise FileNotFoundError(image)
        rows.append(dict(uid=raw['canonical_id'],source=raw['source'],split=raw['split'],image_path=str(image),labels=labels,valid=valid,sha256=raw['image_sha256'],proposed_group_id=raw['group_id'],source_key=raw['source_dataset']+':'+raw['source_id'],native_group=raw['source_group_id'],raw=raw))
    check_records(rows)
    return rows

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',default='..');p.add_argument('--plan',default='../artifacts/phase3_practical_plan_v1');p.add_argument('--output',default='../artifacts/phase3_finalization/phase3_manifest.csv');a=p.parse_args();finalize(a.root,a.plan,a.output)
