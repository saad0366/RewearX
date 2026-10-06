"""Prepare a new human-review queue; never approves images or emits training data."""
import argparse
from collections import Counter,defaultdict
import json
import math
from pathlib import Path
import sqlite3
from PIL import Image,ImageChops,ImageDraw,ImageOps
from feature_extraction.review.phase3_quality import Review,digest,rank
from feature_extraction.training.phase3_fashion4events_wedding import read_labels,LocalImages,photo_group


def image_quality(path):
    """Mechanical crop measurements only, not a wedding/clothing classifier."""
    with Image.open(path) as im:
        im.load();im=ImageOps.exif_transpose(im).convert('RGB');width,height=im.size
        # A black background is intrinsic to Fashion4Events segmented crops.
        gray=im.convert('L');mask=gray.point(lambda p:255 if p>12 else 0)
        box=mask.getbbox();active=sum(mask.histogram()[1:])
        bw,bh=(box[2]-box[0],box[3]-box[1]) if box else (0,0)
        tiny= min(bw,bh)<24 or active<1024
        return dict(width=width,height=height,foreground_bbox=list(box) if box else None,
                    foreground_pixels=active,foreground_fraction=active/(width*height),
                    mechanical_tiny_or_blank=tiny,
                    visual_quality_not_verified=True,preference=math.log1p(active))


def choose_one_per_photo(records,target=500):
    groups=defaultdict(list)
    for r in records:groups[r['photo_group']].append(r)
    best=[]
    for g,items in groups.items():
        # Prefer larger visible content per photo, without inferring garment type.
        best.append(min(items,key=lambda r:(-r['quality']['preference'],rank(r['source_id']))))
    # Stratified round-robin across provided garment IDs, for review diversity.
    strata=defaultdict(list)
    for r in best:strata[r['source_garment_class']].append(r)
    for items in strata.values():items.sort(key=lambda r:(rank(r['photo_group']),r['source_id']))
    chosen=[];seen=set()
    while len(chosen)<target:
        added=False
        for key in sorted(strata):
            while strata[key]:
                r=strata[key].pop(0)
                if r['sha256'] in seen:continue
                chosen.append(r);seen.add(r['sha256']);added=True;break
            if len(chosen)>=target:break
        if not added:break
    return chosen


def sheets(items,directory,source):
    directory.mkdir(parents=True,exist_ok=True)
    for start in range(0,len(items),25):
        canvas=Image.new('RGB',(1500,1800),'white');draw=ImageDraw.Draw(canvas)
        for i,r in enumerate(items[start:start+25]):
            x,y=(i%5)*300,(i//5)*360
            with Image.open(r['image_path']) as im:canvas.paste(ImageOps.contain(ImageOps.exif_transpose(im).convert('RGB'),(295,295)),(x,y))
            draw.text((x+2,y+298),f'{start+i+1} '+r['source_id'][-38:],fill='black')
            draw.text((x+2,y+315),' '.join(r['labels'].values()),fill='black')
            draw.text((x+2,y+332),'human judgment required',fill='black')
        canvas.save(directory/f'{source}_{start//25+1:02d}.jpg',quality=90)


def prepare(root,output,target=500):
    root=Path(root).resolve();output=Path(output).resolve()
    if output.exists():raise FileExistsError('Queue exists; serve/status to resume')
    if not output.is_relative_to(root/'artifacts'):raise ValueError('Use a new artifacts directory')
    olddir=root/'artifacts/phase3_quality_review';oldq=olddir/'queue.json';oldh=olddir/'quarantine.json';olddb=olddir/'decisions.sqlite3'
    original={str(p):digest(p) for p in (oldq,oldh,olddb)}
    old=json.loads(oldq.read_text());holds={r['uid']:r for r in json.loads(oldh.read_text())['records']}
    inputs=dict(old['input_hashes']);inputs.update({str(oldq):original[str(oldq)],str(oldh):original[str(oldh)]})
    items=[];mechanical_holds=[];count=Counter()
    for r in old['items']:
        if r['source'] not in ('hf','imat'):continue
        if r['uid'] in holds:
            count[r['source']+'_prior_quarantine']+=1;continue
        if digest(r['image_path'])!=r['sha256']:raise ValueError('Original image changed')
        try:q=image_quality(r['image_path'])
        except (OSError,ValueError) as e:
            mechanical_holds.append(dict(r,reason='unreadable',error=str(e)));continue
        # Black-background measurements are only exclusions for wedding; many
        # legitimate HF/iMaterialist images use white backgrounds.
        items.append(dict(r,quality=q,representative=True,review_inherited_from=str(olddb)))
    label=root/'datasets/fashion4events/valid.txt';inputs[str(label)]=digest(label)
    source=LocalImages(root/'datasets/fashion4events/valid');annotation=list(read_labels(label))
    group_events=defaultdict(set)
    for r in annotation:group_events[photo_group(r['source_path'])].add(r['source_event_class'])
    conflicts={g for g,e in group_events.items() if 7 in e and len(e)>1}
    protected_hashes={r['sha256'] for r in old['items']}
    old_photo_groups={r['photo_group'] for r in old['items'] if r['source']=='wedding'}
    party=root/'datasets/phase3_rewearx/party_reviewed/party_reviewed_manifest.csv'
    if party.exists():
        import csv
        inputs[str(party)]=digest(party)
        with party.open(encoding='utf-8-sig',newline='') as f:
            protected_hashes.update(r['image_sha256'] for r in csv.DictReader(f))
    wedding=[];poolhashes=set()
    for r in annotation:
        if r['source_event_class']!=7:continue
        count['wedding_annotation_rows']+=1;g=photo_group(r['source_path'])
        if g in conflicts:count['wedding_conflicting_event_rows']+=1;continue
        if g in old_photo_groups:count['wedding_legacy_quarantine_photo_rows']+=1;continue
        p=source.resolve(r['source_path'])
        if p is None:count['wedding_missing']+=1;continue
        sha=digest(p)
        if sha in protected_hashes:count['wedding_existing_dataset_hash_rows']+=1;continue
        if sha in poolhashes:count['wedding_duplicate_bytes']+=1;continue
        poolhashes.add(sha)
        try:q=image_quality(p)
        except (OSError,ValueError):count['wedding_unreadable']+=1;continue
        if q['mechanical_tiny_or_blank']:
            count['wedding_tiny_or_blank']+=1;mechanical_holds.append(dict(source_path=r['source_path'],sha256=sha,reason='mechanical_tiny_or_blank',quality=q));continue
        sid=p.relative_to(source.root).as_posix()
        wedding.append(dict(uid='Fashion4Events:'+sid,source='wedding',source_dataset='Fashion4Events',source_id=sid,
            source_path=r['source_path'],source_row_index=r['source_row_index'],source_event_class=7,
            source_garment_class=r['source_garment_class'],annotation_schema='source_path,event_class_id,garment_class_id',
            image_path=str(p),sha256=sha,photo_group=g,quality=q,split='pending_human_group_review',
            labels={'occasion':'wedding'},valid={h:h=='occasion' for h in ('color','occasion','season','category','sleeve_length','pattern')},representative=True))
    chosen=choose_one_per_photo(wedding,target);items=chosen+items
    count['wedding_mechanically_eligible_crops']=len(wedding);count['wedding_mechanically_eligible_photo_groups']=len({r['photo_group'] for r in wedding})
    count['wedding_review_candidates']=len(chosen)
    output.mkdir(parents=True)
    payload=dict(status='human_review_queue_not_training_manifest',items=items,input_hashes=inputs,
        initialization='load_training_checkpoint then initialize_skirt_below_existing(model, margin=1.0)',
        wedding_split_policy='Unassigned until explicit human quality and group review; future CUSTOM ReWearX group-safe ~80/10/10.',
        preserved_legacy_decision_snapshot_sha256=original[str(olddb)],prior_quarantine_count=dict(count))
    (output/'queue.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
    review=Review(output)
    # Preserve exact status/timestamp/history for eligible records. Never write
    # to the old review database, and never infer a human approval.
    con=sqlite3.connect('file:'+str(olddb)+'?mode=ro',uri=True)
    inherited=con.execute('SELECT * FROM decisions').fetchall();actions=con.execute('SELECT * FROM actions').fetchall();con.close()
    with review.connect() as db:
        for r in inherited:
            if r[0] in review.items:db.execute('INSERT INTO decisions VALUES(?,?,?,?,?,?)',r)
        for r in actions:
            if r[0] in review.items:db.execute('INSERT INTO actions VALUES(?,?,?,?,?,?)',r)
    for name in ('wedding','hf','imat'):sheets([r for r in items if r['source']==name],output/'sheets',name)
    (output/'mechanical_holds.json').write_text(json.dumps(mechanical_holds,indent=2),encoding='utf-8')
    assert len({r['photo_group'] for r in chosen})==len(chosen)
    assert len({r['sha256'] for r in chosen})==len(chosen)
    assert all(digest(p)==sha for p,sha in original.items()),'Original review inputs changed'
    report=dict(status='BLOCKED_HUMAN_REVIEW_REQUIRED',candidate_counts=dict(Counter(r['source'] for r in items)),
        mechanical_counts=dict(count),review=review.gate(),original_review_inputs_unchanged=True,
        original_snapshot=original,training_approved=False,final_manifest_published=False,
        notes=['Mechanical measurements do not establish wedding suitability or garment identity.',
               'Existing quarantined wedding photo groups excluded entirely; no legacy record released.',
               'HF Formal has 70 remaining candidates; no replacement quota.',
               'Source flags remain unresolved until explicit human decisions.',
               'Use shared anonymous outfit/scene/event tags before group-safe wedding splits.'])
    (output/'preparation_audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


def main():
    p=argparse.ArgumentParser();p.add_argument('--root',default='..');p.add_argument('--output',default='../artifacts/phase3_quality_review_v2');p.add_argument('--target',type=int,default=500);a=p.parse_args()
    if a.target<1:raise ValueError('Positive target required')
    prepare(a.root,a.output,a.target)

if __name__=='__main__':main()
