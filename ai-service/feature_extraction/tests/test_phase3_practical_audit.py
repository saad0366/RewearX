import tempfile
from pathlib import Path
import unittest
import json
from PIL import Image
from feature_extraction.training.phase3_practical_audit import sample_rows,split_groups,quality,issue_estimate,native_group_key
from feature_extraction.training.phase3_sample_assessment import assess,conservative_prefix_groups


class PracticalTests(unittest.TestCase):
    def test_unverified_prefix_conflicts_are_held_without_reassigning(self):
        a=dict(uid='a',source='wedding',split='train',photo_group='w007_0001',proposed_group_id='a',human_review_status='unreviewed')
        b=dict(a,uid='b',split='test',photo_group='w007_0002',proposed_group_id='b')
        held,conflicts=conservative_prefix_groups([a,b])
        self.assertEqual(len(held),2);self.assertEqual(len(conflicts),1)
        self.assertEqual((a['split'],b['split']),('train','test'))
        self.assertEqual(a['human_review_status'],'unreviewed')
        b['split']='train';held,conflicts=conservative_prefix_groups([a,b])
        self.assertFalse(held);self.assertFalse(conflicts)
        self.assertEqual(a['proposed_group_id'],b['proposed_group_id'])
    def test_empty_photo_group_does_not_merge_unrelated_records(self):
        a=dict(source='hf',source_id='1',photo_group='');b=dict(a,source_id='2')
        self.assertNotEqual(native_group_key(a),native_group_key(b))
    def test_stratified_sampling_and_rare_formal_no_fake_approval(self):
        rows=[dict(uid=f'{label}:{i}',source='hf',labels={'occasion':label},human_review_status='unreviewed') for label in ('formal','casual','sports') for i in range(30)]
        a=sample_rows(rows,'hf');b=sample_rows(list(reversed(rows)),'hf')
        self.assertEqual({r['uid'] for r in a},{r['uid'] for r in b})
        self.assertEqual(sum(r['labels']['occasion']=='formal' for r in a),15)
        self.assertTrue(all(r['human_review_status']=='unreviewed' for r in a))
        self.assertTrue(all('sampled_for' not in r for r in rows))
    def test_group_splits_preserve_fixed_assignments(self):
        anchor=dict(uid='hf',source='hf',split='val')
        wedding=dict(uid='w',source='wedding',split=None)
        split_groups([wedding],[[anchor,wedding]])
        self.assertEqual(wedding['split'],'val');self.assertEqual(anchor['split'],'val')
        with self.assertRaises(ValueError):split_groups([],[[anchor,dict(uid='test',source='imat',split='test')]])
    def test_blank_filters_do_not_claim_semantic_quality(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'blank.png';Image.new('RGB',(100,100),'white').save(p)
            q,*_=quality(p);self.assertTrue(q['mechanical_unusable'])
    def test_quality_interval_does_not_claim_zero_error_from_zero_issues(self):
        q=issue_estimate(0,75);self.assertGreater(q['wilson95'][1],0)
        self.assertEqual(issue_estimate(15,75)['observed_rate'],.2)
        with self.assertRaises(ValueError):issue_estimate(2,1)
    def test_sample_holds_are_overlay_only_and_preserve_party(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);source=root/'audit';source.mkdir()
            row=dict(uid='w',source='wedding',split='train',labels={'occasion':'wedding'},proposed_group_id='g',label_origin='source_labeled',human_review_status='unreviewed')
            party=dict(row,uid='p',source='party',labels={'occasion':'party'},label_origin='human_reviewed',human_review_status='approved')
            path=source/'candidate_audit_records.json';path.write_text(json.dumps([row,party]));before=path.read_bytes()
            (source/'sample_index.json').write_text(json.dumps(dict(wedding=[dict(uid='w')],hf=[],imat=[])))
            obs=root/'obs.json';obs.write_text(json.dumps(dict(reviewer_kind='assistant_visual_sample_audit',observations=[dict(uid='w',issues=['irrelevant_or_unusable_crop'],ambiguities=[])])))
            assess(source,obs,root/'result')
            result=json.loads((root/'result/assessment.json').read_text())
            self.assertEqual(result['by_source'],{'party':1});self.assertEqual(result['protected_party_conflicts'],['p'])
            self.assertEqual(path.read_bytes(),before);self.assertFalse(result['human_statuses_modified'])
            obs.write_text(json.dumps(dict(reviewer_kind='assistant_visual_sample_audit',observations=[dict(uid='w',issues=[],ambiguities=['unclear'],quarantine=True)])))
            assess(source,obs,root/'precautionary')
            result=json.loads((root/'precautionary/assessment.json').read_text())
            self.assertEqual(result['by_source'],{'party':1})
            self.assertEqual(result['quality_estimates']['wedding']['estimate']['issues'],0)
            self.assertEqual(result['precautionary_sample_holds'],['w'])
            self.assertEqual(path.read_bytes(),before)

if __name__=='__main__':unittest.main()
