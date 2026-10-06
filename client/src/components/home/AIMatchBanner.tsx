import { Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'wouter';
import { useAuth } from '../../contexts/AuthContext';

export default function AIMatchBanner() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="bg-[#FAF9F5] border-b border-border/30 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10 sm:py-12 md:py-14 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-primary"
        >
          {/* soft glow orbs */}
          <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full bg-accent/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-10 w-72 h-72 rounded-full bg-accent/10 blur-3xl" />

          {/* large bg text */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-end pr-10 opacity-[0.04] select-none overflow-hidden">
            <span className="font-headings text-[12rem] font-black text-white leading-none tracking-tighter">AI</span>
          </div>

          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8 lg:gap-16 px-7 sm:px-10 lg:px-14 py-10 sm:py-12 lg:py-14">

            {/* left */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/20 border border-accent/25 text-accent mb-4 sm:mb-5">
                <Sparkles size={10} />
                <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.22em]">AI-Powered matching</span>
              </div>
              <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight mb-3 sm:mb-4">
                Your style,<br />
                <span className="italic font-light text-white/70">understood by AI.</span>
              </h2>
              <p className="text-white/60 text-[13px] sm:text-sm md:text-base max-w-md mx-auto lg:mx-0 leading-relaxed mb-7 sm:mb-8">
                Tell us what you wear and our recommendation engine surfaces swap opportunities you will actually want — filtered by size, condition, colour and brand.
              </p>
              <Link href={isAuthenticated ? '/recommendations' : '/signup'}>
                <button className="inline-flex items-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 rounded-full bg-white text-primary font-bold text-[10px] sm:text-xs uppercase tracking-[0.15em] hover:bg-muted transition-colors shadow-lg hover:-translate-y-0.5 transform duration-200">
                  {isAuthenticated ? 'See my AI picks' : 'Get started free'}
                  <ArrowRight size={13} />
                </button>
              </Link>
            </div>

            {/* right — editorial stat strip */}
            <div className="flex-shrink-0 w-full max-w-xs lg:max-w-[280px] grid grid-cols-2 gap-3">
              {[
                { value: '94%',  label: 'Match accuracy'           },
                { value: '3×',   label: 'More swaps completed'     },
                { value: '< 2s', label: 'Recommendation speed'     },
                { value: '50K+', label: 'Items analysed daily'     },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.92 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.18 + i * 0.07, duration: 0.4 }}
                  className="bg-white/8 border border-white/12 backdrop-blur rounded-xl p-4 sm:p-5 text-center"
                >
                  <p className="font-headings text-xl sm:text-2xl font-black text-white leading-none mb-1.5">
                    {stat.value}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-white/50 font-medium leading-tight">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>

          </div>
        </motion.div>
      </div>
    </section>
  );
}
