import { ArrowRight, Sparkles, Camera, Search, Repeat, Leaf } from 'lucide-react';
import { motion } from 'motion/react';

export default function ProcessSection() {
  const steps = [
    { num: '01', title: 'List Your Items', desc: 'Add photos of pieces you want to swap.', icon: Camera },
    { num: '02', title: 'Find a Match', desc: 'Discover items you love and send a request.', icon: Search },
    { num: '03', title: 'Ship & Swap', desc: 'Exchange directly with your matched peer.', icon: Repeat },
    { num: '04', title: 'Refresh Your Style', desc: 'New pre-loved pieces arrive at your door.', icon: Leaf },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
  };

  const stepVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
  };

  return (
    <section className="bg-[#FAF9F5] relative overflow-hidden border-y border-border/20">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl">
          <div className="absolute top-1/4 left-0 w-48 sm:w-64 md:w-80 h-48 sm:h-64 md:h-80 bg-accent/5 rounded-full blur-3xl opacity-50 mix-blend-multiply" />
          <div className="absolute bottom-1/4 right-0 w-48 sm:w-64 md:w-80 h-48 sm:h-64 md:h-80 bg-primary/5 rounded-full blur-3xl opacity-50 mix-blend-multiply" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 lg:px-12 py-10 sm:py-12 md:py-14 lg:py-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-xl mx-auto mb-8 sm:mb-10 md:mb-12"
        >
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent mb-3 sm:mb-4">
            <Sparkles size={11} className="sm:w-3 sm:h-3" />
            <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em]">The Process</span>
          </div>
          <h2 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold text-primary tracking-tight leading-tight">
            How ReWearX Works
          </h2>
          <p className="text-[13px] sm:text-sm md:text-base text-muted-foreground mt-2.5 sm:mt-3 md:mt-4 leading-relaxed max-w-md mx-auto">
            Four simple steps to refresh your style sustainably.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7 sm:gap-6 md:gap-8 lg:gap-4 relative"
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                variants={stepVariants}
                key={index}
                className="relative z-10 flex flex-col items-center w-full"
              >
                <div className="flex flex-col items-center text-center font-body relative group w-full px-2 sm:px-4">
                  <span className="absolute -top-3 sm:-top-5 md:-top-7 lg:-top-8 left-1/2 -translate-x-1/2 font-headings text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black text-primary/5 tracking-tighter select-none transition-transform duration-700 group-hover:scale-110 group-hover:text-accent/5">
                    {step.num}
                  </span>

                  <motion.div
                    whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                    className="mb-3 sm:mb-4 md:mb-5 mt-1 sm:mt-2 md:mt-3 relative z-10 text-primary/80 group-hover:text-accent transition-colors duration-300"
                  >
                    <Icon strokeWidth={1.5} className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9" />
                  </motion.div>

                  <h4 className="font-headings text-base sm:text-lg font-bold text-primary mb-1.5 sm:mb-2 relative z-10 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-accent transition-all duration-300">
                    {step.title}
                  </h4>

                  <p className="text-[13px] sm:text-sm text-muted-foreground font-medium leading-relaxed relative z-10 max-w-[220px] mx-auto">
                    {step.desc}
                  </p>
                </div>

                {/* Connector — only show on lg+ between steps */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-[48px] -right-[12%] w-[24%] items-center justify-center z-0 pointer-events-none">
                    <div className="w-full h-[2px] bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 relative">
                      <ArrowRight size={14} className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-primary/30" />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
