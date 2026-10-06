'use strict';
// Real Express/Multer/Axios HTTP wiring against a local protocol server; no DB/auth service startup.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ApiError = require('../utils/ApiError');
const taxonomy = require('../config/imageTaxonomy');
const mapping = require('../services/imageCategoryMapping');
let express, multer, axios;
try { express=require('express');multer=require('multer');axios=require('axios'); } catch (_) {}
const root=path.resolve(__dirname,'../..');
function load(relative,deps,env={}) {const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,relative),'utf8'),{
 module,exports:module.exports,Buffer,Blob,FormData,AbortSignal,Date,process:{env},require:id=>Object.hasOwn(deps,id)?deps[id]:require(id),
});return module.exports;}
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;}
async function close(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
test('real HTTP: auth, multipart forwarding, envelope, invalid uploads, upstream failures and GET compatibility', {skip:!express}, async()=>{
 let upstreamCalls=0;let upstreamStatus=200;
 const meta=load('server/services/imageAiService.js',{axios,'./imageModelRegistry':require('../services/imageModelRegistry'),'../config/imageTaxonomy':taxonomy,'../utils/ApiError':ApiError});
 const predictions=Object.fromEntries(Object.entries(taxonomy).map(([h,l])=>[h,{label:l[0],confidence:0.8,...(meta.UNSUPPORTED[h]?{
  unsupported_classes:meta.UNSUPPORTED[h],support_status:'limited_classes',confidence_interpretation:meta.INTERPRETATION}:{} )}]));
 predictions.color={label:'gold',labels:['gold'],confidence:0.9,probabilities:Object.fromEntries(taxonomy.color.map(c=>[c,c==='gold'?0.9:0.1]))};
 const upstream=http.createServer(async(req,res)=>{upstreamCalls++;let body='';for await(const chunk of req)body+=chunk;
  assert.equal(req.url,'/api/image/extract');assert.match(req.headers['content-type'],/multipart\/form-data/);assert.match(body,/name="image"/);
  res.writeHead(upstreamStatus,{'Content-Type':'application/json'});res.end(JSON.stringify(upstreamStatus===200?{
   success:true,predictions,model:{architecture:'efficientnet_b0_six_head_v2',checkpoint_sha256:meta.CHECKPOINT_SHA256}
  }:{success:false,error:'image_model_not_ready'}));
 });
 const base=await listen(upstream);const wrapper=load('server/services/imageAiService.js',{axios,'./imageModelRegistry':require('../services/imageModelRegistry'),'../config/imageTaxonomy':taxonomy,'../utils/ApiError':ApiError},{IMAGE_AI_SERVICE_URL:base});
 const helpers=require('../utils/response');
 const controller=load('server/controllers/imageAiController.js',{'../services/visualMatchingService':{matchListings:async(userId,mode,attrs,cats,page,limit)=>{assert.equal(userId,55);assert.equal(attrs.colors[0],'gold');return {operation:mode,total:1,results:[{id:123,title:'Database fixture listing'}],candidate_limited:false,page,limit};}},'../services/listingAttributeService':{getStorageCapabilities:async()=>({confirmed_attributes:false,reason:'storage_not_enabled'})},'../services/imageAiService':wrapper,'../services/imageCategoryMapping':mapping,
  '../models':{Category:{findAll:async()=>[{id:987,name:'T-Shirts',parentId:null,isActive:true}]}},'../utils/ApiError':ApiError,'../utils/response':helpers});
 const auth=(req,res,next)=>req.headers.authorization==='Bearer fixture'?(req.user={id:55},next()):res.status(401).json({success:false,message:'Authentication required.'});
 const router=load('server/routes/search.routes.js',{express,'../controllers/itemController':{search:(_req,res)=>res.json({success:true,data:['existing GET']})},
  '../controllers/imageAiController':controller,'../utils/validators':{itemSearch:(_req,_res,next)=>next()},
  '../middleware/authMiddleware':{authenticate:auth,optionalAuth:(_req,_res,next)=>next()},
  '../middleware/uploadMiddleware':{uploadSingle:field=>multer({storage:multer.memoryStorage()}).single(field)}});
 const app=express();app.use(express.json());app.use('/api/v1/search',router);app.use((err,_req,res,_next)=>res.status(err.statusCode||(err.name==='MulterError'?400:500)).json({success:false,message:err.message,details:err.details}));
 const backend=http.createServer(app);const url=await listen(backend);
 async function post(mode='extract',field='image',mime='image/png',authenticated=true){const body=new FormData();if(field)body.append(field,new Blob(['bytes'],{type:mime}),'test.png');body.append('mode',mode);
  return fetch(`${url}/api/v1/search/visual`,{method:'POST',body,headers:authenticated?{Authorization:'Bearer fixture'}:{}});}
 try {
  assert.equal((await post('extract','image','image/png',false)).status,401);assert.equal(upstreamCalls,0);
  const response=await post();assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.success,true);assert.equal(data.data.operation,'extract');assert.equal(data.data.category_mapping.category_id,987);assert.equal(data.data.predictions.color.label,'gold');
  assert.equal(data.data.matching_available,false);assert.equal(data.data.human_confirmed,false);assert.equal(data.data.results,undefined);
  assert.equal((await post('extract',null)).status,400);assert.equal((await post('extract','images')).status,400);
  assert.equal((await post('extract','image','image/gif')).status,415);assert.equal((await post('unknown')).status,400);
  for(const mode of ['have','want']){const result=await fetch(`${url}/api/v1/search/visual`,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({mode,attributes:{colors:['gold']},page:1})});assert.equal(result.status,200);const payload=await result.json();assert.equal(payload.data.operation,mode);assert.equal(payload.data.results[0].id,123);assert.equal(payload.data.pagination.totalItems,1);}
  upstreamStatus=503;assert.equal((await post()).status,503);
  assert.deepEqual((await (await fetch(`${url}/api/v1/search`)).json()).data,['existing GET']);
 } finally {await close(backend);await close(upstream);}
});
