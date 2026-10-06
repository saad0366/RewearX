"""Local quality/group review gate. Never emits a training manifest."""
import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3
from contextlib import contextmanager

from flask import Flask, abort, jsonify, request, send_file, render_template
from PIL import Image, ImageDraw, ImageOps

def digest(path):
    with Path(path).open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()

def rank(s): return hashlib.sha256(('42:'+s).encode()).hexdigest()

def csv_rows(path):
    with path.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))

def prepare(root, output):
    root,output=Path(root).resolve(),Path(output).resolve()
    if output.exists(): raise FileExistsError('Review output exists; use serve to resume')
    if output.is_relative_to(root/'datasets'):raise ValueError('Review artifacts must be outside datasets')
    audit_path=root/'artifacts/phase3_selection_audit_v1/final_selection_audit.json'
    audit=json.loads(audit_path.read_text());excluded=set()
    for p in audit['duplicate_and_similarity_pairs']:
        for k in ('a','b'):
            if p[k+'_excluded']:excluded.add(p[k])
    records=[];inputs={str(audit_path):digest(audit_path)}
    for source,filename,heads in [('wedding','fashion4events_wedding_manifest.csv',('occasion',)),('hf','hf_fashion_manifest.csv',('occasion','season')),('imat','imaterialist_sleeves_manifest.csv',('sleeve_length',))]:
        path=root/'datasets/phase3_rewearx'/filename;inputs[str(path)]=digest(path)
        rows=csv_rows(path);strata=defaultdict(list)
        for x in rows:
            uid=x['source_dataset']+':'+x['source_id']
            if source=='wedding':assert x['source_event_class']=='7'
            strata[tuple(x[h] if x[h+'_valid']=='1' else '' for h in heads)].append((uid,x))
        assignments={}
        for values in strata.values():
            ordered=sorted(values,key=lambda t:rank(t[1]['source_photo_group'] if source=='wedding' else t[0]))
            n=50 if source=='wedding' else int(len(ordered)*.1+.5)
            for i,(uid,x) in enumerate(ordered):assignments[uid]='val' if i<n else 'test' if i<2*n else 'train'
        for x in rows:
            uid=x['source_dataset']+':'+x['source_id']
            if uid in excluded:continue
            image=(path.parent/x['image_name']).resolve()
            if not image.is_relative_to(path.parent.resolve()):raise ValueError('Unsafe image path')
            if digest(image)!=x['image_sha256']:raise ValueError('Image hash mismatch')
            records.append(dict(uid=uid,source=source,source_id=x['source_id'],image_path=str(image),
              sha256=x['image_sha256'],split=assignments[uid],photo_group=x.get('source_photo_group',''),
              labels={h:x[h] for h in heads if x[h+'_valid']=='1'},representative=False))
    # Representative audit sample: twelve train/validation examples per label.
    chosen=set()
    for source in ('hf','imat'):
        labels={(h,v) for r in records if r['source']==source for h,v in r['labels'].items()}
        for h,v in sorted(labels):
            options=sorted((r for r in records if r['source']==source and r['split']!='test' and r['labels'].get(h)==v),key=lambda r:rank('sample:'+r['uid']))
            chosen.update(r['uid'] for r in options[:12])
    for r in records:r['representative']=r['source']=='wedding' or r['uid'] in chosen
    output.mkdir(parents=True)
    payload={'status':'review_queue_not_training_manifest','input_hashes':inputs,'items':records}
    (output/'queue.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
    sheets=output/'sheets';sheets.mkdir()
    for source in ('wedding','hf','imat'):
        items=sorted((r for r in records if r['source']==source and r['representative']),key=lambda r:r['uid'])
        for start in range(0,len(items),25):
            canvas=Image.new('RGB',(1250,1500),'white');draw=ImageDraw.Draw(canvas)
            for i,r in enumerate(items[start:start+25]):
                x,y=(i%5)*250,(i//5)*300
                with Image.open(r['image_path']) as im:canvas.paste(ImageOps.contain(ImageOps.exif_transpose(im).convert('RGB'),(245,245)),(x,y))
                draw.text((x+2,y+248),f'{start+i+1:03d} {r["split"]} '+r['source_id'][-28:],fill='black')
                draw.text((x+2,y+263),' '.join(r['labels'].values()),fill='black')
                r['sheet_index']=start+i+1
            canvas.save(sheets/f'{source}_{start//25+1:02d}.jpg',quality=90)
    (output/'queue.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
    return payload

class Review:
    def __init__(self,directory):
        self.directory=Path(directory).resolve();self.queue=self.directory/'queue.json'
        self.payload=json.loads(self.queue.read_text());self.items={r['uid']:r for r in self.payload['items']}
        self.db=self.directory/'decisions.sqlite3'
        for p,h in self.payload['input_hashes'].items():
            if digest(p)!=h:raise ValueError('Source manifest/audit changed')
        with self.connect() as db:
            db.executescript('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS decisions (uid TEXT PRIMARY KEY,status TEXT,reason TEXT,groups_json TEXT,group_checked INTEGER,timestamp TEXT); CREATE TABLE IF NOT EXISTS actions (uid TEXT,status TEXT,reason TEXT,groups_json TEXT,group_checked INTEGER,timestamp TEXT);')
            old=db.execute("SELECT value FROM meta WHERE key='queue_hash'").fetchone();h=digest(self.queue)
            if old and old[0]!=h:raise ValueError('Queue changed; refusing stale review')
            if not old:db.execute("INSERT INTO meta VALUES('queue_hash',?)",(h,))
    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.db,timeout=20);db.execute('PRAGMA synchronous=FULL')
        try:
            with db:yield db
        finally:db.close()
    def decisions(self):
        with self.connect() as db:return {r[0]:dict(status=r[1],reason=r[2],groups=json.loads(r[3]),group_checked=bool(r[4]),timestamp=r[5]) for r in db.execute('SELECT * FROM decisions')}
    def save(self,uid,status,reason,groups,checked):
        if uid not in self.items or status not in ('approved','rejected','unsure','unreviewed'):raise ValueError('Invalid image/status')
        if status=='approved' and uid in self.quarantined():raise ValueError('Audit quarantine must be resolved separately before approval')
        if not isinstance(reason,str) or len(reason)>2000 or not isinstance(groups,list) or any(not isinstance(g,str) or not g.strip() or len(g)>100 for g in groups):raise ValueError('Invalid review fields')
        if digest(self.items[uid]['image_path'])!=self.items[uid]['sha256']:raise ValueError('Image changed')
        now=datetime.now(timezone.utc).isoformat();values=(uid,status,reason,json.dumps(sorted(set(groups))),int(checked is True),now)
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO decisions VALUES(?,?,?,?,?,?)',values)
            db.execute('INSERT INTO actions VALUES(?,?,?,?,?,?)',values)
    def quarantined(self):
        path=self.directory/'quarantine.json'
        return {r['uid']:r['quarantine_reason'] for r in json.loads(path.read_text()).get('records',[])} if path.exists() else {}
    def update_groups(self,uids,tag=None,checked=None):
        if not isinstance(uids,list) or not uids or len(uids)>50 or len(set(uids))!=len(uids) or any(u not in self.items for u in uids):raise ValueError('Select 1â€“50 known images')
        if tag is not None and (not isinstance(tag,str) or not tag.strip() or len(tag)>100):raise ValueError('Invalid shared tag')
        if checked is not None and type(checked) is not bool:raise ValueError('Invalid group check')
        if any(digest(self.items[u]['image_path'])!=self.items[u]['sha256'] for u in uids):raise ValueError('Image changed')
        now=datetime.now(timezone.utc).isoformat()
        with self.connect() as db:
            for uid in uids:
                old=db.execute('SELECT * FROM decisions WHERE uid=?',(uid,)).fetchone()
                status,reason,groups,complete=(old[1],old[2],json.loads(old[3]),bool(old[4])) if old else ('unreviewed','',[],False)
                if tag and tag.strip() not in groups:
                    groups=sorted(set(groups+[tag.strip()]));complete=False
                if checked is not None:complete=checked
                values=(uid,status,reason,json.dumps(groups),int(complete),now)
                db.execute('INSERT OR REPLACE INTO decisions VALUES(?,?,?,?,?,?)',values)
                db.execute('INSERT INTO actions VALUES(?,?,?,?,?,?)',values)
    def gate(self):
        decisions=self.decisions();counts=defaultdict(Counter);groups=defaultdict(list)
        for uid,r in self.items.items():
            d=decisions.get(uid,{'status':'unreviewed','groups':[]});counts[r['source']][d['status']]+=1
            if d['status']=='approved':
                for group in d['groups']:groups[group].append(uid)
        conflicts={g:ids for g,ids in groups.items() if len({self.items[u]['split'] for u in ids})>1}
        pending=sum(c['unreviewed']+c['unsure'] for c in counts.values())
        group_pending=[u for u,r in self.items.items() if r['source']=='wedding' and decisions.get(u,{}).get('status')=='approved' and not decisions[u]['group_checked']]
        holds_path=self.directory/'quarantine.json'
        holds=json.loads(holds_path.read_text()) if holds_path.exists() else {}
        return {'status':'BLOCKED' if pending or conflicts or holds or group_pending else 'REVIEWS_COMPLETE_REAUDIT_REQUIRED',
                'counts':dict(counts),'pending':pending,'cross_split_groups':conflicts,
                'approved_pending_group_check':len(group_pending),'group_check_pending_uids':group_pending,
                'audit_quarantined':len(holds.get('records',[])),'audit_blockers':holds.get('blockers',[]),
                'manifest_publication_allowed':False,'reason':'Final selection, baseline and leakage checks must be rerun after review; this tool never publishes a training manifest.'}

def related_candidates(review,uid,limit=8):
    """Thumbnail similarity is a review hint only; never assigns groups/status."""
    from PIL import ImageStat
    if uid not in review.items:raise ValueError('Unknown image')
    if not hasattr(review,'_visual_hints'):
        review._visual_hints={}
        for key,r in review.items.items():
            if r['source']!='wedding':continue
            with Image.open(r['image_path']) as im:
                thumb=ImageOps.exif_transpose(im).convert('RGB').resize((9,8))
                gray=list(thumb.convert('L').tobytes())
                bits=sum((gray[y*9+x]>gray[y*9+x+1])<<(y*8+x) for y in range(8) for x in range(8))
                color=ImageStat.Stat(thumb).mean
                review._visual_hints[key]=(bits,color)
    source=review.items[uid];hints=review._visual_hints
    def score(key):
        other=review.items[key]
        shared=source.get('photo_group') and source.get('photo_group')==other.get('photo_group')
        if shared:return -100
        if uid not in hints or key not in hints:return 1000
        a,c=hints[uid];b,d=hints[key]
        return (a^b).bit_count()+sum(abs(x-y) for x,y in zip(c,d))/24
    keys=[k for k,r in review.items.items() if k!=uid and r['source']==source['source']]
    return sorted(keys,key=lambda k:(score(k),k))[:limit]

def app_for(review,port=8766):
    app=Flask(__name__);token=secrets.token_urlsafe(32)
    @app.before_request
    def localhost():
        if request.host not in (f'127.0.0.1:{port}',f'localhost:{port}'):abort(403)
    @app.get('/')
    def page():return render_template('phase3_quality.html',token=token)
    @app.get('/api/items')
    def items():
        ds=review.decisions();holds=review.quarantined()
        return jsonify(items=[dict(r,quarantine_reason=holds.get(uid,''),review=ds.get(uid,dict(status='unreviewed',reason='',groups=[],group_checked=False))) for uid,r in review.items.items()],gate=review.gate(),sheets=[p.name for p in sorted((review.directory/'sheets').glob('*.jpg'))])
    @app.get('/sheets/<name>')
    def sheet(name):
        p=(review.directory/'sheets'/name).resolve()
        if Path(name).name!=name or p.parent!=(review.directory/'sheets').resolve() or p.suffix!='.jpg' or not p.is_file():abort(404)
        return send_file(p)
    @app.get('/image')
    def image():
        r=review.items.get(request.args.get('uid'))
        if not r:abort(404)
        return send_file(r['image_path'])
    @app.post('/api/review')
    def save():
        if request.headers.get('X-Review-Token')!=token:abort(403)
        try:
            d=request.get_json();review.save(d['uid'],d['status'],d.get('reason',''),d.get('groups',[]),d.get('group_checked',False))
        except (ValueError,KeyError,TypeError) as exc:return jsonify(error=str(exc)),400
        return jsonify(review.gate())
    @app.get('/api/related')
    def related():
        try:return jsonify(uids=related_candidates(review,request.args.get('uid')),note='Visual suggestions only; inspect manually')
        except (ValueError,OSError) as exc:return jsonify(error=str(exc)),400
    @app.post('/api/groups')
    def groups():
        if request.headers.get('X-Review-Token')!=token:abort(403)
        try:
            d=request.get_json();review.update_groups(d['uids'],d.get('tag'),d.get('checked'))
        except (ValueError,KeyError,TypeError) as exc:return jsonify(error=str(exc)),400
        return jsonify(review.gate())
    return app

def main():
    p=argparse.ArgumentParser();p.add_argument('command',choices=['prepare','serve','status']);p.add_argument('--root',default='..');p.add_argument('--output',default='../artifacts/phase3_quality_review');p.add_argument('--port',type=int,default=8766);a=p.parse_args()
    if a.command=='prepare':
        q=prepare(a.root,a.output);Review(a.output);print(Counter(r['source'] for r in q['items']))
    elif a.command=='status':print(json.dumps(Review(a.output).gate(),indent=2))
    else:app_for(Review(a.output),a.port).run(host='127.0.0.1',port=a.port,debug=False,use_reloader=False)

if __name__=='__main__':main()
