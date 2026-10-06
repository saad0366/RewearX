import type { Key, ReactNode } from 'react';

type BadgeColor =
  | 'accent'
  | 'amber'
  | 'green'
  | 'red'
  | 'teal'
  | 'gray'
  | 'primary'
  | 'sky';

interface BadgeProps {
  label?: ReactNode;
  children?: ReactNode;
  color?: BadgeColor;
  className?: string;
  key?: Key | null;
}

const colorMap: Record<BadgeColor, string> = {
  accent: 'bg-accent/10 text-accent border-accent/20',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  gray: 'bg-muted/50 text-primary/70 border-border',
  primary: 'bg-primary text-white border-primary',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
};

export default function Badge({ label, children, color = 'gray', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${colorMap[color]} ${className}`}
    >
      {label ?? children}
    </span>
  );
}
