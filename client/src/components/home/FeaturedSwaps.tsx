import React, { useState, useEffect } from 'react';
import { ArrowRight, Heart, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useToast } from '../../contexts/ToastContext';
import { featuredItemsApi } from '../../lib/api';
import type { FeaturedItem } from '../../lib/api/featuredItems';

const SwapCardSkeleton = () => (
  <div className="bg-background rounded-2xl overflow-hidden shadow-sm flex flex-col font-body animate-pulse border border-border/40 w-full">
    <div className="aspect-[4/3] w-full bg-muted/40 relative">
      <div className="absolute top-2.5 left-2.5 w-12 h-5 bg-white/20 rounded-full" />
      <div className="absolute top-2.5 right-2.5 w-7 h-7 bg-white/20 rounded-full" />
    </div>
    <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-muted/60" />
        <div className="h-2 bg-muted/60 rounded w-16" />
      </div>
      <div className="h-4 bg-muted/60 rounded w-2/3" />
      <div className="mt-1 pt-2.5 border-t border-border/50 flex justify-between items-center">
        <div className="space-y-1.5 w-1/2">
          <div className="h-2 bg-muted/50 rounded w-12" />
          <div className="h-3 bg-muted/60 rounded w-full" />
        </div>
        <div className="w-8 h-8 rounded-full bg-muted/60" />
      </div>
    </div>
  </div>
);

export default function FeaturedSwaps() {
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Fetch 4 random featured items from the dedicated API
    featuredItemsApi
      .list()
      .then((fetchedItems) => {
        console.log('Featured items fetched:', fetchedItems);
        setItems(fetchedItems);
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch featured items:', err);
        setError(err.message || 'Failed to load items');
        setItems([]);
        setIsLoading(false);
      });
  }, []);

  const handleWishlist = (title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toast(`Added "${title}" to your wishlist.`, 'success');
  };

  const handleSwapRequest = (title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toast(`Swap request sent for "${title}".`, 'success');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] as [number, number, number, number] } },
  };

  return (
    <section className="bg-gradient-to-b from-background to-muted/20 border-t border-border/40 overflow-hidden">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-10 sm:py-12 md:py-14 lg:py-16">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-5 mb-6 sm:mb-8 md:mb-10">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <span className="text-accent font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
              <span className="w-5 h-px bg-accent" />
              Curated Selection
            </span>
            <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold text-primary tracking-tight leading-tight">
              Featured Swaps
            </h2>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
            className="hidden sm:inline-flex group text-primary font-semibold text-xs items-center gap-1.5 hover:text-accent transition-all pb-1 border-b border-transparent hover:border-accent uppercase tracking-widest"
          >
            Explore all
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </div>

        <motion.div
          key={isLoading ? 'loading' : 'loaded'}
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: false, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
        >
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <motion.div variants={itemVariants} key={`skel-${i}`} className="w-full">
                  <SwapCardSkeleton />
                </motion.div>
              ))
            : error
            ? <div className="col-span-full text-center py-12">
                <p className="text-red-600 font-semibold">{error}</p>
                <p className="text-muted-foreground text-sm mt-2">Please try refreshing the page</p>
              </div>
            : items.length === 0
            ? <div className="col-span-full text-center py-12">
                <p className="text-muted-foreground font-semibold">No items available yet</p>
                <p className="text-muted-foreground text-sm mt-2">Check back soon for featured swaps!</p>
              </div>
            : items.map((item, i) => (
                <motion.div
                  variants={itemVariants}
                  key={`item-${item.id}`}
                  className="group relative bg-background rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:shadow-primary/10 transition-all duration-500 flex flex-col font-body border border-border/60 hover:-translate-y-1.5 hover:border-primary/10 w-full"
                >
                  <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                    <img
                      src={item.images[0] || '/placeholder.svg'}
                      alt={item.title}
                      className="w-full h-full object-cover transform transition-transform duration-1000 ease-out group-hover:scale-[1.03]"
                    />

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 flex items-center justify-center backdrop-blur-[2px]">
                      <button
                        onClick={(e) => handleSwapRequest(item.title, e)}
                        className="bg-white text-primary px-4 py-2 rounded-full font-bold text-[10px] sm:text-[11px] tracking-widest shadow-xl flex items-center gap-1.5 transform translate-y-6 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 hover:scale-105"
                      >
                        <RefreshCw size={12} />
                        REQUEST SWAP
                      </button>
                    </div>

                    <div className="absolute top-2.5 left-2.5 z-20 flex gap-2">
                      <span className="px-2 py-0.5 bg-white/95 backdrop-blur-md text-[9px] font-bold text-primary rounded-full uppercase tracking-[0.18em] shadow-sm">
                        {item.condition}
                      </span>
                    </div>

                    <button
                      onClick={(e) => handleWishlist(item.title, e)}
                      className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/95 backdrop-blur-md text-primary hover:text-white hover:bg-accent hover:scale-110 flex items-center justify-center transition-all duration-300 shadow-sm z-20"
                      aria-label="Add to wishlist"
                    >
                      <Heart size={12} />
                    </button>
                  </div>

                  <div className="p-3.5 sm:p-4 flex flex-col gap-2.5 sm:gap-3 flex-1 relative z-10 bg-background">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <img 
                          src={item.ownerImage || '/default-avatar.png'} 
                          alt={item.owner} 
                          className="w-4 h-4 rounded-full object-cover ring-2 ring-background shadow-sm" 
                        />
                        <span className="text-[10px] font-semibold tracking-wide text-primary">{item.owner}</span>
                      </div>
                      <h3 className="font-headings text-sm sm:text-base font-bold text-primary truncate group-hover:text-accent transition-colors">
                        {item.title}
                      </h3>
                    </div>

                    <div className="mt-auto pt-2.5 sm:pt-3 border-t border-border/50">
                      <div className="flex items-center justify-between group/looking cursor-pointer">
                        <div className="flex flex-col min-w-0">
                          <span className="flex items-center gap-1 text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">
                            <RefreshCw size={9} className="text-accent" />
                            Category
                          </span>
                          <span className="text-xs sm:text-[13px] text-primary font-bold truncate group-hover/looking:text-accent transition-colors">
                            {item.category}
                          </span>
                        </div>
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 border-background shadow-md transform group-hover/looking:scale-110 transition-transform duration-300 relative ml-2.5">
                          <img 
                            src={item.images[1] || item.images[0] || '/placeholder.svg'} 
                            alt={item.category} 
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
        </motion.div>

        {/* Mobile "Explore all" CTA */}
        <div className="flex sm:hidden justify-center mt-6">
          <button className="group text-primary font-semibold text-[11px] flex items-center gap-1.5 hover:text-accent transition-all pb-1 border-b border-primary/30 hover:border-accent uppercase tracking-widest">
            Explore all
            <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </section>
  );
}
