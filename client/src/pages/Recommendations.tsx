import { useEffect, useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { sizes, genders, colors as colorOptions } from '../lib/mockData';
import type { Item as UIItem } from '../lib/mockData';
import ItemCard from '../components/ui/ItemCard';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { recommendationsApi, savedApi, usersApi, categoriesApi } from '../lib/api';
import { adaptItem, ApiCategory } from '../lib/api/types';
import { normalizePreferenceCategoryIds, type UserPreferences } from '../lib/api/users';

interface UIPrefs {
  sizes: string[];
  gender: 'Male' | 'Female' | 'Unisex' | 'Any';
  categories: number[];
  colors: string[];
  condition: 'New' | 'Like New' | 'Good' | 'Fair' | 'Any';
}

const conditionToApi = { New: 'new', 'Like New': 'like_new', Good: 'good', Fair: 'fair', Any: 'any' } as const;
const conditionFromApi: Record<string, UIPrefs['condition']> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  any: 'Any',
};
const genderToApi = { Male: 'male', Female: 'female', Unisex: 'unisex', Any: 'any' } as const;
const genderFromApi: Record<string, UIPrefs['gender']> = {
  male: 'Male',
  female: 'Female',
  unisex: 'Unisex',
  any: 'Any',
};

export default function Recommendations() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [sort, setSort] = useState<'match' | 'newest'>('match');
  const [showPrefs, setShowPrefs] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [items, setItems] = useState<UIItem[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [apiCategories, setApiCategories] = useState<ApiCategory[]>([]);
  const [prefs, setPrefs] = useState<UIPrefs>({
    sizes: [],
    gender: 'Any',
    categories: [],
    colors: [],
    condition: 'Any',
  });

  useEffect(() => {
    categoriesApi.list().then(setApiCategories).catch(() => undefined);
  }, []);

  const fetchRecs = async (refresh = false) => {
    setLoading(true);
    try {
      const recs = await recommendationsApi.list(24, refresh);
      const mapped = recs.map((r) => adaptItem(r.item, r.score));
      const sorted = sort === 'newest'
        ? [...mapped].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : mapped;
      setItems(sorted);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load recommendations.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchRecs();
    savedApi.list(1, 100).then(({ items: list }) => {
      setSavedIds(new Set(list.map((i) => String(i.id))));
    }).catch(() => undefined);

    usersApi.preferences().then((p) => {
      if (!p) return;
      setPrefs({
        sizes: p.preferredSizes || [],
        gender: genderFromApi[p.preferredGender || 'any'] || 'Any',
        categories: normalizePreferenceCategoryIds(p.preferredCategories),
        colors: p.preferredColors || [],
        condition: conditionFromApi[p.preferredCondition || 'any'] || 'Any',
      });
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (sort === 'newest') {
      setItems((prev) => [...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } else {
      setItems((prev) => [...prev].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)));
    }
  }, [sort]);

  const onToggleSaved = async (id: string) => {
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
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  };

  const togglePref = <K extends keyof UIPrefs>(key: K, value: UIPrefs[K] extends Array<infer U> ? U : UIPrefs[K]) => {
    if (key === 'gender' || key === 'condition') {
      setPrefs({ ...prefs, [key]: value } as UIPrefs);
      return;
    }
    const arr = prefs[key] as unknown as Array<typeof value>;
    setPrefs({
      ...prefs,
      [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
    } as UIPrefs);
  };

  const savePreferences = async () => {
    setSavingPrefs(true);
    try {
      const payload: UserPreferences = {
        preferredGender: genderToApi[prefs.gender],
        preferredCondition: conditionToApi[prefs.condition],
        preferredSizes: prefs.sizes,
        preferredColors: prefs.colors,
        preferredCategories: prefs.categories,
      };
      await usersApi.updatePreferences(payload);
      toast('Preferences saved – refreshing matches…', 'success');
      setShowPrefs(false);
      await fetchRecs(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  const categoryNames = apiCategories
    .filter((c) => prefs.categories.includes(c.id))
    .map((c) => c.name);

  return (
    <div className="pt-6 sm:pt-8 pb-12 sm:pb-16 bg-background relative z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
              AI-powered
            </span>
            <h1 className="font-headings text-2xl sm:text-3xl font-bold text-primary mt-1">
              For you
            </h1>
          </div>
          <button
            onClick={() => setShowPrefs(true)}
            className="px-4 py-2 rounded-full bg-primary text-white text-[11px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-md"
          >
            <Sparkles size={12} /> Preferences
          </button>
        </div>

        <div className="rounded-xl bg-accent/5 border border-accent/20 p-4 mb-4">
          <button
            onClick={() => setShowHow((s) => !s)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                <Sparkles size={13} />
              </div>
              <div>
                <p className="font-headings font-bold text-primary text-sm">How recommendations work</p>
                <p className="text-[11px] text-muted-foreground">
                  Tap to see the science behind your matches.
                </p>
              </div>
            </div>
            {showHow ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showHow && (
            <div className="mt-3 pt-3 border-t border-accent/20 text-xs text-primary/80 leading-relaxed">
              We score every available listing against your preferred sizes, colors, gender,
              category interests, condition, and image-feature similarity to items you've saved
              or swapped before. Higher matches mean more shared attributes — adjust your
              preferences anytime to refine results.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {[
            ...prefs.sizes.map((s) => `Size ${s}`),
            prefs.gender !== 'Any' ? prefs.gender : null,
            prefs.condition !== 'Any' ? prefs.condition : null,
            ...categoryNames,
            ...prefs.colors,
          ].filter((p): p is string => Boolean(p)).map((p) => (
            <Badge key={p} color="accent">{p}</Badge>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-primary">
            <span className="font-headings text-lg font-bold">{items.length}</span> matches
          </p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="text-xs font-semibold border border-border/60 rounded-full px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="match">Highest match</option>
            <option value="newest">Newest</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-primary/40">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No matches yet"
            message="Save some items or list your wardrobe so the AI can learn what you like."
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                matchScore={item.matchScore}
                saved={savedIds.has(item.id)}
                onSave={onToggleSaved}
              />
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showPrefs} onClose={() => setShowPrefs(false)} title="Update preferences" size="md">
        <div className="space-y-6">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-3 block">
              Sizes
            </label>
            <div className="grid grid-cols-6 gap-2">
              {sizes.map((s) => (
                <button
                  key={s}
                  onClick={() => togglePref('sizes', s)}
                  className={`py-2 rounded-lg text-xs font-bold uppercase border-2 transition-colors ${
                    prefs.sizes.includes(s)
                      ? 'bg-primary text-white border-primary'
                      : 'border-border/60 text-primary/80 hover:border-primary'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-3 block">
              Gender
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['Any', ...genders] as UIPrefs['gender'][]).map((g) => (
                <button
                  key={g}
                  onClick={() => togglePref('gender', g)}
                  className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider border-2 transition-colors ${
                    prefs.gender === g
                      ? 'bg-primary text-white border-primary'
                      : 'border-border/60 text-primary/80 hover:border-primary'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-3 block">
              Condition
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['Any', 'New', 'Like New', 'Good', 'Fair'] as UIPrefs['condition'][]).map((c) => (
                <button
                  key={c}
                  onClick={() => togglePref('condition', c)}
                  className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider border-2 transition-colors ${
                    prefs.condition === c
                      ? 'bg-primary text-white border-primary'
                      : 'border-border/60 text-primary/80 hover:border-primary'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-3 block">
              Categories
            </label>
            <div className="grid grid-cols-2 gap-2">
              {apiCategories.map((c) => (
                <label key={c.id} className="flex items-center gap-2.5 text-sm text-primary/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.categories.includes(c.id)}
                    onChange={() => togglePref('categories', c.id)}
                    className="w-4 h-4 rounded border-border accent-accent"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-3 block">
              Colors
            </label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c.name}
                  onClick={() => togglePref('colors', c.name)}
                  title={c.name}
                  className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 ${
                    prefs.colors.includes(c.name) ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={savePreferences}
            disabled={savingPrefs}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-bold uppercase tracking-wider text-xs hover:bg-primary/90 shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {savingPrefs && <Loader2 size={14} className="animate-spin" />}
            Save preferences
          </button>
        </div>
      </Modal>
    </div>
  );
}
