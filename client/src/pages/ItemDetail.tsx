import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronRight, Heart, Edit, Trash2, Repeat, MessageSquare, Star, Loader2, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { itemsApi, savedApi, swapsApi, usersApi } from '../lib/api';
import { adaptItem, adaptUser, ApiItem } from '../lib/api/types';
import type { User as UIUser, Item as UIItem } from '../lib/mockData';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import ItemCard from '../components/ui/ItemCard';

interface ItemDetailProps {
  params: { id: string };
}

export default function ItemDetail({ params }: ItemDetailProps) {
  const { user, isAuthenticated, apiUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [apiItem, setApiItem] = useState<ApiItem | null>(null);
  const [item, setItem] = useState<UIItem | null>(null);
  const [owner, setOwner] = useState<UIUser | null>(null);
  const [similar, setSimilar] = useState<UIItem[]>([]);
  const [myItems, setMyItems] = useState<UIItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeImage, setActiveImage] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submittingSwap, setSubmittingSwap] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = useMemo(
    () => Boolean(item && user && item.user_id === user.id),
    [item, user]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveImage(0);

    itemsApi
      .byId(params.id)
      .then(async (raw) => {
        if (cancelled) return;
        const ui = adaptItem(raw);
        setApiItem(raw);
        setItem(ui);

        // Owner info
        if (raw.owner) {
          setOwner(adaptUser(raw.owner));
        } else {
          usersApi
            .byId(raw.userId)
            .then((u) => !cancelled && setOwner(adaptUser(u)))
            .catch(() => undefined);
        }

        // Similar items
        itemsApi
          .list({ categoryId: raw.categoryId, limit: 8 })
          .then(({ items }) => {
            if (cancelled) return;
            setSimilar(
              items
                .filter((i) => i.id !== raw.id && i.isAvailable)
                .slice(0, 4)
                .map((i) => adaptItem(i))
            );
          })
          .catch(() => undefined);

        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load item.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    if (!isAuthenticated || !item) return;
    let cancelled = false;
    Promise.all([
      savedApi.list(1, 100).catch(() => ({ items: [] })),
      apiUser ? itemsApi.byUser(apiUser.id, 1, 50).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
    ]).then(([savedList, mine]) => {
      if (cancelled) return;
      setSaved(savedList.items.some((i) => String(i.id) === item.id));
      setMyItems(mine.items.filter((i) => i.isAvailable && String(i.id) !== item.id).map((i) => adaptItem(i)));
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, item, apiUser]);

  if (loading) {
    return (
      <div className="pt-32 max-w-4xl mx-auto px-6 flex justify-center text-primary/40">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (error || !item || !apiItem) {
    return (
      <div className="pt-32 max-w-4xl mx-auto px-6">
        <EmptyState
          title="Item not found"
          message={error || 'This listing may have been removed or the link is broken.'}
          actionLabel="Browse all"
          onAction={() => setLocation('/browse')}
        />
      </div>
    );
  }

  const isLong = item.description.length > 240;
  const visibleDesc = descExpanded || !isLong ? item.description : item.description.slice(0, 240) + '…';

  const handleToggleSave = async () => {
    if (!isAuthenticated) {
      toast('Please log in to save items.', 'info');
      return;
    }
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) await savedApi.unsave(item.id);
      else await savedApi.save(item.id);
      toast(wasSaved ? 'Removed from saved.' : 'Saved to your wishlist.', wasSaved ? 'info' : 'success');
    } catch (err) {
      setSaved(wasSaved);
      toast(err instanceof Error ? err.message : 'Action failed.', 'error');
    }
  };

  const handleSendSwap = async () => {
    if (!selectedOffer || !apiItem || !apiUser) return;
    setSubmittingSwap(true);
    try {
      await swapsApi.create({
        receiverId: apiItem.userId,
        receiverItemId: apiItem.id,
        senderItemId: Number(selectedOffer),
        message: message.trim() || undefined,
      });
      toast(`Swap request sent to ${owner?.name.split(' ')[0] || 'the owner'}.`, 'success');
      setShowSwapModal(false);
      setSelectedOffer(null);
      setMessage('');
      setTimeout(() => setLocation('/swaps'), 400);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send swap.', 'error');
    } finally {
      setSubmittingSwap(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await itemsApi.remove(item.id);
      toast('Listing removed.', 'success');
      setShowDeleteConfirm(false);
      setLocation('/profile');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="pt-6 sm:pt-8 pb-12 sm:pb-16 bg-background relative z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary/60 mb-4">
          <Link href="/browse" className="hover:text-primary transition-colors">Browse</Link>
          <ChevronRight size={11} />
          <Link href="/browse" className="hover:text-primary transition-colors">{item.category}</Link>
          <ChevronRight size={11} />
          <span className="text-primary truncate max-w-[180px]">{item.title}</span>
        </nav>

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-10">
          {/* Gallery */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="lg:sticky lg:top-24 self-start"
          >
            <div className="aspect-square w-full bg-muted/30 rounded-2xl overflow-hidden shadow-sm">
              <img
                src={item.images[activeImage]}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            </div>
            {item.images.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                {item.images.map((src, idx) => (
                  <button
                    key={src + idx}
                    onClick={() => setActiveImage(idx)}
                    className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 transition-all ${
                      idx === activeImage
                        ? 'ring-2 ring-primary scale-105'
                        : 'ring-1 ring-border/60 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={src} alt={`thumb-${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-headings text-xl sm:text-2xl lg:text-3xl font-bold text-primary leading-tight">
                {item.title}
              </h1>
              {!isOwner && isAuthenticated && (
                <button
                  onClick={handleToggleSave}
                  aria-label="Save"
                  className="w-9 h-9 rounded-full border border-border/60 bg-background flex items-center justify-center hover:scale-110 active:scale-95 transition-transform flex-shrink-0"
                >
                  <Heart
                    size={15}
                    className={saved ? 'fill-red-500 text-red-500' : 'text-primary'}
                  />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge label={`Size ${item.size}`} color="gray" />
              <Badge label={item.gender} color="gray" />
              <Badge label={item.condition} color="accent" />
              {item.color && <Badge label={item.color} color="gray" />}
              {item.brand && <Badge label={item.brand} color="primary" />}
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#2E4D3A]/10 text-[#2E4D3A] text-xs font-semibold border border-[#2E4D3A]/20">
                <MapPin size={12} className="text-[#2E4D3A]" />
                {item.location || 'Islamabad'}
              </span>
            </div>

            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary/60 mb-1.5">
                About the piece
              </h3>
              <p className="text-primary/80 text-sm leading-relaxed">
                {visibleDesc || <em className="text-muted-foreground">No description provided.</em>}{' '}
                {isLong && (
                  <button
                    onClick={() => setDescExpanded((s) => !s)}
                    className="text-accent font-bold ml-1 hover:underline"
                  >
                    {descExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </p>
            </div>

            {/* Owner card */}
            {owner && (
              <Link href={`/users/${owner.id}`}>
                <div className="flex items-center gap-3 p-3 bg-background border border-border/60 rounded-xl hover:border-accent transition-colors cursor-pointer group">
                  <img
                    src={owner.avatar}
                    alt={owner.name}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-accent/20"
                  />
                  <div className="flex-1">
                    <p className="font-headings font-bold text-primary text-sm group-hover:text-accent transition-colors">
                      {owner.name}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-semibold">
                      {owner.rating > 0 && (
                        <>
                          <span className="flex items-center gap-1">
                            <Star size={11} className="fill-amber-400 text-amber-400" />
                            {owner.rating}
                          </span>
                          <span>·</span>
                        </>
                      )}
                      <span>{owner.swapsCompleted} swaps</span>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-primary/40 group-hover:text-accent transition-colors" />
                </div>
              </Link>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2 mt-1">
              {isOwner && (
                <>
                  <Link href={`/items/${item.id}/edit`} className="flex-1">
                    <button className="w-full py-2.5 rounded-lg border border-primary/20 text-primary font-bold uppercase tracking-wider text-[11px] hover:bg-muted/40 flex items-center justify-center gap-2 transition-colors">
                      <Edit size={12} /> Edit
                    </button>
                  </Link>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex-1 py-2.5 rounded-lg border border-red-200 text-red-600 font-bold uppercase tracking-wider text-[11px] hover:bg-red-50 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </>
              )}

              {!isOwner && isAuthenticated && item.is_available && (
                <button
                  onClick={() => setShowSwapModal(true)}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-white font-bold uppercase tracking-wider text-[11px] hover:bg-primary/90 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  <Repeat size={12} /> Propose a swap
                </button>
              )}

              {!isAuthenticated && (
                <Link href="/login" className="flex-1">
                  <button className="w-full py-2.5 rounded-lg bg-primary text-white font-bold uppercase tracking-wider text-[11px] hover:bg-primary/90 flex items-center justify-center gap-2 shadow-md transition-all">
                    Log in to swap
                  </button>
                </Link>
              )}
            </div>
          </motion.div>
        </div>

        {/* Similar */}
        {similar.length > 0 && (
          <section className="mt-12">
            <h2 className="font-headings text-lg sm:text-xl font-bold text-primary mb-4">
              Similar in {item.category}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {similar.map((it) => (
                <ItemCard key={it.id} item={it} />
              ))}
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        destructive
        title="Delete this listing?"
        message="This will mark the listing as unavailable. You can list it again later."
        confirmLabel={deleting ? 'Deleting…' : 'Yes, delete'}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />

      {/* Swap Request Modal */}
      <Modal
        isOpen={showSwapModal}
        onClose={() => setShowSwapModal(false)}
        title="Propose a swap"
        size="lg"
      >
        <div className="space-y-6">
          {/* Target item */}
          <div className="rounded-2xl border border-border/60 p-4 flex items-center gap-4 bg-muted/30">
            <img
              src={item.images[0]}
              alt={item.title}
              className="w-20 h-20 rounded-xl object-cover"
            />
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                You want
              </p>
              <p className="font-headings font-bold text-primary text-lg leading-tight">
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {item.condition} · Size {item.size}
                {owner ? ` · From ${owner.name.split(' ')[0]}` : ''}
              </p>
            </div>
          </div>

          {/* My items grid */}
          <div>
            <h4 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">
              Offer one of your pieces
            </h4>
            {myItems.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border/70 p-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  You don't have any listings yet.
                </p>
                <Link href="/items/new">
                  <button className="px-5 py-2.5 rounded-full bg-accent text-accent-foreground font-bold text-xs uppercase tracking-wider">
                    List your first piece
                  </button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {myItems.map((mi) => (
                  <button
                    key={mi.id}
                    type="button"
                    onClick={() => setSelectedOffer(mi.id)}
                    className={`text-left rounded-2xl overflow-hidden border-2 transition-all ${
                      selectedOffer === mi.id
                        ? 'border-accent ring-2 ring-accent/20'
                        : 'border-border/60 hover:border-primary/40'
                    }`}
                  >
                    <div className="aspect-square bg-muted/30 overflow-hidden">
                      <img src={mi.images[0]} alt={mi.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-2.5">
                      <p className="text-sm font-bold text-primary truncate">{mi.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Size {mi.size} · {mi.condition}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Message */}
          <div>
            <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2 block">
              Add a note (optional)
            </label>
            <textarea
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Hi${owner ? ` ${owner.name.split(' ')[0]}` : ''} — I love this piece because…`}
              rows={3}
              className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none bg-muted/20"
            />
            <p className="text-[11px] text-muted-foreground text-right mt-1">
              {message.length}/500
            </p>
          </div>

          <button
            onClick={handleSendSwap}
            disabled={!selectedOffer || submittingSwap}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-bold uppercase tracking-wider text-xs hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            {submittingSwap ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
            {submittingSwap ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
