import { useState } from 'react';
import { 
  ArrowRight, 
  Mail, 
  Leaf, 
  ShieldCheck, 
  Tag 
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export default function CTASection() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      toast('Please enter a valid email address.', 'error');
      return;
    }
    setSubscribed(true);
    toast('Welcome to the ReWearX movement! Check your inbox soon.', 'success');
    setEmail('');
  };

  return (
    <section className="w-full bg-[#F7F4EB] border-t border-b border-[#E9E4DB] overflow-hidden font-body relative">
      <div className="w-full">
        <div className="grid lg:grid-cols-12 items-stretch min-h-[480px] lg:min-h-[520px]">
          
          {/* ── LEFT CONTENT (Full-Width Pad) ── */}
          <div className="lg:col-span-7 flex flex-col justify-center px-6 sm:px-12 lg:pl-16 xl:pl-24 lg:pr-10 py-12 sm:py-16 space-y-6 sm:space-y-8 z-10">
            
            {/* Pill Badge */}
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E4ECE5] border border-[#243F2F]/20 text-[#243F2F] text-xs font-bold tracking-wide">
                <Leaf size={14} className="text-[#243F2F]" />
                <span>JOIN THE MOVEMENT</span>
              </div>
            </div>

            {/* Headline */}
            <h2 className="font-headings text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1]">
              <span className="block text-[#1E1B18]">Swap Better.</span>
              <span className="block text-[#243F2F]">Live Better.</span>
            </h2>

            {/* Description */}
            <p className="text-sm sm:text-base lg:text-lg text-[#7D7265] max-w-lg font-normal leading-relaxed">
              Join thousands of members swapping quality items, saving money, and reducing waste.
            </p>

            {/* Email Subscription Box */}
            <form 
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl border border-[#E9E4DB] p-1.5 flex items-center shadow-xs max-w-lg transition-all focus-within:border-[#243F2F] focus-within:ring-2 focus-within:ring-[#243F2F]/15"
            >
              <Mail size={18} className="text-[#7D7265] ml-3.5 mr-2 shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="flex-1 text-xs sm:text-sm text-[#1E1B18] placeholder:text-[#7D7265] bg-transparent focus:outline-none pr-2 font-normal"
                required
              />
              <button
                type="submit"
                className="bg-[#243F2F] hover:bg-[#1A3324] text-white px-5 sm:px-7 py-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-xs shrink-0 cursor-pointer"
              >
                <span>{subscribed ? 'Subscribed' : 'Subscribe Now'}</span>
                <ArrowRight size={14} />
              </button>
            </form>

            {/* 3 Trust Feature Badges */}
            <div className="grid grid-cols-3 gap-3 sm:gap-6 pt-4 sm:pt-6 border-t border-[#E9E4DB]/80 max-w-lg">
              
              {/* Feature 1 */}
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#E4ECE5] flex items-center justify-center text-[#243F2F] shrink-0">
                  <ShieldCheck size={19} className="stroke-[2.2]" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-[#1E1B18] leading-tight">100% Verified</p>
                  <p className="text-[10px] sm:text-[11px] text-[#7D7265] mt-0.5">Safe & Trusted</p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#E4ECE5] flex items-center justify-center text-[#243F2F] shrink-0">
                  <Leaf size={19} className="stroke-[2.2]" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-[#1E1B18] leading-tight">Eco Friendly</p>
                  <p className="text-[10px] sm:text-[11px] text-[#7D7265] mt-0.5">Reduce Waste</p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#E4ECE5] flex items-center justify-center text-[#243F2F] shrink-0">
                  <Tag size={19} className="stroke-[2.2]" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-[#1E1B18] leading-tight">Great Value</p>
                  <p className="text-[10px] sm:text-[11px] text-[#7D7265] mt-0.5">Save More</p>
                </div>
              </div>

            </div>

          </div>

          {/* ── RIGHT LIFESTYLE FLATLAY IMAGE (Full-Bleed Edge to Edge) ── */}
          <div className="lg:col-span-5 relative h-full min-h-[360px] lg:min-h-full overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=1400"
              alt="Sustainable Swapping Lifestyle"
              className="w-full h-full object-cover object-center"
            />
            {/* Subtle soft gradient blending into left column on large screens */}
            <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#F7F4EB] via-transparent to-transparent pointer-events-none" />
          </div>

        </div>
      </div>
    </section>
  );
}
