"""Kaggle-safe transport copies; original images, manifests and models are immutable."""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
import zipfile
import torch
from feature_extraction.training.phase3_manifest import load_manifest

PREFIX = 'artifacts/phase3_finalization/'
MANIFEST = PREFIX + 'phase3_manifest.csv'
CHECKPOINT = 'ai-service/feature_extraction/phase2_pakistani_best.pt'
CACHE = PREFIX + 'baseline/validation_features.pt'
BASELINE = PREFIX + 'baseline/baseline.json'

def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def safe_entry(name):
    # Conservative ASCII allowlist, including __init__.py.
    parts = name.split('/')
    if any(p in ('', '.', '..') or not re.fullmatch(r'[A-Za-z0-9_.-]+', p) for p in parts) or PurePosixPath(name).is_absolute():
        raise ValueError('Unsafe archive entry: ' + name)
    return name

def rewrite_manifest(rows):
    rewritten = []; seen_ids = set(); seen_hashes = set()
    for i, row in enumerate(rows, 1):
        if row['canonical_id'] in seen_ids or row['image_sha256'] in seen_hashes:
            raise ValueError('Duplicate manifest ID or image hash')
        seen_ids.add(row['canonical_id']); seen_hashes.add(row['image_sha256'])
        original = row['image_path']; extension = Path(original).suffix.lower()
        if extension not in ('.jpg', '.jpeg', '.png', '.webp', '.bmp'):
            raise ValueError('Unsupported image extension: ' + original)
        annotation = json.loads(row.get('source_annotation_json') or '{}')
        updated = dict(row, image_path=f'images/{i:06d}{extension}', original_image_path=original,
                       original_source_path=annotation.get('source_path') or annotation.get('image_path') or 'datasets/' + original)
        safe_entry('datasets/' + updated['image_path']); rewritten.append(updated)
    text = io.StringIO(newline=''); writer = csv.DictWriter(text, fieldnames=list(rewritten[0]))
    writer.writeheader(); writer.writerows(rewritten)
    return rewritten, text.getvalue().encode('utf-8')

def assert_same_cache(original, bundled):
    if torch.is_tensor(original):
        if not torch.equal(original, bundled): raise ValueError('Validation tensors changed')
    elif isinstance(original, dict):
        if original.keys() != bundled.keys(): raise ValueError('Validation cache structure changed')
        for key in original:
            if key != 'manifest_sha256': assert_same_cache(original[key], bundled[key])
    elif isinstance(original, (list, tuple)):
        if len(original) != len(bundled): raise ValueError('Validation cohort changed')
        for a, b in zip(original, bundled): assert_same_cache(a, b)
    elif original != bundled: raise ValueError('Validation metadata changed')

def verify_archive(path, original_rows, checkpoint_hash, original_cache):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        for name in names: safe_entry(name)
        if len({n.casefold() for n in names}) != len(names): raise ValueError('Duplicate/case-colliding archive entries')
        if archive.testzip() is not None: raise ValueError('Archive CRC failure')
        images = [n for n in names if n.startswith('datasets/')]
        if len(images) != len(original_rows): raise ValueError('Each selected image must occur exactly once')
        # Extract only validated entries into a new disposable directory.
        with tempfile.TemporaryDirectory(prefix='.phase3-bundle-verify-', dir=Path(path).parent) as temp:
            root = Path(temp).resolve(); archive.extractall(root)
            rows = load_manifest(root / MANIFEST, root / 'datasets')
            if len(rows) != len(original_rows): raise ValueError('Extracted manifest count changed')
            for raw, row in zip(original_rows, rows):
                if sha(row['image_path']) != raw['image_sha256']: raise ValueError('Extracted image hash mismatch')
                for key, value in raw.items():
                    if key != 'image_path' and row['raw'].get(key) != value:
                        raise ValueError('Label, mask, split or provenance changed: ' + key)
                if row['raw']['original_image_path'] != raw['image_path']: raise ValueError('Original image path lost')
            if sha(root / CHECKPOINT) != checkpoint_hash: raise ValueError('Checkpoint hash mismatch')
            baseline = json.loads((root / BASELINE).read_text()); manifest_hash = sha(root / MANIFEST)
            if baseline['manifest_sha256'] != manifest_hash or baseline['validation_cache_sha256'] != sha(root / CACHE):
                raise ValueError('Bundled baseline hash references are inconsistent')
            cache = torch.load(root / CACHE, map_location='cpu', weights_only=True)
            if cache['manifest_sha256'] != manifest_hash or cache['checkpoint_sha256'] != checkpoint_hash:
                raise ValueError('Bundled cache references are inconsistent')
            assert_same_cache(original_cache, cache)
    return dict(extracted_manifest_paths_verified=len(rows), image_hashes_verified=len(rows),
                labels_masks_splits_provenance_unchanged=True, checkpoint_hash_verified=True,
                validation_tensors_unchanged=True, unsafe_entries=0, duplicate_entries=0)

def bundle(root, output, inventory_only=False, overwrite=False, baseline_dir=None, instructions=None):
    root = Path(root).resolve(); output = Path(output).resolve()
    if output.exists() and not overwrite: raise FileExistsError('Use --overwrite explicitly to rebuild an existing bundle')
    base = root / PREFIX; manifest = root / MANIFEST; checkpoint = root / CHECKPOINT
    baseline_root = Path(baseline_dir).resolve() if baseline_dir else root / PREFIX / 'baseline'
    cache_path = baseline_root / 'validation_features.pt'; report_path = baseline_root / 'baseline.json'
    report = json.loads(report_path.read_text())
    protected = {manifest: report['manifest_sha256'], checkpoint: report['checkpoint_sha256'],
                 cache_path: report['validation_cache_sha256'], report_path: sha(report_path)}
    for path, expected in protected.items():
        if sha(path) != expected: raise ValueError('Verified input changed: ' + str(path))
    records = load_manifest(manifest, root / 'datasets')
    if len(records) != 7295 or {s: sum(r['split'] == s for r in records) for s in ('train', 'val', 'test')} != {'train': 5824, 'val': 727, 'test': 744}:
        raise ValueError('Final manifest count/splits changed')
    rows = [r['raw'] for r in records]; rewritten, manifest_bytes = rewrite_manifest(rows)
    files = {CHECKPOINT: checkpoint}; code = root / 'ai-service/feature_extraction'
    files.update({p.relative_to(root).as_posix(): p for p in code.rglob('*.py')})
    files['ai-service/feature_extraction/training/phase3_stage_a_config.json'] = code / 'training/phase3_stage_a_config.json'
    for name in ('KAGGLE_STAGE_A.md', 'class_counts.csv', 'baseline_per_class.csv'):
        if (base / name).exists(): files[PREFIX + name] = base / name
    if instructions:
        files[PREFIX + 'KAGGLE_STAGE_A.md'] = Path(instructions).resolve()
    if baseline_dir:
        # Never ship stale skirt-training baseline tables with the new policy.
        files.pop(PREFIX + 'baseline_per_class.csv', None)
    for record, updated in zip(records, rewritten):
        path = Path(record['image_path'])
        if sha(path) != record['sha256']: raise ValueError('Selected image changed: ' + str(path))
        files['datasets/' + updated['image_path']] = path
    cache = torch.load(cache_path, map_location='cpu', weights_only=True)
    new_cache = dict(cache, manifest_sha256=digest(manifest_bytes))
    cache_buffer = io.BytesIO(); torch.save(new_cache, cache_buffer); cache_bytes = cache_buffer.getvalue()
    new_report = dict(report, original_manifest_sha256=report['manifest_sha256'], manifest_sha256=digest(manifest_bytes),
                      validation_cache_sha256=digest(cache_bytes), bundle_path_mapping='Original fields preserved; image bytes and validation tensors unchanged')
    audit = json.loads((base / 'phase3_manifest.audit.json').read_text())
    audit.update(original_manifest_sha256=audit['manifest_sha256'], manifest_sha256=digest(manifest_bytes), manifest=MANIFEST)
    generated = {MANIFEST: manifest_bytes, CACHE: cache_bytes, BASELINE: json.dumps(new_report, indent=2).encode(),
                 PREFIX + 'phase3_manifest.audit.json': json.dumps(audit, indent=2).encode()}
    names = sorted([*files, *generated, 'bundle_inventory.json'])
    for name in names: safe_entry(name)
    if len(set(n.casefold() for n in names)) != len(names): raise ValueError('Archive entry collision')
    inventory = dict(image_count=len(rows), file_count=len(names), original_manifest_sha256=report['manifest_sha256'],
                     manifest_sha256=digest(manifest_bytes), checkpoint_sha256=sha(checkpoint), files=names, training_started=False)
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.phase3-bundle-', suffix='.tmp', dir=output.parent); os.close(fd); temporary = Path(temporary)
    try:
        if inventory_only: temporary.write_text(json.dumps(inventory, indent=2))
        else:
            with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_STORED, allowZip64=True) as archive:
                for name, path in sorted(files.items()): archive.write(path, name)
                for name, data in generated.items(): archive.writestr(name, data)
                archive.writestr('bundle_inventory.json', json.dumps(inventory, indent=2))
            inventory['verification'] = verify_archive(temporary, rows, inventory['checkpoint_sha256'], cache)
            inventory['bundle_bytes'] = temporary.stat().st_size
        for path, expected in protected.items():
            if sha(path) != expected: raise ValueError('Original verified input changed during packaging')
        if output.exists() and not overwrite: raise FileExistsError(output)
        os.replace(temporary, output)  # Old ZIP replaced only after successful verification.
    finally: temporary.unlink(missing_ok=True)
    return inventory

def main():
    p = argparse.ArgumentParser(); p.add_argument('--root', default='..'); p.add_argument('--output', required=True)
    p.add_argument('--inventory-only', action='store_true'); p.add_argument('--overwrite', action='store_true')
    p.add_argument('--baseline'); p.add_argument('--instructions')
    a = p.parse_args(); result = bundle(a.root, a.output, a.inventory_only, a.overwrite, a.baseline, a.instructions)
    print(json.dumps({k: v for k, v in result.items() if k != 'files'}, indent=2))

if __name__ == '__main__': main()
