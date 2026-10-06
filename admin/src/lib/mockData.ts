// Mock data for the ReWearX admin console.
// In production this would come from the admin API.

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'user' | 'admin';
  status: 'active' | 'blocked';
  joined: string;
  listings: number;
  swaps: number;
  rating: number;
}

export interface AdminItem {
  id: string;
  title: string;
  image: string;
  user: string;
  category: string;
  createdAt: string;
}

export interface AdminReport {
  id: string;
  reporter: { id: string; name: string; avatar: string };
  reported: {
    type: 'user' | 'item';
    id: string;
    name: string;
    image: string;
  };
  reason: 'Fake Listing' | 'Inappropriate' | 'Fraud' | 'Harassment' | 'Other';
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: string;
}

export interface DayPoint {
  date: string;
  value: number;
}

export const users: AdminUser[] = [
  { id: 'u1', name: 'Sophie Larsen', email: 'sophie@rewearx.com', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200', role: 'user', status: 'active', joined: '2024-02-12', listings: 12, swaps: 34, rating: 4.9 },
  { id: 'u2', name: 'James Kovac', email: 'james@rewearx.com', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200', role: 'user', status: 'active', joined: '2023-11-04', listings: 8, swaps: 21, rating: 4.7 },
  { id: 'u3', name: 'Aria Khatri', email: 'aria@rewearx.com', avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&q=80&w=200', role: 'user', status: 'active', joined: '2025-01-22', listings: 15, swaps: 12, rating: 4.8 },
  { id: 'u4', name: 'Marcus Hale', email: 'marcus@rewearx.com', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200', role: 'user', status: 'blocked', joined: '2024-07-19', listings: 9, swaps: 18, rating: 4.6 },
  { id: 'u5', name: 'Lena Park', email: 'lena@rewearx.com', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200', role: 'user', status: 'active', joined: '2025-04-05', listings: 4, swaps: 7, rating: 4.9 },
  { id: 'u6', name: 'Ben Olsen', email: 'ben@rewearx.com', avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=200', role: 'user', status: 'active', joined: '2025-06-11', listings: 6, swaps: 5, rating: 4.5 },
  { id: 'u7', name: 'Mira Devi', email: 'mira@rewearx.com', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200', role: 'admin', status: 'active', joined: '2023-06-10', listings: 2, swaps: 15, rating: 5.0 },
  { id: 'u8', name: 'Roy Adesina', email: 'roy@rewearx.com', avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&q=80&w=200', role: 'user', status: 'active', joined: '2025-08-03', listings: 6, swaps: 7, rating: 4.9 },
];

export const reports: AdminReport[] = [
  {
    id: 'r1',
    reporter: { id: 'u3', name: 'Aria Khatri', avatar: users.find((u) => u.id === 'u3')!.avatar },
    reported: { type: 'item', id: 'i12', name: 'Quilted Denim Jacket', image: 'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?auto=format&fit=crop&q=80&w=400' },
    reason: 'Fake Listing',
    description: 'Image looks AI-generated, seller cannot answer specifics.',
    status: 'pending',
    createdAt: '2026-05-27',
  },
  {
    id: 'r2',
    reporter: { id: 'u1', name: 'Sophie Larsen', avatar: users.find((u) => u.id === 'u1')!.avatar },
    reported: { type: 'user', id: 'u4', name: 'Marcus Hale', image: users.find((u) => u.id === 'u4')!.avatar },
    reason: 'Harassment',
    description: 'Sent multiple aggressive DMs after I declined a swap.',
    status: 'reviewed',
    createdAt: '2026-05-22',
  },
  {
    id: 'r3',
    reporter: { id: 'u5', name: 'Lena Park', avatar: users.find((u) => u.id === 'u5')!.avatar },
    reported: { type: 'item', id: 'i7', name: 'Vintage Western Boots', image: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&q=80&w=400' },
    reason: 'Inappropriate',
    description: 'Description contained off-platform contact info.',
    status: 'resolved',
    createdAt: '2026-05-18',
  },
  {
    id: 'r4',
    reporter: { id: 'u6', name: 'Ben Olsen', avatar: users.find((u) => u.id === 'u6')!.avatar },
    reported: { type: 'item', id: 'i4', name: 'Levi\'s 501 Original', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=400' },
    reason: 'Fraud',
    description: 'Bait-and-switch attempted during the swap.',
    status: 'pending',
    createdAt: '2026-05-26',
  },
];

export const recentItems: AdminItem[] = [
  { id: 'i1', title: 'Vintage Zara Trench Coat', image: 'https://images.unsplash.com/photo-1559551409-dadc959f76b8?auto=format&fit=crop&q=80&w=400', user: 'Sophie Larsen', category: 'Outerwear', createdAt: '2026-05-20' },
  { id: 'i2', title: 'A.P.C. Half-Moon Bag', image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=400', user: 'James Kovac', category: 'Bags', createdAt: '2026-05-18' },
  { id: 'i3', title: 'Linen Slip Dress — Sage', image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=400', user: 'Aria Khatri', category: 'Dresses', createdAt: '2026-05-15' },
  { id: 'i4', title: 'Levi\'s 501 Original', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=400', user: 'Marcus Hale', category: 'Bottoms', createdAt: '2026-05-12' },
];

// ─── ANALYTICS ──────────────────────────────────────────────────────────────
function genSeries(days: number, base: number, variance: number): DayPoint[] {
  const out: DayPoint[] = [];
  const start = new Date();
  start.setDate(start.getDate() - days);
  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const value = Math.max(0, Math.round(base + Math.sin(i / 3) * variance + Math.random() * variance));
    out.push({ date: d.toISOString().slice(5, 10), value });
  }
  return out;
}

export const usersOverTime = (days = 30) => genSeries(days, 14, 8);
export const listingsOverTime = (days = 30) => genSeries(days, 22, 12);

export const swapFunnel = [
  { stage: 'Requests sent', value: 1240 },
  { stage: 'Accepted', value: 812 },
  { stage: 'Completed', value: 587 },
];

export const categoryBreakdown = [
  { name: 'Tops', value: 320 },
  { name: 'Bottoms', value: 245 },
  { name: 'Dresses', value: 198 },
  { name: 'Outerwear', value: 175 },
  { name: 'Footwear', value: 132 },
  { name: 'Bags', value: 96 },
  { name: 'Jewelry', value: 54 },
  { name: 'Accessories', value: 71 },
];

// ─── KPIs ───────────────────────────────────────────────────────────────────
export const kpis = {
  totalUsers: { value: 12483, trend: 12.4 },
  activeListings: { value: 3147, trend: 8.1 },
  swaps: { value: 1872, trend: 4.7 },
  pendingReports: { value: reports.filter((r) => r.status === 'pending').length, trend: -2.3 },
};

export const topActiveUsers = [...users]
  .sort((a, b) => b.swaps - a.swaps)
  .slice(0, 5);
