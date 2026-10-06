"""Apply sampled issue holds to audit proposals, preserving original review data."""
import argparse
from collections import Counter,defaultdict
import json
import hashlib
import re
from pathlib import Path
from feature_extraction.training.phase3_practical_audit import issue_estimate,stats


DEFINITE={'irrelevant_or_unusable_crop','clear_sleeve_label_conflict','clear_source_label_conflict'}


def conservative_prefix_groups(rows):
    """Unverified wNNN_ prefixes are conservative constraints, not event IDs."""
    parent={r['proposed_group_id']:r['proposed_group_id'] for r in rows}
    def find(g):
        while parent[g]!=g:parent[g]=parent[parent[g]];g=parent[g]
        return g
    prefixes=defaultdict(list)
    for r in rows:
        if r['source']=='wedding':
            match=re.match(r'^(w\d+)_',r.get('photo_group',''))
            if match:prefixes[match[1]].append(r)
    for group in prefixes.values():
        for r in group[1:]:parent[find(r['proposed_group_id'])]=find(group[0]['proposed_group_id'])
    components=defaultdict(list)
    for r in rows:components[find(r['proposed_group_id'])].append(r)
    held=[];conflicts=[]
    for group in components.values():
        if len({r['split'] for r in group})>1:
            held.extend(r for r in group if r['source']!='party')
            conflicts.append(dict(uids=[r['uid'] for r in group],reason='unverified_wedding_prefix_cross_split_group'))
        else:
            gid='practical:'+hashlib.sha256('|'.join(sorted(r['uid'] for r in group)).encode()).hexdigest()[:16]
            for r in group:r['proposed_group_id']=gid
    return held,conflicts


def assess(directory,observations,output):
    directory=Path(directory).resolve();output=Path(output).resolve()
    if output.exists():raise FileExistsError('Assessment output already exists')
    samples=json.loads((directory/'sample_index.json').read_text());rows=json.loads((directory/'candidate_audit_records.json').read_text())
    data=json.loads(Path(observations).read_text());obs=data['observations']
    expected={r['uid'] for sample in samples.values() for r in sample}
    if {r['uid'] for r in obs}!=expected or len(obs)!=len(expected):raise ValueError('One observation per sampled image required')
    byuid={r['uid']:r for r in obs};records={r['uid']:r for r in rows}
    holdgroups={records[r['uid']]['proposed_group_id'] for r in obs if set(r['issues']) & DEFINITE or r.get('quarantine',False)}
    held=[r for r in rows if r['proposed_group_id'] in holdgroups and r['source']!='party']
    protected_conflicts=[r['uid'] for r in rows if r['proposed_group_id'] in holdgroups and r['source']=='party']
    held_uids={r['uid'] for r in held}
    retained=[r for r in rows if r['uid'] not in held_uids]
    prefix_held,prefix_conflicts=conservative_prefix_groups(retained)
    prefix_uids={r['uid'] for r in prefix_held};retained=[r for r in retained if r['uid'] not in prefix_uids]
    held.extend(prefix_held)
    leakage={}
    for key in ('uid','sha256','proposed_group_id'):
        splits=defaultdict(set)
        for r in retained:
            if r.get(key):splits[r[key]].add(r['split'])
        leakage[key+'_cross_split_conflicts']=sum(len(v)>1 for v in splits.values())
    leakage['party_only_masks_preserved']=all(r['labels'].get('occasion')=='party' and
        all(v is None for h,v in r['labels'].items() if h!='occasion') for r in retained if r['source']=='party')
    estimates={}
    for source,sample in samples.items():
        if source=='wedding':
            n=sum(bool(set(byuid[r['uid']]['issues']) & DEFINITE) for r in sample)
            estimates[source]=dict(measured='recognizable/usable clothing crop; NOT visual wedding-specific accuracy',
                estimate=issue_estimate(n,len(sample)),sampling='Seed-42 random sample of retained source-labeled subset',
                ambiguity_count=sum(bool(byuid[r['uid']].get('ambiguities')) for r in sample))
        else:
            strata=defaultdict(list)
            for r in sample:
                for key in r.get('sampled_for',[]):strata[key].append(r)
            estimates[source]={key:dict(estimate=issue_estimate(sum(bool(set(byuid[r['uid']]['issues']) & DEFINITE) for r in sample),len(sample)),
                ambiguity_count=sum(bool(byuid[r['uid']].get('ambiguities')) for r in sample),sampling='Random hash-ranked within this label stratum; descriptive issue counts, not measured model accuracy') for key,sample in strata.items()}
    output.mkdir(parents=True)
    result=dict(status='SOURCE_LABEL_PLAN_PENDING_SAMPLE_LEVEL_DECISION',reviewer_kind=data['reviewer_kind'],quality_estimates=estimates,
        confidence_caveat='Wilson intervals assume representative independent sampling; unknown event/product correlations and visual uncertainty limit them.',
        additional_held_by_source=dict(Counter(r['source'] for r in held)),additional_held_uids=[r['uid'] for r in held],
        protected_party_conflicts=protected_conflicts,counts=stats(retained),by_source=dict(Counter(r['source'] for r in retained)),total=len(retained),
        precautionary_sample_holds=[r['uid'] for r in obs if r.get('quarantine',False) and not set(r['issues']) & DEFINITE],
        wedding_prefix_conflicts=prefix_conflicts,wedding_prefix_policy='Unverified album/sequence heuristic, not certified event or person identity; conflicting components held, same-split groups merged.',
        label_origin=dict(Counter(r['label_origin'] for r in retained)),training_started=False,final_manifest_published=False,
        leakage_checks=leakage,
        individual_approval_required=False,human_statuses_modified=False,
        split_changes='None: conservatively subtract high-risk groups; inherited/proposed assignments retained.')
    (output/'assessment.json').write_text(json.dumps(result,indent=2))
    (output/'retained_audit_records.json').write_text(json.dumps(retained,indent=2))
    (output/'sample_issue_quarantine_overlay.json').write_text(json.dumps(held,indent=2))
    print(json.dumps({k:result[k] for k in ('by_source','total','additional_held_by_source')},indent=2))


def main():
    p=argparse.ArgumentParser();p.add_argument('--audit-dir',required=True);p.add_argument('--observations',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    assess(a.audit_dir,a.observations,a.output)

if __name__=='__main__':main()
