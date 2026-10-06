"""Source-label/sample audit only: never trains, copies images or approves labels."""
import argparse
from collections import Counter,defaultdict
import csv
import hashlib
import json
import math
from pathlib import Path
import random
import sqlite3
import time
import numpy as np
from PIL import Image,ImageOps,ImageStat
from feature_extraction.clothing_config import CLASS_NAMES,HEAD_NAMES
from feature_extraction.review.phase3_quality import digest,rank
from feature_extraction.review.phase3_quality_candidates import choose_one_per_photo,sheets
from feature_extraction.training.phase3_fashion4events_wedding import read_labels,LocalImages,photo_group
from feature_extraction.training.phase3_hf_fashion import labels_for
from feature_extraction.training.phase3_imaterialist_sleeves import SLEEVE_MAP


def read_csv(path):
    with Path(path).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))


def native_group_key(row):
    return row['source']+':'+(row.get('photo_group') or row['source_id'])


def quality(path,segmented=False):
    with Image.open(path) as raw:
        raw.load();im=ImageOps.exif_transpose(raw).convert('RGB');w,h=im.size
        gray=im.convert('L');std=ImageStat.Stat(gray).stddev[0]
        mask=gray.point(lambda v:255 if v>12 else 0);box=mask.getbbox();active=sum(mask.histogram()[1:])
        bw,bh=(box[2]-box[0],box[3]-box[1]) if box else (0,0)
        bad=min(w,h)<64 or std<2
        if segmented:bad|=min(bw,bh)<48 or active<4096
        pix=digest(path);rgb=np.asarray(im.resize((32,32)),dtype=np.float32)/255
        g=np.asarray(gray.resize((17,16),Image.Resampling.LANCZOS));bits=g[:,:-1]>g[:,1:]
        dh=int.from_bytes(np.packbits(bits.flatten()).tobytes(),'big')
        pixels=hashlib.sha256(str(im.size).encode()+im.tobytes()).hexdigest()
        return dict(width=w,height=h,stddev=std,foreground_pixels=active,foreground_bbox=box,
                    mechanical_unusable=bool(bad),preference=math.log1p(active)),pix,pixels,dh,rgb


def sample_rows(rows,source,per_class=10):
    pool=[r for r in rows if r['source']==source];selected={}
    for head,label in sorted({(h,v) for r in pool for h,v in r['labels'].items() if v is not None}):
        n=15 if source=='hf' and label=='formal' else per_class
        candidates=sorted((r for r in pool if r['labels'].get(head)==label),key=lambda r:rank('sample:'+head+':'+label+':'+r['uid']))
        for r in candidates[:n]:
            if r['uid'] not in selected:selected[r['uid']]=dict(r,sampled_for=[])
            selected[r['uid']]['sampled_for'].append(head+':'+label)
    return list(selected.values())


def issue_estimate(issues,n):
    """Wilson interval for observed issues, not a claim of label accuracy."""
    if n<=0 or not 0<=issues<=n:raise ValueError('Invalid observed sample')
    z=1.96;p=issues/n;den=1+z*z/n
    center=(p+z*z/(2*n))/den
    half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return dict(issues=issues,sample_size=n,observed_rate=p,wilson95=[max(0,center-half),min(1,center+half)])


def stats(rows):
    out={s:dict(images=0,sources=Counter(),heads={h:Counter() for h in HEAD_NAMES}) for s in ('train','val','test')}
    for r in rows:
        if r['split'] not in out:continue
        c=out[r['split']];c['images']+=1;c['sources'][r['source']]+=1
        for h,v in r['labels'].items():
            if v is not None:c['heads'][h][v]+=1
    return out


def split_groups(rows,groups):
    """Assign free wedding components; inherited splits constrain whole groups."""
    totals=Counter();target={'train':.8*len(rows),'val':.1*len(rows),'test':.1*len(rows)}
    for component in sorted(groups,key=lambda rs:rank('group:'+min(r['uid'] for r in rs))):
        fixed={r['split'] for r in component if r['split'] in ('train','val','test')}
        if len(fixed)>1:raise ValueError('Conflicting inherited split group')
        wedding=[r for r in component if r['source']=='wedding']
        if not wedding:continue
        s=next(iter(fixed)) if fixed else max(target,key=lambda k:target[k]-totals[k])
        for r in wedding:r['split']=s
        totals[s]+=len(wedding)
    return dict(totals)


class BKTree:
    def __init__(self):self.root=None
    def insert(self,v,i):
        if self.root is None:self.root=[v,[i],{}];return
        n=self.root
        while True:
            d=(v^n[0]).bit_count()
            if d==0:n[1].append(i);return
            if d not in n[2]:n[2][d]=[v,[i],{}];return
            n=n[2][d]
    def query(self,v,radius=8):
        stack=[self.root] if self.root else []
        while stack:
            n=stack.pop();d=(v^n[0]).bit_count()
            if d<=radius:yield from n[1]
            stack.extend(c for k,c in n[2].items() if d-radius<=k<=d+radius)


def reconstruct_df(root,party,base,output):
    """Reproduce the previously approved deterministic selection, not all training data."""
    from feature_extraction.training.adapters.deepfashion_attribute import DeepFashionAttributeAdapter
    a=DeepFashionAttributeAdapter(root/'datasets/deepfashion_attribute')
    overlaps={'img/'+r['source_id'] for r in party if r['source_dataset']=='deepfashion_attribute'}
    excluded={p[k] for p in base['duplicate_and_similarity_pairs'] for k in ('a','b') if p[k+'_excluded']}
    pool=[]
    for i,x in enumerate(a):
        if x['image_name'] in overlaps or not any(x['valid'].values()) or not Path(x['image_path']).is_file():continue
        pool.append(dict(uid='deepfashion_attribute:'+x['image_name'][4:],source='df',source_id=x['image_name'][4:],
            source_dataset='deepfashion_attribute',image_path=str(x['image_path']),labels=x['labels'],split=x['split'],
            folder=x['image_name'].rsplit('/',1)[0],label_origin='source_labeled',human_review_status='unreviewed'))
        if i%50000==0:print('DeepFashion reconstruction',i,flush=True)
    targets=base['deepfashion']['selection_targets_train'];selected=[]
    for s in ('train','val','test'):
        ordered=sorted((r for r in pool if r['split']==s),key=lambda r:rank(r['uid']));picked={};styles=Counter();counts=defaultdict(Counter)
        for h,classes in targets.items():
            for label,n in classes.items():
                desired=n if s=='train' else max(1,math.ceil(n/8))
                for r in ordered:
                    if counts[h][label]>=desired:break
                    if r['uid'] in picked or r['labels'][h]!=label or styles[r['folder']] >= (10 if s=='train' else 4):continue
                    picked[r['uid']]=r;styles[r['folder']]+=1
                    for hh,v in r['labels'].items():
                        if v is not None:counts[hh][v]+=1
        selected.extend(r for r in picked.values() if r['uid'] not in excluded)
    comparison={'expected':{s:base['final'][s]['sources']['df'] for s in ('train','val','test')},
                'reconstructed':dict(Counter(r['split'] for r in selected))}
    (output/'deepfashion_selection_check.json').write_text(json.dumps(comparison,indent=2))
    (output/'deepfashion_selected_cache.json').write_text(json.dumps(selected))
    print('DeepFashion selection comparison',comparison,flush=True)
    return selected,a


def main():
    p=argparse.ArgumentParser();p.add_argument('--root',default='..');p.add_argument('--output',default='../artifacts/phase3_practical_audit');a=p.parse_args()
    root=Path(a.root).resolve();out=Path(a.output).resolve()
    if out.exists():raise FileExistsError('Audit output exists; original data never overwritten')
    if not out.is_relative_to(root/'artifacts'):raise ValueError('Use artifacts output')
    out.mkdir(parents=True);start=time.monotonic();qdir=root/'artifacts/phase3_quality_review_v2'
    queue=json.loads((qdir/'queue.json').read_text());con=sqlite3.connect((qdir/'decisions.sqlite3').as_uri()+'?mode=ro',uri=True)
    decisions={x[0]:dict(status=x[1],reason=x[2],groups=json.loads(x[3]),group_checked=bool(x[4]),timestamp=x[5]) for x in con.execute('select * from decisions')};con.close()
    before={str(qdir/'queue.json'):digest(qdir/'queue.json'),str(root/'artifacts/phase3_quality_review/quarantine.json'):digest(root/'artifacts/phase3_quality_review/quarantine.json')}
    before.update({str(root/'ai-service/feature_extraction'/n):digest(root/'ai-service/feature_extraction'/n) for n in ('phase1_deepfashion_best.pt','phase2_pakistani_best.pt')})
    holds=[];rows=[];metadata={}
    for source,name in [('hf','hf_fashion_manifest.csv'),('imat','imaterialist_sleeves_manifest.csv')]:
        file=root/'datasets/phase3_rewearx'/name;before[str(file)]=digest(file)
        metadata.update({x['source_dataset']+':'+x['source_id']:x for x in read_csv(file)})
    def decorated(r):
        d=decisions.get(r['uid'],{});r=dict(r);r['human_review_status']=d.get('status','unreviewed');r['human_review_timestamp']=d.get('timestamp');r['groups']=d.get('groups',[]);r['group_checked']=d.get('group_checked',False)
        r['label_origin']='human_reviewed' if d.get('status')=='approved' else 'source_labeled'
        r['labels']={h:r.get('labels',{}).get(h) for h in HEAD_NAMES};r['valid']={h:v is not None for h,v in r['labels'].items()};return r
    for raw in queue['items']:
        if raw['source']=='wedding':continue
        r=decorated(raw);m=metadata[r['uid']]
        if r['human_review_status'] in ('rejected','unsure'):
            holds.append(dict(uid=r['uid'],reason='existing_human_'+r['human_review_status']));continue
        expected=labels_for(dict(season=m['source_season'],usage=m['source_usage'])) if r['source']=='hf' else {'sleeve_length':SLEEVE_MAP.get(m['source_sleeve'])}
        if any(r['labels'][h]!=v for h,v in expected.items()):raise ValueError('Source mapping mismatch')
        r['original_annotation']={k:v for k,v in m.items() if k.startswith('source_')}
        r['source_needs_manual_review']=m.get('needs_manual_review')
        r['source_review_flag_status']='preserved_not_resolved'
        rows.append(r)
    annotations=root/'datasets/fashion4events/valid.txt';before[str(annotations)]=digest(annotations)
    all_labels=list(read_labels(annotations));event_groups=defaultdict(set)
    for r in all_labels:event_groups[photo_group(r['source_path'])].add(r['source_event_class'])
    conflicts={g for g,v in event_groups.items() if 7 in v and len(v)>1}
    old=json.loads((root/'artifacts/phase3_quality_review/queue.json').read_text())
    forbidden_groups={r['photo_group'] for r in old['items'] if r['source']=='wedding'}
    forbidden_hashes={r['sha256'] for r in old['items']};wpool=[];source=LocalImages(root/'datasets/fashion4events/valid')
    existing_wedding_paths={r['source_path'] for r in queue['items'] if r['source']=='wedding'}
    for raw in all_labels:
        if raw['source_event_class']!=7:continue
        if raw['source_path'] not in existing_wedding_paths:continue
        g=photo_group(raw['source_path'])
        if g in conflicts or g in forbidden_groups:continue
        path=source.resolve(raw['source_path'])
        if path is None:continue
        sid=path.relative_to(source.root).as_posix();r=decorated(dict(uid='Fashion4Events:'+sid,source='wedding',source_dataset='Fashion4Events',source_id=sid,source_path=raw['source_path'],image_path=str(path),photo_group=g,split=None,source_garment_class=raw['source_garment_class'],original_annotation=raw,labels={'occasion':'wedding'}))
        if r['human_review_status'] in ('rejected','unsure'):continue
        try:q,sha,*_=quality(path,True)
        except (OSError,ValueError):continue
        if sha in forbidden_hashes:continue
        if q['mechanical_unusable']:continue
        r.update(quality=q,sha256=sha);wpool.append(r)
    # Prefer previously human-approved crop within each photo; never alter decisions.
    for r in wpool:
        if r['human_review_status']=='approved':r['quality']['preference']+=100
    reviewed=choose_one_per_photo([r for r in wpool if r['human_review_status']=='approved'],500)
    occupied={r['photo_group'] for r in reviewed}
    wedding=reviewed+choose_one_per_photo([r for r in wpool if r['photo_group'] not in occupied],max(0,500-len(reviewed)))
    rows.extend(wedding)
    partyfile=root/'datasets/phase3_rewearx/party_reviewed/party_reviewed_manifest.csv';before[str(partyfile)]=digest(partyfile)
    partyraw=read_csv(partyfile);basefile=root/'artifacts/phase3_selection_audit_v1/final_selection_audit.json';base=json.loads(basefile.read_text());before[str(basefile)]=digest(basefile)
    df,adapter=reconstruct_df(root,partyraw,base,out);rows.extend(df)
    p2=json.loads((root/'artifacts/phase2_training_seed42/splits.json').read_text());p2split={x['image_sha256']:x['split'] for x in p2['assignments']}
    for raw in partyraw:
        if raw['review_status']!='approved' or raw['human_reviewed']!='1':raise ValueError('Invalid PARTY review provenance')
        s=adapter.partitions['img/'+raw['source_id']] if raw['source_dataset']=='deepfashion_attribute' else p2split[raw['image_sha256']]
        labels={h:raw[h] if raw[h+'_valid']=='1' else None for h in HEAD_NAMES}
        assert labels['occasion']=='party' and all(v is None for h,v in labels.items() if h!='occasion')
        rows.append(dict(uid=raw['source_dataset']+':'+raw['source_id'],source='party',source_dataset=raw['source_dataset'],source_id=raw['source_id'],image_path=str((partyfile.parent/raw['image_name']).resolve()),split=s,labels=labels,label_origin='human_reviewed',original_label_origin='pseudo_labeled',pseudo_label_model=raw.get('pseudo_label_model','FashionCLIP'),human_review_status='approved',human_review_timestamp=raw['review_timestamp'],sha256=raw['image_sha256'],groups=[]))
    print('Screening five-source candidates',len(rows),flush=True)
    parent=list(range(len(rows)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    def union(i,j):parent[find(j)]=find(i)
    tree=BKTree();seen_bytes={};seen_pixels={};native={};features={};pairs=[];bad=set()
    for i,r in enumerate(rows):
        try:q,sha,pix,dh,rgb=quality(r['image_path'],r['source']=='wedding')
        except (OSError,ValueError) as e:
            if r['source']=='party':raise ValueError('Protected PARTY unreadable') from e
            bad.add(i);holds.append(dict(uid=r['uid'],reason='unreadable'));continue
        if r.get('sha256') and sha!=r['sha256']:raise ValueError('Image hash changed')
        r.update(sha256=sha,decoded_pixel_sha256=pix,mechanical_quality=q)
        if q['mechanical_unusable'] and r['source']!='party':bad.add(i);holds.append(dict(uid=r['uid'],reason='mechanically_unusable'));continue
        features[i]=rgb
        for seen,key,kind in [(seen_bytes,sha,'exact_bytes'),(seen_pixels,pix,'exact_decoded_pixels')]:
            if key in seen:union(i,seen[key]);pairs.append((seen[key],i,kind,0))
            else:seen[key]=i
        for j in tree.query(dh):
            # dHash is a candidate screen. Confirm aligned thumbnail similarity.
            mae=float(np.abs(rgb-features[j]).mean())
            if mae<=.10:union(i,j);pairs.append((j,i,'perceptual_candidate',mae))
        tree.insert(dh,i)
        keys=[native_group_key(r)]+['human:'+g for g in r.get('groups',[])]
        for key in keys:
            if key in native:union(i,native[key])
            else:native[key]=i
        if i%1000==0:print('Screened',i,flush=True)
    clusters=defaultdict(list)
    for i in range(len(rows)):
        if i not in bad:clusters[find(i)].append(i)
    blocks=[]
    for ids in clusters.values():
        fixed={rows[i]['split'] for i in ids if rows[i]['split'] in ('train','val','test')}
        pp=[i for i in ids if rows[i]['source']=='party']
        if len(fixed)>1:
            if len({rows[i]['split'] for i in pp})>1:blocks.append(dict(reason='protected_party_cross_split_component',uids=[rows[i]['uid'] for i in ids]))
            for i in ids:
                if i not in pp:bad.add(i);holds.append(dict(uid=rows[i]['uid'],reason='cross_split_source_or_similarity_group'))
        else:
            # Exact bytes collapse; preserve human PARTY priority. Perceptual
            # candidates stay together but are not asserted to be same product.
            hashes=set();pixel_hashes=set()
            for i in sorted(ids,key=lambda i:(rows[i]['source']!='party',rank(rows[i]['uid']))):
                sha=rows[i]['sha256']
                pix=rows[i]['decoded_pixel_sha256']
                if (sha in hashes or pix in pixel_hashes) and rows[i]['source']!='party':bad.add(i);holds.append(dict(uid=rows[i]['uid'],reason='same_split_exact_duplicate'))
                hashes.add(sha);pixel_hashes.add(pix)
    retained=[r for i,r in enumerate(rows) if i not in bad]
    kept_groups=[[rows[i] for i in ids if i not in bad] for ids in clusters.values()]
    kept_groups=[g for g in kept_groups if g]
    split_groups([r for r in retained if r['source']=='wedding'],kept_groups)
    for g in kept_groups:
        splits={r['split'] for r in g}
        if len(splits)>1:blocks.append(dict(reason='unresolved_group_splits',uids=[r['uid'] for r in g]))
        gid='component:'+hashlib.sha256('|'.join(sorted(r['uid'] for r in g)).encode()).hexdigest()[:16]
        for r in g:r['proposed_group_id']=gid
    sample_w=random.Random(42).sample(sorted((r for r in retained if r['source']=='wedding'),key=lambda r:r['uid']),min(75,sum(r['source']=='wedding' for r in retained)))
    samples={'wedding':sample_w,'hf':sample_rows(retained,'hf',10),'imat':sample_rows(retained,'imat',15)}
    for name,sample in samples.items():
        # Existing sheet helper renders observed labels without asserting approval.
        sheetrows=[dict(r,labels={h:v for h,v in r['labels'].items() if v is not None}) for r in sample]
        sheets(sheetrows,out/'sheets',name)
    index={s:[dict(index=i+1,uid=r['uid'],source_id=r['source_id'],labels=r['labels'],split=r['split'],image_path=r['image_path'],sha256=r['sha256'],label_origin=r['label_origin'],sampled_for=r.get('sampled_for',['random_wedding'])) for i,r in enumerate(sample)] for s,sample in samples.items()}
    (out/'sample_index.json').write_text(json.dumps(index,indent=2))
    pairreport=[dict(a=rows[i]['uid'],b=rows[j]['uid'],kind=k,thumbnail_mae=mae,a_split=rows[i]['split'],b_split=rows[j]['split'],a_held=i in bad,b_held=j in bad) for i,j,k,mae in pairs]
    (out/'leakage_pairs.json').write_text(json.dumps(pairreport,indent=2));(out/'quarantine_overlay.json').write_text(json.dumps(holds,indent=2))
    # Audit-only records, not a CSV or approved final training manifest.
    for r in retained:r['valid']={h:r['labels'].get(h) is not None for h in HEAD_NAMES};r['training_approved']=False
    (out/'candidate_audit_records.json').write_text(json.dumps(retained,indent=2))
    result=dict(status='SOURCE_LABEL_AUDIT_PENDING_SAMPLE_ASSESSMENT',counts=stats(retained),total=len(retained),
        by_source=dict(Counter(r['source'] for r in retained)),label_origin=dict(Counter(r['label_origin'] for r in retained)),
        new_quarantine_reasons=dict(Counter(r['reason'] for r in holds)),prior_quarantines_preserved={'hf':385,'imat':6,'legacy_wedding':500},
        sample_sizes={s:len(v) for s,v in samples.items()},human_approval_not_required_for_each_source_row=True,
        sampled_quality_estimates='Pending visual assessment; do not infer quality from mechanical pass rate.',
        leakage=dict(screened=len(rows),pair_counts=dict(Counter(p['kind'] for p in pairreport)),blocking_conflicts=blocks,
                     caveat='Photo IDs, hashes and perceptual components do not establish full person/event independence. Unselected raw pools not screened.'),
        wedding_policy='CUSTOM ReWearX split: source event 7, one crop/photo, similarity/native groups kept together; not visually verified wedding-specific garments.',
        checkpoints_and_inputs_unchanged=all(digest(p)==h for p,h in before.items()),input_hashes=before,
        training_started=False,final_manifest_published=False,runtime_seconds=time.monotonic()-start)
    assert result['checkpoints_and_inputs_unchanged']
    (out/'audit.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:result[k] for k in ('by_source','total','sample_sizes','new_quarantine_reasons','runtime_seconds')},indent=2))

if __name__=='__main__':main()
