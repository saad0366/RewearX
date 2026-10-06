'use client';
import { Leaf, Sparkles, Repeat } from 'lucide-react';
import { motion } from 'motion/react';

const reasons = [
  {
    icon: Repeat,
    num: '01',
    title: 'Zero cost, infinite wardrobe',
    desc: 'No money changes hands. Just two people trading pieces they love for pieces they will love more.',
  },
  {
    icon: Sparkles,
    num: '02',
    title: 'AI finds your perfect match',
    desc: 'Our model reads your style preferences and surfaces swaps that fit — brand, size, colour and vibe.',
  },
  {
    icon: Leaf,
    num: '03',
    title: 'Fashion that gives back',
    desc: 'Every swap keeps a garment out of landfill. Looking good has never felt this responsible.',
  },
];

export default function WhySwapSection() {
  return (
    <section className="bg-[#FAF9F5] border-b border-border/30 relative overflow-hidden">
      {/* background numerals */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.025] select-none">
        <span className="font-headings text-[20rem] font-black text-primary leading-none tracking-tighter">
          WHY
        </span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12 sm:py-14 md:py-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="mb-10 sm:mb-12"
        >
          <span className="text-accent font-bold text-[10px] uppercase tracking-[0.22em] flex items-center gap-2 mb-2.5">
            <span className="w-5 h-px bg-accent" />
            Why ReWearX
          </span>
          <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold text-primary tracking-tight leading-tight max-w-sm">
            Swap smarter,<br />
            <span className="italic font-light text-primary/70">live lighter.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border/30 rounded-2xl overflow-hidden border border-border/30">
          {reasons.map((r, i) => {
            const Icon = r.icon;
            return (
              <motion.div
                key={r.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-[#FAF9F5] p-6 sm:p-8 flex flex-col gap-5 group hover:bg-white transition-colors duration-300"
              >
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-accent/8 border border-accent/15 text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                    <Icon size={18} strokeWidth={1.8} />
                  </div>
                  <span className="font-headings text-4xl font-black text-primary/6 tracking-tighter select-none group-hover:text-primary/10 transition-colors">
                    {r.num}
                  </span>
                </div>
                <div>
                  <h3 className="font-headings text-base sm:text-lg font-bold text-primary mb-2 leading-snug group-hover:text-accent transition-colors duration-300">
                    {r.title}
                  </h3>
                  <p className="text-[12px] sm:text-[13px] text-muted-foreground leading-relaxed">
                    {r.desc}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
