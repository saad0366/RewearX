import { useEffect, useState, type ComponentType } from 'react';
import { useLocation } from 'wouter';
import {
  Bell,
  Repeat,
  MessageCircle,
  Star,
  Sparkles,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { Notification } from '../lib/mockData';
import EmptyState from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { notificationsApi } from '../lib/api';
import { adaptNotification } from '../lib/api/types';
import { getSocket } from '../lib/socket';

type FilterKey = 'all' | 'swap_request' | 'new_message' | 'review_received' | 'system';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'swap_request', label: 'Swaps' },
  { key: 'new_message', label: 'Messages' },
  { key: 'review_received', label: 'Reviews' },
  { key: 'system', label: 'System' },
];

const ICONS: Partial<Record<Notification['type'], { Icon: ComponentType<{ size?: number; className?: string }>; bg: string; fg: string }>> = {
  swap_request: { Icon: Repeat, bg: 'bg-amber-100', fg: 'text-amber-700' },
  swap_accepted: { Icon: Check, bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  swap_rejected: { Icon: X, bg: 'bg-red-100', fg: 'text-red-700' },
  swap_completed: { Icon: Sparkles, bg: 'bg-teal-100', fg: 'text-teal-700' },
  new_message: { Icon: MessageCircle, bg: 'bg-sky-100', fg: 'text-sky-700' },
  review_received: { Icon: Star, bg: 'bg-amber-100', fg: 'text-amber-700' },
  system: { Icon: Bell, bg: 'bg-muted/60', fg: 'text-primary' },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function navigateFor(n: Notification): string {
  switch (n.type) {
    case 'swap_request':
    case 'swap_accepted':
    case 'swap_rejected':
    case 'swap_completed':
      return n.refId ? `/swaps/${n.refId}` : '/profile?tab=history';
    case 'new_message':
      return n.refId ? `/chat/${n.refId}` : '/chat';
    case 'review_received':
      return '/profile';
    default:
      return '/browse';
  }
}

export default function Notifications() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/login');
      return;
    }
    let cancelled = false;
    setLoading(true);
    notificationsApi
      .list(1, 50)
      .then(({ items: list }) => {
        if (cancelled) return;
        setItems(list.map(adaptNotification));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        toast(err instanceof Error ? err.message : 'Failed to load notifications.', 'error');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setLocation, toast]);

  // Real-time push via Socket.IO
  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getSocket();
    const handler = (raw: Parameters<typeof adaptNotification>[0]) => {
      setItems((prev) => [adaptNotification(raw), ...prev]);
    };
    socket.on('notification', handler);
    return () => {
      socket.off('notification', handler);
    };
  }, [isAuthenticated]);

  const visible = items.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'swap_request')
      return ['swap_request', 'swap_accepted', 'swap_rejected', 'swap_completed'].includes(n.type);
    return n.type === filter;
  });

  const markAll = async () => {
    const previous = items;
    setItems(items.map((n) => ({ ...n, read: true })));
    try {
      await notificationsApi.markAllRead();
    } catch (err) {
      setItems(previous);
      toast(err instanceof Error ? err.message : 'Action failed.', 'error');
    }
  };

  const onClick = async (n: Notification) => {
    if (!n.read) {
      setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, read: true } : p)));
      notificationsApi.markRead(n.id).catch(() => undefined);
    }
    setLocation(navigateFor(n));
  };

  return (
    <div className="pt-6 sm:pt-8 pb-12 sm:pb-16 bg-background relative z-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
              Inbox
            </span>
            <h1 className="font-headings text-2xl sm:text-3xl font-bold text-primary mt-1">
              Notifications
            </h1>
          </div>
          <button
            onClick={markAll}
            className="text-[11px] font-bold uppercase tracking-wider text-accent hover:underline"
          >
            Mark all read
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                filter === f.key
                  ? 'bg-primary text-white border-primary'
                  : 'border-border/60 text-primary/70 hover:bg-muted/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-primary/40">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="You're all caught up"
            message="When something new happens, it'll appear here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((n) => {
              const meta = ICONS[n.type] || ICONS.system!;
              const Icon = meta.Icon;
              return (
                <div
                  key={n.id}
                  onClick={() => onClick(n)}
                  className={`bg-background rounded-xl border shadow-sm p-3 flex gap-2.5 cursor-pointer hover:shadow-md transition-all ${
                    !n.read ? 'border-accent/40 bg-accent/5' : 'border-border/60'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      !n.read ? 'bg-accent' : 'bg-transparent'
                    }`}
                  />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${meta.bg} ${meta.fg} flex-shrink-0`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <p className="text-xs font-bold text-primary">{n.title}</p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {relativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
