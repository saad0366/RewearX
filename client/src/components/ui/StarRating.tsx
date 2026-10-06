import { Star } from 'lucide-react';
import { useState } from 'react';

interface StarRatingProps {
  value: number;
  readOnly?: boolean;
  size?: number;
  onChange?: (value: number) => void;
  showValue?: boolean;
}

export default function StarRating({
  value,
  readOnly = false,
  size = 18,
  onChange,
  showValue = false,
}: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(null)}
            className={`${
              readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
            } transition-transform`}
            aria-label={`${n} stars`}
          >
            <Star
              size={size}
              className={
                n <= display ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-primary/30'
              }
            />
          </button>
        ))}
      </div>
      {showValue && (
        <span className="text-sm font-bold text-primary ml-1">{value.toFixed(1)}</span>
      )}
    </div>
  );
}
