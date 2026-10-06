import { useState, FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Eye, EyeOff, Loader2, ArrowLeft, Mail, KeyRound, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../contexts/ToastContext';
import { ApiError } from '../lib/api/client';
import { authApi } from '../lib/api/auth';

export default function ForgotPassword() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      toast('If registered, an OTP has been sent to your email.', 'success');
      setStep(2);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to request password reset.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authApi.verifyResetOtp(email, otp);
      setResetToken(res.resetToken);
      toast('OTP verified. You can now create a new password.', 'success');
      setStep(3);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to verify OTP.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError('Please enter a new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword(resetToken, password);
      toast('Password reset successfully! You can now sign in.', 'success');
      navigate('/login');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to reset password.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] py-8 sm:py-12 flex items-center justify-center bg-background">
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 md:px-8 grid lg:grid-cols-2 gap-10 lg:gap-20 xl:gap-24 items-center">

        {/* Form Column */}
        <div className="w-full max-w-md mx-auto lg:mx-0 overflow-hidden relative min-h-[450px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            
            {/* STEP 1: Email */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <Link href="/login" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-primary transition-colors mb-6 group">
                  <ArrowLeft size={16} className="mr-2 group-hover:-translate-x-1 transition-transform" />
                  Back to Login
                </Link>
                
                <div className="mb-8 sm:mb-10 text-center lg:text-left">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-5 mx-auto lg:mx-0 text-primary">
                    <KeyRound size={24} />
                  </div>
                  <h1 className="font-headings text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-primary to-primary/70 mb-3 sm:mb-4 leading-tight">
                    Forgot Password?
                  </h1>
                  <p className="text-muted-foreground font-medium text-sm sm:text-base">
                    No worries, we'll send you an OTP to reset it.
                  </p>
                </div>

                <form className="space-y-5 sm:space-y-6" onSubmit={handleEmailSubmit} noValidate>
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
                        <span>Sending…</span>
                      </>
                    ) : (
                      <>
                        <span>Send OTP</span>
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 2: OTP Verification */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <button 
                  onClick={() => setStep(1)}
                  className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-primary transition-colors mb-6 group"
                >
                  <ArrowLeft size={16} className="mr-2 group-hover:-translate-x-1 transition-transform" />
                  Change Email
                </button>
                
                <div className="mb-8 sm:mb-10 text-center lg:text-left">
                  <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center mb-5 mx-auto lg:mx-0 text-accent">
                    <Mail size={24} />
                  </div>
                  <h1 className="font-headings text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-primary to-primary/70 mb-3 sm:mb-4 leading-tight">
                    Check your email
                  </h1>
                  <p className="text-muted-foreground font-medium text-sm sm:text-base">
                    We've sent a 6-digit OTP to <strong className="text-primary">{email}</strong>.
                  </p>
                </div>

                <form className="space-y-5 sm:space-y-6" onSubmit={handleOtpSubmit} noValidate>
                  <div className="space-y-2">
                    <label className="text-[11px] sm:text-sm font-bold uppercase tracking-wider text-primary/80" htmlFor="otp">
                      Verification Code (OTP)
                    </label>
                    <input
                      id="otp"
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      autoComplete="one-time-code"
                      className="w-full px-4 sm:px-5 py-3.5 sm:py-4 bg-muted/20 border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/50 text-center tracking-[0.5em] text-lg sm:text-xl font-bold"
                    />
                  </div>

                  {error && (
                    <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || otp.length !== 6}
                    className="w-full group mt-6 sm:mt-8 bg-primary hover:bg-primary/95 text-white py-3.5 sm:py-4 rounded-xl font-bold uppercase tracking-widest text-xs sm:text-sm transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Verifying…</span>
                      </>
                    ) : (
                      <>
                        <span>Verify OTP</span>
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                  
                  <div className="text-center mt-6">
                    <button 
                      type="button" 
                      onClick={handleEmailSubmit}
                      disabled={submitting}
                      className="text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
                    >
                      Resend OTP
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* STEP 3: New Password */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <div className="mb-8 sm:mb-10 text-center lg:text-left">
                  <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center mb-5 mx-auto lg:mx-0 text-green-600">
                    <CheckCircle2 size={24} />
                  </div>
                  <h1 className="font-headings text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-primary to-primary/70 mb-3 sm:mb-4 leading-tight">
                    Set New Password
                  </h1>
                  <p className="text-muted-foreground font-medium text-sm sm:text-base">
                    OTP verified successfully. Please enter your new password below.
                  </p>
                </div>

                <form className="space-y-5 sm:space-y-6" onSubmit={handlePasswordSubmit} noValidate>
                  <div className="space-y-2">
                    <label className="text-[11px] sm:text-sm font-bold uppercase tracking-wider text-primary/80" htmlFor="password">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
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

                  <div className="space-y-2">
                    <label className="text-[11px] sm:text-sm font-bold uppercase tracking-wider text-primary/80" htmlFor="confirmPassword">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="w-full pl-4 sm:pl-5 pr-12 py-3.5 sm:py-4 bg-muted/20 border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/50 tracking-widest text-sm sm:text-base"
                      />
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
                        <span>Updating…</span>
                      </>
                    ) : (
                      <>
                        <span>Reset Password</span>
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Editorial Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          className="hidden lg:block relative h-[600px] w-full rounded-3xl overflow-hidden shadow-2xl"
        >
          <img
            src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1600"
            alt="Editorial fashion"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent flex flex-col justify-end p-10 xl:p-12">
            <h2 className="text-white font-headings text-2xl xl:text-3xl font-bold mb-3 drop-shadow-md leading-tight">
              "Your style journey awaits. Let's get you back in."
            </h2>
            <p className="text-white/80 font-medium text-sm">— The ReWearX Vision</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
