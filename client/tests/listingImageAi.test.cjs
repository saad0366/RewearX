'use strict';
// Exercise the actual ListingForm with a deterministic hook/event harness; no DOM or live services.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function transpile(file,deps){const module={exports:{}};const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,
});assert.equal((source.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 vm.runInNewContext(source.outputText,{module,exports:module.exports,AbortController,console,require:id=>{assert.ok(Object.hasOwn(deps,id),`Unexpected import ${id}`);return deps[id];}});return module.exports;}
const helper=transpile('src/lib/listingImageAi.ts',{});
const imageSave=transpile('src/lib/listingImageSave.ts',{});
const cats=[{id:90,name:'Men',parentId:null,isActive:true},{id:91,name:'Women',parentId:null,isActive:true},
 {id:300,name:'Shirts',parentId:90,isActive:true},{id:301,name:'Shirts',parentId:91,isActive:true},{id:500,name:'Jackets',parentId:90,isActive:true}];
const plain=x=>JSON.parse(JSON.stringify(x));
function extraction(color=['black','gold'],status='mapped') {return {operation:'extract',matching_available:false,image_sha256:'a'.repeat(64),model:{},
 category_mapping:{status,category_id:status==='mapped'?300:null,candidates:[]},storage:{confirmed_attributes:true,reason:null},
 predictions:{category:{label:'shirt',confidence:0.8},color:{label:color.length===1?color[0]:color,labels:color,confidence:0.8},
 occasion:{label:'party',confidence:0.8},season:{label:'winter',confidence:0.8},sleeve_length:{label:'full',confidence:0.8},pattern:{label:'plain',confidence:0.8}}};}
function walk(n){if(Array.isArray(n))return n.flatMap(walk);if(!n||typeof n!=='object')return [];return [n,...walk(n.props?.children)];}
function text(n){if(Array.isArray(n))return n.map(text).join('');if(n==null||typeof n==='boolean')return '';if(typeof n==='string'||typeof n==='number')return String(n);return text(n.props?.children);}
function harness({mode='create',storage=true,item,failUpload=false}={}) {
 let cursor=0,tree,dirty=true;
 let savedImages=(item?.images||[]).map(i=>({...i}));const slots=[],pending=[],requests=[],creates=[],updates=[],uploads=[],toasts=[],locations=[];
 const navigate=(url)=>locations.push(url),toast=(message)=>toasts.push(message),apiUser={id:1};
 const React={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true;}];},
  useRef(initial){const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i];},
  useEffect(fn,deps){const i=cursor++;const previous=slots[i];if(!previous||!deps||deps.some((v,k)=>!Object.is(v,previous.deps[k]))){slots[i]={deps,cleanup:previous?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
 const api={categoriesApi:{list:async()=>cats},itemsApi:{imageCapabilities:async()=>({confirmed_attributes:storage,reason:storage?null:'storage_not_enabled'}),
  extractImage:(file,signal)=>new Promise((resolve,reject)=>requests.push({file,signal,resolve,reject})),byId:async()=>({...item,images:savedImages}),
  create:async(payload,files)=>{creates.push({payload,files});return {id:44};},update:async(id,payload)=>updates.push({id,payload}),addImages:async(id,files)=>{uploads.push({id,files});if(failUpload)throw Error('fixture upload failed');savedImages.push(...files.map((file,index)=>({id:100+index,url:file.name})));return {...item,images:savedImages};},deleteImage:async(_id,img)=>{savedImages=savedImages.filter(i=>i.id!==img);},setPrimary:async(_id,img)=>{savedImages.forEach(i=>i.isPrimary=i.id===img);return {...item,images:savedImages};}}};
 const jsx=(type,props)=>({type,props:props||{}});
 const Form=transpile('src/pages/ListingForm.tsx',{'react':React,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  wouter:{useLocation:()=>['/listing',navigate]},'lucide-react':new Proxy({},{get:(_o,k)=>String(k)}),
  'motion/react':{motion:new Proxy({},{get:(_o,k)=>String(k)})},'../components/ui/ImageUploader':{default:'Uploader'},
  '../components/ui/ConfirmDialog':{default:'ConfirmDialog'},'../contexts/ToastContext':{useToast:()=>({toast})},
  '../contexts/AuthContext':{useAuth:()=>({apiUser,isAuthenticated:true})},'../lib/api':api,'../lib/listingImageAi':helper,'../lib/listingImageSave':imageSave,
  '../lib/api/types':{apiConditionFromUI:v=>v.toLowerCase().replace(' ','_'),apiGenderFromUI:v=>v.toLowerCase()},
  '../lib/mockData':{sizes:['S','M','L'],genders:['Male','Female','Unisex'],conditions:['New','Good'],colors:[{name:'Black',hex:'#000'}],PAKISTAN_CITIES:['All Pakistan','Islamabad','Lahore']},
 }).default;
 async function flush(){for(let i=0;i<30;i++){if(dirty){dirty=false;cursor=0;tree=Form({mode,params:mode==='edit'?{id:'44'}:undefined});const queue=pending.splice(0);queue.forEach(fn=>fn());}await Promise.resolve();if(!dirty&&!pending.length){await Promise.resolve();if(!dirty)return;}}throw Error('Render loop did not settle');}
 function find(predicate){const n=walk(tree).find(predicate);assert.ok(n,'Expected form control');return n;}
 async function click(label){const n=find(n=>n.type==='button'&&text(n).trim()===label);await n.props.onClick();await flush();}
 async function change(predicate,value){find(predicate).props.onChange({target:{value,checked:value}});await flush();}
 async function upload(name){const file=new File(['fixture'],name,{type:'image/png'});find(n=>n.type==='Uploader').props.onChange([{file,url:`blob:${name}`}]);await flush();return file;}
 async function basics(){await change(n=>n.type==='input'&&n.props.placeholder?.startsWith('e.g. Vintage'),'Manual jacket');
  await change(n=>n.type==='select'&&text(n).includes('Select Main Category'),90);await change(n=>n.type==='select'&&text(n).includes('Select Subcategory'),300);
  await click('M');await click('Female');await click('Good');}
 async function review(){await change(n=>n.type==='input'&&n.props.type==='checkbox'&&text(walk(tree).find(p=>p.props?.children?.includes?.(n))||'').includes('I reviewed'),true);}
 return {flush,find,click,change,upload,basics,review,requests,creates,updates,uploads,toasts,locations,get tree(){return tree;}};
}
for(const colors of [[],['gold'],['black','gold'],['black','blue','gold']])test(`safe color suggestions ${JSON.stringify(colors)}`,()=>{
 const p=helper.safeSuggestions(extraction(colors),cats);assert.equal(p.color,colors.length?(colors.length>2?'multicolor':colors.join(', ')):undefined);
});
test('ambiguous, inactive, parent-only and unsupported predictions stay unfilled',()=>{
 assert.equal(helper.safeSuggestions(extraction(['black'],'ambiguous'),cats).categoryId,undefined);
 assert.equal(helper.safeSuggestions(extraction(),cats.map(c=>({...c,isActive:false}))).categoryId,undefined);
 const d=extraction();d.category_mapping.category_id=90;assert.equal(helper.safeSuggestions(d,cats).categoryId,undefined);
 d.predictions.category.label='skirt';d.predictions.sleeve_length.label='half';d.predictions.season.label='all_season';
 const p=helper.safeSuggestions(d,cats);assert.equal(p.categoryId,undefined);assert.equal(p.sleeve_length,undefined);assert.equal(p.season,undefined);
});
test('session prevents late responses and preserves manual edits on replacement',()=>{
 const session=new helper.ListingSuggestionSession(),a=session.begin();session.changed('color');
 assert.deepEqual(plain(session.accept(a.id,{color:'black',pattern:'plain'},{color:'red'})),{pattern:'plain'});
 const b=session.begin();assert.deepEqual(plain(b.reset),{pattern:''});assert.deepEqual(plain(session.accept(a.id,{color:'blue'},{})),{});
 assert.deepEqual(plain(session.accept(b.id,{color:'gold',pattern:'striped'},{})),{pattern:'striped'});
});
test('actual form shows suggestions, preserves manual corrections, and saves confirmed extras',async()=>{
 const h=harness();await h.flush();await h.upload('a.png');assert.equal(h.requests.length,1);await h.click('Continue');
 await h.change(n=>n.type==='input'&&n.props['aria-label']==='Color or comma-separated colors','red');
 await h.change(n=>n.type==='select'&&text(n).includes('party'),'formal');
 h.requests[0].resolve(extraction());await h.flush();assert.equal(h.find(n=>n.type==='input'&&n.props['aria-label']).props.value,'red');
 assert.equal(h.find(n=>n.type==='select'&&text(n).includes('party')).props.value,'formal');
 await h.basics();await h.click('Continue');await h.review();await h.click('Publish listing');
 assert.equal(h.creates.length,1);assert.equal(h.creates[0].payload.color,'red');assert.equal(h.creates[0].payload.confirmedAttributes.occasion,'formal');assert.equal(h.creates[0].payload.gender,'female');
});
test('image replacement clears AI-owned values and ignores out-of-order response',async()=>{
 const h=harness();await h.flush();await h.upload('a.png');h.requests[0].resolve(extraction(['gold']));await h.flush();await h.click('Continue');
 assert.equal(h.find(n=>n.type==='input'&&n.props['aria-label']).props.value,'gold');
 await h.click('Back');await h.upload('b.png');await h.upload('c.png');assert.equal(h.requests[1].signal.aborted,true);
 h.requests[2].resolve(extraction(['blue']));await h.flush();h.requests[1].resolve(extraction(['red']));await h.flush();await h.click('Continue');
 assert.equal(h.find(n=>n.type==='input'&&n.props['aria-label']).props.value,'blue');
});
test('AI unavailable does not prevent existing manual creation or validation',async()=>{
 const h=harness({storage:false});await h.flush();await h.upload('a.png');h.requests[0].reject(Error('unavailable'));await h.flush();await h.click('Continue');
 await h.click('Continue');assert.equal(h.creates.length,0);await h.basics();await h.click('Continue');await h.click('Publish listing');assert.equal(h.creates.length,0);
 await h.review();await h.click('Publish listing');assert.equal(h.creates.length,1);assert.equal(h.creates[0].payload.confirmedAttributes,undefined);
});
test('unavailable storage never silently discards entered clothing attributes',async()=>{
 const h=harness({storage:false});await h.flush();await h.upload('a.png');const d=extraction();d.storage.confirmed_attributes=false;h.requests[0].resolve(d);await h.flush();await h.click('Continue');await h.basics();await h.click('Continue');await h.review();await h.click('Publish listing');assert.equal(h.creates.length,0);assert.ok(h.toasts.some(t=>t.includes('cannot be saved')));
});
test('edit listing keeps existing values and preserves existing update/add-image behavior',async()=>{
 const item={id:44,userId:1,title:'Existing shirt',categoryId:300,size:'M',gender:'female',condition:'good',color:'cream',location:'Lahore',description:'existing',brand:'existing',isAvailable:true,images:[{id:9,url:'existing.png'}],confirmedAttributes:{occasion:'formal'}};
 const h=harness({mode:'edit',item});await h.flush();assert.equal(h.requests.length,0);await h.upload('new.png');h.requests[0].resolve(extraction());await h.flush();await h.click('Continue');
 assert.equal(h.find(n=>n.type==='input'&&n.props['aria-label']).props.value,'cream');assert.equal(h.find(n=>n.type==='select'&&text(n).includes('party')).props.value,'formal');
 await h.click('Continue');await h.review();await h.click('Save changes');assert.equal(h.creates.length,0);assert.equal(h.updates.length,2);assert.equal(h.updates[1].payload.reviewConfirmed,true);assert.equal(h.updates[1].payload.trainingConsent,undefined);assert.equal(h.updates[0].payload.color,'cream');assert.equal(h.uploads.length,1);
});

test('publishing while inference is pending ignores the later response',async()=>{
 const h=harness({storage:false});await h.flush();await h.upload('a.png');await h.click('Continue');await h.basics();
 await h.change(n=>n.type==='input'&&n.props['aria-label'],'red');await h.click('Continue');await h.review();await h.click('Publish listing');
 assert.equal(h.creates.length,1);assert.equal(h.creates[0].payload.color,'red');assert.equal(h.requests[0].signal.aborted,true);
 h.requests[0].resolve(extraction());await h.flush();await h.click('Back');assert.equal(h.find(n=>n.type==='input'&&n.props['aria-label']).props.value,'red');
});
test('manual category selection survives a different AI category and remains editable',async()=>{
 const h=harness();await h.flush();await h.upload('a.png');await h.click('Continue');
 await h.change(n=>n.type==='select'&&text(n).includes('Select Main Category'),91);
 await h.change(n=>n.type==='select'&&text(n).includes('Select Subcategory'),301);
 h.requests[0].resolve(extraction());await h.flush();assert.equal(h.find(n=>n.type==='select'&&text(n).includes('Select Subcategory')).props.value,301);
 await h.change(n=>n.type==='select'&&text(n).includes('Select Subcategory'),301);
});

test('all attributes share the main form without a separate save checkbox or ambiguous warning',async()=>{
 const h=harness();await h.flush();await h.upload('a.png');h.requests[0].resolve(extraction(['black','gold'],'ambiguous'));await h.flush();await h.click('Continue');
 assert.ok(!text(h.tree).includes('Optional clothing attributes'));assert.ok(!text(h.tree).includes('Save these extra'));assert.ok(!text(h.tree).includes('Category is ambiguous'));
 for(const head of ['occasion','season','sleeve length','pattern'])assert.ok(h.find(n=>n.type==='select'&&n.props['aria-label']===head));
});
test('listing review is the only checkbox; successful save carries review but no permission field',async()=>{
 const h=harness();await h.flush();await h.upload('a.png');h.requests[0].resolve(extraction());await h.flush();await h.click('Continue');await h.basics();await h.click('Continue');assert.ok(!text(h.tree).includes('Allow ReWearX'));await h.click('Publish listing');assert.equal(h.creates.length,0);await h.review();await h.click('Publish listing');assert.equal(h.creates[0].payload.reviewConfirmed,true);assert.equal(h.creates[0].payload.trainingConsent,undefined);
});
test('manual color entry allows two colors or multicolor, rejects three explicit colors',async()=>{
 const h=harness();await h.flush();await h.upload('a.png');h.requests[0].resolve(extraction(['black','blue','gold']));await h.flush();await h.click('Continue');await h.basics();await h.change(n=>n.type==='input'&&n.props['aria-label']==='Color or comma-separated colors','black, blue, gold');await h.click('Continue');assert.equal(h.creates.length,0);assert.ok(text(h.tree).includes('Choose up to two colors'));await h.change(n=>n.type==='input'&&n.props['aria-label']==='Color or comma-separated colors','multicolor');await h.click('Continue');await h.review();await h.click('Publish listing');assert.equal(h.creates[0].payload.color,'multicolor');
});
test('failed image-edit save never sends the final training confirmation',async()=>{
 const item={id:44,userId:1,title:'Existing jacket',categoryId:500,size:'M',gender:'unisex',condition:'good',color:'black',location:'Lahore',isAvailable:true,trainingConsent:true,images:[{id:9,url:'existing.png',isPrimary:true}]};
 const h=harness({mode:'edit',item,failUpload:true});await h.flush();await h.upload('replacement.png');h.requests[0].resolve(extraction());await h.flush();await h.click('Continue');await h.click('Continue');await h.review();await h.click('Save changes');assert.equal(h.updates.length,1);assert.equal(h.updates[0].payload.reviewConfirmed,undefined);assert.equal(h.locations.length,0);assert.ok(h.toasts.some(t=>t.includes('failed')));
});

for(const name of ['Jeans','Trousers','Pants','Skirts','Women leggings'])test('sleeves hidden for '+name,()=>assert.equal(helper.sleeveApplicable({name}),false));
for(const name of ['Shirts','T-Shirts','Hoodies','Sweaters','Jackets','Dresses','Shalwar Kameez','Kurti'])test('sleeves retained for '+name,()=>assert.equal(helper.sleeveApplicable({name}),true));
test('lower-body form clears and omits stale sleeve values while saving other confirmed labels',async()=>{
 const item={id:44,userId:1,title:'Existing pants',categoryId:500,size:'M',gender:'unisex',condition:'good',color:'black',location:'Lahore',isAvailable:true,images:[{id:9,url:'existing.png'}],confirmedAttributes:{sleeve_length:'full',occasion:'casual'}};
 const original=cats.find(c=>c.id===500).name;cats.find(c=>c.id===500).name='Pants';try{const h=harness({mode:'edit',item});await h.flush();await h.click('Continue');assert.equal(walk(h.tree).some(n=>n.type==='select'&&n.props['aria-label']==='sleeve length'),false);await h.click('Continue');await h.review();await h.click('Save changes');assert.equal(h.updates[0].payload.confirmedAttributes.sleeve_length,null);assert.equal(h.updates[0].payload.confirmedAttributes.occasion,'casual');}finally{cats.find(c=>c.id===500).name=original;}
});
for(const [label,name] of [['jacket','Jackets'],['jeans','Jeans'],['trousers','Pants'],['lehenga','Bridal Lehenga']])test('frontend safely applies mapped '+label,()=>{const data=extraction();data.predictions.category.label=label;data.category_mapping.category_id=70;const rows=[{id:70,name,parentId:null,isActive:true}];assert.equal(helper.safeSuggestions(data,rows).categoryId,70);});
test('numeric string category IDs safely reconcile with mapping IDs',()=>{const data=extraction();assert.equal(helper.safeSuggestions(data,[{id:'300',name:'Shirts',parentId:null,isActive:true}]).categoryId,300);});
