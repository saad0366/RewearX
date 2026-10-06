import type { ApiCategory } from './api/types';
export const EXTRA_OPTIONS = {
  occasion: ['casual','formal','party','wedding','sports'],
  season: ['summer','winter'],
  sleeve_length: ['sleeveless','short','three_quarter','full'],
  pattern: ['plain','striped','checked','floral','printed','embroidered'],
} as const;
export type ExtraHead = keyof typeof EXTRA_OPTIONS;
export type ExtraAttributes = Record<ExtraHead, string>;
export const EMPTY_EXTRA: ExtraAttributes = { occasion:'', season:'', sleeve_length:'', pattern:'' };
export interface ImagePrediction {
  label: string | string[] | null; confidence: number;
  labels?: string[]; probabilities?: Record<string,number>;
  unsupported_classes?: string[]; support_status?: string; confidence_interpretation?: string;
}
export interface ImageExtraction {
  operation: 'extract'; matching_available: false;
  predictions: Record<'category'|'color'|ExtraHead, ImagePrediction>;
  category_mapping: { status:string; category_id:number|null; candidates:Array<{id:number;name:string;parent_id:number|null;parent_name:string|null}> };
  image_sha256:string; model:{architecture:string;checkpoint_sha256:string};
  storage?: {confirmed_attributes:boolean;reason:string|null};
}
export type SuggestionPatch = Partial<ExtraAttributes & {categoryId:number|'';color:string}>;
export function safeSuggestions(data:ImageExtraction,categories:ApiCategory[]):SuggestionPatch {
  const patch:SuggestionPatch={};
  const supported=(p:ImagePrediction, banned:string[]) => typeof p?.label==='string' && !banned.includes(p.label) && !(p.unsupported_classes || []).includes(p.label);
  const category=data.category_mapping;
  if (supported(data.predictions.category,['skirt']) && category.status==='mapped' && category.category_id != null) {
    const row=categories.find(c=>Number(c.id)===Number(category.category_id) && c.isActive);
    const parent=row?.parentId ? categories.find(c=>Number(c.id)===Number(row.parentId) && c.isActive) : null;
    // A main category with children is not a safe final leaf selection.
    if (row && (!row.parentId || parent) && !categories.some(c=>Number(c.parentId)===Number(row.id) && c.isActive)) patch.categoryId=Number(row.id);
  }
  const color=data.predictions.color;
  if (color?.labels?.length) patch.color=color.labels.length>2 ? 'multicolor' : color.labels.join(', '); // Atomic predictions remain in the extraction response.
  for (const head of Object.keys(EXTRA_OPTIONS) as ExtraHead[]) {
    const p=data.predictions[head];
    if (typeof p?.label==='string' && (EXTRA_OPTIONS[head] as readonly string[]).includes(p.label)
        && !(p.unsupported_classes || []).includes(p.label)) patch[head]=p.label;
  }
  return patch;
}
// Request identity + manual ownership survive image replacement. React uses this same logic.
export class ListingSuggestionSession {
  generation=0;
  manual=new Set<string>();
  owned=new Set<keyof SuggestionPatch>();
  changed(key:string) { this.manual.add(key); this.owned.delete(key as keyof SuggestionPatch); }
  begin():{id:number;reset:SuggestionPatch} {
    const reset:SuggestionPatch={};
    for (const key of this.owned) if (!this.manual.has(key)) (reset as Record<string,unknown>)[key]='';
    this.owned.clear();return {id:++this.generation,reset};
  }
  cancel() { ++this.generation; }
  accept(id:number,suggestions:SuggestionPatch,current:Record<string,unknown>):SuggestionPatch {
    if (id!==this.generation) return {};
    const patch:SuggestionPatch={};
    for (const [key,value] of Object.entries(suggestions)) {
      if (!this.manual.has(key) && !current[key] && value!==undefined && value!=='') {
        (patch as Record<string,unknown>)[key]=value;this.owned.add(key as keyof SuggestionPatch);
      }
    }
    return patch;
  }
}
export function extraPayload(extra:ExtraAttributes):Partial<Record<ExtraHead,string|null>> {
  return Object.fromEntries(Object.entries(extra).map(([k,v])=>[k,v || null]));
}

export function sleeveApplicable(category: Pick<ApiCategory,'name'> | undefined):boolean {
  const name=(category?.name || '').toLowerCase().replace(/[_-]/g,' ');
  return !(/\b(jeans|trousers?|pants|skirts?|shorts|leggings|culottes|joggers|bottoms)\b/.test(name) && !/\b(shirts?|tops?|dresses?|suits?|jackets?|kameez|hoodies?|sweaters?)\b/.test(name));
}
