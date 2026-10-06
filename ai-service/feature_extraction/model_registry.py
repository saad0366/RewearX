"""Read-only hot reload of locally validated, versioned models; no request trains."""
import json,os,threading,time
from pathlib import Path
import torch
from feature_extraction.inference_service import ImageInferenceService

BASE_SHA='b2911bd9d1ed6e737c3e2a4695518d48eb829fd2489fa224fa4b317340af785a'

def reload_once(service,root):
    root=Path(root).resolve();pointer=root/'active.json'
    if not pointer.is_file():return False
    try:
        raw=pointer.read_text(encoding='utf-8')
        if raw==getattr(service,'_registry_seen',None):return False
        data=json.loads(raw)
        if data.get('base_sha256')!=BASE_SHA:raise ValueError('Wrong model origin')
        current=data.get('current')
        if current:
            target=(root/current['path']).resolve();expected=current['sha256']
            if not target.is_relative_to(root) or target.suffix!='.pt':raise ValueError('Invalid candidate path')
        else:target=Path(service.checkpoint_path);expected=service.expected_sha256
        candidate=ImageInferenceService(str(target),expected)
        if not candidate.load_checkpoint():raise ValueError('Invalid candidate')
        if current:
            checkpoint=torch.load(target,map_location='cpu',weights_only=True)
            provenance=checkpoint.get('training_metadata',{}).get('continual_learning',{})
            if provenance.get('base_sha256')!=BASE_SHA or provenance.get('job_id')!=current['version']:raise ValueError('Wrong candidate provenance')
        # Construct and verify outside the serving lock. In-flight requests hold their own model reference.
        with service._lock:
            service._model=candidate._model;service.checkpoint_sha256=candidate.checkpoint_sha256
            service._load_attempted=True;service.not_ready_reason=None;service.model_version=current['version'] if current else 'accepted-phase3'
            service._registry_seen=raw;service.registry_error=None
        return True
    except Exception:
        service.registry_error='candidate_rejected_previous_model_retained';return False

def start_registry_watch(service,root,interval=2):
    def watch():
        while True:
            reload_once(service,root);time.sleep(interval)
    thread=threading.Thread(target=watch,name='image-model-registry',daemon=True);thread.start();return thread

def rollback(root):
    root=Path(root).resolve();p=root/'active.json';data=json.loads(p.read_text(encoding='utf-8'))
    if data.get('base_sha256')!=BASE_SHA:raise ValueError('Wrong registry')
    data['current'],data['previous']=data.get('previous'),data.get('current')
    temp=root/'active.rollback.tmp';temp.write_text(json.dumps(data),encoding='utf-8');os.replace(temp,p)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--rollback',action='store_true',required=True);parser.add_argument('--registry',required=True)
    args=parser.parse_args();rollback(args.registry)
