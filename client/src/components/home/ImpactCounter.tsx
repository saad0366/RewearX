import { useEffect, useRef, useState } from 'react';
import { Leaf, Repeat, Users, Shirt } from 'lucide-react';
import { motion, useInView } from 'motion/react';

function AnimatedNumber({ target, suffix = '', duration = 1600 }: { target: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  useEffect(() => {
    if (!inView) return;
    let current = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      current += step;
      if (current >= target) { setVal(target); clearInterval(id); }
      else setVal(Math.floor(current));
    }, 16);
    return () => clearInterval(id);
  }, [inView, target, duration]);

  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

const stats = [
  { icon: Repeat, value: 320000, suffix: '+', label: 'Swaps Completed',  sub: 'Pieces given a second life'          },
  { icon: Leaf,   value: 120,    suffix: 'T',  label: 'CO₂ Avoided',     sub: 'Tonnes kept out of the atmosphere'   },
  { icon: Users,  value: 25000,  suffix: '+',  label: 'Active Members',  sub: 'Trendsetters across Pakistan'        },
  { icon: Shirt,  value: 48000,  suffix: '+',  label: 'Items Listed',    sub: 'Available to browse right now'       },
];

export default function ImpactCounter() {
  return (
    <section className="bg-primary relative overflow-hidden border-b border-white/5">
      {/* soft glow */}
      <div className="pointer-events-none absolute -top-24 left-1/4 w-96 h-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-1/4 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />

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
            Our impact
          </span>
          <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight max-w-lg">
            Together we're making<br />
            <span className="italic font-light text-white/60">a real difference.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/8 rounded-2xl overflow-hidden border border-white/8">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.09 }}
                className="bg-primary px-5 sm:px-8 py-7 sm:py-9 flex flex-col gap-3 group hover:bg-white/5 transition-colors duration-300"
              >
                <div className="p-2 rounded-lg bg-white/8 border border-white/10 text-accent w-fit">
                  <Icon size={16} strokeWidth={1.8} />
                </div>
                <div>
                  <p className="font-headings text-2xl sm:text-3xl md:text-4xl font-black text-white leading-none mb-1.5">
                    <AnimatedNumber target={s.value} suffix={s.suffix} duration={1500 + i * 100} />
                  </p>
                  <p className="text-[11px] sm:text-xs font-bold text-white/70 uppercase tracking-wider mb-1">
                    {s.label}
                  </p>
                  <p className="text-[11px] sm:text-[12px] text-white/35 leading-snug">
                    {s.sub}
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
