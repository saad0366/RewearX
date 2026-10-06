import { useState, useEffect, useMemo } from 'react';
import { Search, SlidersHorizontal, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ItemCard from '../components/ui/ItemCard';
import FilterSidebar, { BrowseFilters } from '../components/ui/FilterSidebar';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { categories } from '../lib/mockData';
import type { Item as UIItem } from '../lib/mockData';
import { itemsApi, savedApi, categoriesApi } from '../lib/api';
import { adaptItem, ApiCategory, apiConditionFromUI, apiGenderFromUI } from '../lib/api/types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { Pagination as ApiPagination } from '../lib/api/client';

const PAGE_SIZE = 12;
const emptyFilters: BrowseFilters = {
  categories: [],
  sizes: [],
  genders: [],
  conditions: [],
  colors: [],
  brand: '',
  location: '',
};

export default function Browse() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [isNlpSearch, setIsNlpSearch] = useState(false);
  const [filters, setFilters] = useState<BrowseFilters>(emptyFilters);
  const [sort, setSort] = useState<'newest' | 'relevant' | 'az'>('newest');
  const [page, setPage] = useState(1);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [apiCategories, setApiCategories] = useState<ApiCategory[]>([]);
  const [items, setItems] = useState<UIItem[]>([]);
  const [pagination, setPagination] = useState<ApiPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    categoriesApi.list().then((cs) => setApiCategories(cs)).catch(() => undefined);
  }, []);

  // Sync query params from URL (e.g. /browse?q=... or ?category=... or ?location=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qParam = params.get('q') || '';
    const catParam = params.get('category');
    const locParam = params.get('location') || '';
    setQuery(qParam);
    setSubmittedQuery(qParam);
    setFilters((prev) => ({
      ...prev,
      categories: catParam ? [catParam] : [],
      location: locParam,
    }));
    setPage(1);
  }, [window.location.search]);

  useEffect(() => {
    if (!isAuthenticated) return;
    savedApi
      .list(1, 100)
      .then(({ items: list }) => {
        setSavedIds(new Set(list.map((i) => String(i.id))));
      })
      .catch(() => undefined);
  }, [isAuthenticated]);

  const handleSearch = () => {
    setPage(1);
    setSubmittedQuery(query.trim());
  };

  const categoryNameToId = useMemo(() => {
    const map = new Map<string, number>();
    apiCategories.forEach((c) => map.set(c.name, c.id));
    return map;
  }, [apiCategories]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const wordCount = submittedQuery.trim().split(/\s+/).filter(Boolean).length;
    const useNlp = wordCount >= 2;
    setIsNlpSearch(useNlp);

    if (useNlp) {
      itemsApi
        .nlpSearch(submittedQuery, page, PAGE_SIZE)
        .then(({ items: list, pagination: p }) => {
          if (cancelled) return;
          setItems(list.map((i) => adaptItem(i, i.matchScore)));
          setPagination(p);
          setLoading(false);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setError(err.message);
          setLoading(false);
        });
    } else {
      const apiFilters: Record<string, unknown> = { page, limit: PAGE_SIZE };
      if (submittedQuery) apiFilters.q = submittedQuery;
      if (filters.brand) apiFilters.brand = filters.brand;
      if (filters.location) apiFilters.location = filters.location;
      if (filters.categories.length === 1) {
        const id = categoryNameToId.get(filters.categories[0]);
        if (id) apiFilters.categoryId = id;
      }
      if (filters.genders.length === 1) {
        apiFilters.gender = apiGenderFromUI(filters.genders[0] as UIItem['gender']);
      }
      if (filters.conditions.length === 1) {
        apiFilters.condition = apiConditionFromUI(filters.conditions[0] as UIItem['condition']);
      }
      if (filters.sizes.length === 1) apiFilters.size = filters.sizes[0];
      if (filters.colors.length === 1) apiFilters.color = filters.colors[0];

      itemsApi
        .list(apiFilters)
        .then(({ items: list, pagination: p }) => {
          if (cancelled) return;
          let mapped = list.map((i) => adaptItem(i));
          if (filters.categories.length > 1)
            mapped = mapped.filter((i) => filters.categories.includes(i.category));
          if (filters.sizes.length > 1)
            mapped = mapped.filter((i) => filters.sizes.includes(i.size));
          if (filters.conditions.length > 1)
            mapped = mapped.filter((i) => filters.conditions.includes(i.condition));
          if (filters.colors.length > 1)
            mapped = mapped.filter((i) => filters.colors.includes(i.color));
          if (sort === 'az')
            mapped = [...mapped].sort((a, b) => a.title.localeCompare(b.title));
          setItems(mapped);
          setPagination(p);
          setLoading(false);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setError(err.message);
          setLoading(false);
        });
    }

    return () => { cancelled = true; };
  }, [submittedQuery, filters, sort, page, categoryNameToId]);

  const onToggleSaved = async (id: string) => {
    if (!isAuthenticated) {
      toast('Please log in to save items.', 'info');
      return;
    }
    const isSaved = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      if (isSaved) await savedApi.unsave(id);
      else await savedApi.save(id);
    } catch (err) {
      // revert on error
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(id);
        else next.delete(id);
        return next;
      });
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    }
  };

  const totalPages = pagination?.totalPages ?? 1;

  const activeChips: { label: string; onRemove: () => void }[] = [];
  filters.categories.forEach((c) =>
    activeChips.push({ label: c, onRemove: () => { setFilters({ ...filters, categories: filters.categories.filter((x) => x !== c) }); setPage(1); } })
  );
  filters.sizes.forEach((s) =>
    activeChips.push({ label: `Size ${s}`, onRemove: () => { setFilters({ ...filters, sizes: filters.sizes.filter((x) => x !== s) }); setPage(1); } })
  );
  filters.genders.forEach((g) =>
    activeChips.push({ label: g, onRemove: () => { setFilters({ ...filters, genders: [] }); setPage(1); } })
  );
  filters.conditions.forEach((c) =>
    activeChips.push({ label: c, onRemove: () => { setFilters({ ...filters, conditions: filters.conditions.filter((x) => x !== c) }); setPage(1); } })
  );
  filters.colors.forEach((c) =>
    activeChips.push({ label: c, onRemove: () => { setFilters({ ...filters, colors: filters.colors.filter((x) => x !== c) }); setPage(1); } })
  );
  if (filters.brand) {
    activeChips.push({ label: `Brand: ${filters.brand}`, onRemove: () => { setFilters({ ...filters, brand: '' }); setPage(1); } });
  }

  const heroCategories = apiCategories.length > 0 ? apiCategories.map((c) => c.name).slice(0, 6) : categories.slice(0, 6);

  return (
    <div className="w-full pb-12 sm:pb-16 bg-background relative z-10">
      {/* Search Hero */}
      <section className="bg-gradient-to-br from-primary to-primary/85 text-white pt-8 sm:pt-10 md:pt-12 pb-10 sm:pb-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
            Browse the community
          </span>
          <h1 className="font-headings text-2xl sm:text-3xl font-bold mt-1.5 mb-4">
            Find your next favourite piece
          </h1>
          <div className="relative max-w-xl mx-auto">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Try: 'warm clothes for cold weather' or search by keyword…"
              className="w-full pl-5 pr-12 py-3 rounded-full text-primary text-sm shadow-lg border border-white/30 bg-white focus:outline-none focus:ring-4 focus:ring-accent/30 transition-all"
            />
            <button
              onClick={handleSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:scale-105 transition-transform">
              <Search size={15} />
            </button>
            {isNlpSearch && (
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/80 uppercase tracking-widest whitespace-nowrap">
                ✦ AI search active
              </span>
            )}
          </div>
          <div className="flex gap-1.5 mt-4 flex-wrap justify-center">
            {['All', ...heroCategories].map((c) => {
              const active =
                (c === 'All' && filters.categories.length === 0) || filters.categories.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => {
                    if (c === 'All') {
                      setFilters({ ...filters, categories: [] });
                    } else {
                      const has = filters.categories.includes(c);
                      setFilters({
                        ...filters,
                        categories: has
                          ? filters.categories.filter((x) => x !== c)
                          : [...filters.categories, c],
                      });
                    }
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${active
                      ? 'bg-accent text-accent-foreground shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
        <div className="flex gap-5">
          <aside className="w-60 flex-shrink-0 hidden lg:block">
            <FilterSidebar
              filters={filters}
              onChange={(f) => {
                setFilters(f);
                setPage(1);
              }}
              onClear={() => { setFilters(emptyFilters); setPage(1); }}
            />
          </aside>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-xs font-semibold text-primary">
                <span className="font-headings text-lg font-bold text-primary">
                  {pagination?.totalItems ?? items.length}
                </span>{' '}
                {(pagination?.totalItems ?? items.length) === 1 ? 'item' : 'items'} found
              </p>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                  Sort
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="text-xs font-semibold border border-border/60 rounded-full px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="newest">Newest</option>
                  <option value="relevant">Most relevant</option>
                  <option value="az">A → Z</option>
                </select>
              </div>
            </div>

            {activeChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {activeChips.map((chip, idx) => (
                  <span
                    key={`${chip.label}-${idx}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 text-[11px] font-bold"
                  >
                    {chip.label}
                    <button onClick={chip.onRemove} aria-label="Remove" className="hover:opacity-70">
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => { setFilters(emptyFilters); setPage(1); }}
                  className="text-[11px] font-bold text-red-600 hover:text-red-700 uppercase tracking-wider"
                >
                  Clear All
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20 text-primary/50">
                <Loader2 size={28} className="animate-spin" />
              </div>
            ) : error ? (
              <EmptyState
                icon={Search}
                title="Couldn't load items"
                message={error}
                actionLabel="Retry"
                onAction={() => setPage(page)}
              />
            ) : items.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No items match"
                message="Try removing a filter or searching a different keyword."
                actionLabel="Clear filters"
                onAction={() => { setFilters(emptyFilters); setPage(1); }}
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    saved={savedIds.has(item.id)}
                    onSave={onToggleSaved}
                  />
                ))}
              </div>
            )}

            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </section>

      {/* Mobile filter FAB */}
      <button
        onClick={() => setShowMobileFilters(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-2xl flex items-center justify-center lg:hidden hover:scale-110 active:scale-95 transition-transform"
        aria-label="Open filters"
      >
        <SlidersHorizontal size={20} />
      </button>

      <AnimatePresence>
        {showMobileFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-end lg:hidden"
            onClick={() => setShowMobileFilters(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-background rounded-t-3xl max-h-[85vh] overflow-hidden"
            >
              <FilterSidebar
                mobile
                filters={filters}
                onChange={setFilters}
                onClear={() => { setFilters(emptyFilters); setPage(1); }}
                onClose={() => setShowMobileFilters(false)}
              />
              <div className="p-4 border-t border-border/60 bg-background">
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="w-full py-3 rounded-xl bg-primary text-white font-bold uppercase tracking-wider text-xs"
                >
                  Show {pagination?.totalItems ?? items.length} items
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
