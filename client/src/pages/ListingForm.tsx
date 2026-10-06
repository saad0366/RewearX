import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Check, ChevronRight, AlertTriangle, Trash2, Loader2, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import ImageUploader, { UploaderImage } from '../components/ui/ImageUploader';
import { EMPTY_EXTRA, EXTRA_OPTIONS, ExtraHead, ExtraAttributes, ImageExtraction, SuggestionPatch, ListingSuggestionSession, safeSuggestions, extraPayload, sleeveApplicable } from '../lib/listingImageAi';
import { saveListingImages, ImageSaveNeedsReloadError } from '../lib/listingImageSave';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { itemsApi, categoriesApi } from '../lib/api';
import { apiConditionFromUI, apiGenderFromUI, ApiCategory } from '../lib/api/types';
import {
  sizes,
  genders,
  conditions,
  colors as colorOptions,
  PAKISTAN_CITIES,
  Item,
} from '../lib/mockData';

interface ListingFormProps {
  params?: { id?: string };
  mode: 'create' | 'edit';
}

type FormState = {
  images: UploaderImage[];
  title: string;
  categoryId: number | '';
  size: string;
  gender: Item['gender'] | '';
  condition: Item['condition'] | '';
  color: string;
  brand: string;
  location: string;
  description: string;
  is_available: boolean;
};

const empty: FormState = {
  images: [],
  title: '',
  categoryId: '',
  size: '',
  gender: '',
  condition: '',
  color: '',
  brand: '',
  location: 'Islamabad',
  description: '',
  is_available: true,
};

export default function ListingForm({ params, mode }: ListingFormProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { apiUser, isAuthenticated } = useAuth();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(empty);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [apiCategories, setApiCategories] = useState<ApiCategory[]>([]);
  const [selectedMainCatId, setSelectedMainCatId] = useState<number | ''>('');
  const [loadingItem, setLoadingItem] = useState(mode === 'edit');
  const [deleting, setDeleting] = useState(false);
  const [extra, setExtra] = useState<ExtraAttributes>({ ...EMPTY_EXTRA });
  const [analysis, setAnalysis] = useState<'idle'|'analyzing'|'ready'|'failed'>('idle');
  const [extraction, setExtraction] = useState<{id:number;data:ImageExtraction}|null>(null);
  const [storageEnabled, setStorageEnabled] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  const aiSession = useRef(new ListingSuggestionSession());
  const pendingAnalysis = useRef<AbortController|null>(null);
  const submittingRef = useRef(false);
  const savedImageIds = useRef<Array<string | number>>([]);
  const [imageRevision, setImageRevision] = useState(0);
  const [imageSaveNeedsReload, setImageSaveNeedsReload] = useState(false);
  const extraDirty = useRef(false);
  const formRef = useRef(form); formRef.current = form;
  const extraRef = useRef(extra); extraRef.current = extra;
  const hasExtra = Object.values(extra).some(Boolean);
  const extraWillSave = storageEnabled;
  const showSleeve = sleeveApplicable(apiCategories.find(c=>c.id===form.categoryId));
  useEffect(()=>{if(!showSleeve && extra.sleeve_length){setExtra(f=>({...f,sleeve_length:''}));setReviewConfirmed(false);}},[showSleeve,extra.sleeve_length]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    itemsApi.imageCapabilities().then(c => { if (active) setStorageEnabled(c.confirmed_attributes); })
      .catch(() => { if (active) setStorageEnabled(false); });
    return () => { active = false; };
  }, [isAuthenticated]);

  const applyAiPatch = (patch: SuggestionPatch) => {
    if (!Object.keys(patch).length) return;
    setForm(f => ({ ...f, ...(patch.categoryId !== undefined ? {categoryId:patch.categoryId} : {}),
      ...(patch.color !== undefined ? {color:patch.color} : {}) }));
    setExtra(f => {
      const next = { ...f };
      for (const head of Object.keys(EXTRA_OPTIONS) as ExtraHead[]) if (patch[head] !== undefined) next[head] = patch[head]!;
      return next;
    });
    setDirty(true); setReviewConfirmed(false);
  };

  const primaryFile = form.images[0]?.file;
  useEffect(() => {
    if (!isAuthenticated || loadingItem) return;
    const request = aiSession.current.begin();
    applyAiPatch(request.reset);
    setExtraction(null);
    if (!primaryFile) { setAnalysis('idle'); return; }
    const controller = new AbortController(); pendingAnalysis.current = controller;
    setAnalysis('analyzing');
    itemsApi.extractImage(primaryFile, controller.signal).then(data => {
      if (request.id !== aiSession.current.generation || submittingRef.current) return;
      setExtraction({id:request.id,data}); setAnalysis('ready');
      if (data.storage) setStorageEnabled(data.storage.confirmed_attributes);
    }).catch(() => {
      if (request.id !== aiSession.current.generation || controller.signal.aborted) return;
      setAnalysis('failed'); // Existing manual entry/submission remains available.
    });
    return () => { controller.abort(); aiSession.current.cancel(); };
  }, [primaryFile, isAuthenticated, loadingItem]);

  useEffect(() => {
    if (!extraction || submittingRef.current) return;
    const patch = aiSession.current.accept(extraction.id, safeSuggestions(extraction.data, apiCategories),
      { ...formRef.current, ...extraRef.current });
    applyAiPatch(patch);
  }, [extraction, apiCategories]);

  const updateExtra = (head: ExtraHead, value: string) => {
    aiSession.current.changed(head); extraDirty.current = true;
    setExtra(f => ({ ...f, [head]:value })); setDirty(true);
    setReviewConfirmed(false);
  };

  useEffect(() => {
    categoriesApi
      .list()
      .then((res) => {
        const cats: ApiCategory[] = Array.isArray(res) ? res : (res as unknown as { data: ApiCategory[] })?.data || [];
        setApiCategories(cats.map(c=>({...c,id:Number(c.id),parentId:c.parentId==null?null:Number(c.parentId)})));
      })
      .catch(() => undefined);
  }, []);

  // Sync selectedMainCatId when editing or when form.categoryId changes
  useEffect(() => {
    if (form.categoryId && apiCategories.length > 0) {
      const cat = apiCategories.find((c) => c.id === form.categoryId);
      if (cat) {
        if (cat.parentId) {
          setSelectedMainCatId(cat.parentId);
        } else {
          setSelectedMainCatId(cat.id);
        }
      }
    }
  }, [form.categoryId, apiCategories]);

  useEffect(() => {
    if (mode !== 'edit' || !params?.id) return;
    setLoadingItem(true);
    itemsApi
      .byId(params.id)
      .then((item) => {
        if (apiUser && item.userId !== apiUser.id) {
          toast('You can only edit your own listings.', 'error');
          setLocation('/home');
          return;
        }
        const conditionMap = { new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair' } as const;
        const genderMap = { male: 'Male', female: 'Female', unisex: 'Unisex' } as const;
        const confirmed = { ...EMPTY_EXTRA, ...Object.fromEntries(Object.entries(item.confirmedAttributes || {}).map(([k,v]) => [k,v || ''])) };
        setExtra(confirmed);
        for (const [key,value] of Object.entries(confirmed)) if (value) aiSession.current.changed(key);
        aiSession.current.changed('categoryId'); aiSession.current.changed('color');
        savedImageIds.current = (item.images || []).map(img => img.id);
        const orderedImages = [...(item.images || [])].sort((a,b) => Number(b.isPrimary) - Number(a.isPrimary));
        setForm({
          images: orderedImages.map((img) => ({ url: img.url, existingId: img.id })),
          title: item.title,
          categoryId: item.categoryId,
          size: item.size,
          gender: genderMap[item.gender],
          condition: conditionMap[item.condition],
          color: (item.color || '').split(',').filter(v=>v.trim()).length>2?'multicolor':item.color || '',
          brand: item.brand || '',
          location: item.location || 'Islamabad',
          description: item.description || '',
          is_available: item.isAvailable,
        });
        setLoadingItem(false);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : 'Failed to load listing.', 'error');
        setLocation('/home');
      });
  }, [params?.id, mode, apiUser, setLocation, toast]);

  useEffect(() => {
    if (!isAuthenticated) {
      toast('Please log in to list a piece.', 'info');
      setLocation('/login');
    }
  }, [isAuthenticated, setLocation, toast]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    aiSession.current.changed(key);
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true); setReviewConfirmed(false);
  };

  const validateStep = (s: number): boolean => {
    if (s === 1) return form.images.length > 0;
    if (s === 2)
      return Boolean(form.title && form.categoryId && form.size && form.gender && form.condition && form.color.length <= 255 && form.color.split(',').filter(v=>v.trim()).length<=2);
    return true;
  };

  const fieldError = (field: keyof FormState): string | null => {
    if (!touched[field]) return null;
    if (field === 'title' && !form.title) return 'A title is required';
    if (field === 'categoryId' && !form.categoryId) return 'Pick a category';
    if (field === 'size' && !form.size) return 'Size is required';
    if (field === 'gender' && !form.gender) return 'Pick a gender';
    if (field === 'color' && form.color.split(',').filter(v=>v.trim()).length>2) return 'Choose up to two colors, or enter multicolor.';
    if (field === 'color' && form.color.length > 255) return 'Color must fit the 255-character field. Please edit the full suggestion; no colors were dropped.';
    if (field === 'condition' && !form.condition) return 'Pick a condition';
    return null;
  };

  const handleSubmit = async () => {
    if (submittingRef.current || imageSaveNeedsReload) return;
    setTouched({ title: true, categoryId: true, size: true, gender: true, condition: true, color: true });
    if (!validateStep(2) || form.images.length === 0) {
      toast('Please complete every required field.', 'error');
      return;
    }
    if (!reviewConfirmed) { toast('Please review and confirm the listing details.', 'info'); return; }
    if (hasExtra && !extraWillSave) {
      toast('These clothing details cannot be saved right now. Please try again; your edits are still here.', 'info'); return;
    }
    submittingRef.current = true;
    pendingAnalysis.current?.abort(); aiSession.current.cancel(); setAnalysis('idle');
    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        categoryId: Number(form.categoryId),
        size: form.size,
        gender: apiGenderFromUI(form.gender as Item['gender']),
        condition: apiConditionFromUI(form.condition as Item['condition']),
        color: form.color || undefined,
        brand: form.brand || undefined,
        location: form.location || 'Islamabad',
        ...(extraWillSave ? { confirmedAttributes:extraPayload({...extra,sleeve_length:showSleeve?extra.sleeve_length:''}) } : {}),
      };

      if (mode === 'create') {
        const newFiles = form.images.filter((i) => i.file).map((i) => i.file as File);
        const created = await itemsApi.create({ ...payload, reviewConfirmed:true }, newFiles);
        toast('Listing published!', 'success');
        setLocation(`/items/${created.id}`);
      } else if (mode === 'edit' && params?.id) {
        await itemsApi.update(params.id, { ...payload, isAvailable: form.is_available });

        await saveListingImages(params.id, form.images, savedImageIds.current, itemsApi, (images, ids) => {
          savedImageIds.current = ids;
          setForm(current => ({ ...current, images }));
          setImageRevision(revision => revision + 1);
        });

        await itemsApi.update(params.id, { reviewConfirmed:true });
        toast('Listing updated.', 'success');
        setLocation(`/items/${params.id}`);
      }
    } catch (err) {
      if (err instanceof ImageSaveNeedsReloadError) setImageSaveNeedsReload(true);
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!params?.id) return;
    setDeleting(true);
    try {
      await itemsApi.remove(params.id);
      toast('Listing deleted.', 'success');
      setShowDeleteConfirm(false);
      setLocation('/profile');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCancel = () => {
    if (dirty) setShowCancelConfirm(true);
    else setLocation('/browse');
  };

  if (loadingItem) {
    return (
      <div className="pt-32 flex justify-center text-primary/40">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const stepLabels = ['Images', 'Details', 'Preferences'];
  const mainCategories = apiCategories.filter((c) => c.isActive && !c.parentId);
  const subcategories = selectedMainCatId
    ? apiCategories.filter((c) => c.isActive && c.parentId === Number(selectedMainCatId))
    : [];

  const handleMainCategoryChange = (mainId: number | '') => {
    setSelectedMainCatId(mainId);
    setTouched((t) => ({ ...t, categoryId: true }));
    if (!mainId) {
      update('categoryId', '');
      return;
    }
    const mainCat = apiCategories.find((c) => c.id === mainId);
    if (mainCat) {
      if (mainCat.name === 'Men' && !form.gender) update('gender', 'Male');
      if (mainCat.name === 'Women' && !form.gender) update('gender', 'Female');
      if (mainCat.name === 'Unisex' && !form.gender) update('gender', 'Unisex');
    }
    const subs = apiCategories.filter((c) => c.isActive && c.parentId === Number(mainId));
    if (subs.length > 0) {
      update('categoryId', '');
    } else {
      update('categoryId', mainId);
    }
  };

  return (
    <div className="pt-6 sm:pt-8 pb-12 sm:pb-16 bg-background relative z-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
            {mode === 'edit' ? 'Editing your listing' : 'List a new piece'}
          </span>
          <h1 className="font-headings text-2xl sm:text-3xl font-bold text-primary mt-1">
            {mode === 'edit' ? 'Refine your listing' : 'Give this piece a second life'}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-2 max-w-md mx-auto">
            Thoughtful listings get more swaps. Spend a minute on great photos and details.
          </p>
        </div>

        {imageSaveNeedsReload && <p role="alert" className="text-sm text-red-600 text-center mb-4">The upload outcome is uncertain. Reload the saved listing before making further changes. <button type="button" className="underline font-bold" onClick={() => window.location.reload()}>Reload listing</button></p>}

      {/* Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {stepLabels.map((label, idx) => {
            const i = idx + 1;
            const active = step === i;
            const completed = step > i;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border-2 transition-all ${
                      completed
                        ? 'bg-accent border-accent text-accent-foreground'
                        : active
                        ? 'bg-primary border-primary text-white'
                        : 'bg-background border-border/60 text-primary/50'
                    }`}
                  >
                    {completed ? <Check size={13} /> : i}
                  </div>
                  <span
                    className={`text-[9px] uppercase tracking-wider font-bold ${
                      active ? 'text-primary' : 'text-primary/40'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < stepLabels.length && (
                  <div className={`w-8 h-[2px] ${step > i ? 'bg-accent' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-background rounded-2xl border border-border/60 shadow-sm p-5 sm:p-6 md:p-8"
        >
          {step === 1 && (
            <div>
              <h2 className="font-headings text-lg font-bold text-primary mb-0.5">
                Add up to 5 images
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                The first image will be your cover. Star another to set it as primary.
              </p>
              <ImageUploader
                key={imageRevision}
                disabled={submitting}
                maxFiles={5}
                existingImages={form.images}
                onChange={(imgs) => update('images', imgs)}
              />
              {analysis === 'analyzing' && <p role="status" className="text-xs text-muted-foreground mt-3 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Analyzing your cover image. You can continue entering details.</p>}
              {analysis === 'failed' && <p role="status" className="text-xs text-muted-foreground mt-3">AI suggestions are unavailable. You can enter all details manually.</p>}
              {analysis === 'ready' && <p role="status" className="text-xs text-muted-foreground mt-3">Suggestions are ready. Review and correct them in Details.</p>}
              {touched.images && form.images.length === 0 && (
                <p className="text-red-600 text-xs mt-3 font-semibold">At least one image required</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">

              {analysis === 'analyzing' && <p role="status" className="text-xs text-muted-foreground flex gap-2"><Loader2 size={14} className="animate-spin" />Analyzing image; manual entry is available.</p>}
              {analysis === 'failed' && <p role="status" className="text-xs text-muted-foreground">AI is unavailable; complete the form manually.</p>}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.title}
                  maxLength={150}
                  onChange={(e) => update('title', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, title: true }))}
                  placeholder="e.g. Vintage Levi's denim jacket"
                  className={`w-full mt-2 px-4 py-3 rounded-xl bg-muted/20 border focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                    fieldError('title') ? 'border-red-500 ring-1 ring-red-200' : 'border-border/60'
                  }`}
                />
                <div className="flex justify-between mt-1">
                  {fieldError('title') ? (
                    <p className="text-red-600 text-xs font-semibold">{fieldError('title')}</p>
                  ) : <span />}
                  <p className={`text-xs ${form.title.length > 135 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {form.title.length}/150
                  </p>
                </div>
              </div>

              {/* â”€â”€ Separate Main Category & Subcategory Selection â”€â”€ */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* 1. Main Category Selector */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
                    Main Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedMainCatId}
                    onChange={(e) => handleMainCategoryChange(e.target.value ? Number(e.target.value) : '')}
                    onBlur={() => setTouched((t) => ({ ...t, categoryId: true }))}
                    className={`w-full mt-2 px-4 py-3 rounded-xl bg-muted/20 border focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                      fieldError('categoryId') && !selectedMainCatId ? 'border-red-500' : 'border-border/60'
                    }`}
                  >
                    <option value="">Select Main Categoryâ€¦</option>
                    {mainCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Subcategory Selector */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
                    Subcategory {subcategories.length > 0 && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    disabled={!selectedMainCatId || subcategories.length === 0}
                    value={form.categoryId}
                    onChange={(e) => update('categoryId', e.target.value ? Number(e.target.value) : '')}
                    onBlur={() => setTouched((t) => ({ ...t, categoryId: true }))}
                    className={`w-full mt-2 px-4 py-3 rounded-xl bg-muted/20 border focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed ${
                      fieldError('categoryId') && selectedMainCatId && subcategories.length > 0
                        ? 'border-red-500'
                        : 'border-border/60'
                    }`}
                  >
                    <option value="">
                      {!selectedMainCatId
                        ? 'Select Main Category first'
                        : subcategories.length === 0
                        ? 'No subcategories available'
                        : 'Select Subcategoryâ€¦'}
                    </option>
                    {subcategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {analysis==='ready' && !form.categoryId && <p role="status" className="text-sm text-muted-foreground">Choose the category that best fits this item.</p>}
              {fieldError('categoryId') && (
                <p className="text-red-600 text-xs font-semibold mt-1">
                  {!selectedMainCatId
                    ? 'Please select a main category'
                    : 'Please select a subcategory'}
                </p>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
                  Brand
                </label>
                <input
                  value={form.brand}
                  maxLength={100}
                  onChange={(e) => update('brand', e.target.value)}
                  placeholder="e.g. Levi's, Zara, Arket"
                  className="w-full mt-2 px-4 py-3 rounded-xl bg-muted/20 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80 flex items-center gap-1.5 mb-2">
                  <MapPin size={13} className="text-[#2E4D3A]" />
                  <span>Location (City in Pakistan)</span> <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <select
                    value={form.location}
                    onChange={(e) => update('location', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-muted/20 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium text-sm text-primary cursor-pointer"
                  >
                    {PAKISTAN_CITIES.filter((c) => c !== 'All Pakistan').map((city) => (
                      <option key={city} value={city}>
                        {city}, Pakistan
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80 mb-2 block">
                  Size <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update('size', s)}
                      className={`py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider border-2 transition-colors ${
                        form.size === s
                          ? 'bg-primary text-white border-primary'
                          : 'border-border/60 text-primary/80 hover:border-primary'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <input
                  value={form.size && !sizes.includes(form.size) ? form.size : ''}
                  onChange={(e) => update('size', e.target.value)}
                  placeholder="â€¦or type a free-form size"
                  className="w-full mt-2 px-4 py-2.5 rounded-xl bg-muted/20 border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {fieldError('size') && (
                  <p className="text-red-600 text-xs font-semibold mt-1">{fieldError('size')}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80 mb-2 block">
                  Gender <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {genders.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => update('gender', g)}
                      className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider border-2 transition-colors ${
                        form.gender === g
                          ? 'bg-primary text-white border-primary'
                          : 'border-border/60 text-primary/80 hover:border-primary'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {fieldError('gender') && (
                  <p className="text-red-600 text-xs font-semibold mt-1">{fieldError('gender')}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80 mb-2 block">
                  Condition <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {conditions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update('condition', c)}
                      className={`p-3 rounded-2xl text-sm font-bold border-2 text-center transition-all ${
                        form.condition === c
                          ? 'bg-accent/10 text-accent border-accent ring-2 ring-accent/20'
                          : 'border-border/60 text-primary/80 hover:border-primary'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {fieldError('condition') && (
                  <p className="text-red-600 text-xs font-semibold mt-1">{fieldError('condition')}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80 mb-2 block">
                  Color
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {colorOptions.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => { const selected=form.color.split(',').map(value=>value.trim()).filter(Boolean); const has=selected.some(value=>value.toLowerCase()===c.name.toLowerCase()); update('color', has ? selected.filter(value=>value.toLowerCase()!==c.name.toLowerCase()).join(', ') : selected.length>=2?'multicolor':[...selected.filter(v=>v.toLowerCase()!=='multicolor'),c.name.toLowerCase()].join(', ')); }}
                      title={c.name}
                      className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 ${
                        form.color.split(',').some(value=>value.trim().toLowerCase()===c.name.toLowerCase()) ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                  <input
                    value={form.color}
                    onChange={(e) => update('color', e.target.value)}
                    placeholder="e.g. black, gold"
                    aria-label="Color or comma-separated colors"
                    className="px-3 py-2 ml-2 rounded-lg bg-muted/20 border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-40"
                  />
                </div>
              </div>

              {form.color.includes(',') && <p className="text-xs text-muted-foreground">Multiple colors: {form.color}. Edit the color field to correct them.</p>}
              {fieldError('color') && <p className="text-xs text-red-600">{fieldError('color')}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {(Object.keys(EXTRA_OPTIONS) as ExtraHead[]).filter(head=>head!=='sleeve_length'||showSleeve).map(head => <label key={head} className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
                  {head.replace('_', ' ')}
                  <select aria-label={head.replace('_', ' ')} value={extra[head]} onChange={e => updateExtra(head, e.target.value)} className="w-full mt-2 px-4 py-3 rounded-xl border border-border/60 bg-muted/20 text-sm font-normal normal-case focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">Not specified</option>
                    {extra[head] && !(EXTRA_OPTIONS[head] as readonly string[]).includes(extra[head]) && <option value={extra[head]}>{extra[head].replace('_',' ')}</option>}
                    {EXTRA_OPTIONS[head].map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                  </select>
                </label>)}
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
                  Description
                </label>
                <textarea
                  value={form.description}
                  maxLength={5000}
                  rows={5}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Cut, fit, story, defectsâ€¦"
                  className="w-full mt-2 px-4 py-3 rounded-xl bg-muted/20 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
                <p className="text-xs text-muted-foreground text-right mt-1">
                  {form.description.length}/5000
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 p-5 bg-muted/20">
                <p className="font-headings font-bold text-primary mb-1">Almost there!</p>
                <p className="text-xs text-muted-foreground">
                  Review the details below. Publishing saves your confirmed values, not unchecked AI predictions.
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt>Title</dt><dd>{form.title}</dd>
                <dt>Category</dt><dd>{apiCategories.find(c => c.id === form.categoryId)?.name || 'Select category'}</dd>
                <dt>Color</dt><dd>{form.color || 'Not specified'}</dd>
                <dt>Size / gender / condition</dt><dd>{form.size} / {form.gender} / {form.condition}</dd>
                {(Object.keys(EXTRA_OPTIONS) as ExtraHead[]).filter(head=>head!=='sleeve_length'||showSleeve).map(head => <div key={head} className="contents"><dt>{head.replace('_',' ')}</dt><dd>{extra[head] || 'Not specified'}</dd></div>)}
              </dl>

              <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewConfirmed} onChange={e => setReviewConfirmed(e.target.checked)} />I reviewed and confirmed these listing details.</label>
              {mode === 'edit' && (
                <div className="rounded-2xl border border-border/60 p-5 flex items-center justify-between bg-muted/20">
                  <div>
                    <p className="font-headings font-bold text-primary">Availability</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pause this listing without deleting it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => update('is_available', !form.is_available)}
                    className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${
                      form.is_available ? 'bg-accent' : 'bg-primary/20'
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform ${
                        form.is_available ? 'translate-x-5' : 'translate-x-0.5'
                      } mt-0.5`}
                    />
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Footer nav */}
        <div className="flex justify-between items-center gap-3 mt-6">
          <button
            type="button"
            disabled={submitting}
            onClick={() => (step === 1 ? handleCancel() : setStep(step - 1))}
            className="px-5 py-3 rounded-xl border border-border/60 text-primary font-bold uppercase tracking-wider text-xs hover:bg-muted/40 transition-colors"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && form.images.length === 0) {
                  setTouched((t) => ({ ...t, images: true }));
                  return;
                }
                if (step === 2) {
                  setTouched({ title: true, categoryId: true, size: true, gender: true, condition: true, color: true });
                  if (!validateStep(2)) return;
                }
                setStep(step + 1);
              }}
              className="px-7 py-3 rounded-xl bg-primary text-white font-bold uppercase tracking-wider text-xs hover:bg-primary/90 flex items-center gap-2 shadow-lg transition-all"
            >
              Continue <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || imageSaveNeedsReload}
              className={`px-8 py-3.5 rounded-xl bg-accent text-accent-foreground font-bold uppercase tracking-wider text-xs hover:bg-accent/90 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 ${
                submitting ? 'opacity-70 cursor-wait' : ''
              }`}
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {mode === 'edit' ? 'Save changes' : 'Publish listing'}
            </button>
          )}
        </div>

        {/* Danger zone (edit only) */}
        {mode === 'edit' && (
          <div className="mt-10 rounded-2xl border border-red-200 bg-red-50/60 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <h3 className="font-headings font-bold text-red-700">Danger zone</h3>
                <p className="text-sm text-red-700/80 mt-1">
                  Permanently remove this listing. You can list it again later.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 rounded-xl bg-white border border-red-300 text-red-600 font-bold uppercase tracking-wider text-[11px] hover:bg-red-100 flex items-center gap-1.5 transition-colors flex-shrink-0"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Discard changes?"
        message="You'll lose any unsaved details you've entered."
        confirmLabel="Discard"
        destructive
        onCancel={() => setShowCancelConfirm(false)}
        onConfirm={() => {
          setShowCancelConfirm(false);
          setLocation('/browse');
        }}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete this listing?"
        message="This will mark the listing as unavailable. You can re-list it later."
        confirmLabel={deleting ? 'Deletingâ€¦' : 'Yes, delete'}
        destructive
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
