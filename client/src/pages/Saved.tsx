import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Heart, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { savedApi } from '../lib/api';
import { adaptItem } from '../lib/api/types';
import type { Item as UIItem } from '../lib/mockData';
import ItemCard from '../components/ui/ItemCard';
import EmptyState from '../components/ui/EmptyState';

export default function Saved() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<UIItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/login');
      return;
    }
    let cancelled = false;
    setLoading(true);
    savedApi
      .list(1, 100)
      .then(({ items: list }) => {
        if (cancelled) return;
        setItems(list.map((i) => adaptItem(i)));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        toast(err instanceof Error ? err.message : 'Failed to load saved items.', 'error');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setLocation, toast]);

  const unsave = async (id: string) => {
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await savedApi.unsave(id);
      toast('Removed from saved.', 'info');
    } catch (err) {
      setItems(previous);
      toast(err instanceof Error ? err.message : 'Action failed.', 'error');
    }
  };

  return (
    <div className="pt-6 sm:pt-8 pb-12 sm:pb-16 bg-background relative z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
              Wishlist
            </span>
            <h1 className="font-headings text-2xl sm:text-3xl font-bold text-primary mt-1">
              Saved pieces
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {items.length} {items.length === 1 ? 'item' : 'items'} bookmarked
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-primary/40">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Nothing saved yet"
            message="Tap the heart icon on any listing to add it here for later."
            actionLabel="Browse pieces"
            onAction={() => setLocation('/browse')}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            <AnimatePresence>
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25 }}
                >
                  <ItemCard item={item} saved onUnsave={unsave} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
