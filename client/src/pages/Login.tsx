import { useState, FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiError } from '../lib/api/client';
import { startGoogleLogin } from '../lib/googleLogin';

export default function Login() {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Please enter email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await signIn(email, password);
      toast(`Welcome back, ${user.name.split(' ')[0]}!`, 'success');
      navigate('/browse');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Login failed.';
      setError(message);
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] py-8 sm:py-12 flex items-center justify-center bg-background">
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 md:px-8 grid lg:grid-cols-2 gap-10 lg:gap-20 xl:gap-24 items-center">

        {/* Form Column */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-md mx-auto lg:mx-0"
        >
          <div className="mb-8 sm:mb-10 text-center lg:text-left">
            <h1 className="font-headings text-3xl sm:text-4xl lg:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-primary to-primary/70 mb-3 sm:mb-4 leading-tight">
              Welcome back.
            </h1>
            <p className="text-muted-foreground font-medium text-sm sm:text-base">
              Log in to continue your sustainable style journey.
            </p>
          </div>

          <form className="space-y-5 sm:space-y-6" onSubmit={onSubmit} noValidate>
            <div className="space-y-2">
              <label className="text-[11px] sm:text-sm font-bold uppercase tracking-wider text-primary/80" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-4 sm:px-5 py-3.5 sm:py-4 bg-muted/20 border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/50 text-sm sm:text-base"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center gap-3">
                <label className="text-[11px] sm:text-sm font-bold uppercase tracking-wider text-primary/80" htmlFor="password">
                  Password
                </label>
                <Link href="/forgot-password" className="text-[11px] sm:text-xs font-semibold text-accent hover:text-accent/80 transition-colors">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-4 sm:pl-5 pr-12 py-3.5 sm:py-4 bg-muted/20 border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/50 tracking-widest text-sm sm:text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full group mt-6 sm:mt-8 bg-primary hover:bg-primary/95 text-white py-3.5 sm:py-4 rounded-xl font-bold uppercase tracking-widest text-xs sm:text-sm transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-7 sm:mt-8 flex items-center">
            <div className="flex-grow border-t border-border/60" />
            <span className="mx-3 sm:mx-4 text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground">Or</span>
            <div className="flex-grow border-t border-border/60" />
          </div>

          <button
            type="button"
            onClick={() => startGoogleLogin().catch(() => setError('Unable to start Google sign-in. Please try again.'))}
            className="w-full mt-6 sm:mt-8 bg-background border border-border/60 hover:bg-muted/30 text-primary py-3.5 sm:py-4 rounded-xl font-bold uppercase tracking-widest text-xs sm:text-sm transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-3"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="mt-8 sm:mt-10 text-center">
            <p className="text-muted-foreground text-sm font-medium">
              Don't have an account?{' '}
              <Link href="/signup" className="text-primary font-bold hover:underline underline-offset-4 decoration-accent decoration-2">
                Join the community
              </Link>
            </p>
          </div>
        </motion.div>

        {/* Editorial Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          className="hidden lg:block relative h-[600px] w-full rounded-3xl overflow-hidden shadow-2xl"
        >
          <img
            src="https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=1600"
            alt="Editorial fashion"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent flex flex-col justify-end p-10 xl:p-12">
            <h2 className="text-white font-headings text-2xl xl:text-3xl font-bold mb-3 drop-shadow-md leading-tight">
              "Building a wardrobe you love shouldn't cost the earth."
            </h2>
            <p className="text-white/80 font-medium text-sm">— The ReWearX Vision</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
