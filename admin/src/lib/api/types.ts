/**
 * Backend DTO types and adapters for the admin console.
 */

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'blocked' | 'pending';
  isVerified?: boolean;
  avatarUrl?: string | null;
  bio?: string | null;
  rating?: number | null;
  reviewCount?: number;
  swapsCompleted?: number;
  itemsListed?: number;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface ApiCategory {
  id: number;
  name: string;
  slug?: string;
  parentId?: number | null;
}

export interface ApiItemImage {
  id: number;
  imageUrl: string;
  isPrimary?: boolean;
}

export interface ApiItem {
  id: number;
  title: string;
  description?: string | null;
  brand?: string | null;
  size?: string | null;
  color?: string | null;
  condition?: string | null;
  isAvailable: boolean;
  userId: number;
  categoryId: number;
  category?: ApiCategory | null;
  owner?: ApiUser | null;
  images?: ApiItemImage[];
  primaryImage?: string | null;
  createdAt: string;
}

export interface ApiReport {
  id: number;
  reporterId: number;
  reportedUserId?: number | null;
  reportedItemId?: number | null;
  reason: string;
  description?: string | null;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  adminNotes?: string | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  createdAt: string;
  reporter?: ApiUser | null;
  reportedUser?: ApiUser | null;
  reportedItem?: ApiItem | null;
}

export interface ApiStats {
  users: {
    total: number;
    active: number;
    blocked: number;
    newThisWeek: number;
  };
  items: {
    total: number;
    available: number;
    byCategory: { categoryId: number; categoryName: string; count: number }[];
  };
  swaps: {
    total: number;
    completed: number;
    pending: number;
    byStatus: Record<string, number>;
  };
  messages: { total: number };
  reports: { pending: number };
  reviews: { avgRating: number | null };
}

// ─── UI ADAPTERS ────────────────────────────────────────────────────────────

import type { AdminUser, AdminReport, AdminItem } from '../mockData';

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200';
const FALLBACK_ITEM =
  'https://images.unsplash.com/photo-1490481651829-192e10e425ce?auto=format&fit=crop&q=80&w=400';

const formatDate = (iso: string): string => {
  if (!iso) return '';
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
};

export const adaptUser = (u: ApiUser): AdminUser => ({
  id: String(u.id),
  name: u.name,
  email: u.email,
  avatar: u.avatarUrl || FALLBACK_AVATAR,
  role: u.role,
  status: (u.status === 'pending' ? 'active' : u.status) as 'active' | 'blocked',
  joined: formatDate(u.createdAt),
  listings: u.itemsListed ?? 0,
  swaps: u.swapsCompleted ?? 0,
  rating: u.rating ?? 0,
});

export const adaptItem = (i: ApiItem): AdminItem => {
  const image =
    i.primaryImage ||
    i.images?.find((img) => img.isPrimary)?.imageUrl ||
    i.images?.[0]?.imageUrl ||
    FALLBACK_ITEM;
  return {
    id: String(i.id),
    title: i.title,
    image,
    user: i.owner?.name || `User #${i.userId}`,
    category: i.category?.name || 'Uncategorized',
    createdAt: formatDate(i.createdAt),
  };
};

const REASON_MAP: Record<string, AdminReport['reason']> = {
  fake_listing: 'Fake Listing',
  inappropriate: 'Inappropriate',
  fraud: 'Fraud',
  harassment: 'Harassment',
  spam: 'Other',
  other: 'Other',
};

const reasonLabel = (raw: string): AdminReport['reason'] => {
  if (!raw) return 'Other';
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  return REASON_MAP[key] || (raw as AdminReport['reason']);
};

const statusMap: Record<string, AdminReport['status']> = {
  pending: 'pending',
  reviewed: 'reviewed',
  resolved: 'resolved',
  dismissed: 'resolved',
};

export const adaptReport = (r: ApiReport): AdminReport => {
  const reporter = r.reporter
    ? {
        id: String(r.reporter.id),
        name: r.reporter.name,
        avatar: r.reporter.avatarUrl || FALLBACK_AVATAR,
      }
    : { id: String(r.reporterId), name: 'Unknown', avatar: FALLBACK_AVATAR };

  let reported: AdminReport['reported'];
  if (r.reportedItemId && r.reportedItem) {
    const img =
      r.reportedItem.primaryImage ||
      r.reportedItem.images?.[0]?.imageUrl ||
      FALLBACK_ITEM;
    reported = {
      type: 'item',
      id: String(r.reportedItem.id),
      name: r.reportedItem.title,
      image: img,
    };
  } else if (r.reportedUserId && r.reportedUser) {
    reported = {
      type: 'user',
      id: String(r.reportedUser.id),
      name: r.reportedUser.name,
      image: r.reportedUser.avatarUrl || FALLBACK_AVATAR,
    };
  } else {
    reported = {
      type: r.reportedItemId ? 'item' : 'user',
      id: String(r.reportedItemId ?? r.reportedUserId ?? 0),
      name: 'Unknown',
      image: FALLBACK_ITEM,
    };
  }

  return {
    id: String(r.id),
    reporter,
    reported,
    reason: reasonLabel(r.reason),
    description: r.description || '',
    status: statusMap[r.status] || 'pending',
    createdAt: formatDate(r.createdAt),
  };
};
