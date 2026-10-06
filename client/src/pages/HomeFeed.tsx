import { Link } from 'wouter';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Plus,
  Search,
  Repeat,
  Heart,
  Sparkles,
  ArrowRight,
  Bell,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ItemCard from '../components/ui/ItemCard';
import {
  itemsApi,
  recommendationsApi,
  swapsApi,
  notificationsApi,
  savedApi,
} from '../lib/api';
import { adaptItem } from '../lib/api/types';
import type { Item as UIItem } from '../lib/mockData';

const QUICK_ACTIONS = [
  { label: 'Create Listing', desc: 'Share a piece', href: '/items/new', icon: Plus, color: 'bg-accent text-accent-foreground' },
  { label: 'Browse All', desc: 'Explore swaps', href: '/browse', icon: Search, color: 'bg-primary text-white' },
  { label: 'My Swaps', desc: 'Requests & deals', href: '/swaps', icon: Repeat, color: 'bg-amber-100 text-amber-700' },
  { label: 'Saved', desc: 'Wishlisted pieces', href: '/saved', icon: Heart, color: 'bg-rose-50 text-rose-600' },
];

export default function HomeFeed() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [recs, setRecs] = useState<UIItem[]>([]);
  const [recent, setRecent] = useState<UIItem[]>([]);
  const [pendingSwaps, setPendingSwaps] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      recommendationsApi.list(4).catch(() => []),
      itemsApi.list({ page: 1, limit: 8 }).catch(() => ({ items: [], pagination: null })),
      swapsApi
        .list({ role: 'received', status: 'pending', limit: 1 })
        .catch(() => ({ items: [], pagination: { totalItems: 0 } as never })),
      notificationsApi.unreadCount().catch(() => ({ unread: 0 })),
      savedApi.list(1, 100).catch(() => ({ items: [], pagination: null })),
    ]).then(([recList, itemList, pendingList, unread, savedList]) => {
      if (cancelled) return;
      setRecs(recList.map((r) => adaptItem(r.item, r.score)));
      setRecent(itemList.items.map((i) => adaptItem(i)));
      setPendingSwaps(pendingList.pagination?.totalItems ?? pendingList.items.length);
      setUnreadNotifs(unread.unread);
      setSavedIds(new Set(savedList.items.map((i) => String(i.id))));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const onToggleSaved = async (id: string) => {
    if (!isAuthenticated) {
      toast('Please log in to save items.', 'info');
      return;
    }
    const isSaved = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      if (isSaved) await savedApi.unsave(id);
      else await savedApi.save(id);
    } catch (err) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(id);
        else next.delete(id);
        return next;
      });
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    }
  };

  return (
    <div className="w-full pt-6 sm:pt-8 pb-12 sm:pb-16 bg-background relative z-10">
      {/* Hero */}
      <section className="relative w-full overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative bg-gradient-to-br from-primary to-primary/80 rounded-2xl overflow-hidden p-6 sm:p-8 md:p-10"
          >
            <div className="absolute inset-0 opacity-25 pointer-events-none">
              <img
                src="https://images.unsplash.com/photo-1490481651829-192e10e425ce?auto=format&fit=crop&q=80&w=2000"
                alt=""
                className="w-full h-full object-cover mix-blend-luminosity"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
            </div>

            <div className="relative z-10 max-w-2xl">
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.25em] text-accent mb-2">
                Welcome back
              </span>
              <h1 className="font-headings text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-2">
                Hello, <span className="text-accent">{user?.name?.split(' ')[0] || 'friend'}</span>
              </h1>
              <p className="text-white/75 text-sm sm:text-base max-w-md leading-relaxed">
                Your wardrobe never stops evolving. Here's what's new today.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Link href="/swaps">
                  <button className="px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-bold border border-white/30 flex items-center gap-1.5 transition-all">
                    <Repeat size={13} /> {pendingSwaps} pending
                  </button>
                </Link>
                <Link href="/notifications">
                  <button className="px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-bold border border-white/30 flex items-center gap-1.5 transition-all">
                    <Bell size={13} /> {unreadNotifs} new
                  </button>
                </Link>
                <Link href="/recommendations">
                  <button className="px-4 py-2 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow-md">
                    <Sparkles size={13} /> AI picks
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 -mt-5 sm:-mt-6 relative z-20">
          {QUICK_ACTIONS.map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div
                key={a.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.04 * i }}
              >
                <Link href={a.href}>
                  <div className="bg-background rounded-xl shadow-md hover:shadow-lg border border-border/40 p-3 sm:p-4 flex items-center gap-3 cursor-pointer hover:-translate-y-0.5 transition-all h-full">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color}`}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-headings font-bold text-primary text-sm leading-tight truncate">
                        {a.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{a.desc}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* AI Recommendations */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-10 sm:mt-14">
        <div className="flex items-end justify-between mb-4 gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
              Curated for you
            </span>
            <h2 className="font-headings text-xl sm:text-2xl font-bold text-primary mt-0.5">
              Recommended pieces
            </h2>
          </div>
          <Link href="/recommendations">
            <span className="text-xs font-bold text-accent hover:underline flex items-center gap-1 whitespace-nowrap uppercase tracking-wider">
              View all <ArrowRight size={12} />
            </span>
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-primary/40">
            <Loader2 className="animate-spin" />
          </div>
        ) : recs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No recommendations yet — list a piece to start training the AI.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {recs.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                matchScore={item.matchScore}
                saved={savedIds.has(item.id)}
                onSave={onToggleSaved}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent listings */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-10 sm:mt-14">
        <div className="flex items-end justify-between mb-4 gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
              Just listed
            </span>
            <h2 className="font-headings text-xl sm:text-2xl font-bold text-primary mt-0.5">
              Fresh on ReWearX
            </h2>
          </div>
          <Link href="/browse">
            <span className="text-xs font-bold text-accent hover:underline flex items-center gap-1 whitespace-nowrap uppercase tracking-wider">
              View all <ArrowRight size={12} />
            </span>
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-primary/40">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {recent.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                saved={savedIds.has(item.id)}
                onSave={onToggleSaved}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
