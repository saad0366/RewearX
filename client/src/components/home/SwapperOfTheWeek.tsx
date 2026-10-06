import { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Award, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Link } from 'wouter';
import { swapperOfWeekApi, type SwapperOfWeek } from '../../lib/api';

const SwapperCardSkeleton = () => (
  <div className="bg-white rounded-2xl p-4 sm:p-5 border border-border/50 shadow-sm flex flex-col h-full relative w-full animate-pulse">
    <div className="flex items-center gap-3.5 sm:gap-4 mb-4 sm:mb-5">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shrink-0 bg-muted/60" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="w-20 h-4 bg-muted/60 rounded-full" />
        <div className="w-14 h-2.5 bg-muted/60 rounded-full" />
      </div>
    </div>
    <div className="w-full h-[1px] bg-border/40 mb-4 sm:mb-5" />
    <div className="flex items-center justify-between mt-auto">
      <div className="flex flex-col gap-1.5">
        <div className="w-10 h-2 bg-muted/60 rounded-full" />
        <div className="w-14 h-3 bg-muted/60 rounded-full" />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <div className="w-10 h-2 bg-muted/60 rounded-full" />
        <div className="w-14 h-3 bg-muted/60 rounded-full" />
      </div>
    </div>
  </div>
);

export default function SwapperOfTheWeek() {
  const [isLoading, setIsLoading] = useState(true);
  const [swappers, setSwappers] = useState<SwapperOfWeek[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    swapperOfWeekApi
      .list()
      .then((data) => {
        setSwappers(data);
        setIsLoading(false);
      })
      .catch(() => {
        setSwappers([]);
        setIsLoading(false);
      });
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.85;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Don't show section if no swappers
  if (!isLoading && swappers.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#fdfdfc] border-b border-border/40 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10 sm:py-12 md:py-14 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-5 mb-6 sm:mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="p-1.5 bg-primary/5 rounded-lg text-accent">
                <Award size={13} className="sm:w-4 sm:h-4" />
              </div>
              <span className="text-[10px] font-black tracking-[0.2em] text-primary/40 uppercase">Community Heroes</span>
            </div>
            <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-primary leading-tight">
              Swappers of the Week
            </h2>
          </div>

          <div className="flex flex-row items-center justify-between sm:justify-end gap-3 sm:gap-4">
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
              href="/community"
              className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-primary hover:text-accent transition-colors pb-1 border-b-2 border-primary hover:border-accent"
            >
              View All
            </Link>
          </div>
        </div>

        <div className="relative -mx-4 sm:mx-0 px-4 sm:px-0">
          <div
            ref={scrollRef}
            className="flex gap-3.5 sm:gap-4 md:gap-5 overflow-x-auto pb-5 sm:pb-6 snap-x snap-mandatory hide-scrollbar pt-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={`skel-swapper-${i}`}
                    className="w-[240px] sm:w-[260px] lg:w-[calc(25%-15px)] snap-start flex-shrink-0"
                  >
                    <SwapperCardSkeleton />
                  </div>
                ))
              : swappers.map((swapper, index) => (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: false, margin: '-100px' }}
                    transition={{ duration: 0.5, delay: index * 0.07 }}
                    key={swapper.id}
                    className="w-[240px] sm:w-[260px] lg:w-[calc(25%-15px)] snap-start flex-shrink-0 group cursor-pointer"
                  >
                    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-border/50 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 ease-out flex flex-col h-full relative">
                      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-accent/10 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider text-accent border border-accent/20 z-10 uppercase">
                        {swapper.badge}
                      </div>

                      <div className="flex items-center gap-3.5 sm:gap-4 mb-4 sm:mb-5 mt-0.5">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden shrink-0 border-2 border-white shadow-md relative group-hover:border-primary/10 transition-colors">
                          {swapper.image ? (
                            <img src={swapper.image} alt={swapper.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                          ) : (
                            <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                              <span className="text-primary text-xl font-bold">{swapper.name.charAt(0)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-headings font-bold text-sm sm:text-base text-primary leading-tight group-hover:text-accent transition-colors truncate">
                            {swapper.name}
                          </h3>
                          <p className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate">{swapper.username}</p>
                        </div>
                      </div>

                      <div className="w-full h-[1px] bg-border/40 mb-4 sm:mb-5" />

                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex flex-col">
                          <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-primary/40 mb-0.5">Completed</span>
                          <span className="text-sm sm:text-base font-headings font-bold text-primary">
                            {swapper.swaps}{' '}
                            <span className="text-[11px] sm:text-xs font-body font-medium text-muted-foreground">swaps</span>
                          </span>
                        </div>

                        <div className="flex flex-col items-end">
                          <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-primary/40 mb-0.5">Rating</span>
                          <div className="flex items-center gap-1">
                            <Star size={12} className="fill-accent text-accent" />
                            <span className="text-sm sm:text-base font-headings font-bold text-primary">
                              {swapper.rating.toFixed(1)}
                            </span>
                          </div>
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
