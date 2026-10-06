import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from collections import Counter
import torch
from torch import nn
from feature_extraction.training.phase3_stage_a import (StageAProtection,masked_loss,balanced_batches,
    train_class_weights,classification_metrics,CheckpointGate,SOURCE_QUOTAS)
from feature_extraction.review.phase3_quality import Review

class Tiny(nn.Module):
    def __init__(self):
        super().__init__();self.backbone=nn.Sequential(nn.Linear(4,4),nn.BatchNorm1d(4));self.heads=nn.ModuleDict({h:nn.Linear(4,n) for h,n in dict(color=12,category=12,occasion=5,season=3,sleeve_length=5,pattern=6).items()})
    def forward(self,x):return {h:m(self.backbone(x)) for h,m in self.heads.items()}

class StageTests(unittest.TestCase):
    def test_optimizer_preserves_backbone_bn_and_all_category_rows(self):
        torch.manual_seed(42);m=Tiny();g=StageAProtection(m);old={k:v.clone() for k,v in m.state_dict().items()}
        for _ in range(3):
            logits=m(torch.randn(6,4));targets={h:torch.zeros(6,dtype=torch.long) for h in ('category','occasion','season')};targets['category'].fill_(8)
            loss=masked_loss(logits,targets,{h:torch.ones(6,dtype=torch.bool) for h in targets});g.step(loss)
        g.assert_preserved();self.assertTrue(torch.equal(m.heads.category.weight,old['heads.category.weight']));self.assertFalse(m.backbone.training)
        self.assertTrue(all(p['weight_decay']==0 for p in g.optimizer.param_groups))
    def test_mode_error_detected(self):
        m=Tiny();g=StageAProtection(m);m.train()
        with self.assertRaises(RuntimeError):g.step(m(torch.randn(3,4))['category'].sum())
    def test_missing_heads_have_no_loss(self):
        logits={h:torch.randn(2,12,requires_grad=True) for h in ('category','occasion','season')};t={h:torch.tensor([-100,-100]) for h in logits};m={h:torch.zeros(2,dtype=torch.bool) for h in logits}
        self.assertIsNone(masked_loss(logits,t,m));t['category'][0]=8;m['category'][0]=True
        self.assertIsNone(masked_loss(logits,t,m));t['occasion'][0]=0;m['occasion'][0]=True
        masked_loss(logits,t,m).backward();self.assertIsNone(logits['category'].grad);self.assertEqual(logits['occasion'].grad[1].abs().sum(),0)
    def test_sampler_determinism_source_counts_and_repeat_cap(self):
        rows=[dict(source=s,split='train') for s,n in SOURCE_QUOTAS.items() for _ in range(n*4)]
        a=list(balanced_batches(rows,batches=8));self.assertEqual(a,list(balanced_batches(rows,batches=8)))
        for b in a:self.assertEqual(Counter(rows[i]['source'] for i in b),SOURCE_QUOTAS);self.assertEqual(len(set(b)),32)
        self.assertLessEqual(max(Counter(i for b in a for i in b).values()),3)
        rows[0]['split']='test'
        with self.assertRaises(ValueError):list(balanced_batches(rows,batches=1))
    def test_train_only_weights_zero_missing_classes(self):
        names={h:['a','b'] for h in ('category','occasion','season')};r=dict(split='train',labels={h:'a' for h in names},valid={h:True for h in names})
        w=train_class_weights([r],names);self.assertTrue(all(x.tolist()==[1,0] for x in w.values()));r['split']='val'
        with self.assertRaises(ValueError):train_class_weights([r],names)
    def test_absent_classes_not_reported_as_zero_performance(self):
        x=classification_metrics([[2,1],[0,0]]);self.assertIsNone(x['recall'][1]);self.assertIsNone(x['f1'][1]);self.assertAlmostEqual(x['macro_f1_supported'],.8)
    def test_skirt_competition_rejected_even_with_protected_parameters(self):
        base=dict(split='val',cohort_sha256='same',new=dict(occasion=.1,season=.1),protected=dict(shalwar_kameez_recall=.8))
        gate=CheckpointGate(base);candidate=dict(base,new=dict(occasion=.2,season=.2),protected=dict(shalwar_kameez_recall=.7))
        for _ in range(3):r=gate.consider(candidate,True,True)
        self.assertFalse(r['eligible']);self.assertTrue(r['early_stop'])
        candidate['protected']=base['protected'];self.assertTrue(CheckpointGate(base).consider(candidate,True,True)['eligible'])
        self.assertFalse(CheckpointGate(base).consider(candidate,False,True)['eligible'])
        candidate['cohort_sha256']='different';self.assertFalse(CheckpointGate(base).consider(candidate,True,True)['eligible'])
    def test_missing_baseline_blocks(self):
        with self.assertRaises(ValueError):CheckpointGate({'split':'val','cohort_sha256':'x','new':{},'protected':{}})

class ReviewTests(unittest.TestCase):
    def test_quarantine_cannot_be_overridden_by_approval(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);image=p/'image';image.write_bytes(b'original')
            row=dict(uid='hf:1',source='hf',split='train',image_path=str(image),sha256=hashlib.sha256(b'original').hexdigest())
            (p/'queue.json').write_text(json.dumps(dict(items=[row],input_hashes={})))
            (p/'quarantine.json').write_text(json.dumps(dict(blockers=['non-garment'],records=[dict(uid='hf:1',quarantine_reason='shoe')])))
            store=Review(p)
            with self.assertRaises(ValueError):store.save('hf:1','approved','',[],True)
            self.assertEqual(store.gate()['audit_quarantined'],1)
            self.assertEqual(store.decisions(),{})
            self.assertFalse(store.gate()['manifest_publication_allowed'])
    def test_persistence_resume_group_conflicts_and_original_protection(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);image=p/'original.bin';image.write_bytes(b'unchanged');sha=hashlib.sha256(image.read_bytes()).hexdigest()
            items=[dict(uid=str(i),source='wedding',split=s,image_path=str(image),sha256=sha) for i,s in enumerate(['train','val'])]
            (p/'queue.json').write_text(json.dumps(dict(items=items,input_hashes={})))
            store=Review(p);self.assertEqual(store.gate()['pending'],2)
            store.save('0','approved','',[],False)
            self.assertEqual(store.gate()['approved_pending_group_check'],1)
            self.assertEqual(store.gate()['status'],'BLOCKED')
            store.save('0','approved','clothing visible',['event:1'],True);store=Review(p);self.assertEqual(store.decisions()['0']['status'],'approved')
            store.save('1','approved','clothing visible',['event:1'],True);self.assertEqual(store.gate()['status'],'BLOCKED');self.assertIn('event:1',store.gate()['cross_split_groups'])
            store.save('1','rejected','Same event conflict',[],True);self.assertEqual(store.gate()['status'],'REVIEWS_COMPLETE_REAUDIT_REQUIRED');self.assertFalse(store.gate()['manifest_publication_allowed'])
            self.assertEqual(hashlib.sha256(image.read_bytes()).hexdigest(),sha)
    def test_no_silent_approval_queue_changes_or_unknown_records(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);q=p/'queue.json';q.write_text(json.dumps(dict(items=[],input_hashes={})));store=Review(p)
            with self.assertRaises(ValueError):store.save('unknown','approved','',[],True)
            q.write_text(json.dumps(dict(items=[],input_hashes={},changed=True)))
            with self.assertRaises(ValueError):Review(p)

if __name__=='__main__':unittest.main()
