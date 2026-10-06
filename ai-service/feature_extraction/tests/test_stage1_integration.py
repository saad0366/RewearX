"""Stage 1 guard + actual accepted checkpoint checks. No training or writes."""
import hashlib
import os
import json
import subprocess
from io import BytesIO
from pathlib import Path
import unittest
from unittest.mock import patch
import torch
from PIL import Image
from feature_extraction.app import create_app
from feature_extraction.inference_service import ImageInferenceService
from feature_extraction.prediction_policy import UNSUPPORTED_CLASSES

SHA = "b2911bd9d1ed6e737c3e2a4695518d48eb829fd2489fa224fa4b317340af785a"
ROOT = Path(__file__).resolve().parents[3]
CHECKPOINT = ROOT / "ai-service/feature_extraction/checkpoints/phase3_stage_a_best.pt"

class HashGuardTests(unittest.TestCase):
    def test_wrong_hash_rejected_before_torch_load(self):
        with patch("feature_extraction.inference_service.Path.is_file", return_value=True), \
             patch("feature_extraction.inference_service.Path.open", return_value=BytesIO(b"wrong weights")), \
             patch("feature_extraction.inference_service.torch.load") as load:
            service = ImageInferenceService("fixture.pt", expected_sha256=SHA)
            self.assertFalse(service.load_checkpoint())
            self.assertEqual(service.not_ready_reason,"checkpoint_hash_mismatch")
            load.assert_not_called()

@unittest.skipUnless(os.getenv("REWEARX_REAL_CHECKPOINT_TEST") == "1" and (ROOT / "ai-service/feature_extraction/phase2_pakistani_best.pt").exists(), "opt-in real checkpoint verification")
class ActualCheckpointTests(unittest.TestCase):
    def test_accepted_checkpoint_and_frozen_heads_remain_unchanged(self):
        before = hashlib.sha256(CHECKPOINT.read_bytes()).hexdigest()
        self.assertEqual(before,SHA)
        source = ROOT / "ai-service/feature_extraction/phase2_pakistani_best.pt"
        phase2_before = hashlib.sha256(source.read_bytes()).hexdigest()
        old = torch.load(source,map_location="cpu",weights_only=True)
        service = ImageInferenceService(str(CHECKPOINT),expected_sha256=SHA)
        self.assertTrue(service.load_checkpoint(),service.not_ready_reason)
        state=service._model.state_dict()
        for name,tensor in old["state_dict"].items():
            if not name.startswith(("heads.occasion.","heads.season.")):
                self.assertTrue(torch.equal(state[name],tensor),name)
        app=create_app();app.extensions["image_inference_service"]=service
        stream=BytesIO();Image.new("RGB",(256,256),"blue").save(stream,format="PNG");stream.seek(0)
        response=app.test_client().post("/api/image/extract",data={"image":(stream,"test.png","image/png")})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json["model"]["checkpoint_sha256"],SHA)
        # Validate the actual Flask response with Node's adapter, without installing packages.
        node_code = """const fs=require('node:fs'),vm=require('node:vm');
const filename=process.argv[1],realRequire=require('node:module').createRequire(filename),m={exports:{}};
vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:m,exports:m.exports,Buffer,Blob,FormData,AbortSignal,Date,process,
require:id=>id==='axios'?{}:realRequire(id)});
m.exports.validatePredictions(JSON.parse(fs.readFileSync(0,'utf8')));"""
        subprocess.run(["node","--eval",node_code,str(ROOT / "server/services/imageAiService.js")],
                       input=json.dumps(response.json),text=True,check=True,capture_output=True)
        self.assertEqual(set(response.json["predictions"]),{"color","occasion","season","category","sleeve_length","pattern"})
        for head,labels in UNSUPPORTED_CLASSES.items():
            self.assertNotIn(response.json["predictions"][head]["label"],labels)
            self.assertEqual(response.json["predictions"][head]["unsupported_classes"],labels)
        self.assertEqual(hashlib.sha256(CHECKPOINT.read_bytes()).hexdigest(),before)
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),phase2_before)

if __name__ == "__main__":
    unittest.main()
