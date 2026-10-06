import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Repeat, ArrowRight, Eye, X, Check, MessageCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { SwapRequest } from '../lib/mockData';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { swapsApi } from '../lib/api';
import { adaptSwap, ApiSwap } from '../lib/api/types';

import { getSocket } from '../lib/socket';

type Tab = 'received' | 'sent';
type StatusFilter = 'all' | 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';

const STATUS_COLOR: Record<SwapRequest['status'], 'amber' | 'green' | 'red' | 'teal' | 'gray'> = {
  pending: 'amber',
  accepted: 'green',
  rejected: 'red',
  completed: 'teal',
  cancelled: 'gray',
};

function relativeTime(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

interface DisplaySwap {
  ui: SwapRequest;
  raw: ApiSwap;
}

export default function Swaps() {
  const { user, apiUser } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('received');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [items, setItems] = useState<DisplaySwap[]>([]);
  const [receivedCount, setReceivedCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadSwaps = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [receivedRes, sentRes] = await Promise.all([
        swapsApi.list({ role: 'received', limit: 50 }).catch(() => ({ items: [] as ApiSwap[] })),
        swapsApi.list({ role: 'sent', limit: 50 }).catch(() => ({ items: [] as ApiSwap[] })),
      ]);

      setReceivedCount(receivedRes.items.length);
      setSentCount(sentRes.items.length);

      const activeList = tab === 'received' ? receivedRes.items : sentRes.items;
      setItems(
        activeList.map((s) => ({
          ui: adaptSwap(s, user.id),
          raw: s,
        }))
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load swaps.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSwaps();
    const socket = getSocket();
    const handleUpdate = () => loadSwaps();
    socket.on('swap-request-new', handleUpdate);
    socket.on('swap-request-updated', handleUpdate);
    return () => {
      socket.off('swap-request-new', handleUpdate);
      socket.off('swap-request-updated', handleUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  const counts = useMemo(() => ({ received: receivedCount, sent: sentCount }), [receivedCount, sentCount]);

  const filtered = useMemo(() => {
    let list = items;
    if (status !== 'all') list = list.filter((s) => s.ui.status === status);
    return list.sort((a, b) => b.ui.createdAt.localeCompare(a.ui.createdAt));
  }, [items, status]);

  const handleStatus = async (id: string, next: 'accepted' | 'rejected' | 'cancelled' | 'completed') => {
    setActingId(id);
    try {
      await swapsApi.updateStatus(id, next);
      toast(`Swap ${next}.`, 'success');
      await loadSwaps();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="pt-6 sm:pt-8 pb-12 sm:pb-16 bg-background relative z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="mb-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
            Your activity
          </span>
          <h1 className="font-headings text-2xl sm:text-3xl font-bold text-primary mt-1">
            Swap requests
          </h1>
        </div>

        {/* Tab toggle */}
        <div className="inline-flex rounded-lg border border-border/60 overflow-hidden bg-background mb-4">
          {(['received', 'sent'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                tab === t ? 'bg-primary text-white' : 'text-primary/70 hover:bg-muted/40'
              }`}
            >
              {t} {tab === t ? `(${counts[t]})` : ''}
            </button>
          ))}
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {(['all', 'pending', 'accepted', 'rejected', 'completed', 'cancelled'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                status === s
                  ? 'bg-primary text-white border-primary'
                  : 'border-border/60 text-primary/70 hover:bg-muted/40'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-primary/40">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title={tab === 'received' ? 'No incoming requests' : 'No outgoing requests'}
            message={
              tab === 'received'
                ? 'When someone proposes a swap on your listings, it will show up here.'
                : 'Find a piece you love in Browse and send your first swap request.'
            }
            actionLabel="Browse items"
            onAction={() => (window.location.href = '/browse')}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(({ ui, raw }) => {
              const offered = raw.senderItem;
              const requested = raw.receiverItem;
              const isReceiver = tab === 'received';
              const otherUser = isReceiver ? raw.sender : raw.receiver;

              return (
                <div
                  key={ui.id}
                  className="bg-background rounded-xl shadow-sm border border-border/60 p-4 hover:shadow-md transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* items row */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {offered?.images?.[0]?.url && (
                          <img
                            src={offered.images[0].url}
                            alt={offered.title}
                            className="w-12 h-12 rounded-lg object-cover border border-border/60 flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
                            {isReceiver ? 'They offer' : 'You offer'}
                          </p>
                          <p className="text-xs font-bold text-primary truncate max-w-[120px]">
                            {offered?.title || `Item #${ui.offeredItemId}`}
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-primary/40 flex-shrink-0" />
                      <div className="flex items-center gap-2 min-w-0">
                        {requested?.images?.[0]?.url && (
                          <img
                            src={requested.images[0].url}
                            alt={requested.title}
                            className="w-12 h-12 rounded-lg object-cover border border-border/60 flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
                            {isReceiver ? 'For your' : 'For their'}
                          </p>
                          <p className="text-xs font-bold text-primary truncate max-w-[120px]">
                            {requested?.title || `Item #${ui.requestedItemId}`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* meta */}
                    <div className="flex items-center lg:flex-col lg:items-end gap-2 lg:gap-1 flex-shrink-0">
                      {otherUser && (
                        <div className="flex items-center gap-2">
                          {otherUser.profileImage && (
                            <img src={otherUser.profileImage} alt={otherUser.name || ''} className="w-6 h-6 rounded-full" />
                          )}
                          <span className="text-[11px] font-semibold text-primary/70">{otherUser.name}</span>
                        </div>
                      )}
                      <Badge color={STATUS_COLOR[ui.status]}>{ui.status}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto lg:ml-0">
                        {relativeTime(raw.createdAt)}
                      </span>
                    </div>
                  </div>

                  {ui.message && (
                    <p className="text-xs italic text-primary/70 mt-2 line-clamp-1 border-l-2 border-accent/40 pl-2">
                      "{ui.message}"
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/40">
                    <Link href={`/swaps/${ui.id}`}>
                      <button className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-border/60 hover:bg-muted/40 text-primary flex items-center gap-1 transition-colors">
                        <Eye size={11} /> View
                      </button>
                    </Link>
                    {ui.status === 'pending' && isReceiver && (
                      <>
                        <button
                          onClick={() => handleStatus(ui.id, 'accepted')}
                          disabled={actingId === ui.id}
                          className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-accent text-accent-foreground hover:bg-accent/90 flex items-center gap-1 transition-colors disabled:opacity-60"
                        >
                          <Check size={11} /> Accept
                        </button>
                        <button
                          onClick={() => handleStatus(ui.id, 'rejected')}
                          disabled={actingId === ui.id}
                          className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1 transition-colors disabled:opacity-60"
                        >
                          <X size={11} /> Reject
                        </button>
                      </>
                    )}
                    {ui.status === 'pending' && !isReceiver && (
                      <button
                        onClick={() => handleStatus(ui.id, 'cancelled')}
                        disabled={actingId === ui.id}
                        className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-border/60 text-primary hover:bg-muted/40 flex items-center gap-1 transition-colors disabled:opacity-60"
                      >
                        <X size={11} /> Cancel
                      </button>
                    )}
                    {ui.status === 'accepted' && (
                      <>
                        {ui.conversationId && (
                          <Link href={`/chat/${ui.conversationId}`}>
                            <button className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-primary text-white hover:bg-primary/90 flex items-center gap-1 transition-colors">
                              <MessageCircle size={11} /> Open chat
                            </button>
                          </Link>
                        )}
                        <button
                          onClick={() => handleStatus(ui.id, 'completed')}
                          disabled={actingId === ui.id}
                          className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-accent text-accent hover:bg-accent/10 flex items-center gap-1 transition-colors disabled:opacity-60"
                        >
                          <Check size={11} /> Mark completed
                        </button>
                      </>
                    )}
                    {ui.status === 'completed' && (
                      <Link href={`/swaps/${ui.id}`}>
                        <button className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-accent text-accent-foreground hover:bg-accent/90 flex items-center gap-1 transition-colors">
                          Leave review
                        </button>
                      </Link>
                    )}
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
