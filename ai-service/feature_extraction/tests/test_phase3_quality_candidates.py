import tempfile
import unittest
from pathlib import Path
import json
import hashlib
from PIL import Image
from feature_extraction.review.phase3_quality_candidates import image_quality,choose_one_per_photo,prepare
from feature_extraction.review.phase3_quality import Review,app_for


class CandidatesTests(unittest.TestCase):
    def test_existing_queue_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'existing';out.mkdir();original=out/'queue.json';original.write_bytes(b'protected')
            with self.assertRaises(FileExistsError):prepare(d,out)
            self.assertEqual(original.read_bytes(),b'protected')
    def test_blank_and_tiny_are_mechanical_not_semantic_decisions(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'image.png';Image.new('RGB',(100,100),'black').save(p)
            self.assertTrue(image_quality(p)['mechanical_tiny_or_blank'])
            Image.new('RGB',(100,100),'white').save(p)
            q=image_quality(p);self.assertFalse(q['mechanical_tiny_or_blank']);self.assertTrue(q['visual_quality_not_verified'])

    def test_one_per_photo_hash_dedup_determinism_and_shortage(self):
        rows=[]
        for group in range(5):
            for view in range(2):
                rows.append(dict(photo_group=str(group),source_id=f'{group}-{view}',source_garment_class=group%2,
                    sha256=str(group),quality=dict(preference=view)))
        selected=choose_one_per_photo(rows,10)
        self.assertEqual(len(selected),5)
        self.assertTrue(all(r['source_id'].endswith('-1') for r in selected))
        self.assertEqual(selected,choose_one_per_photo(list(reversed(rows)),10))
        rows.append(dict(rows[0],photo_group='copy',source_id='copy',quality=dict(preference=5)))
        selected=choose_one_per_photo(rows,10)
        self.assertEqual(len(selected),len({r['sha256'] for r in selected}))

    def test_new_queue_requires_human_approval_and_group_check_localhost_only(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);im=p/'im';im.write_bytes(b'image')
            (p/'queue.json').write_text(json.dumps(dict(input_hashes={},items=[dict(uid='w',source='wedding',split='pending_human_group_review',image_path=str(im),sha256=hashlib.sha256(b'image').hexdigest())])))
            r=Review(p);self.assertEqual(r.gate()['pending'],1);self.assertEqual(r.decisions(),{})
            r.save('w','approved','',[],False)
            self.assertEqual(r.gate()['approved_pending_group_check'],1)
            self.assertEqual(r.gate()['status'],'BLOCKED')
            app=app_for(r,8767);client=app.test_client()
            self.assertEqual(client.get('/api/items',base_url='http://localhost:8767').status_code,200)
            self.assertEqual(client.get('/api/items',base_url='http://external.example:8767').status_code,403)
            self.assertEqual(client.post('/api/review',base_url='http://localhost:8767',json={'uid':'w','status':'approved'}).status_code,403)
            self.assertEqual(client.get('/sheets/no.jpg',base_url='http://localhost:8767').status_code,404)
            self.assertFalse(r.gate()['manifest_publication_allowed'])

if __name__=='__main__':unittest.main()
