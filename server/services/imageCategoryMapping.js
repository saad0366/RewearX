'use strict';
const taxonomy = require('../config/imageTaxonomy');
const aliases = {
  t_shirt: ['t shirt','t shirts','tee','tees'], shirt: ['shirt','shirts'],
  hoodie: ['hoodie','hoodies'], sweater: ['sweater','sweaters'], jacket: ['jacket','jackets'],
  jeans: ['jeans'], trousers: ['trouser','trousers','pants'], dress: ['dress','dresses'],
  shalwar_kameez: ['shalwar kameez','salwar kameez'], lehenga: ['lehenga','lehengas','lehenga choli','bridal lehenga','lehenga/choli'],
  other_fashion: ['other fashion','other'],
};
const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
function mapCategory(label, categories) {
  if (!taxonomy.category.includes(label) || label === 'skirt') {
    return { model_label: label, status: 'unsupported', category_id: null, candidates: [] };
  }
  const byId = new Map(categories.map(c => [Number(c.id), c]));
  const candidates = categories.filter(c => {
    if (c.isActive !== true && c.isActive !== 1) return false;
    if(categories.some(child=>Number(child.parentId)===Number(c.id)&&(child.isActive===true||child.isActive===1)))return false;
    if (!(aliases[label] || []).includes(normalize(c.name))) return false;
    const parent = c.parentId == null ? null : byId.get(Number(c.parentId));
    const seen=new Set([Number(c.id)]);let ancestor=parent;
    if(c.parentId!=null&&!ancestor)return false;
    while(ancestor){if(seen.has(Number(ancestor.id))||![true,1].includes(ancestor.isActive))return false;seen.add(Number(ancestor.id));if(ancestor.parentId==null)break;ancestor=byId.get(Number(ancestor.parentId));if(!ancestor)return false;}
    return true;
  }).map(c => ({ id: Number(c.id), name: c.name, parent_id: c.parentId == null ? null : Number(c.parentId),
    parent_name: c.parentId == null ? null : byId.get(Number(c.parentId)).name }))
    .sort((a,b) => a.id-b.id);
  return { model_label: label, status: candidates.length === 1 ? 'mapped' : candidates.length ? 'ambiguous' : 'unmapped',
    category_id: candidates.length === 1 ? candidates[0].id : null, candidates };
}
module.exports = { mapCategory };
