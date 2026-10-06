import csv
import json
from pathlib import Path
import tempfile
import unittest
from collections import Counter
import torch
from torch import nn

from feature_extraction.clothing_config import CLASS_NAMES,HEAD_NAMES
from feature_extraction.prediction_policy import mask_logits
from feature_extraction.training.phase3_manifest import check_records,load_manifest,canonical_path,FIELDS,finalize
from feature_extraction.training.phase3_stage_a import stage_a_batches,StageAProtection,CheckpointGate
from feature_extraction.training.phase3_runner import metrics_for,encode_rows,linear_logits,evaluate_cached,gate_metrics,establish_local_reference
from feature_extraction.training.phase3_kaggle_bundle import bundle

class FinalizationTests(unittest.TestCase):
    def record(self,uid='one',split='train',source='party'):
        labels=dict.fromkeys(HEAD_NAMES);labels['occasion']='party'
        return dict(uid=uid,sha256=uid,source=source,split=split,labels=labels,valid={h:labels[h] is not None for h in HEAD_NAMES},proposed_group_id=uid,source_key=uid,native_group=uid)
    def test_duplicate_hash_id_and_cross_split_group_rejected(self):
        a=self.record();b=self.record('two','val');b['proposed_group_id']=a['proposed_group_id']
        with self.assertRaises(ValueError):check_records([a,b])
        b=self.record('two');b['sha256']=a['sha256']
        with self.assertRaises(ValueError):check_records([a,b])
        with self.assertRaises(ValueError):check_records([a,a])
    def test_party_only_and_explicit_masks(self):
        r=self.record();check_records([r]);r['labels']['category']='dress';r['valid']['category']=True
        with self.assertRaises(ValueError):check_records([r])
        r=self.record();r['valid']['occasion']=False
        with self.assertRaises(ValueError):check_records([r])
    def test_no_overwrite_before_source_access(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'existing.csv';out.write_text('unchanged')
            with self.assertRaises(FileExistsError):finalize(d,d,out)
            self.assertEqual(out.read_text(),'unchanged')
    def test_bundle_never_overwrites_existing_output(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'existing.zip';out.write_bytes(b'unchanged')
            with self.assertRaises(FileExistsError):bundle(d,out)
            self.assertEqual(out.read_bytes(),b'unchanged')
    def test_portable_paths_masking_and_source_label_not_human_approval(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);image=root/'data.jpg';image.write_bytes(b'fixture')
            raw=dict.fromkeys(FIELDS,'');raw.update(canonical_id='one',source='party',source_dataset='df',source_id='one',image_sha256='one',split='train',group_id='one',source_group_id='one',image_path='data.jpg',occasion='party',label_provenance='source_labeled',human_reviewed='0',review_status='unreviewed')
            raw.update({h+'_valid':'1' if h=='occasion' else '0' for h in HEAD_NAMES});manifest=root/'m.csv'
            def write():
                with manifest.open('w',newline='') as f:w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerow(raw)
            write();r=load_manifest(manifest,root)[0];self.assertIsNone(r['labels']['season']);self.assertEqual(r['raw']['human_reviewed'],'0')
            raw['image_path']='../escape.jpg';write()
            with self.assertRaises(ValueError):load_manifest(manifest,root)
            raw['image_path']='data.jpg';raw['season']='summer';write()
            with self.assertRaises(ValueError):load_manifest(manifest,root)
    def test_path_capitalization_preserved_without_renaming_source(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=root/'datasets'/'Striped_A-Line_Dress';p.mkdir(parents=True);image=p/'image.jpg';image.write_bytes(b'unchanged')
            # On Windows, resolve the case-insensitive annotation spelling.
            import os
            spelling='Striped_A-line_Dress' if os.name=='nt' else 'Striped_A-Line_Dress'
            result=canonical_path(root/'datasets'/spelling/'image.jpg',root,{})
            self.assertEqual(result.relative_to(root.resolve()).as_posix(),'datasets/Striped_A-Line_Dress/image.jpg');self.assertEqual(image.read_bytes(),b'unchanged')

class StageRunnerTests(unittest.TestCase):
    def model(self):
        model=nn.Module();model.backbone=nn.Sequential(nn.Linear(4,4),nn.BatchNorm1d(4));model.heads=nn.ModuleDict({h:nn.Linear(4,len(v)) for h,v in CLASS_NAMES.items()});return model
    def test_sampler_is_occasion_season_only_balanced_capped_deterministic(self):
        rows=[]
        def add(source,labels,n=30):
            for _ in range(n):rows.append(dict(source=source,split='train',labels={h:labels.get(h) for h in HEAD_NAMES},valid={h:h in labels for h in HEAD_NAMES}))
        for occ in ('casual','formal','sports'):
            for season in ('summer','winter'):add('hf',{'occasion':occ,'season':season})
        add('party',{'occasion':'party'},40);add('wedding',{'occasion':'wedding'},60)
        batches=list(stage_a_batches(rows,batches=8));self.assertEqual(batches,list(stage_a_batches(rows,batches=8)))
        for batch in batches:
            self.assertEqual(len(set(batch)),32);self.assertEqual(Counter(rows[i]['source'] for i in batch),dict(hf=12,wedding=12,party=8))
            self.assertFalse(any(rows[i]['source']=='df' for i in batch))
        self.assertLessEqual(max(Counter(i for b in batches for i in b).values()),3)
        rows[0]['split']='test'
        with self.assertRaises(ValueError):list(stage_a_batches(rows,batches=1))
    def test_unsupported_metrics_none_and_no_loss_for_missing_heads(self):
        labels=dict.fromkeys(HEAD_NAMES);labels['occasion']='party';rows=[dict(labels=labels)]
        targets,masks=encode_rows(rows);cohort=dict(targets=targets,masks=masks,ids=['one'])
        logits={h:torch.zeros(1,len(v)) for h,v in CLASS_NAMES.items()};metrics=metrics_for(logits,cohort)
        self.assertIsNone(metrics['heads']['season']['accuracy']);self.assertIsNone(metrics['heads']['sleeve_length']['recall'][2]);self.assertEqual(metrics['heads']['color']['labeled_samples'],0)
    def test_old_argmax_interference_rejected_even_when_row_weights_frozen(self):
        base=dict(split='val',cohort_sha256='x',new=dict(occasion=.1,season=.1),protected=dict(old_accuracy=.8))
        candidate=dict(base,new=dict(occasion=.3,season=.3))
        result=CheckpointGate(base).consider(candidate,True,False);self.assertFalse(result['eligible']);self.assertIn('Original Phase 2 category argmax changed',result['reasons'])
    def test_batchnorm_child_and_optimizer_moments_are_protected(self):
        m=self.model();p=StageAProtection(m)
        x=torch.randn(5,4);features=m.backbone(x);loss=nn.functional.cross_entropy(m.heads.occasion(features),torch.zeros(5,dtype=torch.long))
        p.step(loss);p.assert_preserved()
        for param in m.heads.category.parameters():self.assertNotIn(param,p.optimizer.state);self.assertFalse(param.requires_grad)
        m.backbone[1].train()
        with self.assertRaises(RuntimeError):p.step(m.heads.category(torch.randn(5,4)).sum())
    def test_cached_evaluator_detects_skirt_argmax_change_with_identical_frozen_heads(self):
        torch.manual_seed(1);m=self.model();labels=dict.fromkeys(HEAD_NAMES);labels.update(category='skirt',occasion='party',season='summer')
        targets,masks=encode_rows([dict(labels=labels)]);c=dict(features=torch.randn(1,4),ids=['one'],targets=targets,masks=masks)
        logits=linear_logits(m,c['features']);metrics=metrics_for(logits,c)
        cache=dict(cohorts={'phase2':c,'phase3':c},baseline_logits={'phase2':logits,'phase3':logits},original_phase2_predictions=mask_logits('category',logits['category']).argmax(1),original_phase2_raw_predictions=logits['category'].argmax(1),gate=gate_metrics(metrics,metrics,'x'))
        # Harmless cross-platform rounding can establish a local reference.
        cache['baseline_logits']['phase2']=dict(logits,color=logits['color']+1e-7)
        self.assertTrue(establish_local_reference(m,cache)['baseline_metrics_unchanged'])
        with torch.no_grad():m.heads.category.bias[8]=1000
        _,_,changes,frozen=evaluate_cached(m,cache)
        self.assertGreater(changes,0);self.assertFalse(frozen)

if __name__=='__main__':unittest.main()
