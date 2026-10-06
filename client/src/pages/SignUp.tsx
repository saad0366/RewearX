import { useState, FormEvent, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Eye, EyeOff, Loader2, MailCheck, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiError } from '../lib/api/client';
import { authApi } from '../lib/api/auth';

export default function SignUp() {
  const { signUp, refresh } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [registeredName, setRegisteredName] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const passwordMismatch = confirmTouched && password !== confirmPassword;
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('female');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP state — 6 individual digit inputs
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!name || !email || !password) {
      setError('Please complete all fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setConfirmTouched(true);
    if(password !== confirmPassword){setError('Passwords do not match.');return;}
    setSubmitting(true);
    try {
      await signUp({ name, email, password, gender });
      setRegisteredEmail(email);
      setRegisteredName(firstName.trim());
      setStep('otp');
      toast('Check your email for a 6-digit code.', 'info');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Sign up failed.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
  };

  const verifyOtp = async () => {
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter the full 6-digit code.'); return; }
    setError(null);
    setOtpVerifying(true);
    try {
      await authApi.verifyOtp(registeredEmail, code);
      await refresh();
      toast(`Welcome to ReWearX, ${registeredName}!`, 'success');
      navigate('/browse');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Verification failed.';
      setError(message);
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setOtpVerifying(false);
    }
  };

  const resendOtp = async () => {
    setResending(true);
    try {
      await authApi.resendOtp(registeredEmail);
      toast('New code sent to your email.', 'success');
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((c) => {
          if (c <= 1) { clearInterval(interval); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not resend code.';
      toast(message, 'error');
    } finally {
      setResending(false);
    }
  };

  const inputClass =
    'w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-muted/20 border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/50 text-sm sm:text-base';
  const labelClass = 'text-[11px] sm:text-sm font-bold uppercase tracking-wider text-primary/80';

  return (
    <div className="min-h-[calc(100vh-120px)] py-8 sm:py-12 flex items-center justify-center bg-background">
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 md:px-8 grid lg:grid-cols-2 gap-10 lg:gap-20 xl:gap-24 items-center">

        {/* Form Column */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-md mx-auto lg:mx-0 lg:order-2"
        >
          <AnimatePresence mode="wait">

            {/* ── STEP 1: Registration Form ── */}
            {step === 'form' && (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
              >
                <div className="mb-7 sm:mb-8 text-center lg:text-left">
                  <h1 className="font-headings text-3xl sm:text-4xl lg:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-primary to-primary/70 mb-3 sm:mb-4 leading-tight">
                    Join the movement.
                  </h1>
                  <p className="text-muted-foreground font-medium text-sm sm:text-base">
                    Create your account to start swapping premium pieces.
                  </p>
                </div>

                <form className="space-y-4 sm:space-y-5" onSubmit={onSubmit} noValidate>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={labelClass} htmlFor="firstName">First Name</label>
                      <input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" className={inputClass} />
                    </div>
                    <div className="space-y-2">
                      <label className={labelClass} htmlFor="lastName">Last Name</label>
                      <input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" autoComplete="family-name" className={inputClass} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass} htmlFor="email">Email Address</label>
                    <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="demo@example.com" autoComplete="email" className={inputClass} />
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass} htmlFor="gender">Gender</label>
                    <select id="gender" value={gender} onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')} className={inputClass}>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other / Prefer not to say</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass} htmlFor="password">Password</label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 8 characters with letters & digits"
                        autoComplete="new-password"
                        className={`${inputClass} pr-12`}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary transition-colors" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass} htmlFor="confirmPassword">Confirm Password</label>
                    <input id="confirmPassword" type={showPassword?'text':'password'} value={confirmPassword} onChange={e=>{setConfirmPassword(e.target.value);setConfirmTouched(true);}} onBlur={()=>setConfirmTouched(true)} autoComplete="new-password" placeholder="Re-enter your password" aria-invalid={passwordMismatch} aria-describedby={passwordMismatch?'confirmPasswordError':undefined} className={inputClass} />
                    {passwordMismatch && <p id="confirmPasswordError" role="alert" className="text-sm font-semibold text-red-700 dark:text-red-200">Passwords do not match.</p>}
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2.5 text-xs font-semibold text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 backdrop-blur-sm rounded-xl px-4 py-3"
                    >
                      <span className="mt-0.5 shrink-0">⚠</span>
                      <span>{error}</span>
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full group mt-5 sm:mt-6 bg-primary hover:bg-primary/95 text-white py-3.5 sm:py-4 rounded-xl font-bold uppercase tracking-widest text-xs sm:text-sm transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {submitting
                      ? (<><Loader2 size={16} className="animate-spin" /><span>Creating account…</span></>)
                      : (<><span>Create Account</span><ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /></>)}
                  </button>
                </form>

                <div className="mt-6 sm:mt-8 text-center text-xs sm:text-sm font-medium text-muted-foreground leading-relaxed px-2">
                  By joining, you agree to our <a href="#" className="underline hover:text-primary">Terms of Service</a> and{' '}
                  <a href="#" className="underline hover:text-primary">Privacy Policy</a>
                </div>
                <div className="mt-6 sm:mt-8 text-center border-t border-border/60 pt-6 sm:pt-8">
                  <p className="text-muted-foreground text-sm font-medium">
                    Already have an account?{' '}
                    <Link href="/login" className="text-primary font-bold hover:underline underline-offset-4 decoration-accent decoration-2">Log in</Link>
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: OTP Verification ── */}
            {step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
              >
                <div className="mb-8 text-center lg:text-left">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-5">
                    <MailCheck size={28} className="text-primary" />
                  </div>
                  <h1 className="font-headings text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-primary to-primary/70 mb-3 leading-tight">
                    Check your email.
                  </h1>
                  <p className="text-muted-foreground font-medium text-sm sm:text-base">
                    We sent a 6-digit code to{' '}
                    <span className="text-primary font-semibold">{registeredEmail}</span>.
                    It expires in 10 minutes.
                  </p>
                </div>

                <div className="space-y-6">
                  {/* OTP digit inputs */}
                  <div className="flex gap-2 sm:gap-3 justify-center" onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        className="w-12 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-bold bg-muted/20 border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 caret-transparent"
                      />
                    ))}
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2.5 text-xs font-semibold text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 backdrop-blur-sm rounded-xl px-4 py-3"
                    >
                      <span className="mt-0.5 shrink-0">⚠</span>
                      <span>{error}</span>
                    </motion.div>
                  )}

                  <button
                    onClick={verifyOtp}
                    disabled={otpVerifying || otp.join('').length !== 6}
                    className="w-full group bg-primary hover:bg-primary/95 text-white py-3.5 sm:py-4 rounded-xl font-bold uppercase tracking-widest text-xs sm:text-sm transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {otpVerifying
                      ? (<><Loader2 size={16} className="animate-spin" /><span>Verifying…</span></>)
                      : (<><span>Verify & Continue</span><ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /></>)}
                  </button>

                  <p className="text-center text-sm text-muted-foreground">
                    Didn't get the code?{' '}
                    <button
                      onClick={resendOtp}
                      disabled={resending || resendCooldown > 0}
                      className="text-primary font-semibold hover:underline underline-offset-4 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      {resending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

        {/* Editorial Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          className="hidden lg:block relative h-[650px] w-full rounded-3xl overflow-hidden shadow-2xl lg:order-1"
        >
          <img
            src="https://images.unsplash.com/photo-1512413912196-18967b5e94b0?auto=format&fit=crop&q=80&w=1600"
            alt="Editorial fashion lifestyle"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-transparent flex flex-col justify-end p-10 xl:p-12">
            <span className="w-12 h-1 bg-accent mb-5 rounded-full inline-block" />
            <h2 className="text-white font-headings text-3xl xl:text-4xl font-bold mb-4 drop-shadow-md leading-tight">
              Refresh your style.<br />Without the waste.
            </h2>
            <ul className="text-white/90 space-y-2 mt-4 font-medium flex flex-col gap-2 text-sm xl:text-base">
              <li className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Access thousands of premium pieces</li>
              <li className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Connect with verified fashion lovers</li>
              <li className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Contribute to circular sustainability</li>
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
