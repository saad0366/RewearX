"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const helpers = require('../services/nlpOccasion');
const plain = x => JSON.parse(JSON.stringify(x));
const match = name => ({name, score:1, source:'explicit_keyword'});
const cats = [{id:1,name:'Dresses',parentId:null},{id:2,name:'Shirts',parentId:null},
 {id:3,name:'Lehenga',parentId:null},{id:4,name:'Hoodies',parentId:null},
 {id:5,name:'Jackets',parentId:null},{id:6,name:'T-Shirts',parentId:null}];
function rawItem() {return {images:[{id:1,isPrimary:true,orderIndex:0,createdAt:'2026-01-01'}],
 features:{createdAt:'2026-01-02',imagePredictions:{success:true,provenance:'model_prediction',
 image_sha256:'a'.repeat(64),predictions:{occasion:{label:'wedding',confidence:.9}}}}};}

for (const [query, name] of [['wedding dress','wedding'],['party lehenga','party'],
 ['formal black shirt','formal'],['casual hoodie','casual'],['sports jacket','sports'],
 ['for a wedding','wedding'],['sportswear','sports']]) {
 test('literal occasion intent: '+query,()=>assert.deepEqual(helpers.queryOccasions(query,{occasion:[match(name)]}),[name]));
}
test('no occasion and semantic guesses ignored',()=>{
 assert.deepEqual(helpers.queryOccasions('black shirt',{occasion:[match('party')]}),[]);
 assert.deepEqual(helpers.queryOccasions('wedding dress',{occasion:[{name:'wedding',score:.99}]}),[]);
});
test('confirmed occasion normalizes and overrides raw',()=>{
 const item=rawItem();item.features.imagePredictions.confirmed_attributes={occasion:'  FORMAL  '};
 assert.equal(helpers.itemOccasion(item),'formal');
});
for (const value of [null,'','unsupported',false]) test('confirmation clear/invalid is authoritative '+value,()=>{
 const item=rawItem();item.features.imagePredictions.confirmed_attributes={occasion:value};
 assert.equal(helpers.itemOccasion(item),null);
});
test('missing occasion has no label',()=>assert.equal(helpers.itemOccasion({}),null));
test('valid current raw prediction is fallback, including serialized JSON',()=>{
 const item=rawItem();assert.equal(helpers.itemOccasion(item),'wedding');
 item.features.imagePredictions=JSON.stringify(item.features.imagePredictions);
 assert.equal(helpers.itemOccasion(item),'wedding');
});
for (const field of ['label','confidence','valid','supported']) test('invalid raw '+field+' ignored',()=>{
 const item=rawItem();item.features.imagePredictions.predictions.occasion[field]=
 field==='label'?'business':field==='confidence'?1.5:false;
 assert.equal(helpers.itemOccasion(item),null);
});
test('untrusted/malformed raw predictions ignored',()=>{
 for(const mutate of [i=>i.features.imagePredictions.provenance='manual',
 i=>i.features.imagePredictions.success=false,i=>i.features.imagePredictions.image_sha256='invalid',
 i=>i.features.imagePredictions='broken',i=>i.features.imagePredictions.predictions.occasion.confidence=NaN]) {
 const item=rawItem();mutate(item);assert.equal(helpers.itemOccasion(item),null);
 }
});
test('changed cover, missing freshness evidence and stale flags ignored',()=>{
 for(const mutate of [i=>i.images[0].orderIndex=1,i=>i.images[0].createdAt='2026-01-03',
 i=>delete i.features.createdAt,i=>i.images[0].createdAt=null,
 i=>i.images[0].orderIndex=null,i=>i.features.imagePredictions.stale=true,
 i=>i.features.imagePredictions.learning_feedback={snapshot:{cover_image_id:2}}]) {
 const item=rawItem();mutate(item);assert.equal(helpers.itemOccasion(item),null);
 }
});
test('stale confirmed cover ignored without resurrecting raw',()=>{
 const item=rawItem();Object.assign(item.features.imagePredictions,{confirmed_attributes:{occasion:'party'},learning_feedback:{snapshot:{cover_image_id:2}}});
 assert.equal(helpers.itemOccasion(item),null);
});
test('literal singular/plural category priority and no occasion→category guesses',()=>{
 assert.deepEqual(helpers.occasionCategoryIds('wedding dress',cats),[1]);
 assert.deepEqual(helpers.occasionCategoryIds('casual t shirt',cats),[6]);
 assert.deepEqual(helpers.occasionCategoryIds('party wear',cats),[]);
 assert.deepEqual(helpers.occasionCategoryIds('wedding dress or shirt',cats),[]);
});
test('category hierarchy and equivalent DB names included',()=>{
 assert.deepEqual(helpers.occasionCategoryIds('wedding dress',[...cats,{id:7,name:'Dress',parentId:null},{id:8,name:'Evening Gowns',parentId:1}]),[1,7,8]);
});

function searchFixture(query,occasion='wedding',options={}) {
 const calls=[];let retrieval;
 const rows=(options.rows || [
 {id:1,title:'Elegant garment',categoryId:1,category:cats[0],features:{imagePredictions:{confirmed_attributes:{occasion:'wedding'}}}},
 {id:2,title:'Elegant garment',categoryId:1,category:cats[0],features:{imagePredictions:{confirmed_attributes:{occasion:'formal'}}}},
 {id:3,title:'Elegant garment',categoryId:1,category:cats[0],features:{}},
 {id:4,title:'Wedding shirt',categoryId:2,category:cats[1],features:{imagePredictions:{confirmed_attributes:{occasion:'wedding'}}}}
 ]).map(x=>({...x,toJSON(){return {...x};}}));
 const models={ClothingItem:{findAll:async spec=>{
 if(spec.raw)return [{color:'black'}];retrieval=spec;
 if(spec.where.categoryId?.IN)return rows.filter(i=>spec.where.categoryId.IN.includes(i.categoryId));
 if(spec.where.categoryId)return rows.filter(i=>spec.where.categoryId===i.categoryId);return rows;
 }},Category:{findAll:async()=>cats},ClothingImage:{},ItemFeatures:{},User:{}};
 const axios={post:async(url,body)=>{calls.push({url,body});
 if(options.fail)throw new Error('offline');
 if(url.endsWith('/attributes'))return {data:{category:[],color:options.color?[{name:'black',score:.9}]:[],gender:[],condition:[],occasion:occasion?[match(occasion)]:[]}};
 if(url.endsWith('/extract'))return {data:{embedding:[.1,.2]}};
 if(url.endsWith('/rank'))return {data:{rankings:body.items.map(i=>({id:i.id,score:i.id===4?.99:.7}))}};
 throw new Error('unexpected endpoint');}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/nlpSearchService.js'),'utf8'),{
 module,exports:module.exports,process:{env:{}},require:id=>({axios,sequelize:{Op:{ne:'NE',in:'IN',like:'LIKE'},fn:()=>'',col:()=>''},
 '../models':models,'../utils/logger':{info(){},warn(){},error(){}},'./nlpOccasion':helpers}[id] || require(id))});
 return {api:module.exports,calls,get retrieval(){return retrieval;},run:()=>module.exports.nlpSearch(query,99,20)};
}
test('wedding dress excludes unrelated high-semantic wedding shirt; bonus and missing-label neutrality',async()=>{
 const f=searchFixture('wedding dress');const result=await f.run();
 assert.deepEqual(plain(result.map(i=>i.id)),[1,2,3]);
 assert.ok(Math.abs(result[0].matchScore-result[1].matchScore-.08)<1e-10);
 assert.equal(result[1].matchScore,result[2].matchScore);
 assert.deepEqual(plain(f.retrieval.where.categoryId),{IN:[1]});
 assert.equal(f.retrieval.include.filter(i=>i.as==='features').length,1);
 assert.equal(f.calls.find(c=>c.url.endsWith('/attributes')).body.occasions.length,5);
});
test('no-occasion ranking reproduces original formula and queries',async()=>{
 const f=searchFixture('elegant garment',null);const result=await f.run();
 assert.equal(f.retrieval.where.categoryId,undefined);
 const a=result.find(i=>i.id===1),b=result.find(i=>i.id===2),c=result.find(i=>i.id===3);
 assert.ok(Math.abs(a.matchScore-(.7*.55+1*.20+0*.15+1*.10))<1e-10);
 assert.equal(a.matchScore,b.matchScore);assert.equal(b.matchScore,c.matchScore);
 const payload=f.calls.find(c=>c.url.endsWith('/rank')).body.items;
 assert.ok(payload.every(i=>!i.text.includes('Occasion:')));
});
test('existing color filter and stored MiniLM vectors preserved',async()=>{
 const rows=[{id:1,title:'Formal black shirt',categoryId:2,category:cats[1],features:{textVector:JSON.stringify({embedding:[.2,.3]}),imagePredictions:{confirmed_attributes:{occasion:'formal'}}}}];
 const f=searchFixture('formal black shirt','formal',{color:true,rows});await f.run();
 assert.deepEqual(plain(f.retrieval.where.color),{LIKE:'%black%'});
 assert.deepEqual(plain(f.calls.find(c=>c.url.endsWith('/rank')).body.items[0]),{id:1,embedding:[.2,.3]});
});
test('Flask outage continues to trigger existing keyword fallback',async()=>{
 const f=searchFixture('wedding dress','wedding',{fail:true});assert.equal(await f.run(),null);
});
