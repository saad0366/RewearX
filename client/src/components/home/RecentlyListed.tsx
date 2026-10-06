import { useEffect, useState, useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'wouter';
import { itemsApi } from '../../lib/api/items';
import { adaptItem } from '../../lib/api/types';
import type { Item as UIItem } from '../../lib/mockData';
import ItemCard from '../ui/ItemCard';

const SkeletonCard = () => (
  <div className="bg-background rounded-2xl overflow-hidden border border-border/40 flex flex-col animate-pulse shrink-0 w-44 sm:w-52 md:w-56">
    <div className="aspect-[3/4] bg-muted/40 w-full" />
    <div className="p-3 flex flex-col gap-2">
      <div className="h-3.5 bg-muted/50 rounded-full w-3/4" />
      <div className="flex gap-1.5">
        <div className="h-2.5 bg-muted/40 rounded-full w-10" />
        <div className="h-2.5 bg-muted/40 rounded-full w-14" />
      </div>
    </div>
  </div>
);

export default function RecentlyListed() {
  const [items, setItems] = useState<UIItem[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    itemsApi
      .list({ page: 1, limit: 10 })
      .then(({ items: raw }) => {
        setItems(raw.map((i) => adaptItem(i)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  if (!loading && items.length === 0) return null;

  return (
    <section className="bg-background border-b border-border/40 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10 sm:py-12 md:py-14 lg:py-16">

        <div className="flex items-end justify-between mb-7 sm:mb-9">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-accent font-bold text-[10px] uppercase tracking-[0.22em] flex items-center gap-2 mb-2">
              <span className="w-5 h-px bg-accent" />
              Just dropped
            </span>
            <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold text-primary tracking-tight leading-tight">
              Recently Listed
            </h2>
            <p className="text-[12px] sm:text-sm text-muted-foreground mt-1.5">
              Fresh pieces added by the community today
            </p>
          </motion.div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => scroll('left')}
              aria-label="Scroll left"
              className="w-9 h-9 rounded-full border border-border/60 bg-background flex items-center justify-center text-primary/50 hover:text-primary hover:border-primary/40 hover:bg-muted/20 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => scroll('right')}
              aria-label="Scroll right"
              className="w-9 h-9 rounded-full border border-border/60 bg-background flex items-center justify-center text-primary/50 hover:text-primary hover:border-primary/40 hover:bg-muted/20 transition-all"
            >
              <ChevronRight size={16} />
            </button>
            <Link href="/browse">
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-accent hover:underline uppercase tracking-widest ml-1">
                View all <ArrowRight size={11} />
              </span>
            </Link>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-3.5 sm:gap-4 overflow-x-auto pb-2 -mx-1 px-1"
          style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {loading
            ? Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="shrink-0" style={{ scrollSnapAlign: 'start' }}>
                  <SkeletonCard />
                </div>
              ))
            : items.map((item) => (
                <div
                  key={item.id}
                  className="shrink-0 w-44 sm:w-52 md:w-56"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <ItemCard item={item} showOwner />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
