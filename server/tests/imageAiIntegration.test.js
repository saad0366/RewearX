'use strict';
// Protocol fixtures only. No DB, Cloudinary, real listings or fabricated runtime predictions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'../..');
const taxonomy = require('../config/imageTaxonomy');
const ApiError = require('../utils/ApiError');
const mapping = require('../services/imageCategoryMapping');
function load(relative, deps, env = {}) {
  const filename = path.join(root,relative), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename,'utf8'), {
    module,exports:module.exports,Buffer,Blob,FormData,AbortSignal,Date,
    process:{env},require:id => Object.hasOwn(deps,id) ? deps[id] : require(id),
  },{filename});
  return module.exports;
}
const service = (post,env) => load('server/services/imageAiService.js', {
  './imageModelRegistry':require('../services/imageModelRegistry'), axios:{post}, '../utils/ApiError':ApiError, '../config/imageTaxonomy':taxonomy,
},env);
const ai = service();
const file = {buffer:Buffer.from('protocol bytes'),mimetype:'image/png',originalname:'source.png'};
const plain = x => JSON.parse(JSON.stringify(x));
function response(colors = ['black']) {
  const predictions = Object.fromEntries(Object.entries(taxonomy).map(([head,labels]) => [head,{
    label:labels[0],confidence:0.8,
    ...(ai.UNSUPPORTED[head] ? {unsupported_classes:ai.UNSUPPORTED[head],support_status:'limited_classes',confidence_interpretation:ai.INTERPRETATION} : {}),
  }]));
  const selected = taxonomy.color.filter(c => colors.includes(c));
  predictions.color = {label:selected.length === 0 ? null : selected.length === 1 ? selected[0] : selected.length === 2 ? selected : 'multicolor',
    labels:selected,confidence:selected.length ? 0.9 : 0,probabilities:Object.fromEntries(taxonomy.color.map(c => [c,selected.includes(c)?0.9:0.1]))};
  return plain({success:true,predictions,model:{architecture:'efficientnet_b0_six_head_v2',checkpoint_sha256:ai.CHECKPOINT_SHA256}});
}
for (const colors of [[],['gold'],['black','gold'],['black','white','gold']]) {
  test(`accept color format ${JSON.stringify(colors)} and preserve metadata`,() => {
    const data=response(colors); assert.deepEqual(plain(ai.validatePredictions(data)),data);
  });
}
test('ordered taxonomy matches Python exactly without importing models',() => {
  const python = execFileSync('python',['-B','-c',
    'import ast,json,pathlib; t=ast.parse(pathlib.Path("ai-service/feature_extraction/clothing_config.py").read_text()); print(json.dumps(next(ast.literal_eval(n.value) for n in t.body if isinstance(n,ast.Assign) and any(isinstance(k,ast.Name) and k.id=="CLASS_NAMES" for k in n.targets))))'],{cwd:root,encoding:'utf8'});
  assert.deepEqual(taxonomy,JSON.parse(python));
});
for(const [name,mutate] of [
  ['wrong checkpoint',d=>d.model.checkpoint_sha256='0'.repeat(64)],
  ['missing metadata',d=>delete d.predictions.category.unsupported_classes],
  ['missing head',d=>delete d.predictions.pattern],
  ['unsupported skirt',d=>d.predictions.category.label='skirt'],
  ['unsupported half',d=>d.predictions.sleeve_length.label='half'],
  ['unsupported all season',d=>d.predictions.season.label='all_season'],
  ['inconsistent color',d=>d.predictions.color.label='blue'],
  ['nonfinite confidence',d=>d.predictions.pattern.confidence=NaN],
  ['incomplete probabilities',d=>delete d.predictions.color.probabilities.gold],
]) test(`reject ${name}`,()=>{const d=response();mutate(d);assert.throws(()=>ai.validatePredictions(d),e=>e.statusCode===502);});
test('multipart field, endpoint, bounded timeout and image hash',async()=>{
  const result=await service(async(url,body,opts)=>{
    assert.equal(url,'http://image.test/api/image/extract');assert.deepEqual([...body.keys()],['image']);
    assert.equal(await body.get('image').text(),'protocol bytes');assert.equal(opts.timeout,10000);assert.equal(opts.maxRedirects,0);
    return {data:response(['black','gold'])};
  },{IMAGE_AI_SERVICE_URL:'http://image.test/'}).extractImageFeatures(file);
  assert.equal(result.image_sha256,crypto.createHash('sha256').update(file.buffer).digest('hex'));
  const storage=ai.buildPredictionStorage(result);assert.equal(storage.imagePredictions.human_confirmed,false);
  assert.equal(storage.imagePredictions.provenance,'model_prediction');assert.deepEqual(plain(storage.imagePredictions.predictions),response(['black','gold']).predictions);
  assert.equal(storage.color,undefined);assert.equal(storage.categoryId,undefined);assert.equal(storage.textVector,undefined);
});
for(const [name,input,status] of [['missing',undefined,400],['empty',{...file,buffer:Buffer.alloc(0)},400],['wrong mime',{...file,mimetype:'image/gif'},415],['oversize',{...file,buffer:Buffer.alloc(5*1024*1024+1)},413]]) {
  test(`invalid file ${name}`,async()=>{await assert.rejects(ai.extractImageFeatures(input),e=>e.statusCode===status);});
}
for(const [name,error,status] of [['connection',{code:'ECONNREFUSED'},503],['timeout',{code:'ECONNABORTED'},504],['abort',{code:'ERR_CANCELED'},504],['invalid image',{response:{status:400,data:{error:'invalid_image'}}},400],['not ready',{response:{status:503,data:{error:'image_model_not_ready'}}},503],['inference',{response:{status:500,data:{error:'private upstream detail'}}},502]]) {
  test(`Flask failure ${name}`,async()=>{await assert.rejects(service(async()=>{throw error;}).extractImageFeatures(file),e=>e.statusCode===status&&!e.message.includes('private'));});
}
const cats=[{id:90,name:'Men',parentId:null,isActive:true},{id:91,name:'Women',parentId:null,isActive:true},
  {id:300,name:'Shirts',parentId:90,isActive:true},{id:301,name:'Shirts',parentId:91,isActive:true},
  {id:700,name:'Gold',parentId:null,isActive:true},{id:850,name:'Other',parentId:null,isActive:true},
  {id:999,name:'Kurtis',parentId:91,isActive:true},{id:888,name:'Skirts',parentId:91,isActive:true}];
test('ambiguous hierarchy returns IDs, never guessed gender or model index',()=>{
  const m=mapping.mapCategory('shirt',cats);assert.equal(m.status,'ambiguous');assert.equal(m.category_id,null);assert.deepEqual(m.candidates.map(c=>c.id),[300,301]);
  assert.equal(mapping.mapCategory('other_fashion',cats).category_id,850);
});
test('inactive, orphan and inactive-parent categories are excluded',()=>{
  assert.equal(mapping.mapCategory('shirt',cats.map(c=>({...c,isActive:c.id!==90&&c.id!==91}))).status,'unmapped');
  assert.equal(mapping.mapCategory('jacket',[{id:45,name:'Jackets',parentId:55,isActive:true}]).status,'unmapped');
});
test('historical kurti is never relabeled skirt or dress',()=>{
  const before=JSON.stringify(cats);assert.equal(mapping.mapCategory('skirt',cats).status,'unsupported');
  assert.equal(mapping.mapCategory('kurti',cats).category_id,null);assert.equal(mapping.mapCategory('dress',cats).status,'unmapped');assert.equal(JSON.stringify(cats),before);
});
test('storage opt-in is absent on legacy schema, preserves MiniLM fields',()=>{
  function attrs(enabled){let fields;load('server/models/ItemFeatures.js',{sequelize:{DataTypes:{INTEGER:'int',TEXT:()=> 'text',STRING:()=> 'str',ENUM:()=> 'enum',JSON:'json',DATE:'date'}}},{IMAGE_AI_STORAGE_ENABLED:enabled})({define:(_n,a)=>{fields=a;return {};}});return fields;}
  const legacy=attrs('false'),extended=attrs('true');assert.equal(legacy.imagePredictions,undefined);
  for(const k of Object.keys(legacy)) assert.deepEqual(plain(extended[k]),plain(legacy[k]));
  assert.equal(extended.imagePredictions.field,'image_predictions');assert.equal(extended.imageProcessedAt.field,'image_processed_at');
});
test('existing GET search and authenticated extraction route retain middleware',()=>{
  const registrations=[];const get=()=>{};const auth=()=>{};const optional=()=>{};const validate=()=>{};const extract=()=>{};const capabilities=()=>{};const upload=()=>{};
  load('server/routes/search.routes.js',{
    express:{Router:()=>({get:(...a)=>registrations.push(['get',...a]),post:(...a)=>registrations.push(['post',...a])})},
    '../controllers/itemController':{search:get},'../controllers/imageAiController':{extract,capabilities},
    '../utils/validators':{itemSearch:validate},'../middleware/authMiddleware':{authenticate:auth,optionalAuth:optional},
    '../middleware/uploadMiddleware':{uploadSingle:field=>{assert.equal(field,'image');return upload;}},
  });
  assert.deepEqual(registrations,[['get','/visual',auth,capabilities],['post','/visual',auth,upload,extract],['get','/',optional,validate,get]]);
});
test('controller preserves extraction envelope and rejects unknown modes',async()=>{
  const res={};let body;let calls=0;
  const controller=load('server/controllers/imageAiController.js',{
    '../services/visualMatchingService':{matchListings:async()=>{throw Error('Unexpected matching');}},
    '../services/listingAttributeService':{getStorageCapabilities:async()=>({confirmed_attributes:false,reason:'storage_not_enabled'})},
    '../services/imageAiService':{extractImageFeatures:async()=>{calls++;return {...response(),image_sha256:'a'.repeat(64)};}},
    '../services/imageCategoryMapping':mapping,'../models':{Category:{findAll:async()=>cats}},'../utils/ApiError':ApiError,
    '../utils/response':{asyncHandler:fn=>fn,success:(_r,status,data)=>{body={success:true,data,status};return body;}},
  });
  await controller.extract({file,body:{mode:'extract'}},res);assert.equal(body.status,200);assert.equal(body.data.matching_available,false);
  assert.equal(body.data.results,undefined);assert.equal(body.data.human_confirmed,false);
  await assert.rejects(controller.extract({file,body:{mode:'unknown'}},res),e=>e.statusCode===400);assert.equal(calls,1);
});
test('unrelated listing models retain migration hashes; NLP embedding logic unchanged',()=>{
  const audit=JSON.parse(fs.readFileSync(path.join(root,'server/tests/fixtures/source-preservation.json')));
  const nlpSource=fs.readFileSync(path.join(root,'server/services/nlpSearchService.js'),'utf8').replace(/\r\n/g,'\n');
  // Occasion extraction/reranking is authorized; the original MiniLM text and
  // embedding persistence must remain byte-identical to the preserved baseline.
  const sections=[nlpSource.match(/function buildSemanticText\(item\) \{[\s\S]*?\n\}/)[0],
    nlpSource.match(/async function generateAndStoreItemEmbedding\(item\) \{[\s\S]*?\n\}/)[0]];
  const hashes=['3d7c9ae77e8714f623c881066140d655261baeda1e4e2fd2f586d0d355a7a098', '6af95b9aecca2f33011f27f9734da1d70e402d6dccf2ac35bc8bcd03ce694b28'];
  sections.forEach((section,i)=>assert.equal(crypto.createHash('sha256').update(section).digest('hex'),hashes[i]));
  const paths=['server/controllers/itemController.js',
    'server/models/ClothingItem.js','server/models/UserPreferences.js','server/services/userService.js'];
  for(const p of paths){const entry=audit.conflicts.find(e=>e.path===p);assert.ok(entry,p);
    assert.equal(crypto.createHash('sha256').update(p==='server/models/ClothingItem.js'?fs.readFileSync(path.join(root,p),'utf8').replace('color: { type: DataTypes.STRING(255)','color: { type: DataTypes.STRING(50)').replace(/\r\n/g,'\n'):fs.readFileSync(path.join(root,p))).digest('hex'),entry.latest_sha256,p);}
});
