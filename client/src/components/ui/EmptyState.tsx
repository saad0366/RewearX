import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export default function EmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4 text-primary/60">
          <Icon size={28} />
        </div>
      )}
      <h3 className="font-headings text-xl sm:text-2xl font-bold text-primary mb-2">{title}</h3>
      {message && (
        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">{message}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-6 px-6 py-3 rounded-xl bg-primary text-white font-bold uppercase tracking-widest text-xs hover:bg-primary/90 transition-all shadow-md hover:shadow-lg"
        >
          {actionLabel}
        </button>
      )}
      {children}
    </div>
  );
}
