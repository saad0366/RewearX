import { Bell, Search, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { adminApi } from '../lib/api/admin';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/': { kicker: 'Overview', title: 'Dashboard' },
  '/users': { kicker: 'Community', title: 'Users' },
  '/reports': { kicker: 'Trust & safety', title: 'Reports' },
  '/analytics': { kicker: 'Insights', title: 'Analytics' },
};

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/users', label: 'Users' },
  { href: '/reports', label: 'Reports' },
  { href: '/analytics', label: 'Analytics' },
];

export default function TopBar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const meta = TITLES[location] || { kicker: 'Console', title: 'Admin' };

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      adminApi
        .stats()
        .then((s) => mounted && setPending(s.reports.pending))
        .catch(() => undefined);
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border px-6 py-4 lg:px-10 lg:py-5 flex items-center gap-4">
      <button
        onClick={() => setMobileOpen((o) => !o)}
        className="lg:hidden w-10 h-10 rounded-full border border-border flex items-center justify-center text-primary hover:bg-muted/40"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      <div className="flex-1 min-w-0">
        <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-accent">
          {meta.kicker}
        </span>
        <h1 className="font-headings text-2xl sm:text-3xl font-bold text-primary leading-tight">
          {meta.title}
        </h1>
      </div>

      <div className="hidden md:flex items-center bg-surface border border-border rounded-full px-4 py-2 w-64 focus-within:ring-2 focus-within:ring-primary/20">
        <Search size={15} className="text-primary/50 mr-2" />
        <input
          type="text"
          placeholder="Search users, items…"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-primary/40"
        />
      </div>

      <Link href="/reports">
        <button
          aria-label="Notifications"
          className="relative w-10 h-10 rounded-full border border-border bg-surface flex items-center justify-center text-primary hover:bg-muted/40"
        >
          <Bell size={16} />
          {pending > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {pending}
            </span>
          )}
        </button>
      </Link>

      {mobileOpen && (
        <div className="absolute top-full left-0 right-0 bg-surface border-b border-border shadow-lg flex flex-col py-2 lg:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}>
              <span
                onClick={() => setMobileOpen(false)}
                className={`block px-6 py-3 text-sm font-bold ${
                  location === n.href ? 'text-accent bg-accent/5' : 'text-primary'
                }`}
              >
                {n.label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
