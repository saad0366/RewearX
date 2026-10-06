import { motion, type Variants } from 'motion/react';
import aboutBanner from '../../assets/about.png';
import {
  Leaf, Users, Repeat, Heart, Globe, Sparkles, ArrowRight,
  Recycle, ShieldCheck, Zap, Star
} from 'lucide-react';

const team = [
  { name: 'Aisha Rahman', role: 'Co-Founder & CEO', avatar: '2.5% 38.5%', quote: 'Fashion should be a cycle, not a landfill.' },
  { name: 'Daniel Osei', role: 'Co-Founder & CTO', avatar: '10% 38.5%', quote: 'Technology can make sustainability effortless.' },
  { name: 'Sofia Martínez', role: 'Head of Community', avatar: '18% 38.5%', quote: 'Every swap is a new friendship waiting to happen.' },
  { name: 'Liam Chen', role: 'Lead Designer', avatar: '25% 38.5%', quote: 'Good design makes conscious choices feel natural.' },
];

const values = [
  { icon: Recycle, title: 'Circular by Design', desc: 'Every feature we build pushes clothing further from landfills and deeper into the community loop.' },
  { icon: Heart, title: 'Community First', desc: 'We are nothing without the trendsetters who trust us with their wardrobes and their stories.' },
  { icon: ShieldCheck, title: 'Radical Transparency', desc: 'No hidden fees, no dark patterns — just honest peer-to-peer swapping the way it should be.' },
  { icon: Zap, title: 'Effortless Impact', desc: 'Doing good should feel good. We obsess over making sustainability the path of least resistance.' },
];

const milestones = [
  { year: '2022', title: 'The Idea', desc: 'Two friends frustrated by fast fashion started sketching ReWearX on a napkin.' },
  { year: '2023', title: 'Beta Launch', desc: 'First 500 members joined, completing over 1,200 swaps in the first three months.' },
  { year: '2024', title: 'Going National', desc: 'Expanded to 30+ cities with AI-powered matching and 25,000+ active members.' },
  { year: '2025', title: 'The Future', desc: 'Building toward a world where buying new clothes is the exception, not the rule.' },
];

const impactStats = [
  { icon: Repeat, value: '320K+', label: 'Successful Swaps' },
  { icon: Leaf, value: '120T', label: 'CO₂ Saved' },
  { icon: Users, value: '25K+', label: 'Active Members' },
  { icon: Globe, value: '30+', label: 'Cities Covered' },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.55, delay: i * 0.1, ease: 'easeOut' } }),
};

export default function AboutUs() {
  return (
    <div className="flex flex-col w-full font-body">

      {/* ── Hero ── */}
      <section className="relative w-full overflow-hidden flex flex-col items-center justify-center min-h-[520px] sm:min-h-[580px] md:min-h-[640px]">
        <img src={aboutBanner} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/30 to-accent/40 pointer-events-none" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 flex flex-col items-center text-center pt-12 sm:pt-16 pb-16 sm:pb-20">
          <motion.span
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="text-white/75 uppercase tracking-[0.26em] text-[10px] sm:text-[11px] font-bold mb-4"
          >
            Our Story
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
            className="font-headings text-white font-normal text-[2.2rem] leading-[1.08] sm:text-5xl md:text-6xl lg:text-7xl mb-5 sm:mb-6 max-w-[16ch]"
          >
            Fashion that gives<br />
            <span className="italic font-light text-white/85">back to the planet.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="text-white/80 font-light leading-relaxed text-[13px] sm:text-sm md:text-base max-w-[38ch] sm:max-w-lg mb-8"
          >
            ReWearX was born from a simple belief — the best outfit you'll ever own is already out there, waiting to be swapped into your life.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}
            className="flex items-center gap-2"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
              <Sparkles size={11} className="text-white/80" />
              <span className="text-white/80 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em]">Est. 2022 · Circular Fashion</span>
            </div>
          </motion.div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#fbf9f4] to-transparent pointer-events-none" />
      </section>

      {/* ── Impact Stats ── */}
      <section className="bg-[#FAF9F5] border-b border-border/40 relative z-10">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-8 sm:py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {impactStats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={i}
                  custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: false, margin: '-10%' }}
                  className={`flex flex-col items-center text-center py-2 ${i !== 0 ? 'lg:border-l border-border/50' : ''}`}
                >
                  <div className="text-accent/80 mb-2 bg-accent/8 p-2 rounded-full">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="font-headings text-xl sm:text-2xl md:text-3xl font-black text-primary tracking-tight leading-none">{stat.value}</span>
                  <span className="text-[9px] sm:text-[11px] text-muted-foreground font-semibold mt-1.5 uppercase tracking-wider">{stat.label}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Mission ── */}
      <section className="bg-background relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 right-0 w-72 h-72 bg-accent/5 rounded-full blur-3xl opacity-60" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/4 rounded-full blur-3xl opacity-40" />
        </div>
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-14 sm:py-16 md:py-20 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-14 lg:gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-4">
                <Sparkles size={11} />
                <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">Our Mission</span>
              </div>
              <h2 className="font-headings text-3xl sm:text-4xl md:text-5xl font-bold text-primary tracking-tight leading-tight mb-5 sm:mb-6">
                Closing the loop<br />
                <span className="italic font-light text-primary/70">on fast fashion.</span>
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-4">
                The fashion industry produces 92 million tonnes of textile waste every year. We built ReWearX to prove there's a better way — one swap at a time.
              </p>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-7">
                Our platform connects people who want to refresh their wardrobes without spending money or harming the planet. No cash, no waste — just community-powered style.
              </p>
              <a href="/how-it-works" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground text-xs uppercase tracking-[0.18em] font-semibold hover:bg-primary/90 transition-colors rounded-full">
                See How It Works <ArrowRight size={13} />
              </a>
            </motion.div>

            {/* Visual card stack */}
            <motion.div
              initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.6, delay: 0.15 }}
              className="relative flex items-center justify-center h-[320px] sm:h-[380px]"
            >
              {/* Back card */}
              <div className="absolute w-[220px] sm:w-[260px] h-[280px] sm:h-[320px] bg-accent/10 border border-accent/20 rounded-3xl rotate-6 top-4 left-1/2 -translate-x-1/2" />
              {/* Mid card */}
              <div className="absolute w-[220px] sm:w-[260px] h-[280px] sm:h-[320px] bg-secondary/60 border border-border rounded-3xl -rotate-3 top-2 left-1/2 -translate-x-1/2" />
              {/* Front card */}
              <div className="relative w-[220px] sm:w-[260px] h-[280px] sm:h-[320px] bg-white border border-border/60 rounded-3xl shadow-2xl flex flex-col items-center justify-center gap-4 p-6 z-10">
                <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                  <Leaf className="w-8 h-8 text-accent" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="font-headings text-2xl font-bold text-primary">120 Tons</p>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-1">CO₂ Saved So Far</p>
                </div>
                <div className="w-full h-px bg-border/50" />
                <p className="text-[12px] text-center text-muted-foreground leading-relaxed italic font-headings">
                  "Equal to taking 26 cars off the road for a year."
                </p>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => <Star key={i} size={11} fill="#d4af37" className="text-[#d4af37]" />)}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Values ── */}
      <section className="bg-[#FAF9F5] border-y border-border/20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl opacity-50" />
          <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl opacity-50" />
        </div>
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-14 sm:py-16 md:py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.5 }}
            className="text-center max-w-xl mx-auto mb-10 sm:mb-12"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-4">
              <Sparkles size={11} />
              <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">What We Stand For</span>
            </div>
            <h2 className="font-headings text-3xl sm:text-4xl md:text-5xl font-bold text-primary tracking-tight leading-tight">
              Our Core Values
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-md mx-auto">
              These aren't just words on a wall — they're the decisions we make every day.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {values.map((v, i) => {
              const Icon = v.icon;
              return (
                <motion.div
                  key={i}
                  custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: false, margin: '-50px' }}
                  className="group bg-white border border-border/60 rounded-2xl p-6 sm:p-7 flex flex-col gap-4 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 cursor-default"
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/8 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-headings text-base sm:text-lg font-bold text-primary mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-accent transition-all duration-300">
                      {v.title}
                    </h3>
                    <p className="text-[13px] sm:text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Timeline ── */}
      <section className="bg-background relative overflow-hidden">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-14 sm:py-16 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.5 }}
            className="text-center max-w-xl mx-auto mb-10 sm:mb-14"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-4">
              <Sparkles size={11} />
              <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">Our Journey</span>
            </div>
            <h2 className="font-headings text-3xl sm:text-4xl md:text-5xl font-bold text-primary tracking-tight leading-tight">
              How We Got Here
            </h2>
          </motion.div>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[18px] sm:left-1/2 sm:-translate-x-px top-0 bottom-0 w-px bg-border/60 hidden sm:block" />

            <div className="flex flex-col gap-8 sm:gap-0">
              {milestones.map((m, i) => (
                <motion.div
                  key={i}
                  custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: false, margin: '-60px' }}
                  className={`relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-0 ${i % 2 === 0 ? 'sm:flex-row' : 'sm:flex-row-reverse'}`}
                >
                  {/* Content */}
                  <div className={`w-full sm:w-[calc(50%-2rem)] ${i % 2 === 0 ? 'sm:pr-10 sm:text-right' : 'sm:pl-10 sm:text-left'}`}>
                    <div className={`bg-white border border-border/60 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-lg transition-shadow duration-300 ${i % 2 === 0 ? 'sm:ml-auto' : ''}`}>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">{m.year}</span>
                      <h3 className="font-headings text-lg sm:text-xl font-bold text-primary mt-1 mb-2">{m.title}</h3>
                      <p className="text-[13px] sm:text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
                    </div>
                  </div>

                  {/* Dot */}
                  <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-accent border-4 border-background shadow-md z-10" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Team ── */}
      <section className="bg-[#FAF9F5] border-t border-border/20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-accent/4 rounded-full blur-3xl opacity-60" />
        </div>
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-14 sm:py-16 md:py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.5 }}
            className="text-center max-w-xl mx-auto mb-10 sm:mb-12"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-4">
              <Sparkles size={11} />
              <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">The People</span>
            </div>
            <h2 className="font-headings text-3xl sm:text-4xl md:text-5xl font-bold text-primary tracking-tight leading-tight">
              Meet the Team
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-md mx-auto">
              A small team with a big obsession — making circular fashion the new normal.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {team.map((member, i) => (
              <motion.div
                key={i}
                custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: false, margin: '-50px' }}
                className="group bg-white border border-border/60 rounded-2xl p-6 flex flex-col items-center text-center gap-4 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 cursor-default"
              >
                {/* Avatar */}
                <div
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-white shadow-lg group-hover:border-accent/20 transition-colors duration-300 bg-no-repeat"
                  style={{
                    backgroundImage: 'url("https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fe990e254-554b-48ad-bb2d-626d12a0ed9d?alt=media&token=c1c20cfa-7e92-4db2-bbc9-10de0b3f81b6")',
                    backgroundPosition: member.avatar,
                    backgroundSize: '1600% 1200%',
                  }}
                />
                <div>
                  <h3 className="font-headings text-base sm:text-lg font-bold text-primary group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-accent transition-all duration-300">
                    {member.name}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] text-accent mt-0.5">{member.role}</p>
                </div>
                <div className="w-full h-px bg-border/40" />
                <p className="text-[12px] sm:text-[13px] italic text-muted-foreground leading-relaxed font-headings">
                  "{member.quote}"
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-4 sm:px-8 lg:px-12 py-10 sm:py-12 md:py-14">
        <div className="max-w-5xl mx-auto relative overflow-hidden bg-accent rounded-2xl sm:rounded-3xl text-accent-foreground shadow-xl">
          <div className="absolute top-0 right-0 w-48 h-48 sm:w-64 sm:h-64 opacity-[0.10] pointer-events-none mix-blend-overlay">
            <div className="bg-no-repeat aspect-square w-full h-full"
              style={{ backgroundImage: 'url("https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fe990e254-554b-48ad-bb2d-626d12a0ed9d?alt=media&token=c1c20cfa-7e92-4db2-bbc9-10de0b3f81b6")', backgroundPosition: '69.5% 70%', backgroundSize: '1000% 500%' }} />
          </div>
          <div className="absolute bottom-0 left-0 w-48 h-48 sm:w-64 sm:h-64 opacity-[0.10] pointer-events-none transform rotate-180 mix-blend-overlay">
            <div className="bg-no-repeat aspect-square w-full h-full"
              style={{ backgroundImage: 'url("https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fe990e254-554b-48ad-bb2d-626d12a0ed9d?alt=media&token=c1c20cfa-7e92-4db2-bbc9-10de0b3f81b6")', backgroundPosition: '77.5% 68%', backgroundSize: '1200% 600%' }} />
          </div>

          <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10 sm:py-12 md:py-14 text-center relative z-10 flex flex-col items-center">
            <motion.h2
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.5 }}
              className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold mb-3 tracking-tight text-white leading-tight"
            >
              Be part of the movement.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.5, delay: 0.1 }}
              className="text-accent-foreground/85 text-[13px] sm:text-sm md:text-base max-w-sm sm:max-w-md mb-6 sm:mb-7 leading-relaxed font-medium"
            >
              Join 25,000+ trendsetters who are swapping clothes, saving money, and protecting the planet — one outfit at a time.
            </motion.p>
            <motion.button
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.5, delay: 0.2 }}
              className="px-7 py-3.5 bg-white text-accent hover:bg-muted/10 transition-colors font-bold rounded-full text-xs sm:text-sm flex items-center gap-2 shadow-[0_6px_24px_rgba(255,255,255,0.18)] hover:shadow-[0_8px_30px_rgba(255,255,255,0.28)] hover:-translate-y-0.5 transform duration-300"
            >
              <span>Join ReWearX</span>
              <ArrowRight size={14} />
            </motion.button>
          </div>
        </div>
      </section>

    </div>
  );
}
