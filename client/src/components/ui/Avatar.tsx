interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
}

const sizeMap = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-base',
  xl: 'w-24 h-24 text-xl',
};

export default function Avatar({ src, name, size = 'md', className = '', ring }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full bg-accent text-accent-foreground font-bold flex-shrink-0 overflow-hidden ${
        sizeMap[size]
      } ${ring ? 'ring-4 ring-white shadow-md' : ''} ${className}`}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-headings">{initials}</span>
      )}
    </div>
  );
}
