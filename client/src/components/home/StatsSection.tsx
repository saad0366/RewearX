import { useState, useEffect, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { categoriesApi } from '../../lib/api';
import type { ApiCategory } from '../../lib/api/types';

const DEFAULT_HOME_CATEGORIES = [
  {
    name: 'Men',
    count: 'Available',
    link: '/browse?category=Men',
    image: 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&q=80&w=600',
  },
  {
    name: 'Women',
    count: 'Available',
    link: '/browse?category=Women',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=600',
  },
  {
    name: 'Unisex',
    count: 'Available',
    link: '/browse?category=Unisex',
    image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=600',
  },
  {
    name: 'Shalwar Kameez',
    count: 'Popular',
    link: '/browse?q=Shalwar%20Kameez',
    image: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&q=80&w=600',
  },
  {
    name: 'Dresses',
    count: 'Trending',
    link: '/browse?q=Dresses',
    image: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=600',
  },
  {
    name: 'Kurtis',
    count: 'Trending',
    link: '/browse?q=Kurtis',
    image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&q=80&w=600',
  },
  {
    name: 'Jackets',
    count: 'Popular',
    link: '/browse?q=Jackets',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=600',
  },
  {
    name: 'Hoodies',
    count: 'Popular',
    link: '/browse?q=Hoodies',
    image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600',
  },
];

// Professional FontAwesome Solid Icons
const FaSyncIcon = () => (
  <svg 
    className="w-5 h-5 sm:w-6 sm:h-6 fill-current text-[#E8F0EA]" 
    viewBox="0 0 512 512" 
    aria-hidden="true"
  >
    <path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160H336c-17.7 0-32 14.3-32 32s14.3 32 32 32h112c17.7 0 32-14.3 32-32V80c0-17.7-14.3-32-32-32s-32 14.3-32 32v51.2L397.7 113C319.6 34.9 192.4 34.9 114.3 113c-23.7 23.7-40.4 51.5-50.6 81c-5.8 16.7 3.2 34.9 19.9 40.7s34.9-3.2 40.7-19.9zM406.9 309.4c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0L125.7 352H176c17.7 0 32-14.3 32-32s-14.3-32-32-32H64c-17.7 0-32 14.3-32 32v112c0 17.7 14.3 32 32 32s32-14.3 32-32V380.8L114.3 399c78.1 78.1 205.3 78.1 283.4 0c23.7-23.7 40.4-51.5 50.6-81c5.8-16.7-3.2-34.9-19.9-40.7s-34.9 3.2-40.7 19.9z" />
  </svg>
);

const FaDollarIcon = () => (
  <svg 
    className="w-5 h-5 sm:w-6 sm:h-6 fill-current text-[#E8F0EA]" 
    viewBox="0 0 320 512" 
    aria-hidden="true"
  >
    <path d="M160 0c17.7 0 32 14.3 32 32l0 35.7c52.4 9.1 92.5 52.8 95.8 106.6c1.1 17.7-12.4 32.8-30.1 33.9s-32.8-12.4-33.9-30.1c-1.5-24.6-20.9-44.1-46.8-44.1l-34.1 0c-25.9 0-45.3 19.5-46.8 44.1c-1.5 24.2 14.6 42.2 38.8 48.3l57.7 14.4c52 13 88.5 58.8 88.5 112.3c0 58.5-43.5 106.9-99.1 115.1L192 480c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-35.7c-52.4-9.1-92.5-52.8-95.8-106.6c-1.1-17.7 12.4-32.8 30.1-33.9s32.8 12.4 33.9 30.1c1.5 24.6 20.9 44.1 46.8 44.1l34.1 0c25.9 0 45.3-19.5 46.8-44.1c1.5-24.2-14.6-42.2-38.8-48.3l-57.7-14.4C74.6 254.4 38.1 208.6 38.1 155.1c0-58.5 43.5-106.9 99.1-115.1L137.2 32c0-17.7 14.3-32 32-32l-9.2 0z" />
  </svg>
);

const FaLeafIcon = () => (
  <svg 
    className="w-5 h-5 sm:w-6 sm:h-6 fill-current text-[#E8F0EA]" 
    viewBox="0 0 512 512" 
    aria-hidden="true"
  >
    <path d="M272 96c-78.6 0-145.1 51.5-167.7 122.5c33.6-17 71.5-26.5 111.7-26.5h16c8.8 0 16 7.2 16 16s-7.2 16-16 16h-16c-38.7 0-75 10.9-106 29.9C104.9 288.7 104 324.7 104 360c0 5.4 .2 10.7 .7 16H80c-26.5 0-48 21.5-48 48s21.5 48 48 48h24c8.8 0 16-7.2 16-16s-7.2-16-16-16H80c-8.8 0-16-7.2-16-16s7.2-16 16-16h40.4c17.5 48.7 64.2 83.6 119.6 83.6c70.7 0 128-57.3 128-128c0-20.9-5-40.6-13.9-58.1C429 270.4 480 197.9 480 112c0-8.8-7.2-16-16-16H272zm0 32h175.7C442.2 188.5 397.6 248.8 333.6 264c-13.8-19.8-34.2-34.9-58.1-42.5C282.9 181.7 296.8 140.2 272 128zm-32 304c-53 0-96-43-96-96c0-4.1 .3-8.2 .8-12.2c27 10.5 56.4 16.2 87.2 16.2h8c8.8 0 16-7.2 16-16s-7.2-16-16-16h-8c-30.8 0-60.2-5.7-87.2-16.2c16.3-51.5 64.7-87.8 119.2-87.8c38.7 0 72.8 18.2 94.6 46.5C310.8 304.7 288 357.7 288 416c0 5.4 .2 10.7 .7 16H240z" />
  </svg>
);

const FaUsersIcon = () => (
  <svg 
    className="w-5 h-5 sm:w-6 sm:h-6 fill-current text-[#E8F0EA]" 
    viewBox="0 0 640 512" 
    aria-hidden="true"
  >
    <path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192h74.7c58.8 0 106.7 47.8 106.7 106.7V352c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V298.7zM352 298.7c0-58.8 47.8-106.7 106.7-106.7h74.7c58.8 0 106.7 47.8 106.7 106.7V352c0 17.7-14.3 32-32 32H384c-17.7 0-32-14.3-32-32V298.7zM320 64a80 80 0 1 1 0 160 80 80 0 1 1 0-160zm-96 298.7c0-58.8 47.8-106.7 106.7-106.7h74.7c58.8 0 106.7 47.8 106.7 106.7V480c0 17.7-14.3 32-32 32H256c-17.7 0-32-14.3-32-32V362.7z" />
  </svg>
);

const STATS = [
  {
    icon: FaSyncIcon,
    value: '320,000+',
    label: 'SUCCESSFUL SWAPS'
  },
  {
    icon: FaDollarIcon,
    value: '$4.2M+',
    label: 'SAVED BY MEMBERS'
  },
  {
    icon: FaLeafIcon,
    value: '120 Tons',
    label: 'CO₂ SAVED'
  },
  {
    icon: FaUsersIcon,
    value: '25,000+',
    label: 'ACTIVE TRENDSETTERS'
  }
];

export default function StatsSection() {
  const [categories, setCategories] = useState<ApiCategory[]>([]);

  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => undefined);
  }, []);

  const displayCategories = useMemo(() => {
    if (categories.length === 0) return DEFAULT_HOME_CATEGORIES;

    // Map database categories with icons
    const activeWithImages = categories.filter((c) => c.isActive && c.iconUrl);
    if (activeWithImages.length === 0) return DEFAULT_HOME_CATEGORIES;

    return activeWithImages.slice(0, 8).map((c) => ({
      name: c.name,
      count: c.itemCount ? `${c.itemCount} items` : (c.parentId ? 'Subcategory' : 'Main Category'),
      link: c.parentId ? `/browse?q=${encodeURIComponent(c.name)}` : `/browse?category=${encodeURIComponent(c.name)}`,
      image: c.iconUrl || 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&q=80&w=600',
    }));
  }, [categories]);

  return (
    <section className="bg-[#FBF9F4] text-[#1E1B18] pt-2 sm:pt-4 pb-12 sm:pb-16 font-body border-b border-[#E9E4DB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 sm:space-y-12">
        
        {/* ── 1. EXPLORE MARKETPLACE CATEGORIES (8 Full-Cover Photo Cards) ── */}
        <div>
          {/* Header row */}
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <h2 className="font-headings text-2xl sm:text-3xl font-bold text-[#1E1B18] tracking-tight">
              Explore Marketplace Categories
            </h2>
            <Link 
              href="/browse" 
              className="text-xs sm:text-sm font-semibold text-[#2E4D3A] hover:text-[#1E1B18] flex items-center gap-1.5 transition-colors group"
            >
              <span>View all</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* 8-Card Grid with Full-Cover Images */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-3.5">
            {displayCategories.map((cat) => (
              <Link
                key={cat.name}
                href={cat.link}
                className="group relative rounded-2xl sm:rounded-[20px] overflow-hidden aspect-[3/4.2] sm:aspect-[3/4.4] shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer block bg-[#1E1B18]"
              >
                {/* Background Image */}
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                />

                {/* Dark Gradient Overlay at Bottom */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none" />

                {/* Card Text Content */}
                <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4 text-white flex flex-col justify-end z-10">
                  <h3 className="font-headings text-sm sm:text-base font-bold text-white leading-snug drop-shadow-xs whitespace-pre-line">
                    {cat.name}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-white/80 font-normal mt-0.5 drop-shadow-2xs">
                    {cat.count}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── 2. STATS BANNER SECTION (Exact FontAwesome Solid Icons) ── */}
        <div className="relative rounded-2xl sm:rounded-[28px] overflow-hidden border border-[#E9E4DB]/40 shadow-sm bg-[#161412]">
          
          {/* Background Image of Tech/Desk with dark moody overlay */}
          <div className="absolute inset-0 z-0">
            <img
              src="https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&q=80&w=1600"
              alt="Community Swapping Stats"
              className="w-full h-full object-cover object-center opacity-30 filter grayscale"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#121110]/95 via-[#181614]/90 to-[#121110]/95" />
          </div>

          {/* Stats Content Grid */}
          <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 py-8 sm:py-12 px-4 sm:px-8 divide-y md:divide-y-0 md:divide-x divide-white/10">
            {STATS.map((stat) => {
              const IconComponent = stat.icon;
              return (
                <div 
                  key={stat.label} 
                  className="flex flex-col items-center text-center p-4 sm:p-6 space-y-3"
                >
                  {/* Round Green Icon Circle with Solid FontAwesome Icon */}
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#243F2F] border border-[#3D634C]/50 flex items-center justify-center shadow-inner">
                    <IconComponent />
                  </div>

                  {/* Stat Value in Bold Serif */}
                  <p className="font-headings text-2xl sm:text-3xl lg:text-[34px] font-bold text-white tracking-tight">
                    {stat.value}
                  </p>

                  {/* Gold/Beige Stat Label */}
                  <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-[#D4C5A9]">
                    {stat.label}
                  </p>
                </div>
              );
            })}
          </div>

        </div>

      </div>
    </section>
  );
}
