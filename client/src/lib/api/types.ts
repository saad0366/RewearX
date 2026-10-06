/**
 * Backend DTOs (raw from API) and adapter helpers that convert them
 * into the legacy frontend types used by the existing UI components.
 */

import type {
  User as UIUser,
  Item as UIItem,
  SwapRequest as UISwap,
  Conversation as UIConversation,
  Message as UIMessage,
  Notification as UINotification,
  Review as UIReview,
  Address as UIAddress,
} from '../mockData';

// â”€â”€â”€ Raw backend DTOs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface ApiUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  profileImage?: string | null;
  bio?: string | null;
  gender: 'male' | 'female' | 'other';
  location?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  isVerified: boolean;
  role: 'user' | 'admin';
  status: 'active' | 'blocked';
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  stats?: {
    activeListings: number;
    completedSwaps: number;
    avgRating: number | null;
    reviewCount: number;
  };
}

export interface ApiCategory {
  id: number;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  isActive: boolean;
  itemCount?: number;
  parentId?: number | null;
  subcategories?: ApiCategory[];
  parentCategory?: ApiCategory | null;
}

export interface ApiImage {
  id: number;
  itemId: number;
  url: string;
  publicId?: string | null;
  isPrimary: boolean;
  orderIndex: number;
}

export interface ApiItem {
  trainingConsent?: boolean;
  id: number;
  userId: number;
  categoryId: number;
  title: string;
  description?: string | null;
  brand?: string | null;
  size: string;
  gender: 'male' | 'female' | 'unisex';
  condition: 'new' | 'like_new' | 'good' | 'fair';
  color?: string | null;
  location?: string | null;
  isAvailable: boolean;
  viewCount?: number;
  createdAt: string;
  updatedAt?: string;
  images?: ApiImage[];
  category?: ApiCategory;
  owner?: ApiUser;
  matchScore?: number;
  confirmedAttributes?: Partial<Record<'occasion'|'season'|'sleeve_length'|'pattern',string|null>>;
}

export interface ApiSwap {
  id: number;
  senderId: number;
  receiverId: number;
  senderItemId: number;
  receiverItemId: number;
  message?: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';
  acceptedAt?: string | null;
  senderConfirmedAt?: string | null;
  receiverConfirmedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  sender?: Partial<ApiUser>;
  receiver?: Partial<ApiUser>;
  senderItem?: ApiItem;
  receiverItem?: ApiItem;
  conversation?: { id: number; swapRequestId: number };
  reviews?: ApiReview[];
}

export interface ApiMessage {
  id: number;
  conversationId: number;
  senderId: number;
  message: string;
  attachmentUrl?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  sender?: { id: number; name: string; profileImage?: string | null };
}

export interface ApiConversation {
  id: number;
  swapRequestId: number;
  lastMessageAt?: string | null;
  createdAt: string;
  swapRequest?: ApiSwap;
  lastMessage?: ApiMessage | null;
  unreadCount?: number;
}

export interface ApiNotification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface ApiReview {
  id: number;
  reviewerId: number;
  revieweeId: number;
  swapRequestId: number;
  rating: number;
  comment?: string | null;
  createdAt: string;
  reviewer?: { id: number; name: string; profileImage?: string | null };
}

export interface ApiAddress {
  id: number;
  userId: number;
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string | null;
  postalCode?: string | null;
  country: string;
  isDefault: boolean;
}

export interface ApiDisputeEvidence {
  id: number;
  disputeId: number;
  uploaderId: number;
  url: string;
  publicId?: string | null;
  caption?: string | null;
  createdAt: string;
  uploader?: { id: number; name: string };
}

export interface ApiDispute {
  id: number;
  swapRequestId: number;
  initiatorId: number;
  respondentId: number;
  reason: 'item_not_as_described' | 'damaged_item' | 'fake_brand' | 'missing_item' | 'never_shipped' | 'other';
  description: string;
  status: 'opened' | 'under_review' | 'resolved_cancel_swap' | 'resolved_dismissed' | 'resolved_warning_issued';
  resolutionNotes?: string | null;
  resolvedById?: number | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  swapRequest?: ApiSwap;
  initiator?: Partial<ApiUser>;
  respondent?: Partial<ApiUser>;
  resolver?: Partial<ApiUser>;
  evidences?: ApiDisputeEvidence[];
}

export interface ApiAuthResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface ApiRecommendation {
  item: ApiItem;
  score: number;
  reason: string;
}

// â”€â”€â”€ Adapters: API DTO â†’ legacy UI type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const conditionMap: Record<ApiItem['condition'], UIItem['condition']> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const reverseConditionMap: Record<UIItem['condition'], ApiItem['condition']> = {
  New: 'new',
  'Like New': 'like_new',
  Good: 'good',
  Fair: 'fair',
};

const genderMap: Record<ApiItem['gender'], UIItem['gender']> = {
  male: 'Male',
  female: 'Female',
  unisex: 'Unisex',
};

const reverseGenderMap: Record<UIItem['gender'], ApiItem['gender']> = {
  Male: 'male',
  Female: 'female',
  Unisex: 'unisex',
};

export const apiConditionFromUI = (c: UIItem['condition']) => reverseConditionMap[c];
export const apiGenderFromUI = (g: UIItem['gender']) => reverseGenderMap[g];
export const uiConditionFromApi = (c: ApiItem['condition']) => conditionMap[c];
export const uiGenderFromApi = (g: ApiItem['gender']) => genderMap[g];

const userGenderMap: Record<ApiUser['gender'], UIUser['gender']> = {
  male: 'Male',
  female: 'Female',
  other: 'Unisex',
};

export const adaptUser = (u: ApiUser): UIUser => ({
  id: String(u.id),
  name: u.name,
  bio: u.bio || '',
  avatar:
    u.profileImage ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}&backgroundType=gradientLinear`,
  rating: u.stats?.avgRating ?? 0,
  reviewCount: u.stats?.reviewCount ?? 0,
  joined: u.createdAt?.slice(0, 10) || '',
  location: u.location || 'Islamabad',
  address: u.address || undefined,
  phone: u.phone || undefined,
  gender: userGenderMap[u.gender],
  dob: u.dateOfBirth || undefined,
  listingsCount: u.stats?.activeListings ?? 0,
  swapsCompleted: u.stats?.completedSwaps ?? 0,
  role: u.role,
});

export const adaptItem = (i: ApiItem, score?: number): UIItem => ({
  id: String(i.id),
  title: i.title,
  description: i.description || '',
  images:
    i.images && i.images.length
      ? [...i.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((img) => img.url)
      : ['https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&q=80&w=1200'],
  category: i.category?.name || 'Other',
  size: i.size,
  gender: uiGenderFromApi(i.gender),
  condition: uiConditionFromApi(i.condition),
  color: i.color || '',
  brand: i.brand || undefined,
  location: i.location || 'Islamabad',
  is_available: i.isAvailable,
  user_id: String(i.userId),
  createdAt: i.createdAt?.slice(0, 10) || '',
  matchScore: (score !== undefined ? score : i.matchScore) !== undefined ? Math.round((score !== undefined ? score : i.matchScore!) * 100) : undefined,
  owner: i.owner
    ? {
        id: String(i.owner.id),
        name: i.owner.name,
        avatar:
          i.owner.profileImage ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(i.owner.name)}`,
        rating: i.owner.stats?.avgRating ?? undefined,
      }
    : undefined,
});

export const adaptSwap = (s: ApiSwap, currentUserId?: string): UISwap => {
  const status =
    s.status === 'accepted' || s.status === 'pending' || s.status === 'rejected' || s.status === 'completed' || s.status === 'cancelled'
      ? s.status
      : 'pending';

  const timeline: { status: string; at: string }[] = [
    { status: 'Requested', at: s.createdAt?.slice(0, 10) || '' },
  ];
  if (s.status !== 'pending') {
    timeline.push({
      status: s.status.charAt(0).toUpperCase() + s.status.slice(1),
      at: (s.updatedAt || s.createdAt || '').slice(0, 10),
    });
  }

  const hasReviewed = Boolean(
    s.reviews &&
      currentUserId &&
      s.reviews.some((r) => String(r.reviewerId) === String(currentUserId))
  );

  return {
    id: String(s.id),
    fromUserId: String(s.senderId),
    toUserId: String(s.receiverId),
    offeredItemId: String(s.senderItemId),
    offeredItem: s.senderItem ? adaptItem(s.senderItem) : undefined,
    requestedItem: s.receiverItem ? adaptItem(s.receiverItem) : undefined,
    requestedItemId: String(s.receiverItemId),
    message: s.message || undefined,
    status,
    createdAt: s.createdAt?.slice(0, 10) || '',
    updatedAt: (s.updatedAt || s.createdAt || '').slice(0, 10),
    conversationId: s.conversation?.id ? String(s.conversation.id) : undefined,
    timeline,
    hasReviewed,
  };
};

export const adaptConversation = (c: ApiConversation, currentUserId: string): UIConversation => {
  const swap = c.swapRequest;
  const otherId =
    swap?.senderId !== undefined && String(swap.senderId) === currentUserId
      ? String(swap.receiverId)
      : String(swap?.senderId ?? '');
  return {
    id: String(c.id),
    participantIds: [currentUserId, otherId],
    swapId: swap?.id ? String(swap.id) : undefined,
    lastMessage: c.lastMessage?.message,
    lastMessageAt: c.lastMessageAt || c.createdAt,
    unreadCount: c.unreadCount || 0,
  };
};

export const adaptMessage = (m: ApiMessage, currentUserId: string): UIMessage => ({
  id: String(m.id),
  conversationId: String(m.conversationId),
  senderId: String(m.senderId),
  text: m.message,
  attachmentUrl: m.attachmentUrl || undefined,
  createdAt: m.createdAt,
  readBy: m.isRead
    ? Array.from(new Set([String(m.senderId), m.senderId !== Number(currentUserId) ? currentUserId : '']))
        .filter(Boolean)
    : [String(m.senderId)],
});

const mapNotificationType = (type: string): UINotification['type'] => {
  const allowed: UINotification['type'][] = [
    'swap_request',
    'swap_accepted',
    'swap_rejected',
    'swap_completed',
    'new_message',
    'review_received',
    'system',
  ];
  return (allowed.includes(type as UINotification['type']) ? type : 'system') as UINotification['type'];
};

export const adaptNotification = (n: ApiNotification): UINotification => ({
  id: String(n.id),
  type: mapNotificationType(n.type),
  title: n.title,
  message: n.message,
  createdAt: n.createdAt,
  read: n.isRead,
  refId:
    (n.data as { swapId?: number; conversationId?: number; reviewId?: number })?.swapId !== undefined
      ? String((n.data as { swapId?: number }).swapId)
      : (n.data as { conversationId?: number })?.conversationId !== undefined
        ? String((n.data as { conversationId?: number }).conversationId)
        : undefined,
});

export const adaptReview = (r: ApiReview): UIReview => ({
  id: String(r.id),
  fromUserId: String(r.reviewerId),
  toUserId: String(r.revieweeId),
  swapId: String(r.swapRequestId),
  rating: r.rating,
  comment: r.comment || '',
  createdAt: r.createdAt?.slice(0, 10) || '',
});

export const adaptAddress = (a: ApiAddress): UIAddress => ({
  id: String(a.id),
  line1: a.addressLine1,
  line2: a.addressLine2 || undefined,
  city: a.city,
  state: a.state || '',
  postal: a.postalCode || '',
  country: a.country,
  isDefault: a.isDefault,
});
