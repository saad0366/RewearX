import { Link } from 'wouter';
import { motion } from 'motion/react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <p className="font-headings font-black text-[80px] sm:text-[120px] leading-none text-primary tracking-tighter">
          4<span className="text-accent">0</span>4
        </p>
        <h1 className="font-headings text-xl sm:text-2xl font-bold text-primary mt-2">
          Page not found
        </h1>
        <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
          We searched every closet — this piece isn't here. The link might have
          changed, or the page was retired.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mt-6 justify-center">
          <Link href="/">
            <button className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold uppercase tracking-wider text-xs hover:bg-primary/90 shadow-md">
              Go home
            </button>
          </Link>
          <Link href="/browse">
            <button className="px-5 py-2.5 rounded-lg border border-border/60 text-primary font-bold uppercase tracking-wider text-xs hover:bg-muted/40">
              Browse pieces
            </button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
