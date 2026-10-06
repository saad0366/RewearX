import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}

export default function Card({ children, className = '', title, action }: CardProps) {
  return (
    <div className={`bg-surface rounded-2xl border border-border shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-border">
          {title && (
            <h3 className="font-headings text-lg font-bold text-primary">{title}</h3>
          )}
          {action}
        </div>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}
