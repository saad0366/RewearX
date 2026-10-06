import { useState, useEffect } from 'react';
import { 
  Instagram, 
  Twitter, 
  Facebook, 
  Linkedin 
} from 'lucide-react';
import { Link } from 'wouter';
import { categoriesApi } from '../../lib/api';
import type { ApiCategory } from '../../lib/api/types';
import logoImg from '@/assets/logo.png';

const POPULAR_HUBS = [
  'Islamabad',
  'Lahore',
  'Karachi',
  'Rawalpindi',
  'Abbottabad',
  'Peshawar',
  'Faisalabad',
  'Multan',
  'Quetta',
  'Sialkot'
];

export default function Footer() {
  const [categories, setCategories] = useState<ApiCategory[]>([]);

  useEffect(() => {
    categoriesApi
      .list()
      .then((data) => {
        // Only show top-level categories, up to 8 of them
        const topLevel = data.filter((c) => !c.parentId).slice(0, 8);
        setCategories(topLevel);
      })
      .catch((err) => console.error('Failed to load footer categories', err));
  }, []);

  return (
    <footer className="bg-[#F4EFE6] text-[#1E1B18] font-body border-t border-[#E5DFD3]">
      
      {/* ── MAIN FOOTER CONTENT ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Brand Info & Mission (Col 1-4) */}
          <div className="col-span-2 md:col-span-4 space-y-4 pr-0 md:pr-6">
            <Link href="/" className="inline-flex items-center cursor-pointer" aria-label="ReWearX Home">
              <div className="w-24 sm:w-28 h-12 flex items-center justify-start">
                <img 
                  src={logoImg} 
                  alt="ReWearX" 
                  className="h-10 sm:h-12 w-auto object-contain transform scale-[1.8] origin-left"
                />
              </div>
            </Link>

            <p className="text-xs sm:text-sm text-[#7D7265] font-normal leading-relaxed max-w-sm">
              Pakistan&apos;s circular swap community. Exchange preloved apparel, footwear, tech, and vintage collectibles with verified members nationwide.
            </p>

            {/* Clean Social Links */}
            <div className="flex items-center gap-2.5 pt-2">
              <a 
                href="https://instagram.com" 
                target="_blank" 
                rel="noreferrer" 
                aria-label="Instagram"
                className="w-8 h-8 rounded-full bg-[#EAE3D6] hover:bg-[#1E1B18] text-[#1E1B18] hover:text-white flex items-center justify-center transition-colors"
              >
                <Instagram size={15} />
              </a>
              <a 
                href="https://twitter.com" 
                target="_blank" 
                rel="noreferrer" 
                aria-label="Twitter"
                className="w-8 h-8 rounded-full bg-[#EAE3D6] hover:bg-[#1E1B18] text-[#1E1B18] hover:text-white flex items-center justify-center transition-colors"
              >
                <Twitter size={15} />
              </a>
              <a 
                href="https://facebook.com" 
                target="_blank" 
                rel="noreferrer" 
                aria-label="Facebook"
                className="w-8 h-8 rounded-full bg-[#EAE3D6] hover:bg-[#1E1B18] text-[#1E1B18] hover:text-white flex items-center justify-center transition-colors"
              >
                <Facebook size={15} />
              </a>
              <a 
                href="https://linkedin.com" 
                target="_blank" 
                rel="noreferrer" 
                aria-label="LinkedIn"
                className="w-8 h-8 rounded-full bg-[#EAE3D6] hover:bg-[#1E1B18] text-[#1E1B18] hover:text-white flex items-center justify-center transition-colors"
              >
                <Linkedin size={15} />
              </a>
            </div>
          </div>

          {/* Col 2: Marketplace */}
          <div className="col-span-1 md:col-span-3 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#1E1B18]">
              Marketplace
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-[#7D7265]">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={`/browse?category=${category.name}`} className="hover:text-[#1E1B18] transition-colors">
                    {category.name}
                  </Link>
                </li>
              ))}
              {categories.length === 0 && (
                <li>Loading categories...</li>
              )}
              <li>
                <Link href="/browse?filter=free" className="hover:text-[#1E1B18] transition-colors mt-2 block">Free Drops</Link>
              </li>
            </ul>
          </div>

          {/* Col 3: How It Works & Trading */}
          <div className="col-span-1 md:col-span-3 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#1E1B18]">
              Swapping & Safety
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-[#7D7265]">
              <li>
                <Link href="/how-it-works" className="hover:text-[#1E1B18] transition-colors">How Swapping Works</Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-[#1E1B18] transition-colors">Swapper Protection</Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-[#1E1B18] transition-colors">Doorstep Trade Guide</Link>
              </li>
              <li>
                <Link href="/items/new" className="hover:text-[#1E1B18] transition-colors">List an Item</Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-[#1E1B18] transition-colors">Condition Standards</Link>
              </li>
              <li>
                <Link href="/community" className="hover:text-[#1E1B18] transition-colors">Community Guidelines</Link>
              </li>
            </ul>
          </div>

          {/* Col 4: About & Help */}
          <div className="col-span-2 md:col-span-2 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#1E1B18]">
              Company
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-[#7D7265]">
              <li>
                <Link href="/about" className="hover:text-[#1E1B18] transition-colors">About Us</Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-[#1E1B18] transition-colors">Sustainability</Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[#1E1B18] transition-colors">Contact Support</Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-[#1E1B18] transition-colors">Terms of Service</Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-[#1E1B18] transition-colors">Privacy Policy</Link>
              </li>
            </ul>
          </div>

        </div>

        {/* ── LOCAL HUBS IN PAKISTAN (Clean Text Links) ── */}
        <div className="mt-12 pt-8 border-t border-[#E5DFD3]">
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E1B18] shrink-0">
              Popular Cities:
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#7D7265]">
              {POPULAR_HUBS.map((city, idx) => (
                <Link 
                  key={city}
                  href={`/browse?q=${encodeURIComponent(city)}`}
                  className="hover:text-[#1E1B18] transition-colors"
                >
                  {city}{idx < POPULAR_HUBS.length - 1 ? ' ·' : ''}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── BOTTOM COPYRIGHT STRIP ── */}
        <div className="mt-8 pt-6 border-t border-[#E5DFD3] flex flex-col sm:flex-row justify-between items-center text-xs text-[#7D7265] gap-3">
          <p>© {new Date().getFullYear()} ReWearX. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span>Pakistan</span>
            <span className="text-[#E5DFD3]">•</span>
            <span>Circular Swap Economy</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
