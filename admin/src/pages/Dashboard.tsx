import { Link, useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import {
  Users as UsersIcon,
  Package,
  Repeat,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { motion } from 'motion/react';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { adminApi } from '../lib/api/admin';
import { adaptReport, adaptItem, adaptUser } from '../lib/api/types';
import type { ApiStats } from '../lib/api/types';
import type { AdminReport, AdminUser, AdminItem } from '../lib/mockData';

interface StatDef {
  key: 'totalUsers' | 'activeListings' | 'swaps' | 'pendingReports';
  label: string;
  icon: typeof UsersIcon;
  color: string;
}

const STAT_DEFS: StatDef[] = [
  { key: 'totalUsers', label: 'Total Users', icon: UsersIcon, color: 'bg-accent/10 text-accent' },
  { key: 'activeListings', label: 'Active Listings', icon: Package, color: 'bg-sky-100 text-sky-700' },
  { key: 'swaps', label: 'Swaps Completed', icon: Repeat, color: 'bg-amber-100 text-amber-700' },
  { key: 'pendingReports', label: 'Pending Reports', icon: ShieldAlert, color: 'bg-red-100 text-red-700' },
];

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [stats, setStats] = useState<ApiStats | null>(null);
  const [recentReports, setRecentReports] = useState<AdminReport[]>([]);
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const [recentItems, setRecentItems] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, r, u, i] = await Promise.all([
        adminApi.stats(),
        adminApi.reports({ limit: 5 }),
        adminApi.users({ limit: 5 }),
        adminApi.items({ limit: 4, available: true }),
      ]);
      setStats(s);
      setRecentReports(r.items.map(adaptReport));
      setRecentUsers(u.items.map(adaptUser));
      setRecentItems(i.items.map(adaptItem));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveReport = async (id: string) => {
    try {
      await adminApi.updateReport(id, { status: 'resolved' });
      toast('Report resolved.', 'success');
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to resolve report.', 'error');
    }
  };

  const toggleUser = async (u: AdminUser) => {
    const next = u.status === 'active' ? 'blocked' : 'active';
    try {
      await adminApi.setUserStatus(u.id, next);
      toast(`${next === 'blocked' ? 'Blocked' : 'Unblocked'} ${u.name}.`, 'success');
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update user.', 'error');
    }
  };

  const kpiValues = stats
    ? {
        totalUsers: { value: stats.users.total, trend: stats.users.newThisWeek },
        activeListings: { value: stats.items.available, trend: 0 },
        swaps: { value: stats.swaps.completed, trend: 0 },
        pendingReports: { value: stats.reports.pending, trend: 0 },
      }
    : null;

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {STAT_DEFS.map((def, i) => {
          const data = kpiValues?.[def.key] || { value: 0, trend: 0 };
          const Icon = def.icon;
          const positive = data.trend >= 0;
          return (
            <motion.div
              key={def.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.35 }}
              className="bg-surface rounded-2xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${def.color}`}>
                  <Icon size={18} />
                </div>
                {data.trend !== 0 && (
                  <span
                    className={`text-[11px] font-bold flex items-center gap-1 ${
                      positive ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {def.key === 'totalUsers' ? `+${data.trend} this wk` : `${Math.abs(data.trend)}%`}
                  </span>
                )}
              </div>
              <p className="font-headings text-3xl sm:text-4xl font-bold text-primary mt-4">
                {loading ? '—' : data.value.toLocaleString()}
              </p>
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mt-1">
                {def.label}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
        {[
          { label: 'Manage users', desc: 'Block, promote, audit', href: '/users', icon: UsersIcon },
          {
            label: 'Review reports',
            desc: `${stats?.reports.pending ?? 0} pending right now`,
            href: '/reports',
            icon: ShieldAlert,
          },
          { label: 'See analytics', desc: 'Growth, funnel & breakdowns', href: '/analytics', icon: TrendingUp },
        ].map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.href} href={q.href}>
              <div className="rounded-2xl border border-border bg-surface p-5 flex items-center gap-4 hover:border-accent hover:shadow-md transition-all cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-headings font-bold text-primary">{q.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{q.desc}</p>
                </div>
                <ArrowRight size={16} className="text-primary/40" />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent reports */}
        <Card
          title="Recent reports"
          action={
            <Link href="/reports">
              <span className="text-xs font-bold uppercase tracking-wider text-accent hover:underline cursor-pointer">
                View all →
              </span>
            </Link>
          }
        >
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={18} className="animate-spin text-primary/40" />
            </div>
          ) : recentReports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No reports yet.</p>
          ) : (
            <div className="space-y-3">
              {recentReports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-border/80 p-3 flex items-center gap-3"
                >
                  <img
                    src={r.reported.image}
                    alt={r.reported.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-primary truncate">{r.reported.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.reason} · reported by {r.reporter.name}
                    </p>
                  </div>
                  <StatusBadge variant={r.status}>{r.status}</StatusBadge>
                  {r.status === 'pending' && (
                    <button
                      onClick={() => resolveReport(r.id)}
                      className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-[10px] font-bold uppercase tracking-wider hover:bg-accent/90"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent users */}
        <Card
          title="Recent users"
          action={
            <Link href="/users">
              <span className="text-xs font-bold uppercase tracking-wider text-accent hover:underline cursor-pointer">
                View all →
              </span>
            </Link>
          }
        >
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={18} className="animate-spin text-primary/40" />
            </div>
          ) : recentUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No users yet.</p>
          ) : (
            <div className="space-y-3">
              {recentUsers.map((u) => (
                <div key={u.id} className="rounded-xl border border-border/80 p-3 flex items-center gap-3">
                  <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-primary truncate">{u.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <StatusBadge variant={u.status}>{u.status}</StatusBadge>
                  <button
                    onClick={() => toggleUser(u)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      u.status === 'active'
                        ? 'border border-red-200 text-red-600 hover:bg-red-50'
                        : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {u.status === 'active' ? 'Block' : 'Unblock'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Latest listings */}
      <Card title="Latest listings">
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 size={18} className="animate-spin text-primary/40" />
          </div>
        ) : recentItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No listings yet.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {recentItems.map((it) => (
              <div
                key={it.id}
                onClick={() => setLocation('/users')}
                className="rounded-xl overflow-hidden border border-border cursor-pointer hover:border-accent transition-colors"
              >
                <div className="aspect-square overflow-hidden bg-muted/40">
                  <img src={it.image} alt={it.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-3">
                  <p className="font-bold text-primary text-sm truncate">{it.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {it.user} · {it.category}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
