import csv,json,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import torch
from feature_extraction.clothing_config import HEAD_NAMES,CLASS_NAMES
from feature_extraction.training.continual_learning import encode,masked_loss,replay_records,run
from feature_extraction.model_registry import reload_once,rollback,BASE_SHA
from feature_extraction.inference_service import ImageInferenceService

class ContinualTests(unittest.TestCase):
 def test_partial_labels_and_multicolor(self):
  targets,masks=encode({'labels':{'color':['black','gold'],'occasion':'party'},'valid':{'color':True,'occasion':True}})
  self.assertEqual(int(targets['color'].sum()),2);self.assertTrue(masks['occasion']);self.assertFalse(masks['pattern']);self.assertEqual(targets['pattern'].item(),-100)
 def test_unsupported_remains_masked(self):
  _,m=encode({'labels':{'category':'skirt','sleeve_length':'half','season':'all_season'},'valid':{h:True for h in HEAD_NAMES}})
  self.assertFalse(any(v.item() for v in m.values()))
 def test_invalid_atomic_colors_are_not_fake_targets(self):
  t,m=encode({'labels':{'color':['black','teal']},'valid':{'color':True}});self.assertFalse(m['color']);self.assertEqual(t['color'].sum().item(),0)
 def test_masked_loss_only_supervised_outputs_and_unsupported_rows_frozen(self):
  t,m=encode({'labels':{'category':'shirt','occasion':'party','season':'winter'},'valid':{'category':True,'occasion':True,'season':True}})
  logits={h:torch.zeros(1,len(CLASS_NAMES[h]),requires_grad=True) for h in HEAD_NAMES};loss=masked_loss(logits,{h:v.unsqueeze(0) for h,v in t.items()},{h:v.unsqueeze(0) for h,v in m.items()});loss.backward()
  self.assertIsNone(logits['pattern'].grad);self.assertIsNone(logits['color'].grad);self.assertEqual(logits['category'].grad[0,8].item(),0);self.assertEqual(logits['season'].grad[0,2].item(),0)
 def test_zero_labels_skip_loss(self):
  t,m=encode({});self.assertIsNone(masked_loss({h:torch.zeros(1,len(CLASS_NAMES[h])) for h in HEAD_NAMES},{h:v.unsqueeze(0) for h,v in t.items()},{h:v.unsqueeze(0) for h,v in m.items()}))
 def test_replay_deterministic_train_only_and_path_safe(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'a.jpg').write_bytes(b'a');(root/'b.jpg').write_bytes(b'b');f=root/'manifest.csv';fields=['split','image_path','image_sha256']+list(HEAD_NAMES)+[h+'_valid' for h in HEAD_NAMES]
   with f.open('w',newline='') as stream:
    w=csv.DictWriter(stream,fields);w.writeheader()
    for split,p in [('train','a.jpg'),('val','b.jpg'),('test','b.jpg'),('train','../outside.jpg')]:w.writerow({'split':split,'image_path':p,'image_sha256':p,**{h:'' for h in HEAD_NAMES},**{h+'_valid':'0' for h in HEAD_NAMES}})
   a=replay_records(f,root,24);self.assertEqual(a,replay_records(f,root,24));self.assertEqual(len(a),1);self.assertEqual(a[0]['image_path'],str((root/'a.jpg').resolve()))
 def test_no_overwrite_active_parent(self):
  with self.assertRaisesRegex(ValueError,'overwrite'):run({'threads':2,'output':'same.pt','parent_path':'same.pt'})
 def test_bad_hot_reload_retains_old_service(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'active.json').write_text(json.dumps({'base_sha256':BASE_SHA,'current':{'path':'../outside.pt','sha256':'x','version':'x'}}))
   service=SimpleNamespace(_model=object());old=service._model;self.assertFalse(reload_once(service,root));self.assertIs(service._model,old);self.assertEqual(service.registry_error,'candidate_rejected_previous_model_retained')
 def test_valid_reload_atomic_swap_and_idempotent_then_rollback(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'active.json').write_text(json.dumps({'base_sha256':BASE_SHA,'current':{'path':'new.pt','sha256':'new','version':'job'},'previous':None}))
   old=object();new=object();service=SimpleNamespace(_model=old,_lock=threading.RLock(),checkpoint_path='base.pt',expected_sha256='base')
   def factory(p,h):return SimpleNamespace(load_checkpoint=lambda:True,_model=new if h=='new' else old,checkpoint_sha256=h)
   with patch('feature_extraction.model_registry.ImageInferenceService',side_effect=factory),patch('feature_extraction.model_registry.torch.load',return_value={'training_metadata':{'continual_learning':{'base_sha256':BASE_SHA,'job_id':'job'}}}):
    self.assertTrue(reload_once(service,root));self.assertIs(service._model,new);self.assertFalse(reload_once(service,root));rollback(root);self.assertTrue(reload_once(service,root));self.assertIs(service._model,old);self.assertEqual(service.model_version,'accepted-phase3')
 def test_wrong_candidate_provenance_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'active.json').write_text(json.dumps({'base_sha256':BASE_SHA,'current':{'path':'new.pt','sha256':'new','version':'job'}}));old=object();service=SimpleNamespace(_model=old)
   with patch('feature_extraction.model_registry.ImageInferenceService',return_value=SimpleNamespace(load_checkpoint=lambda:True)),patch('feature_extraction.model_registry.torch.load',return_value={}):self.assertFalse(reload_once(service,root));self.assertIs(service._model,old)
 def test_inflight_prediction_keeps_corresponding_hash(self):
  s=ImageInferenceService('not-used','old');s._load_attempted=True;s.checkpoint_sha256='old'
  def model(x):
   s.checkpoint_sha256='new';s._model=lambda x:None
   return {h:torch.zeros(1,len(CLASS_NAMES[h])) for h in HEAD_NAMES}
  s._model=model;predictions,hash_value=s.predict_with_version(torch.zeros(3,224,224));self.assertEqual(hash_value,'old');self.assertEqual(len(predictions),6)

if __name__=='__main__':unittest.main()
