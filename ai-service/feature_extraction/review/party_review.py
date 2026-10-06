"""Local manual PARTY review with durable decisions and approved-only export."""

import argparse
from collections import Counter
from contextlib import contextmanager
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import threading

from flask import Flask, abort, jsonify, render_template, request, send_file

STATUSES = ("approved", "rejected", "unsure", "unreviewed")
REVIEW_FIELDS = ("image_name", "source_id", "original_party_score", "review_status", "review_timestamp",
                 "source_dataset", "image_sha256")
OTHER_HEADS = ("color", "season", "category", "sleeve_length", "pattern")


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()


def atomic_csv(path, fields, rows):
    temporary = path.with_suffix(".csv.tmp")
    with temporary.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


class ReviewStore:
    def __init__(self, manifest, review_dir):
        self.manifest = Path(manifest).resolve()
        self.data_root = self.manifest.parent
        self.review_dir = Path(review_dir).resolve()
        self.manifest_hash = digest(self.manifest)
        self.lock = threading.RLock()
        with self.manifest.open(newline="", encoding="utf-8-sig") as stream:
            self.items = list(csv.DictReader(stream))
        if not self.items:
            raise ValueError("Original manifest is empty")
        for fields in (("image_name",), ("image_sha256",), ("source_dataset", "source_id"),
                       ("source_dataset", "source_group")):
            if len({tuple(r[k] for k in fields) for r in self.items}) != len(self.items):
                raise ValueError(f"Duplicate original entries: {fields}")
        for item in self.items:
            path = (self.data_root / item["image_name"]).resolve()
            if not path.is_relative_to(self.data_root) or not path.is_file():
                raise ValueError("Unsafe or missing original image")
            if self.review_dir == path.parent or self.review_dir.is_relative_to(path.parent):
                raise ValueError("Review state must be separate from original images")
            for head in OTHER_HEADS:
                if item.get(head, "") or item.get(head + "_valid") != "0":
                    raise ValueError("Non-occasion labels must already be masked")
        if self.review_dir == self.data_root:
            raise ValueError("Use a separate review directory")
        self.review_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.review_dir / "review.sqlite3"
        self.csv_path = self.review_dir / "party_review.csv"
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS reviews (
                    image_name TEXT PRIMARY KEY, status TEXT NOT NULL
                    CHECK(status IN ('approved','rejected','unsure','unreviewed')),
                    timestamp TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS actions (
                    id INTEGER PRIMARY KEY, image_name TEXT NOT NULL, status TEXT NOT NULL, timestamp TEXT NOT NULL);
            """)
            existing = db.execute("SELECT value FROM metadata WHERE key='manifest_sha256'").fetchone()
            if existing and existing[0] != self.manifest_hash:
                raise ValueError("Review state belongs to a different or changed manifest")
            if not existing:
                if self.csv_path.exists() or db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]:
                    raise ValueError("Unbound review data exists; refusing to overwrite")
                db.execute("INSERT INTO metadata VALUES ('manifest_sha256', ?)", (self.manifest_hash,))
                db.executemany("INSERT INTO reviews VALUES (?, 'unreviewed', '')",
                               ((r["image_name"],) for r in self.items))
            names = {r[0] for r in db.execute("SELECT image_name FROM reviews")}
            if names != {r["image_name"] for r in self.items}:
                raise ValueError("Review state membership differs from original manifest")
        self.sync_csv()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=30)
        db.execute("PRAGMA synchronous=FULL")
        try:
            with db:
                yield db
        finally:
            db.close()

    def check_manifest(self):
        if digest(self.manifest) != self.manifest_hash:
            raise ValueError("Original manifest changed; review/export stopped")

    def rows(self):
        with self.connect() as db:
            saved = {name: (status, timestamp) for name, status, timestamp in db.execute("SELECT * FROM reviews")}
        return [{"image_name": item["image_name"], "source_id": item["source_id"],
                 "original_party_score": item["party_group_score"], "review_status": saved[item["image_name"]][0],
                 "review_timestamp": saved[item["image_name"]][1], "source_dataset": item["source_dataset"],
                 "image_sha256": item["image_sha256"]} for item in self.items]

    def sync_csv(self):
        with self.lock:
            with self.connect() as db:
                # Serialize CSV snapshots across server/export processes too.
                db.execute("BEGIN IMMEDIATE")
                atomic_csv(self.csv_path, REVIEW_FIELDS, self.rows())

    def counts(self):
        counts = Counter(r["review_status"] for r in self.rows())
        return {"total": len(self.items), **{s: counts[s] for s in STATUSES}}

    def update(self, index, status):
        if type(index) is not int or not 0 <= index < len(self.items) or status not in STATUSES:
            raise ValueError("Invalid image or review status")
        with self.lock:
            self.check_manifest()
            name = self.items[index]["image_name"]
            with self.connect() as db:
                current = db.execute("SELECT status FROM reviews WHERE image_name=?", (name,)).fetchone()[0]
                if current != status:
                    timestamp = datetime.now(timezone.utc).isoformat(timespec="microseconds")
                    db.execute("UPDATE reviews SET status=?,timestamp=? WHERE image_name=?", (status, timestamp, name))
                    db.execute("INSERT INTO actions(image_name,status,timestamp) VALUES (?,?,?)", (name, status, timestamp))
            # SQLite commit is durable first. Startup rebuilds this derived CSV
            # if interrupted between the commit and atomic CSV replacement.
            self.sync_csv()
            return self.rows()[index]

    def image_path(self, index):
        if not 0 <= index < len(self.items):
            raise ValueError("Unknown image")
        item = self.items[index]
        path = (self.data_root / item["image_name"]).resolve()
        if not path.is_relative_to(self.data_root) or digest(path) != item["image_sha256"]:
            raise ValueError("Original image integrity check failed")
        return path


def export_approved(store, output):
    store.check_manifest()
    output = Path(output).resolve()
    if output.exists():
        raise FileExistsError("Export already exists; no overwrites are allowed")
    if store.manifest.is_relative_to(output) or output == store.review_dir:
        raise ValueError("Unsafe export location")
    for item in store.items:
        if output.is_relative_to((store.data_root / item["image_name"]).parent):
            raise ValueError("Export must be separate from original images")
    snapshot = store.rows()
    approved = {r["image_name"]: r for r in snapshot if r["review_status"] == "approved"}
    if not approved:
        raise ValueError("No explicitly approved images; no export created")
    with store.connect() as db:
        for name, review in approved.items():
            if not db.execute("SELECT 1 FROM actions WHERE image_name=? AND status='approved' AND timestamp=?",
                              (name, review["review_timestamp"])).fetchone():
                raise ValueError("Approval lacks a recorded explicit review action")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".party_review_export_", dir=output.parent) as temporary:
        stage = Path(temporary) / "dataset"
        stage.mkdir()
        (stage / "images").mkdir()
        exported = []
        for index, item in enumerate(store.items):
            review = approved.get(item["image_name"])
            if not review:
                continue
            source = store.image_path(index)
            image_name = "images/" + item["image_sha256"] + source.suffix.lower()
            raw = source.read_bytes()
            if hashlib.sha256(raw).hexdigest() != item["image_sha256"]:
                raise ValueError("Original image changed during export")
            (stage / image_name).write_bytes(raw)
            row = {**item, "original_image_name": item["image_name"], "image_name": image_name,
                   "human_reviewed": 1, "review_status": "approved", "review_timestamp": review["review_timestamp"],
                   "review_method": "explicit_local_browser_review", "needs_manual_review": 0,
                   "label_status": "human_reviewed", "training_approved": 0,
                   "occasion": "party", "occasion_valid": 1, "pseudo_label": 1}
            for head in OTHER_HEADS:
                row[head] = ""
                row[head + "_valid"] = 0
            exported.append(row)
        store.check_manifest()
        atomic_csv(stage / "party_reviewed_manifest.csv", list(exported[0]), exported)
        audit = {"exported_count": len(exported), "review_counts": dict(Counter(r["review_status"] for r in snapshot)),
                 "original_manifest": str(store.manifest), "original_manifest_sha256": store.manifest_hash,
                 "review_csv": str(store.csv_path), "export_timestamp": datetime.now(timezone.utc).isoformat(),
                 "source_distribution": dict(Counter(r["source_dataset"] for r in exported)),
                 "human_reviewed": True, "training_approved": False,
                 "notes": ["Only explicit approved decisions are included; unsure and unreviewed are excluded",
                           "Pseudo-label model provenance is retained; original images and manifest are untouched",
                           "This export does not run or authorize model training"]}
        (stage / "party_review_audit.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")
        if output.exists():
            raise FileExistsError("Export destination appeared during export")
        stage.rename(output)
    return audit


def create_app(manifest, review_dir):
    store = ReviewStore(manifest, review_dir)
    app = Flask(__name__)
    app.config.update(REVIEW_STORE=store, REVIEW_TOKEN=secrets.token_urlsafe(32), MAX_CONTENT_LENGTH=4096)

    @app.before_request
    def local_only():
        if request.host.split(":")[0] not in ("localhost", "127.0.0.1"):
            abort(403)
        if request.method == "POST" and request.headers.get("X-Review-Token") != app.config["REVIEW_TOKEN"]:
            abort(403)

    @app.get("/")
    def index():
        return render_template("party_review.html", token=app.config["REVIEW_TOKEN"])

    @app.get("/api/items")
    def items():
        try:
            page = max(0, int(request.args.get("page", "0")))
        except ValueError:
            abort(400)
        status = request.args.get("status", "all")
        if status not in ("all",) + STATUSES:
            abort(400)
        reviews = store.rows()
        filtered = [{**item, **reviews[i], "index": i} for i, item in enumerate(store.items)
                    if status == "all" or reviews[i]["review_status"] == status]
        return jsonify(items=filtered[page * 50:(page + 1) * 50], filtered_total=len(filtered),
                       page=page, page_size=50, counts=store.counts())

    @app.get("/image/<int:index>")
    def image(index):
        try:
            path = store.image_path(index)
        except (OSError, ValueError):
            abort(404)
        return send_file(path, conditional=True)

    @app.post("/api/review")
    def review():
        data = request.get_json(silent=True) or {}
        try:
            row = store.update(data.get("index"), data.get("status"))
        except (OSError, ValueError) as exc:
            return jsonify(error=str(exc)), 400
        return jsonify(review=row, counts=store.counts())

    @app.get("/api/health")
    def health():
        return jsonify(app="rewearx-party-review", counts=store.counts(), training=False)

    return app


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("serve", "export"))
    parser.add_argument("--manifest", default="../datasets/phase3_rewearx/party_fashionclip_manifest.csv")
    parser.add_argument("--review-dir", default="../artifacts/party_fashionclip_review")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--output", default="../datasets/phase3_rewearx/party_reviewed")
    args = parser.parse_args(argv)
    if args.command == "serve":
        app = create_app(args.manifest, args.review_dir)
        print(f"Review {len(app.config['REVIEW_STORE'].items)} images at http://127.0.0.1:{args.port}/", flush=True)
        app.run(host="127.0.0.1", port=args.port, debug=False, use_reloader=False, threaded=True)
    else:
        result = export_approved(ReviewStore(args.manifest, args.review_dir), args.output)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
