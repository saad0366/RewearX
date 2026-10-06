import { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Heart, 
  MapPin, 
  Repeat, 
  CheckCircle2,
  Sparkles,
  Shirt,
  Tag
} from 'lucide-react';
import { Link } from 'wouter';
import { categoriesApi, itemsApi } from '../../lib/api';
import type { ApiCategory, ApiItem } from '../../lib/api/types';
import { useToast } from '../../contexts/ToastContext';

interface CategoryWithItems {
  category: ApiCategory;
  displayTitle: string;
  subtitle: string;
  items: ApiItem[];
}

const CATEGORY_META: Record<string, { displayTitle: string; subtitle: string }> = {
  Men: {
    displayTitle: "Men's Fashion & Outerwear",
    subtitle: 'Premium jackets, casual shirts, hoodies, and traditional wear. 100% verified 1:1 swaps.',
  },
  Women: {
    displayTitle: "Women's Fashion & Apparel",
    subtitle: 'Curated dresses, trench coats, designer knitwear, and traditional ensembles.',
  },
  Unisex: {
    displayTitle: 'Unisex Clothing & Streetwear Essentials',
    subtitle: 'Versatile hoodies, utility jackets, heavyweight tees, and knits for everyone.',
  },
};

const formatCondition = (condition: string): string => {
  switch (condition) {
    case 'new':
      return 'Brand New';
    case 'like_new':
      return 'Like New';
    case 'good':
      return 'Good Condition';
    case 'fair':
      return 'Fair Condition';
    default:
      return condition.replace('_', ' ');
  }
};

const CardSkeleton = () => (
  <div className="rounded-2xl bg-white border border-[#E9E4DB] overflow-hidden shadow-2xs flex flex-col animate-pulse">
    <div className="aspect-[4/3.8] bg-[#F4EAE1]/60" />
    <div className="p-4 space-y-3 bg-white">
      <div className="h-4 bg-[#E9E4DB]/80 rounded w-3/4" />
      <div className="h-3 bg-[#E9E4DB]/50 rounded w-1/2" />
      <div className="pt-2 border-t border-[#E9E4DB]/40 flex justify-between">
        <div className="h-3 bg-[#E9E4DB]/50 rounded w-1/3" />
        <div className="h-3 bg-[#E9E4DB]/50 rounded w-1/4" />
      </div>
    </div>
  </div>
);

export default function CategoryShowcaseSection() {
  const { toast } = useToast();
  const [sections, setSections] = useState<CategoryWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedItems, setSavedItems] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        // 1. Fetch categories
        const catRes = await categoriesApi.list();
        const categories: ApiCategory[] = Array.isArray(catRes)
          ? catRes
          : (catRes as unknown as { data: ApiCategory[] })?.data || [];

        // 2. Filter for main categories (where parentId is null or missing)
        const mainCategories = categories.filter((c) => !c.parentId);

        // Sort main categories logically: Men, Women, Unisex, then any others
        const categoryOrder = ['Men', 'Women', 'Unisex'];
        mainCategories.sort((a, b) => {
          const indexA = categoryOrder.indexOf(a.name);
          const indexB = categoryOrder.indexOf(b.name);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return a.name.localeCompare(b.name);
        });

        // 3. For each main category, fetch 4 items
        const loadedSections: CategoryWithItems[] = await Promise.all(
          mainCategories.map(async (cat) => {
            let items: ApiItem[] = [];
            try {
              const itemRes = await itemsApi.list({ categoryId: cat.id, limit: 4 });
              items = itemRes.items || (itemRes as unknown as { data: ApiItem[] }).data || [];
            } catch (err) {
              console.error(`Failed to fetch items for category ${cat.name}:`, err);
            }

            const meta = CATEGORY_META[cat.name] || {
              displayTitle: `${cat.name} Collection`,
              subtitle: cat.description || 'Explore sustainable pre-loved clothing available for direct item swap.',
            };

            return {
              category: cat,
              displayTitle: meta.displayTitle,
              subtitle: meta.subtitle,
              items,
            };
          })
        );

        if (isMounted) {
          setSections(loadedSections);
        }
      } catch (err) {
        console.error('Error fetching showcase categories:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleSave = (id: number, title: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSavedItems((prev) => {
      const isSaved = !prev[id];
      toast(isSaved ? `Added "${title}" to saved items.` : `Removed "${title}" from saved.`, 'info');
      return { ...prev, [id]: isSaved };
    });
  };

  if (loading) {
    return (
      <div className="bg-[#FBF9F4] text-[#1E1B18] py-8 sm:py-12 space-y-12 sm:space-y-16">
        {[1, 2, 3].map((sectionIdx) => (
          <div key={sectionIdx} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-2 mb-6">
              <div className="h-4 w-28 bg-[#E9E4DB] rounded animate-pulse" />
              <div className="h-7 w-64 bg-[#E9E4DB] rounded animate-pulse" />
              <div className="h-4 w-96 bg-[#E9E4DB]/60 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {[1, 2, 3, 4].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!sections.length) {
    return null;
  }

  return (
    <div className="bg-[#FBF9F4] text-[#1E1B18] py-8 sm:py-12 space-y-12 sm:space-y-16">
      {sections.map(({ category, displayTitle, subtitle, items }) => (
        <section key={category.id} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* ── SECTION HEADER ── */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6 sm:mb-7">
            <div>
              {/* Category Pill Tag */}
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-md bg-[#F4EAE1] text-[#2E4D3A] mb-2 border border-[#E9E4DB]/60">
                <Sparkles size={11} className="text-[#2E4D3A]" />
                <span>FEATURED COLLECTION</span>
              </span>

              {/* Title */}
              <h2 className="font-headings text-2xl sm:text-3xl font-bold text-[#1E1B18] tracking-tight">
                {displayTitle}
              </h2>

              {/* Subtitle */}
              <p className="text-xs sm:text-sm text-[#7D7265] mt-1 font-normal max-w-2xl">
                {subtitle}
              </p>
            </div>

            {/* View More Link */}
            <Link 
              href={`/browse?category=${encodeURIComponent(category.name)}`}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#2E4D3A] hover:text-[#1E1B18] transition-colors group shrink-0"
            >
              <span>View All {category.name} ({items.length})</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* ── 4 ITEM CARDS GRID (Dynamic Real Products) ── */}
          {items.length === 0 ? (
            <div className="bg-white border border-[#E9E4DB] rounded-2xl p-8 text-center text-[#7D7265]">
              <Shirt size={28} className="mx-auto mb-2 text-[#2E4D3A]/40" />
              <p className="text-sm font-medium">No items currently available in {category.name}.</p>
              <Link
                href={`/browse?category=${encodeURIComponent(category.name)}`}
                className="inline-block mt-3 text-xs font-bold text-[#2E4D3A] underline"
              >
                Browse all categories
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {items.map((item) => {
                const isSaved = Boolean(savedItems[item.id]);
                const imageUrl =
                  item.images && item.images.length > 0
                    ? item.images[0].url
                    : 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&q=80&w=600';

                return (
                  <Link
                    key={item.id}
                    href={`/items/${item.id}`}
                    className="group relative rounded-2xl bg-white border border-[#E9E4DB] overflow-hidden shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer"
                  >
                    {/* Item Image Container */}
                    <div className="relative aspect-[4/3.8] bg-[#F4EAE1] overflow-hidden">
                      <img
                        src={imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />

                      {/* Swap Condition Tag Badge */}
                      <div className="absolute bottom-3 left-3 z-10">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#243F2F]/90 backdrop-blur-md text-[#E8F0EA] text-[11px] font-bold border border-[#3D634C]/40 shadow-xs">
                          <CheckCircle2 size={11} className="text-[#A3E635]" />
                          <span>{formatCondition(item.condition)}</span>
                        </span>
                      </div>

                      {/* Size & Gender Badge */}
                      <div className="absolute top-3 left-3 z-10">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/95 backdrop-blur-md text-[#1E1B18] text-[10px] font-bold border border-[#E9E4DB] shadow-2xs">
                          <Tag size={10} className="text-[#2E4D3A]" />
                          <span>Size: {item.size}</span>
                        </span>
                      </div>

                      {/* Top Right Heart Wishlist Button */}
                      <button
                        type="button"
                        onClick={(e) => toggleSave(item.id, item.title, e)}
                        className={`absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center transition-all shadow-xs z-20 ${
                          isSaved ? 'text-red-500' : 'text-[#1E1B18]/70 hover:text-red-500 hover:scale-110'
                        }`}
                        aria-label="Save item"
                      >
                        <Heart size={15} className={isSaved ? 'fill-red-500' : ''} />
                      </button>
                    </div>

                    {/* Card Bottom Details */}
                    <div className="p-4 flex flex-col justify-between flex-1 bg-white space-y-2.5">
                      
                      {/* Title */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-headings text-sm sm:text-[15px] font-bold text-[#1E1B18] group-hover:text-[#2E4D3A] transition-colors line-clamp-1 leading-snug">
                          {item.title}
                        </h3>
                      </div>

                      {/* Location & Brand Pin */}
                      <div className="flex items-center justify-between text-[11px] sm:text-xs text-[#7D7265]">
                        <div className="flex items-center gap-1 truncate">
                          <MapPin size={12} className="shrink-0 text-[#2E4D3A]" />
                          <span className="truncate">{item.location || 'Islamabad'}</span>
                        </div>
                        {item.brand && (
                          <span className="font-medium text-[#2E4D3A] bg-[#F4EAE1]/50 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                            {item.brand}
                          </span>
                        )}
                      </div>

                      {/* Wants / Swap Indicator */}
                      <div className="pt-2 border-t border-[#E9E4DB]/60 flex items-center justify-between text-[11px]">
                        <span className="text-[#7D7265] flex items-center gap-1">
                          <Repeat size={11} className="text-[#2E4D3A]" />
                          <span>Swap Mode:</span>
                        </span>
                        <span className="font-semibold text-[#2E4D3A] truncate">
                          1:1 Direct Item Trade
                        </span>
                      </div>

                    </div>
                  </Link>
                );
              })}
            </div>
          )}

        </section>
      ))}
    </div>
  );
}
