import { ReactNode } from 'react';

const COLORS = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  reviewed: 'bg-sky-50 text-sky-700 border-sky-200',
  resolved: 'bg-teal-50 text-teal-700 border-teal-200',
  admin: 'bg-primary text-white border-primary',
  user: 'bg-muted text-primary border-border',
} as const;

interface StatusBadgeProps {
  children: ReactNode;
  variant: keyof typeof COLORS;
  className?: string;
}

export default function StatusBadge({ children, variant, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${COLORS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
