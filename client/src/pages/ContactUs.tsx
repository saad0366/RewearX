import { useState } from 'react';
import { motion, type Variants } from 'motion/react';
import contactBanner from '../../assets/contact.png';
import {
  Mail, MapPin, Clock, Sparkles, ArrowRight,
  MessageCircle, HelpCircle, Bug, Handshake,
  CheckCircle, Send, Instagram, Twitter, Facebook
} from 'lucide-react';

const contactReasons = [
  { icon: HelpCircle, label: 'General Enquiry', desc: 'Questions about how ReWearX works' },
  { icon: Bug, label: 'Report an Issue', desc: 'Something broken or not working right' },
  { icon: Handshake, label: 'Partnership', desc: 'Collaborate or partner with us' },
  { icon: MessageCircle, label: 'Feedback', desc: 'Share ideas to improve the platform' },
];

const contactInfo = [
  { icon: Mail, label: 'Email Us', value: 'hello@rewearx.com', sub: 'We reply within 24 hours' },
  { icon: MapPin, label: 'Our Location', value: 'Karachi, Pakistan', sub: 'Serving nationwide' },
  { icon: Clock, label: 'Support Hours', value: 'Mon – Fri, 9am – 6pm', sub: 'PKT (UTC+5)' },
];

const socials = [
  { icon: Instagram, label: 'Instagram', handle: '@rewearx', href: '#' },
  { icon: Twitter, label: 'Twitter / X', handle: '@rewearx', href: '#' },
  { icon: Facebook, label: 'Facebook', handle: 'ReWearX', href: '#' },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.55, delay: i * 0.1, ease: 'easeOut' } }),
};

export default function ContactUs() {
  const [selected, setSelected] = useState(0);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setSubmitted(true);
  };

  return (
    <div className="flex flex-col w-full font-body">

      {/* ── Hero ── */}
      <section className="relative w-full overflow-hidden flex flex-col items-center justify-center min-h-[460px] sm:min-h-[520px] md:min-h-[580px]">
        <img src={contactBanner} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/30 to-accent/40 pointer-events-none" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 flex flex-col items-center text-center pt-12 sm:pt-16 pb-16 sm:pb-20">
          <motion.span
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="text-white/75 uppercase tracking-[0.26em] text-[10px] sm:text-[11px] font-bold mb-4"
          >
            Get In Touch
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
            className="font-headings text-white font-normal text-[2.2rem] leading-[1.08] sm:text-5xl md:text-6xl lg:text-7xl mb-5 sm:mb-6 max-w-[18ch]"
          >
            We'd love to<br />
            <span className="italic font-light text-white/85">hear from you.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="text-white/80 font-light leading-relaxed text-[13px] sm:text-sm md:text-base max-w-[38ch] sm:max-w-lg"
          >
            Whether you have a question, a bug to report, or just want to say hello — our team is here and ready to help.
          </motion.p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#fbf9f4] to-transparent pointer-events-none" />
      </section>

      {/* ── Contact Info Cards ── */}
      <section className="bg-[#FAF9F5] border-b border-border/40 relative z-10">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-8 sm:py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {contactInfo.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={i}
                  custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: false, margin: '-10%' }}
                  className="group bg-white border border-border/60 rounded-2xl p-5 sm:p-6 flex items-start gap-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-400"
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/8 flex items-center justify-center text-accent shrink-0 group-hover:bg-accent group-hover:text-white transition-all duration-300">
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground mb-0.5">{item.label}</p>
                    <p className="font-headings font-bold text-primary text-sm sm:text-base">{item.value}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{item.sub}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Main Form + Sidebar ── */}
      <section className="bg-background relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl opacity-50" />
          <div className="absolute bottom-1/4 left-0 w-72 h-72 bg-primary/4 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-14 sm:py-16 md:py-20 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-8 sm:gap-10 lg:gap-14 items-start">

            {/* Form */}
            <motion.div
              initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-4">
                <Sparkles size={11} />
                <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">Send a Message</span>
              </div>
              <h2 className="font-headings text-3xl sm:text-4xl font-bold text-primary tracking-tight leading-tight mb-2">
                Drop us a line,
              </h2>
              <p className="font-headings text-3xl sm:text-4xl font-light italic text-primary/60 tracking-tight leading-tight mb-7 sm:mb-8">
                we'll get back to you.
              </p>

              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
                  className="bg-accent/8 border border-accent/20 rounded-2xl p-8 sm:p-10 flex flex-col items-center text-center gap-4"
                >
                  <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-accent" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-headings text-xl sm:text-2xl font-bold text-primary mb-2">Message Sent!</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      Thanks for reaching out, <span className="font-semibold text-primary">{form.name}</span>. We'll reply to <span className="font-semibold text-primary">{form.email}</span> within 24 hours.
                    </p>
                  </div>
                  <button
                    onClick={() => { setSubmitted(false); setForm({ name: '', email: '', subject: '', message: '' }); }}
                    className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent hover:text-primary transition-colors border-b border-accent/40 hover:border-primary/40 pb-0.5"
                  >
                    Send another message
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  {/* Reason selector */}
                  <div>
                    <label className="block text-xs font-semibold text-primary/70 uppercase tracking-[0.14em] mb-3">What's this about?</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {contactReasons.map((r, i) => {
                        const Icon = r.icon;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelected(i)}
                            className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left transition-all duration-200 ${
                              selected === i
                                ? 'border-accent bg-accent/8 text-accent'
                                : 'border-border/60 bg-white text-muted-foreground hover:border-accent/40 hover:bg-accent/4'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                            <div className="min-w-0">
                              <p className={`text-[11px] sm:text-xs font-bold leading-tight ${selected === i ? 'text-accent' : 'text-primary'}`}>{r.label}</p>
                              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate hidden sm:block">{r.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Name + Email row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { id: 'name', label: 'Your Name', type: 'text', placeholder: 'e.g. Sarah Ahmed' },
                      { id: 'email', label: 'Email Address', type: 'email', placeholder: 'you@example.com' },
                    ].map((field) => (
                      <div key={field.id}>
                        <label className="block text-xs font-semibold text-primary/70 uppercase tracking-[0.14em] mb-2">{field.label}</label>
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={form[field.id as keyof typeof form]}
                          onChange={(e) => setForm({ ...form, [field.id]: e.target.value })}
                          onFocus={() => setFocused(field.id)}
                          onBlur={() => setFocused(null)}
                          className={`w-full px-4 py-3 sm:py-3.5 bg-input border rounded-xl outline-none text-sm text-primary placeholder:text-muted-foreground/60 transition-all duration-200 ${
                            focused === field.id ? 'border-accent shadow-[0_0_0_3px_rgba(46,77,58,0.08)]' : 'border-border hover:border-border/80'
                          }`}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-semibold text-primary/70 uppercase tracking-[0.14em] mb-2">Subject</label>
                    <input
                      type="text"
                      placeholder="Brief subject line"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      onFocus={() => setFocused('subject')}
                      onBlur={() => setFocused(null)}
                      className={`w-full px-4 py-3 sm:py-3.5 bg-input border rounded-xl outline-none text-sm text-primary placeholder:text-muted-foreground/60 transition-all duration-200 ${
                        focused === 'subject' ? 'border-accent shadow-[0_0_0_3px_rgba(46,77,58,0.08)]' : 'border-border hover:border-border/80'
                      }`}
                    />
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-xs font-semibold text-primary/70 uppercase tracking-[0.14em] mb-2">Message</label>
                    <textarea
                      rows={5}
                      placeholder="Tell us what's on your mind..."
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      onFocus={() => setFocused('message')}
                      onBlur={() => setFocused(null)}
                      className={`w-full px-4 py-3 sm:py-3.5 bg-input border rounded-xl outline-none text-sm text-primary placeholder:text-muted-foreground/60 resize-none transition-all duration-200 ${
                        focused === 'message' ? 'border-accent shadow-[0_0_0_3px_rgba(46,77,58,0.08)]' : 'border-border hover:border-border/80'
                      }`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full sm:w-auto self-start px-8 py-3.5 bg-primary text-primary-foreground text-xs uppercase tracking-[0.18em] font-semibold hover:bg-primary/90 transition-all duration-300 rounded-full flex items-center gap-2.5 hover:-translate-y-0.5 shadow-md hover:shadow-lg"
                  >
                    <Send size={13} />
                    Send Message
                  </button>
                </form>
              )}
            </motion.div>

            {/* Sidebar */}
            <motion.div
              initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-100px' }} transition={{ duration: 0.6, delay: 0.15 }}
              className="flex flex-col gap-5"
            >
              {/* Response time card */}
              <div className="bg-accent rounded-2xl p-6 sm:p-7 text-accent-foreground relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none">
                  <div className="bg-no-repeat w-full h-full"
                    style={{ backgroundImage: 'url("https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fe990e254-554b-48ad-bb2d-626d12a0ed9d?alt=media&token=c1c20cfa-7e92-4db2-bbc9-10de0b3f81b6")', backgroundPosition: '69.5% 70%', backgroundSize: '1000% 500%' }} />
                </div>
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-4">
                    <Clock className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-headings text-lg sm:text-xl font-bold text-white mb-2">Fast Response</h3>
                  <p className="text-accent-foreground/80 text-[13px] sm:text-sm leading-relaxed">
                    Our support team typically responds within <span className="text-white font-semibold">24 hours</span> on business days. For urgent issues, mention it in your subject line.
                  </p>
                </div>
              </div>

              {/* Social links */}
              <div className="bg-white border border-border/60 rounded-2xl p-6 sm:p-7">
                <h3 className="font-headings text-base sm:text-lg font-bold text-primary mb-1.5">Follow Us</h3>
                <p className="text-[12px] sm:text-[13px] text-muted-foreground mb-5 leading-relaxed">Stay updated with the latest swaps, tips, and community highlights.</p>
                <div className="flex flex-col gap-3">
                  {socials.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <a
                        key={i}
                        href={s.href}
                        className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 hover:border-accent/40 hover:bg-accent/4 transition-all duration-200"
                      >
                        <div className="w-8 h-8 rounded-lg bg-accent/8 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                          <Icon className="w-4 h-4" strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-primary group-hover:text-accent transition-colors">{s.label}</p>
                          <p className="text-[11px] text-muted-foreground">{s.handle}</p>
                        </div>
                        <ArrowRight size={13} className="text-muted-foreground group-hover:text-accent -rotate-45 group-hover:rotate-0 transition-all duration-300" />
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* FAQ nudge */}
              <div className="bg-[#FAF9F5] border border-border/60 rounded-2xl p-6 sm:p-7 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-accent/8 flex items-center justify-center text-accent shrink-0">
                  <HelpCircle className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-headings text-sm sm:text-base font-bold text-primary mb-1">Looking for quick answers?</h3>
                  <p className="text-[12px] sm:text-[13px] text-muted-foreground leading-relaxed mb-3">Check our How It Works page — most common questions are answered there.</p>
                  <a href="/how-it-works" className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent hover:text-primary transition-colors border-b border-accent/40 hover:border-primary/40 pb-0.5">
                    View FAQ <ArrowRight size={11} />
                  </a>
                </div>
              </div>
            </motion.div>
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
              Not ready to message yet?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.5, delay: 0.1 }}
              className="text-accent-foreground/85 text-[13px] sm:text-sm md:text-base max-w-sm sm:max-w-md mb-6 sm:mb-7 leading-relaxed font-medium"
            >
              Explore the platform, browse thousands of items, and join a community that's changing the way the world wears fashion.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center gap-3"
            >
              <a href="/signup" className="px-7 py-3.5 bg-white text-accent font-bold rounded-full text-xs sm:text-sm flex items-center gap-2 shadow-[0_6px_24px_rgba(255,255,255,0.18)] hover:shadow-[0_8px_30px_rgba(255,255,255,0.28)] hover:-translate-y-0.5 transform duration-300 transition-all">
                <span>Join ReWearX</span>
                <ArrowRight size={14} />
              </a>
              <a href="/browse" className="px-7 py-3.5 bg-white/10 border border-white/30 text-white font-semibold rounded-full text-xs sm:text-sm hover:bg-white/20 transition-all duration-300 backdrop-blur-sm">
                Browse Items
              </a>
            </motion.div>
          </div>
        </div>
      </section>

    </div>
  );
}
