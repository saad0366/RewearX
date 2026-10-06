import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Edit,
  Calendar,
  Star,
  Flag,
  Loader2,
  ChevronRight,
  ShoppingBag,
  Repeat,
  Tag,
  Sparkles,
  User as UserIcon,
  Settings,
  LogOut,
  MapPin,
  ArrowRight,
  Eye,
  Check,
  X,
  MessageCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { User as UserType, PAKISTAN_CITIES } from '../lib/mockData';
import type { Item as UIItem, SwapRequest as UISwap, Review as UIReview } from '../lib/mockData';
import { itemsApi, swapsApi, usersApi, reportsApi } from '../lib/api';
import {
  adaptItem,
  adaptUser,
  adaptSwap,
  adaptReview,
  ApiUser,
  ApiSwap,
} from '../lib/api/types';
import { getSocket } from '../lib/socket';
import ItemCard from '../components/ui/ItemCard';
import StarRating from '../components/ui/StarRating';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

import Badge from '../components/ui/Badge';

interface ProfileProps {
  params?: { id?: string };
  isPublic?: boolean;
}

type Tab = 'overview' | 'listings' | 'history' | 'reviews';
type SwapSubTab = 'received' | 'sent';
type SwapStatusFilter = 'all' | 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';

const STATUS_COLOR: Record<UISwap['status'], 'amber' | 'green' | 'red' | 'teal' | 'gray'> = {
  pending: 'amber',
  accepted: 'green',
  rejected: 'red',
  completed: 'teal',
  cancelled: 'gray',
};

function relativeTime(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

interface DisplaySwap {
  ui: UISwap;
  raw: ApiSwap;
}

export default function Profile({ params, isPublic = false }: ProfileProps) {
  const [, setLocation] = useLocation();
  const { user: me, apiUser, updateUser, signOut } = useAuth();
  const { toast } = useToast();
  const targetId = isPublic ? params?.id : me?.id;
  const isMe = !isPublic;

  const [user, setUser] = useState<UserType | null>(null);
  const [apiTargetUser, setApiTargetUser] = useState<ApiUser | null>(null);
  const [items, setItems] = useState<UIItem[]>([]);
  const [userSwaps, setUserSwaps] = useState<UISwap[]>([]);
  const [userReviews, setUserReviews] = useState<UIReview[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab state synced with URL search params ?tab=...
  const initialSearchTab = useMemo(() => {
    if (typeof window === 'undefined') return 'overview';
    const q = new URLSearchParams(window.location.search).get('tab');
    return q && ['overview', 'listings', 'history', 'reviews'].includes(q) ? (q as Tab) : 'overview';
  }, []);

  const [tab, setTab] = useState<Tab>(initialSearchTab);

  useEffect(() => {
    const checkTab = () => {
      const q = new URLSearchParams(window.location.search).get('tab');
      if (q && ['overview', 'listings', 'history', 'reviews'].includes(q)) {
        setTab(q as Tab);
      }
    };
    checkTab();
    window.addEventListener('popstate', checkTab);
    return () => window.removeEventListener('popstate', checkTab);
  }, []);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', newTab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Detailed Swap Requests & History State
  const [swapSubTab, setSwapSubTab] = useState<SwapSubTab>('received');
  const [swapStatusFilter, setSwapStatusFilter] = useState<SwapStatusFilter>('all');
  const [receivedSwaps, setReceivedSwaps] = useState<DisplaySwap[]>([]);
  const [sentSwaps, setSentSwaps] = useState<DisplaySwap[]>([]);
  const [receivedCount, setReceivedCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [loadingSwaps, setLoadingSwaps] = useState(false);
  const [actingSwapId, setActingSwapId] = useState<string | null>(null);

  const loadProfileSwaps = async () => {
    if (!isMe || !targetId) return;
    setLoadingSwaps(true);
    try {
      const [receivedRes, sentRes] = await Promise.all([
        swapsApi.list({ role: 'received', limit: 50 }).catch(() => ({ items: [] as ApiSwap[] })),
        swapsApi.list({ role: 'sent', limit: 50 }).catch(() => ({ items: [] as ApiSwap[] })),
      ]);

      setReceivedCount(receivedRes.items.length);
      setSentCount(sentRes.items.length);

      setReceivedSwaps(
        receivedRes.items.map((s) => ({
          ui: adaptSwap(s, String(targetId)),
          raw: s,
        }))
      );
      setSentSwaps(
        sentRes.items.map((s) => ({
          ui: adaptSwap(s, String(targetId)),
          raw: s,
        }))
      );
    } catch (err) {
      console.error('Failed loading profile swaps:', err);
    } finally {
      setLoadingSwaps(false);
    }
  };

  useEffect(() => {
    if (isMe && tab === 'history') {
      loadProfileSwaps();
      const socket = getSocket();
      const handleUpdate = () => loadProfileSwaps();
      socket.on('swap-request-new', handleUpdate);
      socket.on('swap-request-updated', handleUpdate);
      return () => {
        socket.off('swap-request-new', handleUpdate);
        socket.off('swap-request-updated', handleUpdate);
      };
    }
  }, [isMe, tab, targetId]);

  const activeSwapsList = useMemo(() => {
    const currentList = swapSubTab === 'received' ? receivedSwaps : sentSwaps;
    let list = currentList;
    if (swapStatusFilter !== 'all') {
      list = list.filter((s) => s.ui.status === swapStatusFilter);
    }
    return list.sort((a, b) => b.ui.createdAt.localeCompare(a.ui.createdAt));
  }, [swapSubTab, swapStatusFilter, receivedSwaps, sentSwaps]);

  const handleSwapStatus = async (id: string, next: 'accepted' | 'rejected' | 'cancelled' | 'completed') => {
    setActingSwapId(id);
    try {
      await swapsApi.updateStatus(id, next);
      toast(`Swap ${next}.`, 'success');
      await loadProfileSwaps();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally {
      setActingSwapId(null);
    }
  };

  // Modals
  const [showEdit, setShowEdit] = useState(false);
  const [showEditPrefs, setShowEditPrefs] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Profile Edit Form State
  const [editForm, setEditForm] = useState({
    name: '',
    bio: '',
    phone: '',
    gender: 'male' as 'male' | 'female' | 'other',
    dob: '',
    avatar: '',
    location: 'Islamabad',
    address: '',
  });

  useEffect(() => {
    if (user && showEdit) {
      const genderUiToApi = { Male: 'male', Female: 'female', Unisex: 'other' } as const;
      setEditForm({
        name: user.name || '',
        bio: user.bio || '',
        phone: user.phone || '',
        gender: (user.gender ? genderUiToApi[user.gender] || 'male' : 'male') as 'male' | 'female' | 'other',
        dob: user.dob || '',
        avatar: user.avatar || '',
        location: user.location || 'Islamabad',
        address: user.address || '',
      });
    }
  }, [user, showEdit]);

  // Preferences State
  const [preferences, setPreferences] = useState({
    styles: ['Trendy', 'Casual', 'Streetwear', 'Minimal'],
    sizes: ['M', 'L', 'XL'],
    colors: ['Black', 'White', 'Beige', 'Navy', 'Grey'],
    categories: ['Jackets', 'Hoodies', 'T-Shirts', 'Denim', 'Sneakers'],
    aiMatches: true,
  });

  const [reportForm, setReportForm] = useState({ reason: 'Inappropriate Behavior', description: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute initials for Avatar fallback
  const initials = useMemo(() => {
    if (!user?.name) return 'AA';
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }, [user?.name]);

  useEffect(() => {
    if (!targetId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const userPromise = isPublic
      ? usersApi.byId(targetId).then((u) => {
          if (cancelled) return null;
          setApiTargetUser(u);
          const ui = adaptUser(u);
          setUser(ui);
          return u;
        })
      : Promise.resolve(apiUser).then((u) => {
          if (!u || cancelled) return null;
          setApiTargetUser(u);
          if (me) setUser(me);
          return u;
        });

    userPromise
      .then(async (u) => {
        if (!u || cancelled) return;

        const itemsPromise = itemsApi
          .byUser(u.id, 1, 50)
          .then(({ items: list }) => {
            const mapped = list.map((i) => adaptItem(i));
            return isPublic ? mapped.filter((i) => i.is_available) : mapped;
          })
          .catch(() => [] as UIItem[]);

        const reviewsPromise = usersApi
          .reviews(u.id, 1, 20)
          .then(({ items: list }) => list.map(adaptReview))
          .catch(() => [] as UIReview[]);

        const swapsPromise = isMe
          ? swapsApi
              .list({ role: 'all', limit: 50 })
              .then(({ items: list }) => list.map((s) => adaptSwap(s, String(u.id))))
              .catch(() => [] as UISwap[])
          : Promise.resolve([] as UISwap[]);

        const prefsPromise = isMe
          ? usersApi.preferences().catch(() => null)
          : Promise.resolve(null);

        const [its, revs, sws, prefsData] = await Promise.all([itemsPromise, reviewsPromise, swapsPromise, prefsPromise]);
        if (cancelled) return;

        setItems(its);
        setUserReviews(revs);
        setUserSwaps(sws);

        if (prefsData) {
          setPreferences((prev) => ({
            styles: prefsData.preferredStyles?.length ? prefsData.preferredStyles : prev.styles,
            sizes: prefsData.preferredSizes?.length ? prefsData.preferredSizes : prev.sizes,
            colors: prefsData.preferredColors?.length ? prefsData.preferredColors : prev.colors,
            categories: prefsData.preferredCategories?.length ? prefsData.preferredCategories.map(String) : prev.categories,
            aiMatches: prev.aiMatches,
          }));
        }

        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetId, isPublic, apiUser, me, isMe]);

  useEffect(() => {
    if (showEdit && me && apiUser) {
      setEditForm({
        name: me.name || '',
        bio: me.bio || '',
        phone: me.phone || '',
        gender: (apiUser.gender as 'male' | 'female' | 'other') || 'male',
        dob: apiUser.dateOfBirth?.slice(0, 10) || '',
        avatar: me.avatar || '',
        location: apiUser.location || '',
        address: apiUser.address || '',
      });
    }
  }, [showEdit, me, apiUser]);

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'listings', label: isMe ? 'My Listings' : 'Listings' },
      { id: 'history', label: 'Swap History', hidden: !isMe },
      { id: 'reviews', label: 'Reviews' },
    ],
    [isMe]
  );

  // Dynamic Marketplace Activity Data
  const activityList = useMemo(() => {
    const list: {
      id: string;
      title: string;
      subtitle: string;
      status: string;
      statusColor: 'listed' | 'completed' | 'request';
      timestamp: string;
      image?: string;
      link: string;
    }[] = [];

    // Map listed items
    items.forEach((it) => {
      list.push({
        id: `item-${it.id}`,
        title: it.title,
        subtitle: 'Listed your item for swap',
        status: 'Listed',
        statusColor: 'listed',
        timestamp: it.createdAt ? new Date(it.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently',
        image: it.images?.[0] || 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=200',
        link: `/items/${it.id}`,
      });
    });

    // Map swaps
    userSwaps.forEach((sw) => {
      const isCompleted = sw.status === 'completed';
      const isAccepted = sw.status === 'accepted';
      list.push({
        id: `swap-${sw.id}`,
        title: sw.requestedItem?.title || sw.offeredItem?.title || items.find(it => it.id === sw.requestedItemId)?.title || items.find(it => it.id === sw.offeredItemId)?.title || `Swap Request #${sw.id}`,
        subtitle: isCompleted ? 'Swapped with another user' : 'Received a swap request',
        status: isCompleted ? 'Completed' : isAccepted ? 'Accepted' : 'Request',
        statusColor: isCompleted ? 'completed' : 'request',
        timestamp: sw.createdAt ? new Date(sw.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently',
        image: sw.requestedItem?.images[0] || sw.offeredItem?.images[0] || items.find(it => it.id === sw.requestedItemId)?.images[0] || items.find(it => it.id === sw.offeredItemId)?.images[0] || 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=200',
        link: `/swaps/${sw.id}`,
      });
    });

    // Fallback sample activity if no real items or swaps exist yet
    if (list.length === 0) {
      return [
        {
          id: 'demo-1',
          title: 'Nike Windrunner Jacket',
          subtitle: 'Listed your item for swap',
          status: 'Listed',
          statusColor: 'listed' as const,
          timestamp: 'Sep 26, 2026 - 10:24 AM',
          image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=200',
          link: '/browse',
        },
        {
          id: 'demo-2',
          title: 'Adidas Samba Sneakers',
          subtitle: 'Swapped with another user',
          status: 'Completed',
          statusColor: 'completed' as const,
          timestamp: 'Sep 24, 2026 - 04:17 PM',
          image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&q=80&w=200',
          link: '/swaps',
        },
        {
          id: 'demo-3',
          title: 'Brown Hoodie',
          subtitle: 'Received a swap request',
          status: 'Request',
          statusColor: 'request' as const,
          timestamp: 'Sep 22, 2026 - 11:03 AM',
          image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=200',
          link: '/swaps',
        },
        {
          id: 'demo-4',
          title: 'Black Cap',
          subtitle: 'Listed your item for swap',
          status: 'Listed',
          statusColor: 'listed' as const,
          timestamp: 'Sep 20, 2026 - 09:48 PM',
          image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&q=80&w=200',
          link: '/browse',
        },
      ];
    }

    return list.slice(0, 5);
  }, [items, userSwaps]);

  if (loading) {
    return (
      <div className="pt-32 flex justify-center text-[#2E4D3A]">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="pt-32">
        <EmptyState
          title="User not found"
          message="This profile may have been removed."
          actionLabel="Back to browse"
          onAction={() => setLocation('/browse')}
        />
      </div>
    );
  }

  const handleEditSave = async () => {
    setSavingProfile(true);
    try {
      await updateUser({
        name: editForm.name,
        bio: editForm.bio,
        phone: editForm.phone,
        gender: editForm.gender,
        dateOfBirth: editForm.dob || undefined,
        location: editForm.location,
        address: editForm.address,
      });
      setUser((prev) =>
        prev
          ? {
              ...prev,
              name: editForm.name,
              bio: editForm.bio,
              phone: editForm.phone,
              gender: editForm.gender === 'male' ? 'Male' : editForm.gender === 'female' ? 'Female' : 'Unisex',
              location: editForm.location,
              address: editForm.address,
            }
          : null
      );
      toast('Profile updated successfully.', 'success');
      setShowEdit(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarChange = async (file: File) => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const updated = await usersApi.uploadAvatar(file);
      const next = adaptUser(updated);
      setEditForm((f) => ({ ...f, avatar: next.avatar }));
      setUser(next);
      toast('Avatar updated successfully.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      if (isMe) {
        await usersApi.updatePreferences({
          preferredSizes: preferences.sizes,
          preferredColors: preferences.colors,
          preferredStyles: preferences.styles,
        });
      }
      toast('Preferences saved successfully.', 'success');
      setShowEditPrefs(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save preferences.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleReport = async () => {
    if (!reportForm.description.trim()) {
      toast('Please describe your concern.', 'error');
      return;
    }
    if (!apiTargetUser) return;
    setSubmittingReport(true);
    try {
      await reportsApi.create({
        reportedUserId: apiTargetUser.id,
        reason: reportForm.reason,
        description: reportForm.description,
      });
      toast('Report submitted. Our team will review it shortly.', 'success');
      setShowReport(false);
      setReportForm({ reason: 'Inappropriate Behavior', description: '' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Submit failed.', 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  const joinedFormatted = user.joined
    ? new Date(user.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'Recently';

  const userRatingFormatted = user.rating > 0 ? user.rating.toFixed(1) : 'New';
  const totalReviewsCount = user.reviewCount || userReviews.length || 0;

  return (
    <div className="min-h-screen bg-[#FBF9F4] font-body text-[#1E1B18] pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

        {/* ── 1. PROFILE HEADER CARD WITH BANNER ── */}
        <div className="bg-white rounded-2xl border border-[#E9E4DB] shadow-xs overflow-hidden">
          
          {/* Cover Banner */}
          <div className="h-44 sm:h-52 w-full relative overflow-hidden bg-[#1E1B18]">
            <img
              src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=2000"
              alt="Profile Cover"
              className="w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </div>

          {/* User Info Bar */}
          <div className="px-6 sm:px-8 pb-6 pt-0 relative flex flex-col md:flex-row md:items-end justify-between gap-6">
            
            {/* Avatar + Main Info */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-5 -mt-12 sm:-mt-14 z-10">
              
              {/* Avatar Circle */}
              <div className="relative shrink-0">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-md object-cover bg-white"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-md bg-gradient-to-br from-[#3B82F6] to-[#A855F7] text-white font-serif font-bold text-2xl sm:text-3xl flex items-center justify-center tracking-wider">
                    {initials}
                  </div>
                )}
              </div>

              {/* Name & Joined */}
              <div className="pt-1">
                <h1 className="font-headings text-2xl sm:text-3xl font-bold text-[#1E1B18]">
                  {user.name}
                </h1>
                <div className="flex items-center gap-3 text-xs text-[#7D7265] mt-1 font-medium flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-[#7D7265]" />
                    <span>Joined {joinedFormatted}</span>
                  </div>
                  {user.location && (
                    <div className="flex items-center gap-1.5 text-[#2E4D3A] font-semibold">
                      <MapPin size={13} className="text-[#2E4D3A]" />
                      <span>{user.location}, Pakistan</span>
                    </div>
                  )}
                  {user.address && (
                    <div className="text-[11px] text-[#7D7265] bg-[#F4EAE1]/50 px-2 py-0.5 rounded-md truncate max-w-xs font-normal">
                      🏠 {user.address}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Side: Stats & Action Button */}
            <div className="flex items-center gap-6 sm:gap-8 flex-wrap justify-between md:justify-end">
              
              {/* Stats Counters */}
              <div className="flex items-center gap-6 text-center">
                
                {/* Rating */}
                <div className="pr-4 border-r border-[#E9E4DB]">
                  <div className="flex items-center justify-center gap-1 font-bold text-sm text-[#1E1B18]">
                    <Star size={13} className="fill-[#1E1B18] text-[#1E1B18]" />
                    <span>{userRatingFormatted}</span>
                  </div>
                  <p className="text-[11px] text-[#7D7265] font-normal mt-0.5">
                    ({totalReviewsCount} {totalReviewsCount === 1 ? 'review' : 'reviews'})
                  </p>
                </div>

                {/* Listings Count */}
                <div className="pr-4 border-r border-[#E9E4DB]">
                  <p className="font-headings text-base font-bold text-[#1E1B18]">
                    {user.listingsCount ?? items.length}
                  </p>
                  <p className="text-[11px] text-[#7D7265] font-normal mt-0.5">Listings</p>
                </div>

                {/* Swaps Count */}
                <div className="pr-4 border-r border-[#E9E4DB]">
                  <p className="font-headings text-base font-bold text-[#1E1B18]">
                    {user.swapsCompleted ?? userSwaps.length}
                  </p>
                  <p className="text-[11px] text-[#7D7265] font-normal mt-0.5">Swaps</p>
                </div>

                {/* Overall Rating Indicator */}
                <div>
                  <p className="font-headings text-base font-bold text-[#1E1B18]">
                    {user.rating > 0 ? user.rating.toFixed(1) : '0.0'}
                  </p>
                  <p className="text-[11px] text-[#7D7265] font-normal mt-0.5">Rating</p>
                </div>

              </div>

              {/* Edit / Settings / Sign Out / Report Buttons */}
              {isMe ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setShowEdit(true)}
                    className="px-4 py-2 rounded-full border border-[#1E1B18] text-[#1E1B18] hover:bg-[#1E1B18] hover:text-white font-medium text-xs tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Edit size={13} />
                    <span>Edit Profile</span>
                  </button>
                  <Link href="/settings">
                    <button
                      className="px-4 py-2 rounded-full border border-[#E9E4DB] text-[#1E1B18] hover:bg-[#F4EAE1]/60 font-medium text-xs tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Settings size={13} />
                      <span>Settings</span>
                    </button>
                  </Link>
                  <button
                    onClick={async () => {
                      await signOut();
                      setLocation('/');
                    }}
                    className="px-4 py-2 rounded-full border border-rose-200 bg-rose-50/50 text-rose-700 hover:bg-rose-600 hover:text-white font-medium text-xs tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <LogOut size={13} />
                    <span>Sign out</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowReport(true)}
                  className="px-5 py-2 rounded-full border border-rose-300 text-rose-700 hover:bg-rose-50 font-medium text-xs tracking-wide transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Flag size={13} />
                  <span>Report User</span>
                </button>
              )}

            </div>
          </div>
        </div>

        {/* ── 2. TAB NAVIGATION BAR ── */}
        <div className="mt-6 border-b border-[#E9E4DB]">
          <div className="flex gap-8 overflow-x-auto no-scrollbar">
            {tabs
              .filter((t) => !t.hidden)
              .map((t) => {
                const isActive = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleTabChange(t.id)}
                    className={`relative pb-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      isActive ? 'text-[#1E1B18]' : 'text-[#7D7265] hover:text-[#1E1B18]'
                    }`}
                  >
                    <span>{t.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="profile-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#2E4D3A] rounded-full"
                      />
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        {/* ── 3. MAIN TAB CONTENT ── */}
        <div className="mt-6">
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* ── LEFT COLUMN: Account Details & Quick Stats (5 cols) ── */}
              <div className="lg:col-span-5 space-y-6">

                {/* Account Details Card */}
                <div className="bg-white rounded-2xl border border-[#E9E4DB] p-6 shadow-xs">
                  <h3 className="font-headings text-lg font-bold text-[#1E1B18]">Account Details</h3>
                  <p className="text-xs text-[#7D7265] mt-1 mb-5">
                    This information is visible to other users on the marketplace.
                  </p>

                  <div className="space-y-4 text-xs font-medium">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[#7D7265]">Full Name</span>
                      <span className="font-bold text-[#1E1B18]">{user.name}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-t border-[#E9E4DB]/60">
                      <span className="text-[#7D7265]">Phone</span>
                      <span className="text-[#1E1B18] font-semibold">{user.phone || '&mdash;'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-t border-[#E9E4DB]/60">
                      <span className="text-[#7D7265]">Date of Birth</span>
                      <span className="text-[#1E1B18] font-semibold">{user.dob || '&mdash;'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-t border-[#E9E4DB]/60">
                      <span className="text-[#7D7265]">Gender</span>
                      <span className="font-bold text-[#1E1B18]">
                        {user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'Male'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-t border-[#E9E4DB]/60">
                      <span className="text-[#7D7265]">Location</span>
                      <span className="font-bold text-[#1E1B18]">{user.location || 'Pakistan'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-t border-[#E9E4DB]/60">
                      <span className="text-[#7D7265]">Joined</span>
                      <span className="text-[#1E1B18] font-semibold">{joinedFormatted}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Stats Card */}
                <div className="bg-white rounded-2xl border border-[#E9E4DB] p-6 shadow-xs">
                  <h4 className="font-headings font-bold text-xs uppercase tracking-wider text-[#7D7265] mb-4">
                    Quick Stats
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    
                    {/* Listings Stat */}
                    <div className="p-3 rounded-xl bg-[#FBF9F4] border border-[#E9E4DB]/60">
                      <div className="w-8 h-8 rounded-full bg-[#2E4D3A]/10 text-[#2E4D3A] mx-auto flex items-center justify-center mb-2">
                        <ShoppingBag size={15} />
                      </div>
                      <p className="font-headings font-bold text-base text-[#1E1B18]">
                        {items.length || user.listingsCount || 0}
                      </p>
                      <p className="text-[10px] text-[#7D7265] mt-0.5 font-medium">Total Listings</p>
                    </div>

                    {/* Swaps Stat */}
                    <div className="p-3 rounded-xl bg-[#FBF9F4] border border-[#E9E4DB]/60">
                      <div className="w-8 h-8 rounded-full bg-[#2E4D3A]/10 text-[#2E4D3A] mx-auto flex items-center justify-center mb-2">
                        <Repeat size={15} />
                      </div>
                      <p className="font-headings font-bold text-base text-[#1E1B18]">
                        {userSwaps.length || user.swapsCompleted || 0}
                      </p>
                      <p className="text-[10px] text-[#7D7265] mt-0.5 font-medium">Total Swaps</p>
                    </div>

                    {/* Rating Stat */}
                    <div className="p-3 rounded-xl bg-[#FBF9F4] border border-[#E9E4DB]/60">
                      <div className="w-8 h-8 rounded-full bg-[#2E4D3A]/10 text-[#2E4D3A] mx-auto flex items-center justify-center mb-2">
                        <Star size={15} />
                      </div>
                      <p className="font-headings font-bold text-base text-[#1E1B18]">
                        {user.rating > 0 ? user.rating.toFixed(1) : '0.0'}
                      </p>
                      <p className="text-[10px] text-[#7D7265] mt-0.5 font-medium">Rating</p>
                    </div>

                  </div>
                </div>

              </div>

              {/* ── RIGHT COLUMN: Style Preferences & Marketplace Activity (7 cols) ── */}
              <div className="lg:col-span-7 space-y-6">

                {/* Your Marketplace Activity Card */}
                <div className="bg-white rounded-2xl border border-[#E9E4DB] p-6 shadow-xs">
                  <div className="flex items-center justify-between pb-4 border-b border-[#E9E4DB]/60">
                    <h3 className="font-headings text-lg font-bold text-[#1E1B18]">Your Marketplace Activity</h3>
                    <Link href="/browse" className="text-xs font-semibold text-[#1E1B18] hover:text-[#2E4D3A] flex items-center gap-1 transition-colors">
                      <span>View All</span>
                      <ChevronRight size={13} />
                    </Link>
                  </div>

                  {/* Activity Rows */}
                  <div className="divide-y divide-[#E9E4DB]/50">
                    {activityList.map((act) => (
                      <Link key={act.id} href={act.link}>
                        <div className="py-3.5 flex items-center justify-between gap-4 hover:bg-[#FBF9F4] px-2 rounded-xl transition-colors cursor-pointer group">
                          
                          {/* Item Thumbnail & Info */}
                          <div className="flex items-center gap-3.5 min-w-0">
                            <img
                              src={act.image}
                              alt={act.title}
                              className="w-11 h-11 rounded-lg object-cover bg-[#F4EAE1]"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-[#1E1B18] truncate group-hover:text-[#2E4D3A] transition-colors">
                                {act.title}
                              </p>
                              <p className="text-[11px] text-[#7D7265] mt-0.5 truncate">
                                {act.subtitle}
                              </p>
                            </div>
                          </div>

                          {/* Status Badge & Timestamp */}
                          <div className="flex items-center gap-4 shrink-0">
                            
                            {/* Status Badge */}
                            <span
                              className={`px-3 py-0.5 rounded-full text-[10px] font-bold ${
                                act.statusColor === 'listed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : act.statusColor === 'completed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : 'bg-sky-50 text-sky-700 border border-sky-200/60'
                              }`}
                            >
                              {act.status}
                            </span>

                            {/* Timestamp */}
                            <span className="text-[10px] text-[#7D7265] font-medium hidden sm:inline">
                              {act.timestamp}
                            </span>

                            {/* Chevron Arrow */}
                            <ChevronRight size={15} className="text-[#7D7265] group-hover:translate-x-0.5 transition-transform" />
                          </div>

                        </div>
                      </Link>
                    ))}
                  </div>

                </div>

              </div>

            </div>
          )}

          {/* ── MY LISTINGS TAB ── */}
          {tab === 'listings' && (
            <>
              {items.length === 0 ? (
                <EmptyState
                  title={isMe ? 'No listings yet' : 'No active listings'}
                  message={
                    isMe
                      ? 'Share your first piece with the community.'
                      : `${user.name.split(' ')[0]} hasn't listed anything yet.`
                  }
                  actionLabel={isMe ? 'List an item' : undefined}
                  onAction={isMe ? () => setLocation('/items/new') : undefined}
                />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {items.map((it) => (
                    <ItemCard key={it.id} item={it} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── SWAP HISTORY & REQUESTS TAB ── */}
          {tab === 'history' && isMe && (
            <div className="space-y-6">
              {/* Section Header */}
              <div className="bg-white rounded-2xl border border-[#E9E4DB] p-6 shadow-xs">
                <div className="mb-5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#2E4D3A]">
                    YOUR ACTIVITY
                  </span>
                  <h2 className="font-headings text-2xl font-bold text-[#1E1B18] mt-0.5">
                    Swap requests
                  </h2>
                </div>

                {/* Sub-Tab Pills: RECEIVED (X) | SENT (Y) */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setSwapSubTab('received')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      swapSubTab === 'received'
                        ? 'bg-[#1E1B18] text-white shadow-xs'
                        : 'bg-[#FBF9F4] text-[#1E1B18] border border-[#E9E4DB] hover:bg-[#F4EAE1]/60'
                    }`}
                  >
                    RECEIVED ({receivedCount})
                  </button>
                  <button
                    onClick={() => setSwapSubTab('sent')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      swapSubTab === 'sent'
                        ? 'bg-[#1E1B18] text-white shadow-xs'
                        : 'bg-[#FBF9F4] text-[#1E1B18] border border-[#E9E4DB] hover:bg-[#F4EAE1]/60'
                    }`}
                  >
                    SENT ({sentCount})
                  </button>
                </div>

                {/* Status Filter Buttons */}
                <div className="flex flex-wrap gap-1.5 pt-3 border-t border-[#E9E4DB]/60">
                  {(['all', 'pending', 'accepted', 'rejected', 'completed', 'cancelled'] as SwapStatusFilter[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSwapStatusFilter(s)}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        swapStatusFilter === s
                          ? 'bg-[#1E1B18] text-white shadow-xs'
                          : 'bg-white text-[#7D7265] border border-[#E9E4DB] hover:text-[#1E1B18] hover:bg-[#FBF9F4]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Swaps List / Loading / Empty State */}
              {loadingSwaps ? (
                <div className="bg-white rounded-2xl border border-[#E9E4DB] p-12 flex items-center justify-center text-[#2E4D3A]">
                  <Loader2 size={28} className="animate-spin" />
                </div>
              ) : activeSwapsList.length === 0 ? (
                <div className="bg-white rounded-2xl border border-[#E9E4DB] p-10 sm:p-14 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[#F4EAE1] flex items-center justify-center mb-4 text-[#1E1B18]">
                    <Repeat size={28} />
                  </div>
                  <h3 className="font-headings text-xl font-bold text-[#1E1B18]">
                    {swapSubTab === 'received' ? 'No incoming requests' : 'No outgoing requests'}
                  </h3>
                  <p className="text-xs text-[#7D7265] mt-1.5 max-w-md">
                    {swapSubTab === 'received'
                      ? 'When someone proposes a swap on your listings, it will show up here.'
                      : 'Find a piece you love in Browse and send your first swap request.'}
                  </p>
                  <button
                    onClick={() => setLocation('/browse')}
                    className="mt-6 px-6 py-3 rounded-xl bg-[#1E1B18] text-white text-xs font-bold tracking-wider uppercase hover:bg-[#2E4D3A] transition-all cursor-pointer shadow-xs"
                  >
                    BROWSE ITEMS
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeSwapsList.map(({ ui, raw }) => {
                    const offered = raw.senderItem;
                    const requested = raw.receiverItem;
                    const isReceiver = swapSubTab === 'received';
                    const otherUser = isReceiver ? raw.sender : raw.receiver;

                    return (
                      <div
                        key={ui.id}
                        className="bg-white rounded-2xl border border-[#E9E4DB] p-4 sm:p-5 hover:border-[#2E4D3A] transition-all shadow-xs"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Items Row */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* Offered Item */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {offered?.images?.[0]?.url ? (
                                <img
                                  src={offered.images[0].url}
                                  alt={offered.title}
                                  className="w-12 h-12 rounded-xl object-cover border border-[#E9E4DB] shrink-0 bg-[#F4EAE1]"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl border border-[#E9E4DB] bg-[#F4EAE1] flex items-center justify-center shrink-0 text-xs font-bold text-[#7D7265]">
                                  Item
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-[9px] uppercase tracking-wider font-bold text-[#7D7265]">
                                  {isReceiver ? 'They offer' : 'You offer'}
                                </p>
                                <p className="text-xs font-bold text-[#1E1B18] truncate max-w-[140px]">
                                  {offered?.title || `Item #${ui.offeredItemId}`}
                                </p>
                              </div>
                            </div>

                            <ArrowRight size={16} className="text-[#2E4D3A] shrink-0" />

                            {/* Requested Item */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {requested?.images?.[0]?.url ? (
                                <img
                                  src={requested.images[0].url}
                                  alt={requested.title}
                                  className="w-12 h-12 rounded-xl object-cover border border-[#E9E4DB] shrink-0 bg-[#F4EAE1]"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl border border-[#E9E4DB] bg-[#F4EAE1] flex items-center justify-center shrink-0 text-xs font-bold text-[#7D7265]">
                                  Item
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-[9px] uppercase tracking-wider font-bold text-[#7D7265]">
                                  {isReceiver ? 'For your' : 'For their'}
                                </p>
                                <p className="text-xs font-bold text-[#1E1B18] truncate max-w-[140px]">
                                  {requested?.title || `Item #${ui.requestedItemId}`}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* User Info & Badge */}
                          <div className="flex items-center lg:flex-col lg:items-end justify-between lg:justify-center gap-2 shrink-0">
                            {otherUser && (
                              <div className="flex items-center gap-2">
                                {otherUser.profileImage ? (
                                  <img src={otherUser.profileImage} alt={otherUser.name || ''} className="w-6 h-6 rounded-full object-cover" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-[#2E4D3A] text-white text-[10px] font-bold flex items-center justify-center">
                                    {otherUser.name?.[0]?.toUpperCase() || 'U'}
                                  </div>
                                )}
                                <span className="text-xs font-semibold text-[#1E1B18]">{otherUser.name}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Badge color={STATUS_COLOR[ui.status]}>{ui.status}</Badge>
                              <span className="text-[10px] text-[#7D7265] font-medium">
                                {relativeTime(raw.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Message if present */}
                        {ui.message && (
                          <p className="text-xs italic text-[#7D7265] mt-2.5 line-clamp-1 border-l-2 border-[#2E4D3A] pl-2.5">
                            "{ui.message}"
                          </p>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#E9E4DB]/60">
                          <Link href={`/swaps/${ui.id}`}>
                            <button className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-[#E9E4DB] hover:bg-[#FBF9F4] text-[#1E1B18] flex items-center gap-1.5 transition-colors cursor-pointer">
                              <Eye size={13} /> View Details
                            </button>
                          </Link>

                          {ui.status === 'pending' && isReceiver && (
                            <>
                              <button
                                onClick={() => handleSwapStatus(ui.id, 'accepted')}
                                disabled={actingSwapId === ui.id}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#2E4D3A] text-white hover:bg-[#233a2c] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                              >
                                {actingSwapId === ui.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Accept
                              </button>
                              <button
                                onClick={() => handleSwapStatus(ui.id, 'rejected')}
                                disabled={actingSwapId === ui.id}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-rose-200 text-rose-700 hover:bg-rose-50 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                              >
                                <X size={13} /> Reject
                              </button>
                            </>
                          )}

                          {ui.status === 'pending' && !isReceiver && (
                            <button
                              onClick={() => handleSwapStatus(ui.id, 'cancelled')}
                              disabled={actingSwapId === ui.id}
                              className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-[#E9E4DB] text-[#1E1B18] hover:bg-[#FBF9F4] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                            >
                              <X size={13} /> Cancel Request
                            </button>
                          )}

                          {ui.status === 'accepted' && (
                            <>
                              {ui.conversationId && (
                                <Link href={`/chat/${ui.conversationId}`}>
                                  <button className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#1E1B18] text-white hover:bg-[#2E4D3A] flex items-center gap-1.5 transition-colors cursor-pointer">
                                    <MessageCircle size={13} /> Open Chat
                                  </button>
                                </Link>
                              )}
                              <button
                                onClick={() => handleSwapStatus(ui.id, 'completed')}
                                disabled={actingSwapId === ui.id}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-[#2E4D3A] text-[#2E4D3A] hover:bg-[#2E4D3A]/10 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                              >
                                <Check size={13} /> Mark Completed
                              </button>
                            </>
                          )}

                          {ui.status === 'completed' && (
                            ui.hasReviewed ? (
                              <span className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1.5 cursor-default">
                                <Check size={13} className="text-emerald-600" /> Review Submitted
                              </span>
                            ) : (
                              <Link href={`/swaps/${ui.id}`}>
                                <button className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#2E4D3A] text-white hover:bg-[#233a2c] flex items-center gap-1.5 transition-colors cursor-pointer">
                                  <Star size={13} /> Leave Review
                                </button>
                              </Link>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── REVIEWS TAB ── */}
          {tab === 'reviews' && (
            <div className="space-y-3">
              {userReviews.length === 0 ? (
                <EmptyState
                  icon={Star}
                  title="No reviews yet"
                  message={`${user.name.split(' ')[0]} will get reviews after completed swaps.`}
                />
              ) : (
                userReviews.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-[#E9E4DB] bg-white p-5 flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="font-headings font-bold text-[#1E1B18] text-sm">Reviewer #{r.fromUserId}</p>
                        <span className="text-xs text-[#7D7265]">{r.createdAt}</span>
                      </div>
                      <StarRating value={r.rating} readOnly size={14} />
                      {r.comment && <p className="text-xs text-[#1E1B18] mt-2 leading-relaxed italic">"{r.comment}"</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>

      </div>

      {/* ── EDIT PROFILE MODAL ── */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Profile" size="md">
        <div className="space-y-4 font-body">
          <div className="flex items-center gap-4">
            <img src={editForm.avatar || user.avatar} alt="avatar" className="w-16 h-16 rounded-full object-cover ring-2 ring-[#E9E4DB]" />
            <div>
              <p className="text-xs font-semibold text-[#7D7265] mb-1">Profile Photo</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files && handleAvatarChange(e.target.files[0])}
              />
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-bold text-[#2E4D3A] hover:underline cursor-pointer disabled:opacity-60"
              >
                {uploadingAvatar ? 'Uploading…' : 'Change photo'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#1E1B18]">Full Name</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#1E1B18]">Bio</label>
            <textarea
              rows={3}
              value={editForm.bio}
              onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#1E1B18]">Phone</label>
              <input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#1E1B18]">Gender</label>
              <select
                value={editForm.gender}
                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as 'male' | 'female' | 'other' })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18]"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#1E1B18] flex items-center gap-1">
                <MapPin size={12} className="text-[#2E4D3A]" /> Location (City)
              </label>
              <select
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18] cursor-pointer"
              >
                {PAKISTAN_CITIES.filter((c) => c !== 'All Pakistan').map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#1E1B18]">Date of Birth</label>
              <input
                type="date"
                value={editForm.dob}
                onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#1E1B18]">Street / Shipping Address</label>
            <input
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              placeholder="e.g. House #12, Street 4, Sector F-7/2"
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18]"
            />
          </div>

          <button
            onClick={handleEditSave}
            disabled={savingProfile}
            className="w-full py-3 rounded-full bg-[#2E4D3A] text-white font-medium text-xs hover:bg-[#233a2c] transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
          >
            {savingProfile && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </Modal>

      {/* ── EDIT PREFERENCES MODAL ── */}
      <Modal isOpen={showEditPrefs} onClose={() => setShowEditPrefs(false)} title="Edit Style Preferences" size="md">
        <div className="space-y-4 font-body">
          <p className="text-xs text-[#7D7265]">
            Select your preferred clothing styles, sizes, and colors to personalize your ReWearX recommendations.
          </p>

          <div>
            <label className="text-xs font-bold text-[#1E1B18] block mb-1.5">Preferred Sizes</label>
            <div className="flex flex-wrap gap-2">
              {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((sz) => {
                const active = preferences.sizes.includes(sz);
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      setPreferences((prev) => ({
                        ...prev,
                        sizes: active ? prev.sizes.filter((s) => s !== sz) : [...prev.sizes, sz],
                      }));
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      active ? 'bg-[#2E4D3A] text-white' : 'bg-[#F4EAE1] text-[#1E1B18]'
                    }`}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#1E1B18] block mb-1.5">Preferred Colors</label>
            <div className="flex flex-wrap gap-2">
              {['Black', 'White', 'Beige', 'Navy', 'Grey', 'Brown', 'Red', 'Green'].map((cl) => {
                const active = preferences.colors.includes(cl);
                return (
                  <button
                    key={cl}
                    type="button"
                    onClick={() => {
                      setPreferences((prev) => ({
                        ...prev,
                        colors: active ? prev.colors.filter((c) => c !== cl) : [...prev.colors, cl],
                      }));
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      active ? 'bg-[#2E4D3A] text-white' : 'bg-[#F4EAE1] text-[#1E1B18]'
                    }`}
                  >
                    {cl}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleSavePreferences}
            disabled={savingPrefs}
            className="w-full py-3 rounded-full bg-[#2E4D3A] text-white font-medium text-xs hover:bg-[#233a2c] transition-all cursor-pointer flex items-center justify-center gap-2 mt-4 disabled:opacity-60"
          >
            {savingPrefs && <Loader2 size={14} className="animate-spin" />}
            Save Preferences
          </button>
        </div>
      </Modal>

      {/* ── REPORT USER MODAL ── */}
      <Modal isOpen={showReport} onClose={() => setShowReport(false)} title={`Report ${user.name}`} size="md">
        <div className="space-y-4 font-body">
          <div>
            <label className="text-xs font-bold text-[#1E1B18]">Reason</label>
            <select
              value={reportForm.reason}
              onChange={(e) => setReportForm({ ...reportForm, reason: e.target.value })}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none"
            >
              <option>Inappropriate Behavior</option>
              <option>Fake Listing</option>
              <option>Fraud / Scam</option>
              <option>Harassment</option>
              <option>Spam</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[#1E1B18]">Description</label>
            <textarea
              rows={4}
              value={reportForm.description}
              onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
              placeholder="Describe your concern in detail…"
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none resize-none"
            />
          </div>
          <button
            onClick={handleReport}
            disabled={submittingReport}
            className="w-full py-3 rounded-full bg-rose-600 text-white font-medium text-xs hover:bg-rose-700 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submittingReport && <Loader2 size={14} className="animate-spin" />}
            Submit Report
          </button>
        </div>
      </Modal>

    </div>
  );
}
