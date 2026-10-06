import React, { useState, useRef, useEffect } from 'react';
import { ScanSearch, X, Camera, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation } from 'wouter';
import { itemsApi, categoriesApi } from '../../lib/api';

import type { ApiCategory } from '../../lib/api/types';
import { EXTRA_OPTIONS, safeSuggestions, ExtraHead } from '../../lib/listingImageAi';

// Temporary discovery uploads are never published as listings.
export default function AISearchWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [extractedTags, setExtractedTags] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState<'have'|'want'>('want');
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [attributes, setAttributes] = useState({categoryId:'',colors:'',occasion:'',season:'',sleeve_length:'',pattern:''});
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [limited, setLimited] = useState(false);
  const extractGeneration = useRef(0), searchGeneration = useRef(0);
  const extractAbort = useRef<AbortController|null>(null), searchAbort = useRef<AbortController|null>(null);
  const edited = useRef(new Set<string>());
  const previewUrl = useRef<string|null>(null);
  const categoriesRef = useRef(categories); categoriesRef.current = categories;
  const extractionRef = useRef<Awaited<ReturnType<typeof itemsApi.extractImage>>|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [, setLocation] = useLocation();

  useEffect(() => {
    let active=true;
    categoriesApi.list().then(c=>{if(active)setCategories(c);}).catch(()=>{if(active)setError('Categories are unavailable; retry later.');});
    return ()=>{active=false;extractAbort.current?.abort();searchAbort.current?.abort();++extractGeneration.current;++searchGeneration.current;if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);};
  }, []);

  useEffect(() => {
    const data=extractionRef.current;if(!data)return;
    const suggestions=safeSuggestions(data,categories);
    if(suggestions.categoryId && !edited.current.has('categoryId'))setAttributes(a=>({...a,categoryId:String(suggestions.categoryId)}));
  },[categories]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const clearResults = () => {
    ++searchGeneration.current;searchAbort.current?.abort();setIsSearching(false);setShowResults(false);setSearchResults([]);setError('');
  };
  const editAttribute = (key: keyof typeof attributes, value:string) => {
    edited.current.add(key);setAttributes(a=>({...a,[key]:value}));clearResults();
  };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0];if(!file)return;
    clearResults();extractAbort.current?.abort();const generation=++extractGeneration.current;
    if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
    const url=URL.createObjectURL(file);previewUrl.current=url;setUploadedImage(url);
    edited.current.clear();extractionRef.current=null;
    setAttributes({categoryId:'',colors:'',occasion:'',season:'',sleeve_length:'',pattern:''});setExtractedTags([]);
    if(!['image/jpeg','image/jpg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Use JPEG, PNG or WebP up to 5 MB.');setIsAnalyzing(false);return;}
    const controller=new AbortController();extractAbort.current=controller;setIsAnalyzing(true);
    try {
      const data=await itemsApi.extractImage(file,controller.signal);
      if(generation!==extractGeneration.current)return;
      extractionRef.current=data;
      const patch=safeSuggestions(data,categoriesRef.current);
      const values={categoryId:patch.categoryId?String(patch.categoryId):'',colors:data.predictions.color.labels?.join(', ')||'',
        occasion:patch.occasion||'',season:patch.season||'',sleeve_length:patch.sleeve_length||'',pattern:patch.pattern||''};
      setAttributes(current=>({...current,...Object.fromEntries(Object.entries(values).filter(([key])=>!edited.current.has(key)))}));
      setExtractedTags(data.category_mapping.status==='ambiguous'?['Category ambiguous: select it manually']:[]);
    } catch(err) {if(generation===extractGeneration.current&&!controller.signal.aborted)setError(err instanceof Error?err.message:'Image analysis failed. Enter attributes manually or retry.');}
    finally {if(generation===extractGeneration.current)setIsAnalyzing(false);}
  };
  const executeVisualSearch = async (nextPage=1) => {
    const generation=++searchGeneration.current;searchAbort.current?.abort();
    const controller=new AbortController();searchAbort.current=controller;
    setError('');setIsSearching(true);setShowResults(false);setSearchResults([]);
    try {
      const query={...attributes,categoryId:attributes.categoryId?Number(attributes.categoryId):null,
        colors:attributes.colors.split(',').map(c=>c.trim().toLowerCase()).filter(Boolean)};
      const response=await itemsApi.visualSearch(mode,query,nextPage,controller.signal);
      if(generation!==searchGeneration.current)return;
      if(response.operation!==mode)throw new Error('Search response mode mismatch.');
      setSearchResults(response.results.map(item=>({...item,owner:item.owner?.name||'Community member',
        image:item.images?.[0]?.url||null,features:item.matchReasons||[]})));
      setPage(nextPage);setHasNext(response.pagination.hasNext);setLimited(response.candidate_limited);setShowResults(true);
    } catch(err) {if(generation===searchGeneration.current&&!controller.signal.aborted)setError(err instanceof Error?err.message:'Search failed.');}
    finally {if(generation===searchGeneration.current)setIsSearching(false);}
  };
  const resetSearch = () => {
    ++extractGeneration.current;extractAbort.current?.abort();clearResults();setIsAnalyzing(false);
    if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;
    extractionRef.current=null;setUploadedImage(null);setExtractedTags([]);
    if(fileInputRef.current)fileInputRef.current.value='';
  };
  const handleRequestSwap = (_title: string, itemId?: number) => {
    // Discovery only: real swaps remain subject to the existing listing/ownership flow.
    if(itemId){setIsOpen(false);setLocation(`/items/${itemId}`);}
  };

  const handleCardClick = (itemId: number) => {
    setIsOpen(false);
    setLocation(`/items/${itemId}`);
  };

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 bg-zinc-950 text-white w-[52px] h-[52px] sm:w-[56px] sm:h-[56px] sm:hover:w-[140px] rounded-full shadow-2xl flex items-center justify-center sm:hover:justify-start cursor-pointer overflow-hidden group transition-all duration-500 ease-out border border-white/10"
        aria-label="Open AI Visual Search"
      >
        <div className="flex items-center px-4 sm:px-[17px] w-full relative z-10">
          <ScanSearch size={20} className="sm:w-[22px] sm:h-[22px] shrink-0 text-white group-hover:scale-110 transition-transform duration-500" strokeWidth={2} />
          
          <div className="hidden sm:flex ml-3 overflow-hidden whitespace-nowrap">
            {"AI SEARCH".split('').map((char, index) => (
              <span 
                key={index} 
                className="font-bold text-[11px] font-headings text-white uppercase tracking-[0.15em] opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
                style={{ 
                  transitionDelay: `${50 + index * 20}ms`,
                }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </div>
        </div>
      </motion.button>

      {/* Sidebar Overlay and Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 lg:hidden"
            />
            
            <motion.div
              initial={isMobile ? { y: '100%', opacity: 0 } : { x: '100%', opacity: 0 }}
              animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
              exit={isMobile ? { y: '100%', opacity: 0 } : { x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-0 sm:inset-auto sm:top-0 sm:right-0 h-[100dvh] w-full sm:w-[400px] bg-[#fdfdfc] shadow-[0_0_60px_-15px_rgba(0,0,0,0.3)] z-50 flex flex-col sm:border-l border-border/40 font-body"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 sm:p-6 bg-white/80 backdrop-blur-xl border-b border-border/40 relative z-10">
                <div className="flex items-center gap-3 text-primary">
                  <div className="p-2 sm:p-2.5 bg-primary rounded-xl border border-primary/10">
                    <ScanSearch size={16} className="sm:w-[18px] sm:h-[18px] text-white" />
                  </div>
                  <div>
                    <h2 className="font-headings font-bold text-base sm:text-lg leading-none tracking-tight">AI Smart Search</h2>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold mt-1.5 opacity-80">Find Matches Instantly</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-primary"
                  aria-label="Close panel"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 sm:py-6 pb-24 relative">
                
                <div className="flex gap-2 mb-3">
                  {(['have','want'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>{setMode(value);clearResults();}} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold border ${mode===value?'bg-primary text-white':'border-border/60'}`}>{value==='have'?'I Have This':'I Want This'}</button>)}
                </div>
                <p className="text-xs text-muted-foreground mb-4">{mode==='have'?"Find owners who want your garment, then browse what they offer.":"Find available listings similar to the garment you want."}</p>
                {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}
                {/* Initial Upload State */}
                {!uploadedImage && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-full flex flex-col items-center justify-center text-center -mt-10"
                  >
                    <div 
                      onClick={handleUploadClick}
                      className="w-full aspect-[4/3] rounded-3xl border-2 border-dashed border-primary/20 hover:border-primary/50 bg-white flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group shadow-sm hover:shadow-md"
                    >
                      <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center text-primary mb-5 group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-300">
                        <Camera size={28} className="group-hover:text-accent transition-colors" />
                      </div>
                      <h3 className="font-headings font-bold text-xl text-primary mb-1.5">Upload a product photo</h3>
                      <p className="text-xs text-muted-foreground px-8 font-medium leading-relaxed">
                        Snap a pic or upload an image to find similar or exact matches in our community catalog.
                      </p>
                      
                      <button className="mt-6 px-6 py-2.5 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-full hover:bg-accent transition-all duration-300 hover:-translate-y-1 shadow-md">
                        Browse Files
                      </button>
                    </div>
                    
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/jpeg,image/png,image/webp" 
                      className="hidden" 
                    />
                  </motion.div>
                )}

                {/* Uploaded Image & Analysis State */}
                {uploadedImage && (
                  <div className="space-y-6">
                    {/* Image Preview Container */}
                    <div className="relative rounded-3xl overflow-hidden bg-white p-2.5 shadow-sm border border-border/60">
                      <div className="aspect-[4/3] rounded-2xl overflow-hidden relative group">
                        <img src={uploadedImage} alt="Uploaded item" className="w-full h-full object-cover" />
                        
                        {/* Scanning Animation */}
                        {isAnalyzing && (
                          <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px]">
                            {/* Scanning line */}
                            <div className="absolute top-0 left-0 w-full h-[2px] bg-accent shadow-[0_0_20px_4px_rgba(var(--accent-rgb),0.8)] animate-[scan_2s_ease-in-out_infinite]" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="bg-white/95 backdrop-blur-md px-5 py-3 rounded-full font-bold text-primary text-xs shadow-xl flex items-center gap-3 border border-border/40">
                                <Loader2 size={16} className="animate-spin text-accent" />
                                Analyzing search attributes...
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Close Preview Button */}
                        <button 
                            onClick={resetSearch}
                            className="absolute top-4 right-4 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-2 rounded-full transition-all opacity-0 group-hover:opacity-100 transform translate-y-[-10px] group-hover:translate-y-0"
                            aria-label="Remove image"
                          >
                            <X size={14} />
                          </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/60 p-3 space-y-3">
                      <p className="text-xs font-bold">Review and correct the garment attributes</p>
                      <label className="text-xs block">Category<select aria-label="Search category" value={attributes.categoryId} onChange={e=>editAttribute('categoryId',e.target.value)} className="w-full border rounded-lg p-2 mt-1">
                        <option value="">Not specified / ambiguous</option>
                        {categories.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.parentId?`${categories.find(p=>p.id===c.parentId)?.name||''} / `:''}{c.name}</option>)}
                      </select></label>
                      <label className="text-xs block">Atomic colors (comma-separated)<input aria-label="Search colors" value={attributes.colors} onChange={e=>editAttribute('colors',e.target.value)} placeholder="black, gold" className="w-full border rounded-lg p-2 mt-1" /></label>
                      <div className="grid grid-cols-2 gap-2">{(Object.keys(EXTRA_OPTIONS) as ExtraHead[]).map(head=><label key={head} className="text-xs">{head.replace('_',' ')}<select aria-label={`Search ${head}`} value={attributes[head]} onChange={e=>editAttribute(head,e.target.value)} className="w-full border rounded-lg p-2 mt-1"><option value="">Not specified</option>{EXTRA_OPTIONS[head].map(value=><option key={value} value={value}>{value.replace('_',' ')}</option>)}</select></label>)}</div>
                      <p className="text-[10px] text-muted-foreground">AI does not support skirt, half sleeves or all-season. Size, gender and condition are not inferred. Search does not publish a listing.</p>
                      <button type="button" onClick={()=>executeVisualSearch()} disabled={isSearching||isAnalyzing} className="w-full bg-primary text-white rounded-xl p-2 text-xs font-bold">{isSearching?'Searching...':mode==='have'?"Find interested owners' listings":'Find similar listings'}</button>
                    </div>
                    {/* Extracted attributes pill badges */}
                    {showResults && extractedTags.length > 0 && (
                      <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3.5 flex items-center gap-2 text-xs text-emerald-900 font-medium">
                        <Sparkles size={16} className="text-emerald-600 shrink-0" />
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-800">Extracted AI Query:</span>
                          {extractedTags.map((tag) => (
                            <span key={tag} className="bg-white px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-300 text-emerald-900">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Results Area */}
                    {isSearching && <p role="status" className="text-xs flex gap-2"><Loader2 size={14} className="animate-spin" />Searching available listings...</p>}
                    {showResults && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-[11px] font-black tracking-[0.2em] text-primary/70 uppercase">
                            Matches Found ({searchResults.length})
                          </h3>
                        </div>
                        
                        {searchResults.length===0 && <p role="status" className="text-sm text-muted-foreground">No eligible matches found. Try correcting or removing uncertain attributes.</p>}
                        {limited && <p className="text-xs text-muted-foreground">Results are ranked within a bounded candidate window; they are not exhaustive.</p>}
                        <div className="space-y-3">
                          {searchResults.map((result, i) => (
                            <motion.div
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.1, ease: 'easeOut' }}
                              key={result.id}
                              onClick={() => handleCardClick(result.id)}
                              className="bg-white rounded-2xl p-3 flex gap-4 shadow-sm border border-border/50 hover:shadow-lg hover:border-primary/20 transition-all duration-300 group cursor-pointer"
                            >
                              <div className="w-[88px] h-[88px] rounded-xl overflow-hidden shrink-0 relative">
                                {result.image ? <img src={result.image} alt={result.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" /> : <span className="text-xs">No image</span>}
                                <div className="absolute top-1.5 left-1.5 bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-black text-primary shadow-sm border border-border/40">
                                  Rank {(page-1)*20+i+1}
                                </div>
                              </div>
                              <div className="flex-1 flex flex-col justify-between py-1">
                                <div>
                                  <h4 className="font-bold text-sm text-primary line-clamp-1 group-hover:text-accent transition-colors">{result.title}</h4>
                                  <span className="text-[10px] text-muted-foreground font-semibold mt-0.5 block">by {result.owner}</span>
                                </div>
                                
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {result.features.slice(0, 3).map((f: string) => (
                                    <span key={f} className="text-[9px] px-2 py-[2px] bg-muted/60 border border-border/40 rounded uppercase tracking-wider text-primary/70 font-bold">{f}</span>
                                  ))}
                                </div>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRequestSwap(result.title, result.id);
                                  }}
                                  className="mt-2.5 self-start text-[10px] font-black text-primary hover:text-accent flex items-center gap-1.5 transition-colors uppercase tracking-widest relative z-10"
                                >
                                  View listing <ArrowRight size={12} className="transform group-hover:translate-x-1 transition-transform" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                        <div className="flex justify-between text-xs"><button disabled={page===1||isSearching} onClick={()=>executeVisualSearch(page-1)}>Previous</button><span>Page {page}: ranking is not an AI probability</span><button disabled={!hasNext||isSearching} onClick={()=>executeVisualSearch(page+1)}>Next</button></div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <style>{`
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </>
  );
}
