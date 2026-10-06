import unittest
import torch
from torch import nn
from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES
from feature_extraction.prediction_policy import mask_logits,UNSUPPORTED_CLASSES
from feature_extraction.inference_service import ImageInferenceService
from feature_extraction.training.phase3_stage_a import StageAProtection,masked_loss,CheckpointGate,train_class_weights
from feature_extraction.training.phase3_runner import metrics_for,encode_rows

class DeferredSupportTests(unittest.TestCase):
    def test_unsupported_winners_never_returned_by_inference(self):
        class Protocol:
            def __call__(self,images):
                logits={h:torch.arange(len(v),dtype=torch.float).unsqueeze(0) for h,v in CLASS_NAMES.items()}
                for h,names in UNSUPPORTED_CLASSES.items():
                    for label in names:logits[h][0,CLASS_NAMES[h].index(label)]=10000
                return logits
        service=ImageInferenceService();service._load_attempted=True;service._model=Protocol()
        result=service.predict(torch.zeros(3,224,224));self.assertEqual(set(result),set(HEAD_NAMES))
        for h,names in UNSUPPORTED_CLASSES.items():
            self.assertNotIn(result[h]['label'],names);self.assertEqual(result[h]['unsupported_classes'],names)
            self.assertIn('conditional',result[h]['confidence_interpretation'])

    def test_validation_uses_identical_mask_and_never_validates_unsupported_truth(self):
        rows=[]
        for unsupported in (False,True):
            labels=dict.fromkeys(HEAD_NAMES)
            labels.update(category='skirt' if unsupported else 'shirt',sleeve_length='half' if unsupported else 'short',season='all_season' if unsupported else 'winter')
            rows.append({'labels':labels})
        targets,masks=encode_rows(rows);cohort=dict(targets=targets,masks=masks,ids=['a','b'])
        logits={h:torch.zeros(2,len(v)) for h,v in CLASS_NAMES.items()}
        for h,names in UNSUPPORTED_CLASSES.items():
            logits[h][:,targets[h][0]]=2;logits[h][:,targets[h][1]]=100
            before=logits[h].clone();self.assertTrue(torch.equal(logits[h],before))
            self.assertTrue(torch.isneginf(mask_logits(h,logits[h])[:,targets[h][1]]).all())
        metrics=metrics_for(logits,cohort)
        for h,names in UNSUPPORTED_CLASSES.items():
            m=metrics['heads'][h];self.assertEqual(m['accuracy'],1);self.assertEqual(m['excluded_unsupported_ground_truth'],1)
            self.assertIsNone(m['recall'][CLASS_NAMES[h].index(names[0])])

    def test_all_frozen_parameters_buffers_and_optimizer_exclusion(self):
        model=nn.Module();model.backbone=nn.Sequential(nn.Linear(4,4),nn.BatchNorm1d(4))
        model.heads=nn.ModuleDict({h:nn.Linear(4,len(v)) for h,v in CLASS_NAMES.items()})
        guard=StageAProtection(model);original={k:v.clone() for k,v in model.state_dict().items()}
        optimizer_ids={id(p) for group in guard.optimizer.param_groups for p in group['params']}
        for h in ('color','category','sleeve_length','pattern'):
            self.assertTrue(all(not p.requires_grad and id(p) not in optimizer_ids for p in model.heads[h].parameters()))
        for _ in range(3):
            features=model.backbone(torch.randn(5,4));logits={h:layer(features) for h,layer in model.heads.items()}
            targets={h:torch.zeros(5,dtype=torch.long) for h in ('occasion','season')};masks={h:torch.ones(5,dtype=torch.bool) for h in targets}
            guard.step(masked_loss(logits,targets,masks))
        guard.assert_preserved()
        for k,v in model.state_dict().items():
            if not k.startswith(('heads.occasion.','heads.season.')):self.assertTrue(torch.equal(v,original[k]),k)
        self.assertTrue(torch.equal(model.heads.season.weight[2],original['heads.season.weight'][2]))

    def test_gate_requires_both_improvements_and_all_regression_proofs(self):
        base=dict(split='val',cohort_sha256='same',new=dict(occasion=.2,season=.3),protected=dict(category=.7976,sleeve=.8))
        candidate=dict(base,new=dict(occasion=.3,season=.4))
        self.assertTrue(CheckpointGate(base).consider(candidate,True,True)['eligible'])
        self.assertFalse(CheckpointGate(base).consider(candidate,True)['eligible'])
        self.assertFalse(CheckpointGate(base).consider(candidate,False,True)['eligible'])
        self.assertFalse(CheckpointGate(base).consider(candidate,True,False)['eligible'])
        candidate['new']['season']=.3;self.assertFalse(CheckpointGate(base).consider(candidate,True,True)['eligible'])
        candidate['new']['season']=.4;candidate['protected']=dict(category=.79,sleeve=.8)
        self.assertFalse(CheckpointGate(base).consider(candidate,True,True)['eligible'])

    def test_all_season_loss_and_weight_are_masked(self):
        logits={'occasion':torch.zeros(1,5,requires_grad=True),'season':torch.zeros(1,3,requires_grad=True)}
        targets={'occasion':torch.tensor([-100]),'season':torch.tensor([2])};masks={'occasion':torch.tensor([False]),'season':torch.tensor([True])}
        self.assertIsNone(masked_loss(logits,targets,masks))
        weights=train_class_weights([dict(split='train',labels={'season':'all_season','occasion':None},valid={'season':True,'occasion':False})],CLASS_NAMES)
        self.assertEqual(weights['season'].tolist(),[0,0,0])

if __name__=='__main__':unittest.main()
