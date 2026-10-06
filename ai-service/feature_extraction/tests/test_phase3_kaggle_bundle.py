import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

import torch
from feature_extraction.clothing_config import HEAD_NAMES
from feature_extraction.training.phase3_manifest import FIELDS
from feature_extraction.training.phase3_kaggle_bundle import (
    rewrite_manifest, safe_entry, verify_archive, assert_same_cache,
    digest, MANIFEST, BASELINE, CACHE, CHECKPOINT)


class KaggleBundleTests(unittest.TestCase):
    def rows(self):
        rows=[]
        for i,split in enumerate(('train','val')):
            row=dict.fromkeys(FIELDS,'')
            row.update(canonical_id=str(i),image_path=f'df/A_&_B/image{i}.jpg',source='hf',
                       source_dataset='original',source_id=f'original/{i}',
                       image_sha256=digest(str(i).encode()),split=split,group_id=str(i),
                       source_group_id=str(i),occasion='casual',human_reviewed='0',
                       review_status='unreviewed',label_provenance='source_labeled',
                       source_annotation_json=json.dumps({'source_path':f'original/A&B/{i}.jpg'}))
            row.update({h+'_valid':'1' if h=='occasion' else '0' for h in HEAD_NAMES})
            rows.append(row)
        return rows

    def test_deterministic_safe_names_and_original_provenance(self):
        rows=self.rows();result,data=rewrite_manifest(rows)
        self.assertEqual((result,data),rewrite_manifest(rows))
        self.assertEqual([r['image_path'] for r in result],['images/000001.jpg','images/000002.jpg'])
        for before,after in zip(rows,result):
            self.assertEqual(after['original_image_path'],before['image_path'])
            self.assertIn('&',after['original_source_path'])
            for key in before:
                if key!='image_path':self.assertEqual(before[key],after[key])
        self.assertEqual(rows,self.rows())

    def test_entry_allowlist_rejects_forbidden_paths(self):
        for name in ('images/A&B.jpg','../escape.jpg','/absolute.jpg','images/a b.jpg',
                     'images/a:b.jpg','images/a\\b.jpg','images/é.jpg','images//a.jpg'):
            with self.subTest(name=name),self.assertRaises(ValueError):safe_entry(name)
        safe_entry('ai-service/feature_extraction/__init__.py')

    def test_duplicate_ids_and_hashes_rejected(self):
        for key in ('canonical_id','image_sha256'):
            rows=self.rows();rows[1][key]=rows[0][key]
            with self.assertRaises(ValueError):rewrite_manifest(rows)

    def test_cache_relocation_changes_only_manifest_reference(self):
        before={'manifest_sha256':'old','features':torch.tensor([1.,2.]),'ids':['one']}
        after=dict(before,manifest_sha256='new');assert_same_cache(before,after)
        after['features']=torch.tensor([2.,2.])
        with self.assertRaises(ValueError):assert_same_cache(before,after)

    def test_extracted_paths_hashes_masks_splits_and_baseline_references(self):
        rows=self.rows();mapped,data=rewrite_manifest(rows)
        cache={'manifest_sha256':'old','checkpoint_sha256':digest(b'checkpoint'),
               'features':torch.tensor([1.,2.]),'ids':['one','two']}
        new=dict(cache,manifest_sha256=digest(data));stream=io.BytesIO();torch.save(new,stream)
        cache_bytes=stream.getvalue()
        baseline={'manifest_sha256':digest(data),'validation_cache_sha256':digest(cache_bytes)}
        with tempfile.TemporaryDirectory() as temp:
            archive=Path(temp)/'bundle.zip'
            def write(unsafe=False):
                with zipfile.ZipFile(archive,'w') as z:
                    z.writestr(MANIFEST,data);z.writestr(CACHE,cache_bytes)
                    z.writestr(BASELINE,json.dumps(baseline));z.writestr(CHECKPOINT,b'checkpoint')
                    for i,row in enumerate(mapped):z.writestr('datasets/'+row['image_path'],str(i).encode())
                    if unsafe:z.writestr('images/A&B.jpg',b'bad')
            write();result=verify_archive(archive,rows,digest(b'checkpoint'),cache)
            self.assertEqual(result['extracted_manifest_paths_verified'],2)
            self.assertTrue(result['labels_masks_splits_provenance_unchanged'])
            write(True)
            with self.assertRaises(ValueError):verify_archive(archive,rows,digest(b'checkpoint'),cache)


if __name__=='__main__':unittest.main()
