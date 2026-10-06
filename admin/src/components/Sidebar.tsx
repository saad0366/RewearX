import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  BarChart3,
  RefreshCw,
  LogOut,
  Image,
  FolderTree,
  Scale,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { adminApi } from '../lib/api/admin';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/reports', label: 'Reports', icon: ShieldAlert },
  { href: '/disputes', label: 'Disputes Tribunal', icon: Scale },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/categories', label: 'Categories', icon: FolderTree },
  { href: '/hero-section', label: 'Hero Section', icon: Image },
];

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200';

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      adminApi
        .stats()
        .then((s) => mounted && setPendingCount(s.reports.pending))
        .catch(() => undefined);
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setLocation('/login');
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-primary text-primary-foreground border-r border-black/30">
      <div className="px-6 py-6 border-b border-white/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
          <RefreshCw size={16} />
        </div>
        <div>
          <p className="font-headings text-lg font-black">ReWearX</p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/50 font-bold">
            Admin Console
          </p>
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all text-sm font-bold ${
                  active
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={16} />
                <span className="flex-1">{item.label}</span>
                {item.href === '/reports' && pendingCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">
                    {pendingCount}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4 space-y-1">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:bg-white/10 hover:text-white cursor-pointer text-sm font-bold"
        >
          <LogOut size={16} />
          Sign out
        </button>
        {user && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-white/5 flex items-center gap-3">
            <img
              src={user.avatarUrl || FALLBACK_AVATAR}
              alt={user.name}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-accent/30"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{user.name}</p>
              <p className="text-[10px] text-white/50 uppercase tracking-wider font-bold">
                Admin · {user.email.split('@')[0]}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
