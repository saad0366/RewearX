import { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight, 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'wouter';

interface BannerSlide {
  id: number;
  tag: string;
  headline: string;
  subheadline: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  bgImage: string;
}

const BANNERS: BannerSlide[] = [
  {
    id: 1,
    tag: 'Preloved Fashion Marketplace',
    headline: 'Swap Your Wardrobe.',
    subheadline: 'Zero Cash Required.',
    description: 'Exchange vintage jackets, streetwear, sneakers, and designer clothing directly with verified members nationwide.',
    ctaText: 'Explore Fashion Swaps',
    ctaLink: '/browse?category=Women',
    secondaryCtaText: 'List an Item',
    secondaryCtaLink: '/items/new',
    bgImage: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&q=80&w=1800'
  },
  {
    id: 2,
    tag: 'Tech & Gadgets Trade',
    headline: 'Upgrade Your Technology.',
    subheadline: 'Trade Direct for $0.',
    description: 'Trade smartphones, wireless headphones, smartwatches, and gaming gear securely with 100% member protection.',
    ctaText: 'Browse Tech Listings',
    ctaLink: '/browse?category=Tech',
    secondaryCtaText: 'How It Works',
    secondaryCtaLink: '/how-it-works',
    bgImage: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&q=80&w=1800'
  },
  {
    id: 3,
    tag: 'AI Recommendation Matcher',
    headline: 'Smart Swap Matching.',
    subheadline: 'Find Fair Trades in Seconds.',
    description: 'Our AI engine scans 50,000+ available listings to pair your items with exact pieces you desire.',
    ctaText: 'Try AI Swap Matcher',
    ctaLink: '/recommendations',
    secondaryCtaText: 'Explore All Items',
    secondaryCtaLink: '/browse',
    bgImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1800'
  }
];

export default function HeroSection() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % BANNERS.length);
    }, 5500);
    return () => clearInterval(interval);
  }, [isPaused]);

  const slide = BANNERS[currentSlide];

  return (
    <section className="bg-[#FBF9F4] text-[#1E1B18] pt-4 sm:pt-6 pb-6 sm:pb-8 font-body">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ── PANORAMIC MARKETING BANNER CAROUSEL ── */}
        <div 
          className="relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm border border-[#E9E4DB] bg-[#1E1B18] h-[360px] sm:h-[420px] lg:h-[450px] flex items-center"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Background Images with Fade */}
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 z-0"
            >
              <img
                src={slide.bgImage}
                alt={slide.headline}
                className="w-full h-full object-cover object-center"
              />
              {/* Natural Dark/Brand Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#1E1B18]/90 via-[#1E1B18]/70 to-[#1E1B18]/20 sm:to-transparent" />
            </motion.div>
          </AnimatePresence>

          {/* Banner Copy & CTAs */}
          <div className="relative z-10 p-6 sm:p-10 lg:p-14 max-w-2xl text-white">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                className="space-y-3 sm:space-y-4"
              >
                {/* Campaign Tag */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[#FBF9F4] text-[11px] font-semibold tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2E4D3A]" />
                  <span>{slide.tag}</span>
                </div>

                {/* Main Headline */}
                <h1 className="font-headings text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.12]">
                  {slide.headline}<br />
                  <span className="text-[#FBF9F4]/90 font-normal italic">{slide.subheadline}</span>
                </h1>

                {/* Subtext */}
                <p className="text-xs sm:text-sm lg:text-base text-[#FBF9F4]/80 font-normal leading-relaxed max-w-lg">
                  {slide.description}
                </p>

                {/* Action CTAs */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Link href={slide.ctaLink}>
                    <button className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-[#2E4D3A] hover:bg-[#233a2c] text-white text-xs sm:text-sm font-semibold tracking-wide flex items-center gap-2 shadow-sm transition-all cursor-pointer">
                      <span>{slide.ctaText}</span>
                      <ArrowRight size={14} />
                    </button>
                  </Link>
                  {slide.secondaryCtaText && slide.secondaryCtaLink && (
                    <Link href={slide.secondaryCtaLink}>
                      <button className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 text-white text-xs sm:text-sm font-semibold tracking-wide transition-all cursor-pointer">
                        {slide.secondaryCtaText}
                      </button>
                    </Link>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Arrows */}
          <div className="absolute right-4 sm:right-6 bottom-4 sm:bottom-6 z-20 flex items-center gap-2">
            <button
              onClick={() => setCurrentSlide((prev) => (prev - 1 + BANNERS.length) % BANNERS.length)}
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-md border border-white/25 text-white flex items-center justify-center transition-all cursor-pointer"
              aria-label="Previous Slide"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentSlide((prev) => (prev + 1) % BANNERS.length)}
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-md border border-white/25 text-white flex items-center justify-center transition-all cursor-pointer"
              aria-label="Next Slide"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Slide Indicator Dots */}
          <div className="absolute left-6 sm:left-10 lg:left-14 bottom-4 sm:bottom-6 z-20 flex items-center gap-1.5">
            {BANNERS.map((b, idx) => (
              <button
                key={b.id}
                onClick={() => setCurrentSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  currentSlide === idx ? 'w-6 bg-[#FBF9F4]' : 'w-1.5 bg-[#FBF9F4]/40'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
