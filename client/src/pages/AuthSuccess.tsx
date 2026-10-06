import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { tokenStore } from '../lib/api/client';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { reconnectWithToken } from '../lib/socket';
import { completeGoogleLogin } from '../lib/googleLogin';

export default function AuthSuccess() {
  const [, navigate] = useLocation();
  const { refresh } = useAuth();

  useEffect(() => {
    let cancelled = false;
    completeGoogleLogin().then(async data => {
      if (cancelled) return;
      tokenStore.set(data.accessToken, data.refreshToken);
      reconnectWithToken();
      const user = await refresh();
      if (!user) throw new Error('Authentication failed.');
      if (!cancelled) navigate('/browse');
    }).catch(() => {
      if (!cancelled) navigate('/login?error=Authentication%20failed');
    });
    return () => { cancelled = true; };
  }, [navigate, refresh]);

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center">
      <Loader2 size={40} className="animate-spin text-primary mb-4" />
      <h2 className="text-xl font-bold font-headings text-primary">Completing sign in...</h2>
      <p className="text-muted-foreground mt-2">Please wait while we set up your session.</p>
    </div>
  );
}
