import { useRef, useState, useEffect } from 'react';
import { Star, ChevronLeft, ChevronRight, MessageSquareQuote } from 'lucide-react';
import { motion } from 'motion/react';

const TestimonialSkeleton = () => (
  <div className="bg-[#faf8f4] border border-border/80 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 sm:gap-5 shadow-sm h-full w-full animate-pulse">
    <div>
      <div className="flex gap-1 mb-3 sm:mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-3 h-3 bg-muted/60 rounded-full" />
        ))}
      </div>
      <div className="space-y-2.5">
        <div className="w-full h-3 bg-muted/60 rounded-full" />
        <div className="w-4/5 h-3 bg-muted/60 rounded-full" />
        <div className="w-5/6 h-3 bg-muted/60 rounded-full" />
      </div>
    </div>

    <div className="flex items-center gap-3 mt-1">
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden bg-muted/60 shrink-0" />
      <div className="flex-1">
        <div className="w-20 h-3 bg-muted/60 rounded-full mb-1" />
        <div className="w-14 h-2.5 bg-muted/60 rounded-full" />
      </div>
    </div>
  </div>
);

export default function TestimonialsSection() {
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const testimonials = [
    { text: '"ReWearX changed how I think about fashion. I swapped three coats for vintage blazers I adore."', author: 'Emma T.', avatar: '2.5% 38.5%' },
    { text: '"The quality is incredible. People care for their clothing, and swapping feels personal."', author: 'Michael B.', avatar: '10% 38.5%' },
    { text: '"Sustainable fashion made free and circular. The logistics guide was super simple."', author: 'Olivia S.', avatar: '32.1% 38.5%' },
    { text: '"The community is amazing — friendly, easy shipping. I am obsessed."', author: 'Sarah L.', avatar: '18% 38.5%' },
    { text: '"Instead of buying new clothes, I just swap. Like an infinite wardrobe for free."', author: 'James D.', avatar: '25% 38.5%' },
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
    <section className="bg-background relative z-10 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10 sm:py-12 md:py-14 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-5 mb-6 sm:mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="p-1.5 bg-primary/5 rounded-lg text-accent">
                <MessageSquareQuote size={13} className="sm:w-4 sm:h-4" />
              </div>
              <span className="text-[10px] font-black tracking-[0.2em] text-primary/40 uppercase">Success Stories</span>
            </div>
            <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-primary leading-tight">
              What Our Community Says
            </h2>
          </div>

          <div className="hidden sm:flex flex-row items-center gap-2">
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
                    key={`skel-testimonial-${i}`}
                    className="w-[260px] sm:w-[290px] lg:w-[310px] snap-start flex-shrink-0"
                  >
                    <TestimonialSkeleton />
                  </div>
                ))
              : testimonials.map((item, index) => (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: false, margin: '-100px' }}
                    transition={{ duration: 0.5, delay: index * 0.08 }}
                    key={index}
                    className="w-[260px] sm:w-[290px] lg:w-[310px] snap-start flex-shrink-0 group cursor-pointer"
                  >
                    <div className="bg-[#faf8f4] border border-border/80 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 sm:gap-5 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 font-body h-full relative">
                      <div className="absolute top-4 right-4 sm:top-5 sm:right-5 opacity-10 text-accent group-hover:scale-125 transition-transform duration-500">
                        <MessageSquareQuote className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" />
                      </div>

                      <div>
                        <div className="flex gap-0.5 text-[#d4af37] mb-3 sm:mb-4">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={12} fill="currentColor" className="sm:w-[13px] sm:h-[13px]" />
                          ))}
                        </div>
                        <p className="text-[13px] sm:text-sm md:text-[15px] italic text-primary/90 leading-relaxed font-headings font-medium relative z-10">
                          {item.text}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 pt-3.5 sm:pt-4 border-t border-border/40 relative z-10">
                        <div
                          className="bg-no-repeat aspect-square w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-white shadow-md relative group-hover:border-primary/10 transition-colors"
                          style={{
                            backgroundImage:
                              'url("https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fe990e254-554b-48ad-bb2d-626d12a0ed9d?alt=media&token=c1c20cfa-7e92-4db2-bbc9-10de0b3f81b6")',
                            backgroundPosition: item.avatar,
                            backgroundSize: '1600% 1200%',
                          }}
                        />
                        <span className="text-[13px] sm:text-sm font-bold text-primary tracking-wide group-hover:text-accent transition-colors">
                          {item.author}
                        </span>
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
