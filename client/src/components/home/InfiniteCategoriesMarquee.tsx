import { Link } from 'wouter';
import { useState, useEffect } from 'react';
import { categoriesApi } from '../../lib/api';
import type { ApiCategory } from '../../lib/api/types';

interface InfiniteCategoriesMarqueeProps {
  speed?: number;
}

export default function InfiniteCategoriesMarquee({ speed = 25 }: InfiniteCategoriesMarqueeProps = {}) {
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    categoriesApi
      .list()
      .then((cats) => {
        setCategories(cats);
        setLoading(false);
      })
      .catch(() => {
        setCategories([]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <section className="py-6 sm:py-8 md:py-10 bg-background border-b border-border/40">
        <div className="flex justify-center items-center h-24">
          <p className="text-sm text-muted-foreground">Loading categories...</p>
        </div>
      </section>
    );
  }

  if (categories.length === 0) {
    return null; // Don't show the section if no categories
  }

  return (
    <section className="py-6 sm:py-8 md:py-10 bg-background border-b border-border/40 overflow-hidden relative">
      <div className="absolute inset-y-0 left-0 w-10 sm:w-16 md:w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-10 sm:w-16 md:w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      <div className="flex w-full group">
        <style>{`
          @keyframes infinite-scroll {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
          .animate-infinite-scroll {
            animation: infinite-scroll ${speed}s linear infinite;
            display: flex;
            width: max-content;
          }
          .animate-infinite-scroll:hover {
            animation-play-state: paused;
          }
        `}</style>

        <div className="animate-infinite-scroll">
          {[...categories, ...categories, ...categories, ...categories].map((category, index) => (
            <Link
              key={index}
              href="/categories"
              className="flex flex-col items-center gap-2 sm:gap-3 md:gap-4 mx-2.5 sm:mx-4 md:mx-5 group/item w-[60px] sm:w-[80px] md:w-[100px] flex-shrink-0 cursor-pointer"
            >
              <div className="w-[52px] h-[52px] sm:w-[70px] sm:h-[70px] md:w-[90px] md:h-[90px] rounded-full overflow-hidden border border-border/60 group-hover/item:border-primary/40 transition-all duration-300 relative shadow-sm group-hover/item:shadow-lg transform group-hover/item:scale-105">
                <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover/item:opacity-100 transition-opacity z-10 duration-300" />
                {category.iconUrl ? (
                  <img
                    src={category.iconUrl}
                    alt={category.name}
                    className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover/item:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary text-xl font-bold">
                      {category.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <span className="font-headings font-bold text-[9px] sm:text-[11px] md:text-xs uppercase tracking-[0.1em] md:tracking-[0.15em] text-primary group-hover/item:text-accent transition-colors text-center w-full truncate">
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
