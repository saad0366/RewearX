import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from feature_extraction.review.phase3_quality import Review,related_candidates


class GridTests(unittest.TestCase):
    def fixture(self,p):
        rows=[]
        for i,split in enumerate(['train','val','train']):
            image=p/f'{i}.png';Image.new('RGB',(40,40),(i*50,50,50)).save(image)
            rows.append(dict(uid=str(i),source='wedding',split=split,photo_group=str(i),image_path=str(image),sha256=hashlib.sha256(image.read_bytes()).hexdigest()))
        (p/'queue.json').write_text(json.dumps(dict(items=rows,input_hashes={})))
        return Review(p)

    def test_one_click_optional_reasons_and_group_gate(self):
        with tempfile.TemporaryDirectory() as d:
            r=self.fixture(Path(d))
            r.save('0','approved','',[],False);r.save('1','rejected','',[],False);r.save('2','unsure','',[],False)
            self.assertEqual(Review(d).decisions()['0']['status'],'approved')
            self.assertEqual(r.gate()['approved_pending_group_check'],1)
            self.assertEqual(r.gate()['status'],'BLOCKED')
            r.save('2','rejected','',[],False)
            r.update_groups(['0'],checked=True)
            self.assertEqual(r.gate()['status'],'REVIEWS_COMPLETE_REAUDIT_REQUIRED')
            self.assertFalse(r.gate()['manifest_publication_allowed'])

    def test_shared_tags_preserve_status_and_require_rechecking(self):
        with tempfile.TemporaryDirectory() as d:
            r=self.fixture(Path(d));r.save('0','approved','keep',['old'],True)
            r.update_groups(['0','1'],tag='outfit:1')
            ds=r.decisions();self.assertEqual(ds['0']['status'],'approved');self.assertEqual(ds['0']['reason'],'keep')
            self.assertEqual(ds['1']['status'],'unreviewed');self.assertFalse(ds['0']['group_checked'])
            self.assertEqual(ds['0']['groups'],['old','outfit:1'])
            r.save('1','approved','',ds['1']['groups'],True);r.update_groups(['0'],checked=True)
            self.assertIn('outfit:1',r.gate()['cross_split_groups'])

    def test_related_suggestions_never_write_decisions(self):
        with tempfile.TemporaryDirectory() as d:
            r=self.fixture(Path(d));before=Path(r.db).read_bytes()
            self.assertEqual(set(related_candidates(r,'0')),{'1','2'})
            self.assertEqual(r.decisions(),{});self.assertEqual(Path(r.db).read_bytes(),before)
            with self.assertRaises(ValueError):r.update_groups(['0','missing'],tag='x')
            self.assertEqual(r.decisions(),{})

if __name__=='__main__':unittest.main()
