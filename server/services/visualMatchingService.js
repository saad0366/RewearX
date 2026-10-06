'use strict';
const { Op } = require('sequelize');
const { ClothingItem,ClothingImage,Category,User,UserPreferences,ItemFeatures } = require('../models');
const { getStorageCapabilities } = require('./listingAttributeService');
const taxonomy = require('../config/imageTaxonomy');
const ApiError = require('../utils/ApiError');
const {sleeveApplicable}=require('./clothingApplicability');
const MAX_CANDIDATES=1000;
const banned={season:['all_season'],sleeve_length:['half']};
const normalize=v=>String(v||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
const colorAliases={gray:'grey',cream:'beige',ivory:'beige',navy:'blue',olive:'green',sage:'green',sand:'beige',cognac:'brown'};
function colors(value){
 const values=Array.isArray(value)?value:String(value||'').split(/[,;+]/);
 return [...new Set(values.map(v=>colorAliases[normalize(v)]||normalize(v)).filter(v=>taxonomy.color.includes(v)))];
}
function list(value){if(Array.isArray(value))return value;try{const p=JSON.parse(value||'[]');return Array.isArray(p)?p:[];}catch(_){return [];}}
function parseAttributes(value,categories){
 let q=value;if(typeof q==='string'){if(q.length>8192)throw ApiError.badRequest('Attributes too large.');try{q=JSON.parse(q);}catch(_){throw ApiError.badRequest('Invalid attributes JSON.');}}
 if(!q||typeof q!=='object'||Array.isArray(q))throw ApiError.badRequest('Edited attributes are required.');
 const allowed=['categoryId','colors','occasion','season','sleeve_length','pattern','size','gender','condition'];
 if(Object.keys(q).some(k=>!allowed.includes(k)))throw ApiError.badRequest('Unknown search attribute.');
 const out={colors:[]};
 if(q.categoryId!=null&&q.categoryId!==''){
  const id=Number(q.categoryId),cat=categories.find(c=>c.id===id&&c.isActive);
  if(!Number.isInteger(id)||!cat||(cat.parentId&&!categories.some(c=>c.id===cat.parentId&&c.isActive)))throw ApiError.badRequest('Category must be an active database category.');
  out.categoryId=id;
 }
 if(q.colors!==undefined){if(!Array.isArray(q.colors)||q.colors.length>12||q.colors.some(c=>!taxonomy.color.includes(c)))throw ApiError.badRequest('Use atomic colors.');out.colors=colors(q.colors);}
 for(const head of ['occasion','season','sleeve_length','pattern']){
  const label=q[head];if(label==null||label==='')continue;
  if(!taxonomy[head].includes(label))throw ApiError.badRequest(`Invalid ${head}.`);
  if(!(banned[head]||[]).includes(label))out[head]=label;
 }
 if(q.gender!=null&&q.gender!==''){if(!['male','female','unisex'].includes(q.gender))throw ApiError.badRequest('Invalid gender.');out.gender=q.gender;}
 if(q.condition!=null&&q.condition!==''){if(!['new','like_new','good','fair'].includes(q.condition))throw ApiError.badRequest('Invalid condition.');out.condition=q.condition;}
 if(q.size!=null&&q.size!==''){if(typeof q.size!=='string'||q.size.length>50)throw ApiError.badRequest('Invalid size.');out.size=q.size;}
 return out;
}
function categoryTier(a,b,categories){
 if(!a||!b)return 0;
 const byId=new Map(categories.filter(c=>c.isActive).map(c=>[Number(c.id),c]));
 const left=byId.get(Number(a)),right=byId.get(Number(b));if(!left||!right)return 0;
 if(left.id===right.id)return 3;
 // Only equal leaf names are cross-parent equivalents. Kurti remains its own historical type.
 const key=v=>normalize(v).replace(/s$/,'');
 if(!categories.some(c=>c.parentId===left.id)&&!categories.some(c=>c.parentId===right.id)&&key(left.name)===key(right.name))return 3;
 function ancestor(id,target){const seen=new Set();while(byId.has(id)&&!seen.has(id)){seen.add(id);id=Number(byId.get(id).parentId);if(id===target)return true;}return false;}
 return ancestor(left.id,right.id)||ancestor(right.id,left.id)?2:0;
}
function extraAttributes(item){
 const json=item.features?.imagePredictions;
 const confirmed=json?.confirmed_attributes||{},predicted=json?.provenance==='model_prediction'?json.predictions||{}:{};
 const attrs={};
 for(const head of ['occasion','season','sleeve_length','pattern']){
  // Explicit null confirmation means cleared; do not resurrect a model suggestion.
  const label=Object.hasOwn(confirmed,head)?confirmed[head]:predicted[head]?.label;
  if((head!=='sleeve_length'||sleeveApplicable(item.category))&&taxonomy[head].includes(label)&&!(banned[head]||[]).includes(label))attrs[head]=label;
 }
 return attrs;
}
function itemColors(item){const explicit=colors(item.color);if(explicit.length||normalize(item.color)!=='multicolor')return explicit;const stored=item.features?.imagePredictions;return stored?.provenance==='model_prediction'?colors(stored.predictions?.color?.labels):[];}
function colorScore(query,target){if(!query.length||!target.length)return 0;return query.filter(c=>target.includes(c)).length/query.length;}
function wantScore(q,item,categories){
 const tier=categoryTier(q.categoryId,item.categoryId,categories);
 if(q.categoryId&&!tier)return null;
 const reasons=[];if(tier)reasons.push(tier===3?'Same garment category':'Compatible category hierarchy');
 const color=colorScore(q.colors,itemColors(item));if(color)reasons.push(`Color overlap: ${q.colors.filter(c=>itemColors(item).includes(c)).join(', ')}`);
 const attrs=extraAttributes(item);let other=0;
 for(const head of ['occasion','season','sleeve_length','pattern'])if(q[head]&&attrs[head]&&q[head]===attrs[head]){other++;reasons.push(`${head}: ${q[head]}`);}
 if(!tier&&!color&&!other)return null;
 return {tier,color,other,reasons};
}
function haveScore(q,prefs,categories){
 const ids=list(prefs.preferredCategories).map(Number).filter(id=>categories.some(c=>c.id===id&&c.isActive));
 const tier=q.categoryId?Math.max(0,...ids.map(id=>categoryTier(q.categoryId,id,categories))):0;
 if(q.categoryId&&ids.length&&!tier)return null;
 const reasons=[];if(tier)reasons.push('Owner wants this category');
 const chosenColors=colors(list(prefs.preferredColors)),color=colorScore(q.colors,chosenColors);
 if(color)reasons.push('Owner selected compatible colors');
 let other=0;
 // Literal occasion-style overlap only. Trendy/Minimal/Streetwear are never inferred.
 if(q.occasion&&list(prefs.preferredStyles).some(s=>normalize(s)===q.occasion)){other++;reasons.push(`Owner selected ${q.occasion} style`);}
 if(q.size&&list(prefs.preferredSizes).includes(q.size)){other++;reasons.push('Owner selected this size');}
 if(q.gender&&prefs.preferredGender&&prefs.preferredGender!=='any'&&(prefs.preferredGender===q.gender||q.gender==='unisex')){other++;reasons.push('Owner selected compatible gender');}
 if(q.condition&&prefs.preferredCondition&&prefs.preferredCondition!=='any'&&prefs.preferredCondition===q.condition){other++;reasons.push('Owner selected this condition');}
 if(!tier&&!color&&!other)return null; // Empty/default-only or unsupported evidence is not interest.
 return {tier,color,other,reasons};
}
function rank(rows,q,mode,categories,prefs=[]){
 const prefMap=new Map(prefs.map(p=>[Number(p.userId),p]));const seen=new Set(),scored=[];
 for(const item of rows){if(seen.has(item.id))continue;seen.add(item.id);
  const score=mode==='want'?wantScore(q,item,categories):haveScore(q,prefMap.get(Number(item.userId))||{},categories);
  if(score)scored.push({item,score});
 }
 scored.sort((a,b)=>b.score.tier-a.score.tier||b.score.color-a.score.color||b.score.other-a.score.other||a.item.id-b.item.id);
 return scored.map(({item,score})=>({...item,matchScore:score.tier*100+score.color*10+score.other,
  matchReasons:score.reasons,scoreInterpretation:'Ranking points, not a probability',features:score.reasons}));
}
async function matchListings(userId,mode,attributes,categories,page=1,limit=20){
 const q=parseAttributes(attributes,categories);
 const cap=await getStorageCapabilities();
 const includes=[{model:User,as:'owner',attributes:['id','name','profileImage','status'],where:{status:'active'},required:true},
  {model:Category,as:'category',where:{isActive:true},required:true},
  {model:ClothingImage,as:'images',separate:true,order:[['orderIndex','ASC']]}];
 if(cap.confirmed_attributes)includes.push({model:ItemFeatures,as:'features',attributes:['imagePredictions'],required:false});
 const where={isAvailable:true,userId:{[Op.ne]:userId}};
 if(mode==='want'&&q.categoryId)where.categoryId={[Op.in]:categories.filter(c=>categoryTier(q.categoryId,c.id,categories)>0).map(c=>c.id)};
 const rows=await ClothingItem.findAll({where,include:includes,order:[['id','ASC']],limit:MAX_CANDIDATES+1});
 const candidateLimited=rows.length>MAX_CANDIDATES;
 const items=rows.slice(0,MAX_CANDIDATES).map(r=>r.toJSON?r.toJSON():r);
 // Eligibility repeated defensively; queries never load more than the bounded window.
 const eligible=items.filter(i=>i.userId!==userId&&i.isAvailable&&i.owner?.status==='active'&&categories.some(c=>c.id===i.categoryId&&c.isActive&&(!c.parentId||categories.some(p=>p.id===c.parentId&&p.isActive))));
 const owners=[...new Set(eligible.map(i=>i.userId))];
 const prefs=mode==='have'&&owners.length?await UserPreferences.findAll({where:{userId:{[Op.in]:owners}},raw:true}):[];
 const results=rank(eligible,q,mode,categories,prefs);
 return {operation:mode,query_attributes:q,results:results.slice((page-1)*limit,page*limit),
  candidate_limit:MAX_CANDIDATES,candidate_limited:candidateLimited,stored_extra_attributes:cap.confirmed_attributes,
  total:results.length,page,limit};
}
module.exports={parseAttributes,categoryTier,wantScore,haveScore,rank,matchListings};
