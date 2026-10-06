import csv
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image
from feature_extraction.review.party_review import ReviewStore, create_app, digest, export_approved


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.original = self.root / "original"
        (self.original / "images").mkdir(parents=True)
        self.manifest = self.original / "party_manifest.csv"
        self.review = self.root / "review"
        self.data = []
        for i in range(4):
            path = self.original / "images" / f"{i}.png"
            Image.new("RGB", (14, 16), (i * 50, 20, 60)).save(path)
            row = {"image_name": f"images/{i}.png", "source_dataset": "test", "source_id": f"original-{i}",
                   "source_group": f"group-{i}", "source_path": f"provenance/{i}.png", "image_sha256": digest(path),
                   "party_group_score": ".24", "party_margin": ".021", "party_prompt_agreement": "3",
                   "occasion": "party", "occasion_valid": "1", "pseudo_label": "1", "training_approved": "0"}
            for head in ("color", "season", "category", "sleeve_length", "pattern"):
                row[head] = ""
                row[head + "_valid"] = "0"
            self.data.append(row)
        self.write_manifest()

    def write_manifest(self):
        with self.manifest.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(self.data[0]))
            writer.writeheader()
            writer.writerows(self.data)

    def csv_rows(self, path):
        with path.open(newline="", encoding="utf-8") as stream:
            return list(csv.DictReader(stream))

    def test_all_default_unreviewed_and_empty_export_rejected(self):
        store = ReviewStore(self.manifest, self.review)
        self.assertEqual(store.counts()["unreviewed"], 4)
        self.assertTrue(all(r["review_timestamp"] == "" for r in store.rows()))
        with self.assertRaises(ValueError):
            export_approved(store, self.root / "export")
        self.assertFalse((self.root / "export").exists())

    def test_each_action_persists_and_resumes(self):
        store = ReviewStore(self.manifest, self.review)
        for index, status in enumerate(("approved", "rejected", "unsure")):
            store.update(index, status)
            row = self.csv_rows(store.csv_path)[index]
            self.assertEqual(row["review_status"], status)
            self.assertTrue(row["review_timestamp"])
        resumed = ReviewStore(self.manifest, self.review)
        self.assertEqual([r["review_status"] for r in resumed.rows()], ["approved", "rejected", "unsure", "unreviewed"])
        resumed.update(0, "rejected")
        self.assertEqual(self.csv_rows(resumed.csv_path)[0]["review_status"], "rejected")

    def test_csv_recovered_after_committed_action(self):
        store = ReviewStore(self.manifest, self.review)
        store.update(0, "approved")
        store.csv_path.write_text("interrupted CSV", encoding="utf-8")
        resumed = ReviewStore(self.manifest, self.review)
        self.assertEqual(self.csv_rows(resumed.csv_path)[0]["review_status"], "approved")

    def test_idempotence_and_duplicate_prevention(self):
        store = ReviewStore(self.manifest, self.review)
        first = store.update(0, "approved")
        second = store.update(0, "approved")
        self.assertEqual(first, second)
        with store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM actions").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0], 4)
        self.data.append(dict(self.data[0]))
        self.write_manifest()
        with self.assertRaises(ValueError):
            ReviewStore(self.manifest, self.root / "different_review")

    def test_only_approved_export_preserves_provenance_and_originals(self):
        before = {p: digest(p) for p in self.original.rglob("*") if p.is_file()}
        store = ReviewStore(self.manifest, self.review)
        for index, status in enumerate(("approved", "rejected", "unsure")):
            store.update(index, status)
        out = self.root / "export"
        audit = export_approved(store, out)
        self.assertEqual(audit["exported_count"], 1)
        row = self.csv_rows(out / "party_reviewed_manifest.csv")[0]
        self.assertEqual(row["source_id"], "original-0")
        self.assertEqual(row["source_path"], "provenance/0.png")
        self.assertEqual(row["original_image_name"], "images/0.png")
        self.assertEqual(row["human_reviewed"], "1")
        self.assertEqual(row["review_status"], "approved")
        self.assertEqual(row["image_sha256"], digest(out / row["image_name"]))
        for head in ("color", "season", "category", "sleeve_length", "pattern"):
            self.assertEqual(row[head], "")
            self.assertEqual(row[head + "_valid"], "0")
        self.assertEqual(before, {p: digest(p) for p in before})
        with self.assertRaises(FileExistsError):
            export_approved(store, out)

    def test_changed_original_manifest_is_rejected(self):
        store = ReviewStore(self.manifest, self.review)
        self.manifest.write_text(self.manifest.read_text() + "\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            store.update(0, "approved")
        with self.assertRaises(ValueError):
            ReviewStore(self.manifest, self.review)

    def test_web_actions_token_and_image_access(self):
        app = create_app(self.manifest, self.review)
        client = app.test_client()
        self.assertEqual(client.get("/").status_code, 200)
        data = client.get("/api/items").get_json()
        self.assertEqual(data["page_size"], 50)
        self.assertEqual(len(data["items"]), 4)
        image_response = client.get("/image/0")
        self.assertEqual(image_response.status_code, 200)
        image_response.close()
        self.assertEqual(client.get("/image/999").status_code, 404)
        self.assertEqual(client.post("/api/review", json={"index": 0, "status": "approved"}).status_code, 403)
        headers = {"X-Review-Token": app.config["REVIEW_TOKEN"]}
        result = client.post("/api/review", json={"index": 0, "status": "approved"}, headers=headers)
        self.assertEqual(result.get_json()["counts"]["approved"], 1)
        self.assertEqual(client.get("/api/items?status=unreviewed").get_json()["filtered_total"], 3)
        self.assertEqual(client.post("/api/review", json={"index": 0, "status": "auto"}, headers=headers).status_code, 400)

    def test_csv_alone_cannot_forge_approval(self):
        store = ReviewStore(self.manifest, self.review)
        text = store.csv_path.read_text().replace("unreviewed", "approved")
        store.csv_path.write_text(text)
        with self.assertRaises(ValueError):
            export_approved(store, self.root / "export")


if __name__ == "__main__":
    unittest.main()
