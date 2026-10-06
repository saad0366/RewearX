"""Stage A safeguards and deterministic source/class balancing."""
import math
import random
import torch
from torch import nn
from feature_extraction.prediction_policy import mask_logits,supported_targets,UNSUPPORTED_CLASSES

ACTIVE_HEADS=('occasion','season')
SOURCE_QUOTAS={'hf':12,'wedding':12,'party':8}

class StageAProtection:
    """Freeze all existing features/logits except occasion and season.

    Use train_mode() and step() in the explicit Stage A trainer. No category
    parameter enters the optimizer, and all rows are checked after each update.
    Category is fully frozen, including inert row 8. Deployment masks remain
    mandatory. Architecture/state_dict stay unchanged.
    """
    def __init__(self,model,lr=1e-4):
        self.model=model
        model.requires_grad_(False)
        for h in ACTIVE_HEADS:model.heads[h].requires_grad_(True)
        self.rows=list(range(model.heads['category'].out_features))
        self.original={k:v.detach().clone() for k,v in model.state_dict().items()}
        self.optimizer=torch.optim.Adam([p for p in model.parameters() if p.requires_grad],lr=lr,weight_decay=0)
        self.train_mode()
    def train_mode(self):
        self.model.train();self.model.backbone.eval()
        for h in ('color','category','sleeve_length','pattern'):self.model.heads[h].eval()
    def assert_preserved(self):
        for k,v in self.model.state_dict().items():
            if k.startswith(('heads.occasion.','heads.season.')):continue
            if k.startswith('heads.category.'):
                if not torch.equal(v[self.rows],self.original[k][self.rows]):raise RuntimeError('Protected category rows changed')
            elif not torch.equal(v,self.original[k]):raise RuntimeError('Protected state changed: '+k)
    def step(self,loss):
        if any(m.training for m in self.model.backbone.modules()):raise RuntimeError('Entire backbone must remain in eval mode')
        if not torch.isfinite(loss):raise ValueError('Non-finite loss')
        self.assert_preserved();self.optimizer.zero_grad(set_to_none=True);loss.backward();self.optimizer.step()
        self.assert_preserved()

def masked_loss(logits,targets,masks,class_weights=None):
    losses=[]
    for h in ACTIVE_HEADS:
        mask=masks[h].bool() & supported_targets(h,targets[h])
        if not mask.any():continue
        weight=None if class_weights is None else class_weights.get(h)
        losses.append(nn.functional.cross_entropy(mask_logits(h,logits[h][mask]),targets[h][mask],weight=weight))
    return sum(losses) if losses else None

def train_class_weights(rows,class_names):
    counts={h:torch.zeros(len(class_names[h])) for h in ACTIVE_HEADS}
    for r in rows:
        if r['split']!='train':raise ValueError('Weights require TRAIN rows only')
        for h in ACTIVE_HEADS:
            if r['valid'][h] and r['labels'][h] not in UNSUPPORTED_CLASSES.get(h,[]):counts[h][class_names[h].index(r['labels'][h])]+=1
    weights={}
    for h,c in counts.items():
        seen=c>0;w=torch.zeros_like(c)
        if seen.any():w[seen]=(c.sum()/(seen.sum()*c[seen])).clamp(max=3)
        weights[h]=w
    return weights

def balanced_batches(rows,epoch=0,batches=48,seed=42):
    if any(r['split']!='train' for r in rows):raise ValueError('Sampler cannot use held-out rows')
    if any(r['source'] not in SOURCE_QUOTAS for r in rows):raise ValueError('Unknown source')
    rng=random.Random(seed+epoch);pools={}
    for source,quota in SOURCE_QUOTAS.items():
        indexes=[i for i,r in enumerate(rows) if r['source']==source]
        if len(indexes)<quota or len(indexes)*3<quota*batches:raise ValueError('Source too small for repeat cap: '+source)
        pools[source]=[]
        for _ in range(3):
            cycle=indexes.copy();rng.shuffle(cycle);pools[source].extend(cycle)
    for _ in range(batches):
        batch=[]
        for source,quota in SOURCE_QUOTAS.items():
            selected=[];deferred=[]
            while len(selected)<quota:
                i=pools[source].pop(0)
                if i in selected:deferred.append(i)
                else:selected.append(i)
            pools[source][0:0]=deferred;batch.extend(selected)
        rng.shuffle(batch);yield batch

def classification_metrics(confusion):
    c=torch.as_tensor(confusion,dtype=torch.float64)
    support=c.sum(1);predicted=c.sum(0);tp=c.diag();valid=support>0
    recall=[float(tp[i]/support[i]) if support[i]>0 else None for i in range(len(c))]
    f1=[float(2*tp[i]/(support[i]+predicted[i])) if support[i]>0 else None for i in range(len(c))]
    return {'support':support.long().tolist(),'recall':recall,'f1':f1,
            'accuracy':float(tp.sum()/support.sum()) if support.sum()>0 else None,
            'macro_f1_supported':sum(v for v in f1 if v is not None)/int(valid.sum()) if valid.any() else None,
            'confusion_matrix':c.long().tolist()}

class CheckpointGate:
    """Require like-for-like baselines, improvement and zero tolerated regression.

    Protected is a named map of validation metrics (all available old-category
    recalls plus frozen-head metrics). No absent-class metric may be substituted
    with zero. Test metrics must never be supplied here.
    """
    def __init__(self,baseline,patience=3):
        if baseline.get('split')!='val' or not baseline.get('cohort_sha256'):raise ValueError('Verified validation baseline required')
        if set(baseline.get('new',{}))!={'occasion','season'} or not baseline.get('protected'):raise ValueError('Incomplete baseline')
        if any(v is None or not math.isfinite(v) for group in ('new','protected') for v in baseline[group].values()):raise ValueError('Missing/non-finite baseline labels/metrics')
        self.baseline=baseline;self.best=sum(baseline['new'].values())/2;self.bad=0;self.patience=patience
    def consider(self,candidate,color_logits_identical,old_predictions_identical=None):
        reasons=[]
        if candidate.get('split')!='val' or candidate.get('cohort_sha256')!=self.baseline['cohort_sha256']:reasons.append('Validation cohort mismatch')
        for group in ('new','protected'):
            if set(candidate.get(group,{}))!=set(self.baseline[group]):reasons.append('Missing '+group+' metrics');continue
            for k,b in self.baseline[group].items():
                v=candidate[group][k]
                if v is None or not math.isfinite(v):reasons.append('Unavailable metric '+k)
                elif group=='protected' and v<b:reasons.append('Protected regression '+k)
                elif group=='new' and v<=b:reasons.append('No baseline improvement '+k)
        if not color_logits_identical:reasons.append('Frozen-head logits changed')
        if not old_predictions_identical:reasons.append('Original Phase 2 category argmax changed')
        score=sum(candidate.get('new',{}).values())/2 if not reasons else None
        eligible=not reasons and score>self.best
        if eligible:self.best=score;self.bad=0
        else:self.bad+=1
        return {'eligible':eligible,'reasons':reasons,'early_stop':self.bad>=self.patience}


def stage_a_batches(rows,epoch=0,batches=48,seed=42):
    """12 HF / 12 wedding / 8 PARTY; only occasion and season supervised.

    Deterministic class/source cycling, at most three draws/image/epoch, no
    duplicate image inside a batch. DF and iMaterialist remain in the manifest.
    """
    if any(r['split']!='train' for r in rows):raise ValueError('Train-only sampler')
    if any(r['source'] not in SOURCE_QUOTAS for r in rows):raise ValueError('Inactive/unknown source in Stage A')
    rng=random.Random(seed+epoch);counts=[0]*len(rows);pools={};cursor={}
    def pool(source,head=None,label=None):
        key=(source,head,label)
        if key not in pools:
            ids=[i for i,r in enumerate(rows) if r['source']==source and (head is None or r['labels'].get(head)==label)]
            rng.shuffle(ids);pools[key]=ids;cursor[key]=0
        return key
    def take(key,used):
        ids=pools[key]
        for _ in ids:
            pos=cursor[key]%len(ids);cursor[key]+=1;i=ids[pos]
            if counts[i]<3 and i not in used:counts[i]+=1;used.add(i);return i
        raise ValueError('Insufficient samples under repeat cap for '+str(key))
    for n in range(batches):
        used=set();batch=[]
        # Two draws per trusted occasion/season pool, plus two general HF draws.
        for h,label in [('occasion','formal'),('occasion','sports'),('occasion','casual'),('season','winter'),('season','summer')]:
            for _ in range(2):batch.append(take(pool('hf',h,label),used))
        for _ in range(2):batch.append(take(pool('hf'),used))
        for source,quota in [('wedding',12),('party',8)]:
            for _ in range(quota):batch.append(take(pool(source),used))
        rng.shuffle(batch);yield batch
