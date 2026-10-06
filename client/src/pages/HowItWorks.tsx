import { motion, type Variants } from 'motion/react';
import howBanner from '../../assets/how.png';
import {
  Camera, Search, Repeat, Leaf, Sparkles, ArrowRight,
  ShieldCheck, MessageCircle, Star, CheckCircle, Package,
  Zap, Heart, Users, HelpCircle, ChevronDown
} from 'lucide-react';
import { useState } from 'react';

const steps = [
  {
    num: '01',
    icon: Camera,
    title: 'List Your Items',
    desc: 'Photograph your pre-loved pieces and upload them in minutes. Add a title, description, size, and condition — our AI helps you write the perfect listing.',
    tips: ['Use natural lighting for best photos', 'Add multiple angles', 'Be honest about condition'],
    color: 'from-accent/10 to-accent/5',
    accent: 'text-accent',
    bg: 'bg-accent/8',
  },
  {
    num: '02',
    icon: Search,
    title: 'Discover & Match',
    desc: 'Browse thousands of items or let our AI-powered search find exactly what you\'re looking for. Filter by size, style, category, and more.',
    tips: ['Use NLP search for natural queries', 'Save items you love', 'Check seller ratings'],
    color: 'from-primary/10 to-primary/5',
    accent: 'text-primary',
    bg: 'bg-primary/8',
  },
  {
    num: '03',
    icon: MessageCircle,
    title: 'Connect & Agree',
    desc: 'Send a swap request to the item owner. Chat directly to confirm details, agree on shipping, and finalise the exchange — all within the platform.',
    tips: ['Be clear about what you\'re offering', 'Agree on shipping method', 'Confirm sizes before swapping'],
    color: 'from-secondary/60 to-secondary/30',
    accent: 'text-primary/80',
    bg: 'bg-secondary/40',
  },
  {
    num: '04',
    icon: Package,
    title: 'Ship & Exchange',
    desc: 'Pack your item securely and ship it to your swap partner. Both parties ship simultaneously so no one waits longer than the other.',
    tips: ['Use tracked shipping', 'Pack items carefully', 'Share tracking numbers'],
    color: 'from-accent/10 to-accent/5',
    accent: 'text-accent',
    bg: 'bg-accent/8',
  },
  {
    num: '05',
    icon: Star,
    title: 'Rate & Repeat',
    desc: 'Once your new piece arrives, leave a review for your swap partner. Build your reputation and unlock more swaps with the community.',
    tips: ['Leave honest reviews', 'Build your swap history', 'Earn community badges'],
    color: 'from-primary/10 to-primary/5',
    accent: 'text-primary',
    bg: 'bg-primary/8',
  },
];

const features = [
  { icon: Zap, title: 'AI-Powered Search', desc: 'Type naturally — "cozy winter jacket in green" — and our NLP engine finds exactly what you mean.' },
  { icon: ShieldCheck, title: 'Verified Community', desc: 'Every member is verified. Ratings and reviews keep the community honest and trustworthy.' },
  { icon: Heart, title: 'Save & Wishlist', desc: 'Heart items you love and get notified when similar pieces are listed by other members.' },
  { icon: MessageCircle, title: 'In-App Chat', desc: 'Negotiate, confirm, and coordinate your swap entirely within our secure messaging system.' },
  { icon: Users, title: 'Community Driven', desc: 'Join a growing movement of 25,000+ trendsetters who believe fashion should be circular.' },
  { icon: Leaf, title: 'Track Your Impact', desc: 'See exactly how much CO₂ you\'ve saved and money you\'ve kept in your pocket with every swap.' },
];

const faqs = [
  { q: 'Is ReWearX completely free to use?', a: 'Yes — listing items and swapping is 100% free. You only pay for shipping, which you arrange directly with your swap partner.' },
  { q: 'What if the item I receive doesn\'t match the description?', a: 'We have a dispute resolution process. If an item is significantly misrepresented, our team will step in to mediate and find a fair solution.' },
  { q: 'Can I swap internationally?', a: 'Currently we support swaps within the country. International swapping is on our roadmap and coming soon!' },
  { q: 'How does the AI matching work?', a: 'Our NLP model understands natural language queries and matches them against item descriptions, categories, colors, and styles to surface the most relevant results.' },
  { q: 'What items are not allowed on the platform?', a: 'Undergarments, swimwear, counterfeit goods, and items in poor/damaged condition are not permitted. All listings are reviewed against our community guidelines.' },
  { q: 'How do I build my reputation on ReWearX?', a: 'Complete swaps, receive positive reviews, and stay active in the community. Top swappers earn badges and get featured as Swapper of the Week.' },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.55, delay: i * 0.1, ease: 'easeOut' } }),
};

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border border-border/60 rounded-2xl overflow-hidden bg-white hover:shadow-md transition-shadow duration-300 cursor-pointer"
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5">
        <span className="font-headings text-sm sm:text-base font-bold text-primary leading-snug">{q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }} className="shrink-0 text-muted-foreground">
          <ChevronDown size={18} />
        </motion.div>
      </div>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.35, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <p className="px-5 sm:px-6 pb-4 sm:pb-5 text-[13px] sm:text-sm text-muted-foreground leading-relaxed">{a}</p>
      </motion.div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <div className="flex flex-col w-full font-body">

      {/* ── Hero ── */}
      <section className="relative w-full overflow-hidden flex flex-col items-center justify-center min-h-[500px] sm:min-h-[560px] md:min-h-[620px]">
        <img src={howBanner} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/30 to-accent/40 pointer-events-none" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 flex flex-col items-center text-center pt-12 sm:pt-16 pb-16 sm:pb-20">
          <motion.span
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="text-white/75 uppercase tracking-[0.26em] text-[10px] sm:text-[11px] font-bold mb-4"
          >
            The Process
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
            className="font-headings text-white font-normal text-[2.2rem] leading-[1.08] sm:text-5xl md:text-6xl lg:text-7xl mb-5 sm:mb-6 max-w-[18ch]"
          >
            Swapping made<br />
            <span className="italic font-light text-white/85">beautifully simple.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="text-white/80 font-light leading-relaxed text-[13px] sm:text-sm md:text-base max-w-[38ch] sm:max-w-lg mb-8"
          >
            Five simple steps stand between you and a refreshed wardrobe — no money, no waste, just community-powered style.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-3"
          >
            <a href="/signup" className="px-7 py-3 sm:py-3.5 bg-white text-primary text-[10px] sm:text-xs uppercase tracking-[0.18em] font-semibold hover:bg-muted transition-colors rounded-full">
              Start Swapping
            </a>
            <a href="/browse" className="px-7 py-3 sm:py-3.5 bg-transparent border border-white/70 text-white text-[10px] sm:text-xs uppercase tracking-[0.18em] font-semibold hover:bg-white/10 transition-colors rounded-full flex items-center gap-2 backdrop-blur-sm">
              Browse Items <ArrowRight size={13} />
            </a>
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#fbf9f4] to-transparent pointer-events-none" />
      </section>

      {/* ── Quick Stats Bar ── */}
      <section className="bg-[#FAF9F5] border-b border-border/40 relative z-10">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-5 sm:py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12">
            {[
              { value: '5 Steps', label: 'Simple Process' },
              { value: '100% Free', label: 'No Hidden Fees' },
              { value: '25K+', label: 'Active Swappers' },
              { value: '320K+', label: 'Swaps Completed' },
            ].map((s, i) => (
              <motion.div
                key={i}
                custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: false }}
                className="flex items-center gap-2.5"
              >
                <CheckCircle size={14} className="text-accent shrink-0" />
                <span className="font-headings font-bold text-primary text-sm sm:text-base">{s.value}</span>
                <span className="text-[11px] sm:text-xs text-muted-foreground font-medium">{s.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Steps ── */}
      <section className="bg-background relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl opacity-50" />
          <div className="absolute bottom-1/4 left-0 w-72 h-72 bg-primary/4 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-14 sm:py-16 md:py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.5 }}
            className="text-center max-w-xl mx-auto mb-12 sm:mb-14 md:mb-16"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-4">
              <Sparkles size={11} />
              <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">Step by Step</span>
            </div>
            <h2 className="font-headings text-3xl sm:text-4xl md:text-5xl font-bold text-primary tracking-tight leading-tight">
              Your swap journey,<br />
              <span className="italic font-light text-primary/70">explained.</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-md mx-auto">
              From listing to receiving — here's exactly how every swap works on ReWearX.
            </p>
          </motion.div>

          <div className="flex flex-col gap-6 sm:gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isEven = i % 2 === 0;
              return (
                <motion.div
                  key={i}
                  custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: false, margin: '-60px' }}
                  className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-6 sm:gap-8 items-center`}
                >
                  {/* Content */}
                  <div className="flex-1 w-full">
                    <div className="bg-white border border-border/60 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 group h-full">
                      <div className="flex items-start gap-4 sm:gap-5 mb-5">
                        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${step.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${step.accent}`} strokeWidth={1.5} />
                        </div>
                        <div>
                          <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${step.accent} opacity-70`}>Step {step.num}</span>
                          <h3 className="font-headings text-xl sm:text-2xl font-bold text-primary mt-0.5 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-accent transition-all duration-300">
                            {step.title}
                          </h3>
                        </div>
                      </div>
                      <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-5">{step.desc}</p>
                      <div className="flex flex-col gap-2">
                        {step.tips.map((tip, j) => (
                          <div key={j} className="flex items-center gap-2.5">
                            <CheckCircle size={13} className="text-accent shrink-0" />
                            <span className="text-[12px] sm:text-[13px] text-muted-foreground font-medium">{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Visual */}
                  <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0">
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      transition={{ duration: 0.4 }}
                      className={`relative rounded-2xl sm:rounded-3xl bg-gradient-to-br ${step.color} border border-border/40 overflow-hidden aspect-[4/3] flex items-center justify-center`}
                    >
                      {/* Big ghost number */}
                      <span className="absolute -bottom-4 -right-2 font-headings text-[8rem] sm:text-[10rem] font-black text-primary/5 leading-none select-none pointer-events-none">
                        {step.num}
                      </span>
                      {/* Center icon */}
                      <div className="relative z-10 flex flex-col items-center gap-3">
                        <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${step.bg} border border-border/30 flex items-center justify-center shadow-lg`}>
                          <Icon className={`w-8 h-8 sm:w-10 sm:h-10 ${step.accent}`} strokeWidth={1.2} />
                        </div>
                        <span className="font-headings text-sm sm:text-base font-bold text-primary/70">{step.title}</span>
                      </div>
                      {/* Decorative dots */}
                      <div className="absolute top-4 left-4 flex gap-1.5">
                        {[...Array(3)].map((_, d) => (
                          <div key={d} className="w-2 h-2 rounded-full bg-primary/10" />
                        ))}
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-[#FAF9F5] border-y border-border/20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl opacity-50" />
          <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl opacity-40" />
        </div>
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-14 sm:py-16 md:py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.5 }}
            className="text-center max-w-xl mx-auto mb-10 sm:mb-12"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-4">
              <Sparkles size={11} />
              <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">Platform Features</span>
            </div>
            <h2 className="font-headings text-3xl sm:text-4xl md:text-5xl font-bold text-primary tracking-tight leading-tight">
              Everything you need<br />
              <span className="italic font-light text-primary/70">to swap with confidence.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={i}
                  custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: false, margin: '-50px' }}
                  className="group bg-white border border-border/60 rounded-2xl p-6 sm:p-7 flex gap-4 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 cursor-default"
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/8 flex items-center justify-center text-accent shrink-0 group-hover:bg-accent group-hover:text-white transition-all duration-300 mt-0.5">
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-headings text-base sm:text-lg font-bold text-primary mb-1.5 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-accent transition-all duration-300">
                      {f.title}
                    </h3>
                    <p className="text-[13px] sm:text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-background relative overflow-hidden">
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-14 sm:py-16 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.5 }}
            className="text-center max-w-xl mx-auto mb-10 sm:mb-12"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-4">
              <HelpCircle size={11} />
              <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">FAQ</span>
            </div>
            <h2 className="font-headings text-3xl sm:text-4xl md:text-5xl font-bold text-primary tracking-tight leading-tight">
              Common questions,<br />
              <span className="italic font-light text-primary/70">honest answers.</span>
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-60px' }} transition={{ duration: 0.5 }}
            className="flex flex-col gap-3"
          >
            {faqs.map((faq, i) => <FAQItem key={i} q={faq.q} a={faq.a} />)}
          </motion.div>
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
              Ready to make your first swap?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.5, delay: 0.1 }}
              className="text-accent-foreground/85 text-[13px] sm:text-sm md:text-base max-w-sm sm:max-w-md mb-6 sm:mb-7 leading-relaxed font-medium"
            >
              It takes less than 3 minutes to list your first item. Join thousands of trendsetters already swapping.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center gap-3"
            >
              <a href="/signup" className="px-7 py-3.5 bg-white text-accent font-bold rounded-full text-xs sm:text-sm flex items-center gap-2 shadow-[0_6px_24px_rgba(255,255,255,0.18)] hover:shadow-[0_8px_30px_rgba(255,255,255,0.28)] hover:-translate-y-0.5 transform duration-300 transition-all">
                <span>Get Started Free</span>
                <ArrowRight size={14} />
              </a>
              <a href="/browse" className="px-7 py-3.5 bg-white/10 border border-white/30 text-white font-semibold rounded-full text-xs sm:text-sm hover:bg-white/20 transition-all duration-300 backdrop-blur-sm">
                Browse First
              </a>
            </motion.div>
          </div>
        </div>
      </section>

    </div>
  );
}
