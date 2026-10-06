import { useState } from 'react';
import { useLocation } from 'wouter';
import { Mail, Lock, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

export default function Login() {
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      toast('Welcome back, admin.', 'success');
      setLocation('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-primary font-body p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-surface rounded-3xl shadow-xl border border-border p-8 sm:p-10"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-2xl bg-primary text-white flex items-center justify-center">
            <RefreshCw size={18} />
          </div>
          <div>
            <p className="font-headings text-2xl font-black leading-none">ReWearX</p>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-bold mt-1">
              Admin Console
            </p>
          </div>
        </div>

        <h1 className="font-headings text-2xl sm:text-3xl font-bold text-primary leading-tight">
          Sign in to admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Use your admin account credentials to continue.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-primary/70 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail size={15} className="absolute top-1/2 -translate-y-1/2 left-4 text-primary/40" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@rewearx.com"
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-primary/70 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={15} className="absolute top-1/2 -translate-y-1/2 left-4 text-primary/40" />
              <input
                type={showPw ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full pl-11 pr-16 py-3 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute top-1/2 -translate-y-1/2 right-3 text-[10px] uppercase tracking-wider font-bold text-primary/60 hover:text-primary"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-100 rounded-lg p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-primary text-white font-bold uppercase tracking-wider text-xs shadow-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Signing in
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-muted-foreground text-center">
          Trouble signing in? Contact platform owner.
        </p>
      </motion.div>
    </div>
  );
}
