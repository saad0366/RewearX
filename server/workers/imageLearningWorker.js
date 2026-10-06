'use strict';
// Dedicated process: no work is executed in a listing request or Flask inference process.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const {Op}=require('sequelize');
const {ClothingItem,ClothingImage,ItemFeatures,Category,User,sequelize}=require('../models');
const {eligibleFeedback}=require('../services/imageLearningFeedback');
const {atomicJson,readState,selectBatch,acquireLock}=require('../services/imageLearningState');
const {registryRoot,BASE_SHA}=require('../services/imageModelRegistry');
const root=path.resolve(__dirname,'../..'),registry=registryRoot(),stateFile=path.join(registry,'state.json');
const threshold=Number(process.env.IMAGE_RETRAIN_THRESHOLD||3),pollSeconds=Number(process.env.IMAGE_LEARNING_POLL_SECONDS||5);
const python=process.env.IMAGE_TRAIN_PYTHON||path.join(root,'ai-service/.venv/Scripts/python.exe');
const basePath=path.resolve(process.env.IMAGE_BASE_CHECKPOINT_PATH||path.join(root,'ai-service/feature_extraction/checkpoints/phase3_stage_a_best.pt'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report=(job,status,code)=>console.log(JSON.stringify({job:job?.slice(0,12),status,code}));
let releaseLock,trainer=null,stopped=false,busy=false;
function parentAlive(){if(!process.env.IMAGE_LEARNING_PARENT_PID)return true;try{process.kill(Number(process.env.IMAGE_LEARNING_PARENT_PID),0);return true;}catch{return false;}}
async function examples(transaction){const categories=(await Category.findAll({transaction})).map(c=>c.toJSON());
 const records=await ClothingItem.findAll({where:{isAvailable:true},include:[{model:User,as:'owner',attributes:['status'],where:{status:'active'},required:true},{model:ClothingImage,as:'images',separate:true},{model:ItemFeatures,as:'features',required:true}],order:[['id','ASC']],transaction,...(transaction?{lock:transaction.LOCK.UPDATE}:{})});
 return records.map(r=>eligibleFeedback(r.toJSON(),categories)).filter(Boolean);
}
function activeParent(){const pointerFile=path.join(registry,'active.json');const pointer=fs.existsSync(pointerFile)?JSON.parse(fs.readFileSync(pointerFile,'utf8')):null;
 if(pointer&&pointer.base_sha256!==BASE_SHA)throw Error('registry_invalid');
 const entry=pointer?.current;const file=entry?path.resolve(registry,entry.path):basePath;
 if(entry&&!file.startsWith(registry+path.sep))throw Error('registry_invalid');
 const digest=sha(file);if(digest!==(entry?.sha256||BASE_SHA))throw Error('parent_hash_mismatch');return {file,sha256:digest,pointer};
}
async function download(example,destination){const url=new URL(example.source_url);const local=process.env.IMAGE_LEARNING_ALLOW_LOCAL_FIXTURES==='true'&&process.env.NODE_ENV==='development'&&['127.0.0.1','localhost'].includes(url.hostname)&&url.port==='5010';
 const cloud= url.protocol==='https:'&&url.hostname==='res.cloudinary.com'&&url.pathname.startsWith('/'+process.env.CLOUDINARY_CLOUD_NAME+'/');
 if(!cloud&&!local)throw Error('image_host_unavailable');
 const response=await require('axios').get(url.toString(),{responseType:'arraybuffer',timeout:10000,maxRedirects:0,maxContentLength:5*1024*1024});
 const bytes=Buffer.from(response.data);if(!bytes.length||bytes.length>5*1024*1024)throw Error('image_unavailable');fs.writeFileSync(destination,bytes,{mode:0o600});return crypto.createHash('sha256').update(bytes).digest('hex');
}
async function runPython(input,job,state){return new Promise((resolve,reject)=>{
 const seconds=Math.max(30,Math.min(300,Number(process.env.IMAGE_TRAIN_TIMEOUT_SECONDS||120)));
 trainer=spawn(python,['-B','-m','feature_extraction.training.continual_learning','--job',input],{cwd:path.join(root,'ai-service'),windowsHide:true,stdio:'ignore',env:{...process.env,OMP_NUM_THREADS:'2',MKL_NUM_THREADS:'2',NODE_OPTIONS:''}});
 job.trainer_pid=trainer.pid;atomicJson(stateFile,state);
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;trainer?.kill();},seconds*1000);
 trainer.once('error',()=>{clearTimeout(timer);trainer=null;reject(Error('trainer_start_failed'));});
 trainer.once('exit',code=>{clearTimeout(timer);trainer=null;if(timedOut)reject(Error('training_timeout'));else if(code===0)resolve();else reject(Error('training_failed'));});
 });}
async function tick(){if(busy||stopped)return;if(!parentAlive()){stop();return;}busy=true;
 let job,id,staging=[];
 try{
  const state=readState(stateFile),current=await examples();
  const parentNow=activeParent();const activated=state.jobs[parentNow.pointer?.current?.version];if(activated&&activated.status!=='succeeded'){activated.status='succeeded';state.consumed=[...new Set([...state.consumed,...activated.fingerprints])];atomicJson(stateFile,state);}
  const recovering=Object.entries(state.jobs).find(([,j])=>j.status==='running'||(j.status==='failed'&&j.attempts<2&&Date.now()>=j.retry_after));
  let batch;
  if(recovering){[id,job]=recovering; if(job.trainer_pid){try{process.kill(job.trainer_pid,0);return;}catch{}}
   batch=job.fingerprints.map(fp=>current.find(x=>x.fingerprint===fp)).filter(Boolean);
   if(batch.length!==job.fingerprints.length){job.status='abandoned';job.failure='feedback_withdrawn_or_changed';atomicJson(stateFile,state);return;}
  }else{
   const failed=new Set(Object.values(state.jobs).filter(j=>['failed','abandoned'].includes(j.status)).flatMap(j=>j.fingerprints));
   batch=selectBatch(current.filter(x=>!failed.has(x.fingerprint)),state,threshold);if(!batch.length)return;
   const parent=activeParent();id=crypto.createHash('sha256').update(parent.sha256+batch.map(x=>x.fingerprint).sort().join(':')).digest('hex');
   job=state.jobs[id]||{status:'pending',attempts:0,fingerprints:batch.map(x=>x.fingerprint),parent_path:parent.file,parent_sha256:parent.sha256};state.jobs[id]=job;
  }
  const directory=path.join(registry,'jobs',id);fs.mkdirSync(directory,{recursive:true});
  job.status='running';job.attempts++;job.started_at=new Date().toISOString();job.trainer_pid=null;atomicJson(stateFile,state);report(id,'running');
  const input=path.join(directory,'input.json'),resultFile=path.join(directory,'result.json');
  staging=batch.map((_,i)=>path.join(directory,'new-'+i+'.img'));
  if(!fs.existsSync(resultFile)){
   const records=[];
   for(let i=0;i<batch.length;i++){const destination=path.join(directory,'new-'+i+'.img');const imageHash=await download(batch[i],destination);records.push({image_path:destination,sha256:imageHash,labels:batch[i].labels,valid:batch[i].valid});}
   atomicJson(input,{job_id:id,parent_path:job.parent_path,parent_sha256:job.parent_sha256,base_sha256:BASE_SHA,output:path.join(directory,'checkpoint.pt'),result:resultFile,records,
    replay_manifest:process.env.IMAGE_TRAIN_REPLAY_MANIFEST||path.join(root,'datasets/phase3_manifest.csv'),dataset_root:process.env.IMAGE_TRAIN_DATASET_ROOT||path.join(root,'datasets'),replay_limit:Math.max(0,Math.min(48,Number(process.env.IMAGE_TRAIN_REPLAY_LIMIT||24))),epochs:Math.max(1,Math.min(3,Number(process.env.IMAGE_TRAIN_EPOCHS||1))),max_steps:Math.max(1,Math.min(16,Number(process.env.IMAGE_TRAIN_MAX_STEPS||8))),batch_size:4,threads:2,learning_rate:0.0001});
  }
  // Existing result/candidate is validated by Python instead of training a successful batch again.
  await runPython(input,job,state);
  const result=JSON.parse(fs.readFileSync(resultFile,'utf8')),candidate=path.join(directory,'checkpoint.pt');
  if(result.sha256!==sha(candidate)||result.job_id!==id)throw Error('candidate_invalid');
  await sequelize.transaction(async t=>{
   const fresh=await examples(t);if(!batch.every(b=>fresh.some(x=>x.fingerprint===b.fingerprint)))throw Error('feedback_withdrawn_or_changed');
   const parent=activeParent();if(parent.sha256!==job.parent_sha256)throw Error('active_model_changed');
   atomicJson(path.join(registry,'active.json'),{format:1,base_sha256:BASE_SHA,current:{version:id,path:path.relative(registry,candidate),sha256:result.sha256},previous:parent.pointer?.current||null,activated_at:new Date().toISOString()});
   // Active pointer is the commit marker; recover consumption if a crash happens before this write.
   state.consumed=[...new Set([...state.consumed,...job.fingerprints])];job.status='succeeded';job.completed_at=new Date().toISOString();job.sha256=result.sha256;job.runtime_seconds=result.runtime_seconds;job.trainer_pid=null;atomicJson(stateFile,state);
  });report(id,'succeeded');
 }catch(error){if(job){const state=readState(stateFile);const active=fs.existsSync(path.join(registry,'active.json'))?JSON.parse(fs.readFileSync(path.join(registry,'active.json'),'utf8')):null;
   if(active?.current?.version===id){state.consumed=[...new Set([...state.consumed,...job.fingerprints])];job.status='succeeded';}
   else{job.status=error.message==='feedback_withdrawn_or_changed'?'abandoned':'failed';job.failure=['image_host_unavailable','image_unavailable','training_timeout','trainer_start_failed','training_failed','candidate_invalid','active_model_changed','feedback_withdrawn_or_changed'].includes(error.message)?error.message:'job_failed';job.retry_after=Date.now()+60000;}
   job.trainer_pid=null;state.jobs[id]=job;atomicJson(stateFile,state);report(id,job.status,job.failure);
  }else report(null,'idle','worker_check_failed');
 }finally{for(const file of staging)try{fs.unlinkSync(file);}catch{}busy=false;}
}
function stop(){if(stopped)return;stopped=true;const finish=()=>{releaseLock?.();sequelize.close().finally(()=>process.exit(0));};if(trainer){trainer.once('exit',finish);trainer.kill();}else finish();}
async function boot(){if(process.env.NODE_ENV!=='development'||!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST)||process.env.IMAGE_LEARNING_ENABLED==='false')return;
 if(!Number.isInteger(threshold)||threshold<1||threshold>24||!Number.isFinite(pollSeconds)||pollSeconds<1)throw Error('invalid_worker_config');
 releaseLock=acquireLock(path.join(registry,'worker.lock'));if(!releaseLock)return;
 await sequelize.authenticate();process.on('SIGTERM',stop);process.on('SIGINT',stop);
 // Recover successful activation after interruption before recording consumed revisions.
 const activeFile=path.join(registry,'active.json');if(fs.existsSync(activeFile)){const p=JSON.parse(fs.readFileSync(activeFile,'utf8')),s=readState(stateFile),j=s.jobs[p.current?.version];if(j&&j.status!=='succeeded'){j.status='succeeded';s.consumed=[...new Set([...s.consumed,...j.fingerprints])];atomicJson(stateFile,s);}}
 await tick();setInterval(tick,pollSeconds*1000);setInterval(()=>{if(!parentAlive())stop();},2000);
}
module.exports={tick,examples,download};
if(require.main===module)boot().catch(()=>{releaseLock?.();report(null,'stopped','worker_start_failed');process.exit(1);});
