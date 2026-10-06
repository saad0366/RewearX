from pathlib import Path
import tempfile
import unittest
import zipfile
import torch
from feature_extraction.training.phase3_final_evaluation import inspect_archive,safe_extract,ALLOWED,add_color_accuracy
from feature_extraction.training.phase3_runner import encode_rows,metrics_for
from feature_extraction.clothing_config import CLASS_NAMES,HEAD_NAMES

class FinalEvaluationTests(unittest.TestCase):
    def archive(self,path,extra=None):
        with zipfile.ZipFile(path,'w') as z:
            for name in ALLOWED:z.writestr(name,b'fixture')
            if extra:z.writestr(*extra)
    def test_traversal_and_original_checkpoint_names_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);archive=root/'a.zip'
            for name in ('../phase2_pakistani_best.pt','phase1_deepfashion_best.pt','absolute/evil.py'):
                self.archive(archive,(name,b'bad'))
                with self.assertRaises(ValueError):safe_extract(archive,root/'new')
                self.assertFalse((root/'new').exists())
    def test_extract_once_and_never_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);archive=root/'a.zip';self.archive(archive)
            safe_extract(archive,root/'new');original=(root/'new/phase3_stage_a_best.pt').read_bytes()
            with self.assertRaises(FileExistsError):safe_extract(archive,root/'new')
            self.assertEqual(original,(root/'new/phase3_stage_a_best.pt').read_bytes())
    def test_duplicate_and_symlink_entries_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            archive=Path(d)/'a.zip';self.archive(archive)
            with zipfile.ZipFile(archive,'a') as z:
                info=zipfile.ZipInfo('link');info.external_attr=0o120777<<16;z.writestr(info,b'target')
            with self.assertRaises(ValueError):inspect_archive(archive)
            self.archive(archive)
            with zipfile.ZipFile(archive,'a') as z:z.writestr('RESULT.JSON',b'collision')
            with self.assertRaises(ValueError):inspect_archive(archive)
    def test_multilabel_exact_match_hamming_and_missing_labels(self):
        rows=[]
        for label in ('black','blue',None):
            labels=dict.fromkeys(HEAD_NAMES);labels['color']=label;rows.append(dict(labels=labels))
        targets,masks=encode_rows(rows);cohort=dict(targets=targets,masks=masks,ids=['a','b','c'])
        logits={h:torch.zeros(3,len(v)) for h,v in CLASS_NAMES.items()};logits['color'].fill_(-10)
        logits['color'][0,0]=10;logits['color'][1,3]=10;logits['color'][1,1]=10
        report=add_color_accuracy(metrics_for(logits,cohort),logits,cohort)['heads']['color']
        self.assertEqual(report['accuracy'],.5);self.assertAlmostEqual(report['hamming_accuracy'],23/24)
        self.assertEqual(report['labeled_samples'],2);self.assertIsNone(report['recall'][1])
        cohort['masks']['color'].fill_(False)
        report=add_color_accuracy(metrics_for(logits,cohort),logits,cohort)['heads']['color']
        self.assertIsNone(report['accuracy']);self.assertIsNone(report['macro_f1_supported'])

if __name__=='__main__':unittest.main()
