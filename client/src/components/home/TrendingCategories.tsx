import { useRef, useState, useEffect } from 'react';
import { ArrowRight, Leaf, User, Sparkles, Wallet, Heart, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'wouter';

const CategoryCardSkeleton = () => (
  <div className="bg-[#f7f5ef] border border-border/70 rounded-2xl p-3 flex flex-col gap-3 font-body animate-pulse w-full">
    <div className="relative rounded-xl overflow-hidden bg-muted/40 aspect-[4/5]">
      <div className="absolute top-2.5 left-2.5 w-9 h-9 bg-white/20 rounded-full" />
    </div>
    <div className="px-2 pb-1.5">
      <div className="w-16 h-3.5 bg-muted/60 rounded-full mb-2" />
      <div className="w-12 h-2.5 bg-muted/60 rounded-full" />
    </div>
  </div>
);

export default function TrendingCategories() {
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const categories = [
    { name: 'Women', items: '140+ Items', icon: <Leaf size={18} className="text-accent group-hover:text-white transition-colors duration-300" />, bgPos: '4.5% 61%' },
    { name: 'Men', items: '95+ Items', icon: <User size={18} className="text-accent group-hover:text-white transition-colors duration-300" />, bgPos: '24.5% 61%' },
    { name: 'Kids', items: '60+ Items', icon: <Sparkles size={18} className="text-accent group-hover:text-white transition-colors duration-300" />, bgPos: '44.8% 61%' },
    { name: 'Accessories', items: '110+ Items', icon: <Wallet size={18} className="text-accent group-hover:text-white transition-colors duration-300" />, bgPos: '65% 61%' },
    { name: 'Footwear', items: '85+ Items', icon: <Heart size={18} className="text-accent group-hover:text-white transition-colors duration-300" />, bgPos: '85.5% 61%' },
    { name: 'Vintage', items: '45+ Items', icon: <Search size={18} className="text-accent group-hover:text-white transition-colors duration-300" />, bgPos: '12% 40%' },
  ];

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.85;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section className="bg-muted/10 border-b border-border/40 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10 sm:py-12 md:py-14 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-5 mb-6 sm:mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="p-1.5 bg-primary/5 rounded-lg text-accent">
                <Search size={13} className="sm:w-4 sm:h-4" />
              </div>
              <span className="text-[10px] font-black tracking-[0.2em] text-primary/40 uppercase">Discover Style</span>
            </div>
            <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-primary leading-tight">
              Trending Categories
            </h2>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
            <div className="hidden sm:flex gap-2">
              <button
                onClick={() => scroll('left')}
                className="w-9 h-9 md:w-10 md:h-10 rounded-full border border-border/50 flex items-center justify-center text-primary/70 hover:text-primary hover:border-primary/30 transition-all hover:bg-white shrink-0 shadow-sm"
                aria-label="Previous"
              >
                <ChevronLeft size={16} className="md:w-[18px] md:h-[18px]" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-9 h-9 md:w-10 md:h-10 rounded-full border border-border/50 flex items-center justify-center text-primary/70 hover:text-primary hover:border-primary/30 transition-all hover:bg-white shrink-0 shadow-sm"
                aria-label="Next"
              >
                <ChevronRight size={16} className="md:w-[18px] md:h-[18px]" />
              </button>
            </div>
            <Link
              href="/categories"
              className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-primary hover:text-accent transition-colors pb-1 border-b-2 border-primary hover:border-accent"
            >
              View All
            </Link>
          </div>
        </div>

        <div className="relative -mx-4 sm:mx-0 px-4 sm:px-0">
          <div
            ref={scrollRef}
            className="flex gap-3.5 sm:gap-4 md:gap-5 overflow-x-auto pb-5 sm:pb-6 snap-x snap-mandatory hide-scrollbar"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={`skel-cat-${i}`}
                    className="w-[140px] sm:w-[190px] md:w-[220px] lg:w-[calc(25%-15px)] snap-start flex-shrink-0"
                  >
                    <CategoryCardSkeleton />
                  </div>
                ))
              : categories.map((cat, index) => (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: false, margin: '-100px' }}
                    transition={{ duration: 0.5, delay: index * 0.07 }}
                    key={index}
                    className="w-[140px] sm:w-[190px] md:w-[220px] lg:w-[calc(25%-15px)] snap-start flex-shrink-0 group cursor-pointer"
                  >
                    <div className="bg-[#f7f5ef] border border-border/70 rounded-2xl p-3 flex flex-col gap-3 font-body shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 ease-out">
                      <div className="relative rounded-xl overflow-hidden bg-muted/20 aspect-[4/5]">
                        <div
                          className="bg-no-repeat w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                          style={{
                            backgroundImage:
                              'url("https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fe990e254-554b-48ad-bb2d-626d12a0ed9d?alt=media&token=c1c20cfa-7e92-4db2-bbc9-10de0b3f81b6")',
                            backgroundPosition: cat.bgPos,
                            backgroundSize: '760% 450%',
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 bg-white group-hover:bg-accent rounded-full w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 flex items-center justify-center shadow-lg transition-colors duration-300">
                          {cat.icon}
                        </div>
                      </div>

                      <div className="px-1.5 sm:px-2 pb-0.5 flex justify-between items-center">
                        <div className="min-w-0">
                          <h4 className="font-headings text-sm sm:text-base md:text-lg font-bold text-primary group-hover:text-accent transition-colors truncate">
                            {cat.name}
                          </h4>
                          <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-0.5 truncate">
                            {cat.items}
                          </p>
                        </div>
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-border flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 shrink-0 ml-1.5">
                          <ArrowRight size={12} className="sm:w-[14px] sm:h-[14px] -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
          </div>
        </div>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
