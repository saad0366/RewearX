import { Key } from 'react';
import { Link } from 'wouter';
import { Heart, X, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { Item, getUser } from '../../lib/mockData';
import Badge from './Badge';

interface ItemCardProps {
  item: Item;
  saved?: boolean;
  onSave?: (id: string) => void;
  onUnsave?: (id: string) => void;
  matchScore?: number;
  showOwner?: boolean;
  unavailableOverlay?: boolean;
  key?: Key | null;
}

export default function ItemCard({
  item,
  saved,
  onSave,
  onUnsave,
  matchScore,
  showOwner = true,
  unavailableOverlay,
}: ItemCardProps) {
  // Prefer the API-embedded owner snippet; fall back to mock-data lookup.
  const owner = item.owner || getUser(item.user_id);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group bg-background rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-border/40 transition-shadow flex flex-col relative"
    >
      <Link href={`/items/${item.id}`}>
        <div className="aspect-[3/4] w-full bg-muted/30 overflow-hidden relative cursor-pointer">
          <img
            src={item.images[0]}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            loading="lazy"
          />
          {(unavailableOverlay || !item.is_available) && (
            <div className="absolute inset-0 bg-primary/60 backdrop-blur-[2px] flex items-center justify-center">
              <span className="text-white font-bold text-[10px] uppercase tracking-widest">
                No longer available
              </span>
            </div>
          )}
          {matchScore !== undefined && (
            <div className="absolute top-2 left-2">
              <span className="px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[9px] font-black tracking-wider uppercase shadow-md">
                {matchScore}% match
              </span>
            </div>
          )}
        </div>
      </Link>

      {(onSave || onUnsave) && (
        <button
          aria-label={onUnsave ? 'Unsave' : 'Save item'}
          onClick={(e) => {
            e.preventDefault();
            if (onUnsave) onUnsave(item.id);
            else onSave?.(item.id);
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-all"
        >
          {onUnsave ? (
            <X size={13} className="text-primary" />
          ) : (
            <Heart
              size={13}
              className={saved ? 'fill-red-500 text-red-500' : 'text-primary'}
            />
          )}
        </button>
      )}

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <Link href={`/items/${item.id}`}>
          <h3 className="font-headings font-bold text-primary text-sm leading-snug line-clamp-2 hover:text-accent transition-colors cursor-pointer">
            {item.title}
          </h3>
        </Link>
        <div className="flex flex-wrap gap-1">
          <Badge label={item.size} color="gray" />
          <Badge label={item.condition} color="accent" />
        </div>
        <div className="flex items-center gap-1 text-[11px] text-[#7D7265] font-medium mt-0.5">
          <MapPin size={11} className="text-[#2E4D3A] shrink-0" />
          <span className="truncate">{item.location || 'Islamabad'}</span>
        </div>
        {showOwner && owner && (
          <Link href={`/users/${owner.id}`}>
            <div className="mt-auto pt-2 border-t border-border/50 flex items-center gap-1.5 cursor-pointer group/o">
              <img
                src={owner.avatar}
                alt={owner.name}
                className="w-5 h-5 rounded-full object-cover"
              />
              <span className="text-[11px] font-semibold text-primary/70 group-hover/o:text-accent transition-colors truncate">
                {owner.name.split(' ')[0]}
              </span>
              {typeof owner.rating === 'number' && owner.rating > 0 && (
                <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                  ★ {owner.rating}
                </span>
              )}
            </div>
          </Link>
        )}
      </div>
    </motion.div>
  );
}
