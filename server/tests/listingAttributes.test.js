'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ApiError=require('../utils/ApiError'),taxonomy=require('../config/imageTaxonomy');
function load(name,deps){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services',name),'utf8'),{
 module,exports:module.exports,Date,process,require:id=>Object.hasOwn(deps,id)?deps[id]:require(id),
});return module.exports;}
function fixture(enabled=true,columns=true,categoryName='Shirt'){const calls=[];let stored={predictions:{original:'preserved'},human_confirmed:false,confirmed_attributes:{season:'winter'}};
 const item={id:44,userId:1,title:'Manual jacket',color:'cream',update:async(data,opts)=>{calls.push(['update',data,opts]);Object.assign(item,data);},setDataValue:(k,v)=>item[k]=v};
 const features={rawAttributes:enabled?{imagePredictions:{},imageProcessedAt:{}}:{},
  sequelize:{getQueryInterface:()=>({describeTable:async()=>{calls.push(['describe']);return columns?{image_predictions:{},image_processed_at:{}}:{};}})},
  create:async(data)=>{calls.push(['features',data]);if(data.imagePredictions)stored=data.imagePredictions;},
  findOne:async()=>({imagePredictions:stored}),upsert:async(data,options)=>{calls.push(['upsert',data,options]);stored=data.imagePredictions;}};
 const attrs=load('listingAttributeService.js',{'../models':{ItemFeatures:features},'../config/imageTaxonomy':taxonomy,'../utils/ApiError':ApiError});
 const items=load('itemService.js',{'sequelize':{Op:{}},'../models':{ClothingItem:{create:async(data)=>{calls.push(['create',data]);Object.assign(item,data);return item;},findByPk:async()=>item},
  ItemFeatures:features,User:{},Category:{findByPk:async()=>({name:categoryName})},ClothingImage:{bulkCreate:async(data)=>calls.push(['images',data])},sequelize:{transaction:async fn=>{calls.push(['transaction']);return fn({fixture:true});}}},
  './clothingApplicability':require('../services/clothingApplicability'),'./imageLearningFeedback':{confirmFeedback:async()=>{},invalidateFeedback:async()=>{}},'./publicItemEligibility':require('../services/publicItemEligibility'),'../utils/ApiError':ApiError,'./listingAttributeService':attrs,'./cloudinaryService':{uploadMultiple:async()=>{calls.push(['upload']);return [{url:'cloudinary fixture',publicId:'fixture'}];}},
  './nlpSearchService':{generateAndStoreItemEmbedding:async full=>calls.push(['embedding',full.color])},'../utils/logger':{warn:()=>{}}});
 return {attrs,items,calls,item,stored:()=>stored};}
const payload={title:'Manual jacket',categoryId:300,size:'M',gender:'female',condition:'good',color:'black, gold',location:'Lahore'};
test('capabilities fail closed when disabled or columns missing',async()=>{
 assert.equal((await fixture(false).attrs.getStorageCapabilities()).confirmed_attributes,false);
 assert.equal((await fixture(true,false).attrs.getStorageCapabilities()).reason,'migration_required');
 assert.equal((await fixture(true,true).attrs.getStorageCapabilities()).confirmed_attributes,true);
});
test('confirmed JSON validates only existing taxonomy and rejects invented attributes',()=>{
 const f=fixture();assert.equal(f.attrs.parseConfirmedAttributes(undefined),undefined);
 assert.equal(f.attrs.parseConfirmedAttributes('{"occasion":"party"}').occasion,'party');
 for(const invalid of ['{',null,[],{gender:'female'},{occasion:'birthday'}])assert.throws(()=>f.attrs.parseConfirmedAttributes(invalid),e=>e.statusCode===422);
 assert.equal(f.attrs.parseConfirmedAttributes({pattern:null}).pattern,null);
});
test('manual creation remains available with legacy schema and preserves MiniLM/location',async()=>{
 const f=fixture(false);await f.items.createItem(1,payload,[]);
 assert.equal(f.item.color,'black, gold');assert.equal(f.item.categoryId,300);assert.equal(f.item.location,'Lahore');
 assert.ok(f.calls.some(c=>c[0]==='embedding'));assert.equal(f.calls.some(c=>c[0]==='describe'),false);
 assert.equal(f.calls.find(c=>c[0]==='features')[1].imagePredictions,undefined);
});
test('explicit extras fail before writes/uploads when unavailable',async()=>{
 for(const f of [fixture(false),fixture(true,false)]){
  await assert.rejects(f.items.createItem(1,{...payload,confirmedAttributes:{occasion:'party'}},[{buffer:Buffer.from('fixture')}]),e=>e.statusCode===409);
  assert.equal(f.calls.some(c=>['create','upload','transaction','embedding'].includes(c[0])),false);
 }
});
test('creation saves user-confirmed extras separately and preserves multi-color string',async()=>{
 const f=fixture();const result=await f.items.createItem(1,{...payload,confirmedAttributes:JSON.stringify({occasion:'party',season:'winter',sleeve_length:'full',pattern:'plain'})},[]);
 assert.equal(result.color,'black, gold');assert.equal(result.confirmedAttributes.occasion,'party');assert.equal(f.stored().confirmation.provenance,'user_confirmed');
 assert.equal(f.stored().confirmation.user_id,1);assert.equal(f.stored().predictions,undefined);assert.ok(f.calls.some(c=>c[0]==='embedding'));
});
test('edit confirmation is transactional and retains original AI metadata',async()=>{
 const f=fixture();await f.items.updateItem(44,1,{color:'red',location:'Karachi',confirmedAttributes:{occasion:'formal',pattern:null}});
 assert.equal(f.item.color,'red');assert.equal(f.item.location,'Karachi');assert.equal(f.stored().predictions.original,'preserved');assert.equal(f.stored().human_confirmed,false);
 assert.equal(f.stored().confirmed_attributes.occasion,'formal');assert.equal(f.stored().confirmed_attributes.pattern,null);assert.equal(f.stored().confirmed_attributes.season,'winter');
 assert.ok(f.calls.find(c=>c[0]==='upsert')[2].transaction);assert.ok(f.calls.some(c=>c[0]==='embedding'));
});
test('legacy edit and ownership restrictions remain unchanged',async()=>{
 const f=fixture(false);await assert.rejects(f.items.updateItem(44,2,{color:'red'}),e=>e.statusCode===403);
 assert.equal(f.calls.length,0);await f.items.updateItem(44,1,{color:'white'});assert.equal(f.item.color,'white');
 assert.equal(f.calls.some(c=>c[0]==='transaction'||c[0]==='describe'),false);assert.ok(f.calls.some(c=>c[0]==='embedding'));
});
test('malformed confirmation fails before listing data changes',async()=>{
 const f=fixture();await assert.rejects(f.items.updateItem(44,1,{color:'red',confirmedAttributes:{occasion:'invented'}}),e=>e.statusCode===422);
 assert.equal(f.item.color,'cream');assert.equal(f.calls.some(c=>c[0]==='update'),false);
});

test('atomic colors persist separately without changing string contract',async()=>{const f=fixture();const result=await f.items.createItem(1,{...payload,color:'black, gold, blue'},[]);assert.equal(result.color,'black, gold, blue');assert.deepEqual(JSON.parse(JSON.stringify(f.stored().confirmed_colors)),['black','gold','blue']);assert.deepEqual(JSON.parse(JSON.stringify(result.confirmedColors)),['black','gold','blue']);});
test('color edits and clears remain authoritative over saved predictions',async()=>{const f=fixture();await f.items.updateItem(44,1,{color:'red'});assert.deepEqual(JSON.parse(JSON.stringify(f.stored().confirmed_colors)),['red']);await f.items.updateItem(44,1,{color:''});assert.deepEqual(JSON.parse(JSON.stringify(f.stored().confirmed_colors)),[]);assert.equal(f.item.color,'');});

test('full atomic vocabulary is preserved without truncation',async()=>{const f=fixture();const color=taxonomy.color.join(', ');assert.ok(color.length>50);const result=await f.items.createItem(1,{...payload,color},[]);assert.equal(result.color,color);assert.deepEqual(JSON.parse(JSON.stringify(f.stored().confirmed_colors)),taxonomy.color);assert.match(fs.readFileSync(path.join(__dirname,'../models/ClothingItem.js'),'utf8'),/color: \{ type: DataTypes.STRING\(255\)/);});

test('lower-body creation/edit masks stale sleeve storage but keeps other attributes and original predictions',async()=>{const f=fixture(true,true,'Pants');await f.items.createItem(1,{...payload,confirmedAttributes:{sleeve_length:'full',occasion:'casual'}},[]);assert.equal(f.stored().confirmed_attributes.sleeve_length,null);assert.equal(f.stored().confirmed_attributes.occasion,'casual');await f.items.updateItem(44,1,{confirmedAttributes:{sleeve_length:'short',pattern:'plain'}});assert.equal(f.stored().confirmed_attributes.sleeve_length,null);assert.equal(f.stored().confirmed_attributes.pattern,'plain');});

test('legacy lower-body manual creation/edit does not require extra storage',async()=>{const f=fixture(false,true,'Jeans');await f.items.createItem(1,payload,[]);await f.items.updateItem(44,1,{color:'blue',categoryId:300});assert.equal(f.item.color,'blue');assert.equal(f.calls.some(c=>c[0]==='describe'),false);});
