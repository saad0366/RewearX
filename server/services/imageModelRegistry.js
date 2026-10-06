'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const BASE_SHA='b2911bd9d1ed6e737c3e2a4695518d48eb829fd2489fa224fa4b317340af785a';
const defaultRoot=path.resolve(__dirname,'../../ai-service/feature_extraction/runtime/learning');
const registryRoot=()=>path.resolve(process.env.IMAGE_MODEL_REGISTRY_DIR||defaultRoot);
let cachedKey=null,cachedHashes=[BASE_SHA];
function trustedCheckpointHashes(){const root=registryRoot(),file=path.join(root,'active.json');if(!fs.existsSync(file))return [BASE_SHA];
 try{const text=fs.readFileSync(file,'utf8'),key=root+text;if(key===cachedKey)return cachedHashes;const pointer=JSON.parse(text);if(pointer.base_sha256!==BASE_SHA)throw Error('Wrong base model');const hashes=[BASE_SHA];for(const entry of [pointer.current,pointer.previous].filter(Boolean)){
  const target=path.resolve(root,entry.path);if(!target.startsWith(root+path.sep)||!/^[a-f0-9]{64}$/.test(entry.sha256)||!target.endsWith('.pt'))throw Error('Invalid registered path');
  const hash=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');if(hash!==entry.sha256)throw Error('Registered hash mismatch');hashes.push(hash);
 }cachedHashes=[...new Set(hashes)];cachedKey=key;return cachedHashes;}catch{return [BASE_SHA];}}
module.exports={BASE_SHA,registryRoot,trustedCheckpointHashes};
