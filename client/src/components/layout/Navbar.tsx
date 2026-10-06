import {
  RefreshCw,
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  Bell,
  Heart,
  Home,
  Repeat,
  MessageCircle,
  Sparkles,
  Settings,
  User as UserIcon,
  LogOut,
  Plus,
  Search,
  MapPin,
  Check,
  Grid,
  Shirt,
  Smartphone,
  Watch,
  ShoppingBag,
  Layers,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { notificationsApi, swapsApi, chatApi, savedApi, categoriesApi } from '../../lib/api';
import { adaptNotification } from '../../lib/api/types';
import { PAKISTAN_CITIES, type Notification as UINotification } from '../../lib/mockData';
import { getSocket } from '../../lib/socket';
import logoImg from '@/assets/logo.png';

const LOCATIONS = PAKISTAN_CITIES;

const SEARCH_CATEGORIES = [
  { label: 'All Categories', value: '' },
  { label: 'Men', value: 'Men' },
  { label: 'Women', value: 'Women' },
  { label: 'Unisex', value: 'Unisex' },
  { label: 'T-Shirts', value: 'T-Shirts' },
  { label: 'Hoodies', value: 'Hoodies' },
  { label: 'Shalwar Kameez', value: 'Shalwar Kameez' },
];

const SUB_NAV_LINKS = [
  { name: "About us", href: '/about' },
  { name: "How it works", href: '/how-it-works' },
  { name: "Browse items", href: '/browse' },
  { name: "Disputes & Escrow", href: '/disputes' },
  { name: 'Contact us', href: '/contact' },
];

export default function Navbar() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, signOut } = useAuth();
  const [apiCategories, setApiCategories] = useState<import('../../lib/api/types').ApiCategory[]>([]);

  useEffect(() => {
    categoriesApi.list().then(setApiCategories).catch(() => undefined);
  }, []);

  const categoryGroups = useMemo(() => {
    const parents = apiCategories.filter((c) => !c.parentId);
    if (parents.length === 0) {
      return [
        {
          name: 'Men',
          subs: ['T-Shirts', 'Shirts', 'Hoodies', 'Sweaters', 'Jackets', 'Jeans', 'Trousers', 'Shalwar Kameez'],
        },
        {
          name: 'Women',
          subs: ['T-Shirts', 'Shirts', 'Hoodies', 'Sweaters', 'Jackets', 'Jeans', 'Trousers', 'Dresses', 'Kurtis', 'Shalwar Kameez', 'Lehengas'],
        },
        {
          name: 'Unisex',
          subs: ['T-Shirts', 'Hoodies', 'Sweaters', 'Jackets'],
        },
      ];
    }
    return parents.map((p) => ({
      name: p.name,
      subs: apiCategories.filter((c) => c.parentId === p.id).map((s) => s.name),
    }));
  }, [apiCategories]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSearchCat, setSelectedSearchCat] = useState('');
  const [selectedCity, setSelectedCity] = useState('All Pakistan');
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [isCategorySelectOpen, setIsCategorySelectOpen] = useState(false);

  // Menus
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);

  // Counters
  const [notifications, setNotifications] = useState<UINotification[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [pendingSwaps, setPendingSwaps] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const categorySelectRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const browseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openBrowse = () => {
    if (browseTimeoutRef.current) clearTimeout(browseTimeoutRef.current);
    setIsBrowseOpen(true);
  };

  const userInitials = useMemo(() => {
    if (!user?.name) return 'AA';
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }, [user?.name]);

  const closeBrowse = () => {
    browseTimeoutRef.current = setTimeout(() => setIsBrowseOpen(false), 150);
  };

  const searchCategoryOptions = useMemo(() => {
    const options: { label: string; value: string; isSub?: boolean }[] = [
      { label: 'All Categories', value: '' },
    ];
    if (!apiCategories || apiCategories.length === 0) {
      options.push(
        { label: 'Men', value: 'Men' },
        { label: 'Women', value: 'Women' },
        { label: 'Unisex', value: 'Unisex' }
      );
      return options;
    }

    const parents = apiCategories.filter((c) => !c.parentId);
    parents.forEach((parent) => {
      options.push({ label: parent.name, value: parent.name });
      const subs = apiCategories.filter((c) => c.parentId === parent.id);
      subs.forEach((sub) => {
        options.push({ label: sub.name, value: sub.name, isSub: true });
      });
    });

    return options;
  }, [apiCategories]);

  // Sync search state from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qParam = params.get('q');
    const catParam = params.get('category');
    const locParam = params.get('location');
    if (qParam !== null) setSearchQuery(qParam);
    if (catParam !== null) setSelectedSearchCat(catParam);
    if (locParam !== null) setSelectedCity(locParam || 'All Pakistan');
  }, [location]);

  // Perform search
  const handlePerformSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (selectedSearchCat) params.set('category', selectedSearchCat);
    if (selectedCity && selectedCity !== 'All Pakistan') params.set('location', selectedCity);
    const queryString = params.toString();
    setLocation(queryString ? `/browse?${queryString}` : '/browse');
    setIsMobileSearchOpen(false);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadNotifs(0);
      setUnreadChats(0);
      setPendingSwaps(0);
      setSavedCount(0);
      return;
    }

    const refresh = async () => {
      try {
        const [{ items: notifs }, unreadCount, swapsList, convs, savedList] = await Promise.all([
          notificationsApi.list(1, 8).catch(() => ({ items: [] })),
          notificationsApi.unreadCount().catch(() => ({ unread: 0 })),
          swapsApi.list({ role: 'received', status: 'pending', limit: 1 }).catch(() => ({ items: [], pagination: { totalItems: 0 } as never })),
          chatApi.conversations(1, 50).catch(() => ({ items: [] })),
          savedApi.list(1, 100).catch(() => ({ items: [] }))
        ]);
        setNotifications(notifs.map(adaptNotification));
        setUnreadNotifs(unreadCount.unread);
        setPendingSwaps(swapsList.pagination?.totalItems ?? swapsList.items.length);
        setSavedCount(savedList.items.length);
        let chatTotal = 0;
        for (const c of convs.items) chatTotal += c.unreadCount || 0;
        setUnreadChats(chatTotal);
      } catch {
        /* noop */
      }
    };
    refresh();

    const socket = getSocket();
    const onNew = () => refresh();
    socket.on('notification', onNew);
    socket.on('receive-message', onNew);
    return () => {
      socket.off('notification', onNew);
      socket.off('receive-message', onNew);
    };
  }, [isAuthenticated]);

  // Click outside handlers
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) setIsUserMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setIsNotifOpen(false);
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(target)) setIsCityDropdownOpen(false);
      if (categorySelectRef.current && !categorySelectRef.current.contains(target)) setIsCategorySelectOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="sticky top-0 left-0 right-0 z-50 bg-[#FBF9F4] border-b border-[#E9E4DB] shadow-xs font-body transition-all duration-200">

      {/* ── UNIFIED MAIN BAR (Clean, Spacious, Seamless) ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-6 sm:gap-8">

          {/* Brand Logo */}
          <Link href="/" className="flex items-center group cursor-pointer shrink-0 py-0.5" aria-label="ReWearX Home">
            <div className="w-16 sm:w-24 h-11 flex items-center justify-start">
              <img
                src={logoImg}
                alt="ReWearX"
                className="h-11 sm:h-12 w-auto object-contain transform scale-[1.75] sm:scale-[2] origin-left transition-transform duration-200"
              />
            </div>
          </Link>

          {/* Integrated Search Bar with Location Filter */}
          <form
            onSubmit={handlePerformSearch}
            className="hidden md:flex flex-1 max-w-2xl mx-2 relative items-center"
          >
            <div className="w-full flex items-center bg-white rounded-full border border-[#E9E4DB] hover:border-[#1E1B18]/40 focus-within:border-[#1E1B18] focus-within:ring-2 focus-within:ring-[#2E4D3A]/15 shadow-xs transition-all h-12 relative">

              {/* Category Picker */}
              <div className="relative border-r border-[#E9E4DB] h-full flex items-center pl-1" ref={categorySelectRef}>
                <button
                  type="button"
                  onClick={() => setIsCategorySelectOpen(!isCategorySelectOpen)}
                  className="px-4 text-xs sm:text-[13px] font-medium text-[#1E1B18]/80 hover:text-[#1E1B18] flex items-center gap-1.5 h-full transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span className="max-w-[105px] truncate font-medium">
                    {searchCategoryOptions.find((c) => c.value === selectedSearchCat)?.label || 'All Categories'}
                  </span>
                  <ChevronDown size={11} className={`opacity-60 transition-transform duration-200 ${isCategorySelectOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isCategorySelectOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute left-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-[#E9E4DB] py-2 z-[999] overflow-hidden max-h-80 overflow-y-auto"
                    >
                      {searchCategoryOptions.map((cat) => (
                        <button
                          key={cat.value || 'all'}
                          type="button"
                          onClick={() => {
                            setSelectedSearchCat(cat.value);
                            setIsCategorySelectOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between hover:bg-[#F4EAE1]/70 transition-colors ${selectedSearchCat === cat.value ? 'font-bold text-[#2E4D3A] bg-[#2E4D3A]/5' : 'text-[#1E1B18]/80'
                            } ${cat.isSub ? 'pl-7 text-[#7D7265]' : 'font-semibold text-[#1E1B18]'}`}
                        >
                          <span className="truncate flex items-center gap-1">
                            {cat.isSub && <span className="opacity-60">↳</span>}
                            <span>{cat.label}</span>
                          </span>
                          {selectedSearchCat === cat.value && <Check size={12} className="text-[#2E4D3A]" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Input */}
              <div className="relative flex-1 flex items-center h-full px-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search preloved clothing, electronics, sneakers, watches..."
                  className="w-full text-xs sm:text-sm text-[#1E1B18] placeholder:text-[#7D7265]/70 bg-transparent focus:outline-none pr-5 font-normal"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[#7D7265] hover:text-[#1E1B18] p-1"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Location selector dropdown inside search */}
              <div className="relative hidden lg:flex items-center border-l border-[#E9E4DB] h-full px-2" ref={cityDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
                  className="flex items-center gap-1 px-2 text-xs text-[#7D7265] hover:text-[#1E1B18] font-medium transition-colors cursor-pointer"
                >
                  <MapPin size={12} className="text-[#2E4D3A]" />
                  <span className="max-w-[90px] truncate">{selectedCity}</span>
                  <ChevronDown size={10} className="opacity-60" />
                </button>

                <AnimatePresence>
                  {isCityDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-[#E9E4DB] py-1.5 z-[999] overflow-hidden max-h-64 overflow-y-auto"
                    >
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#7D7265] border-b border-[#E9E4DB]">
                        Filter by Location
                      </div>
                      {LOCATIONS.map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => {
                            setSelectedCity(loc);
                            setIsCityDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[#F4EAE1]/70 transition-colors ${selectedCity === loc ? 'font-bold text-[#2E4D3A] bg-[#2E4D3A]/5' : 'text-[#1E1B18]/80'
                            }`}
                        >
                          <span className="truncate">{loc}</span>
                          {selectedCity === loc && <Check size={12} className="text-[#2E4D3A]" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit Search Button */}
              <button
                type="submit"
                aria-label="Search items"
                className="h-full px-5 bg-[#1E1B18] text-[#FBF9F4] hover:bg-[#2E4D3A] font-medium text-xs tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 rounded-r-full"
              >
                <Search size={14} />
                <span>Search</span>
              </button>
            </div>
          </form>

          {/* User Actions & Sell Button */}
          <div className="flex items-center gap-3 shrink-0">

            {/* Mobile Search Toggle */}
            <button
              onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
              className="md:hidden w-9 h-9 flex items-center justify-center text-[#1E1B18] hover:bg-[#F4EAE1]/50 rounded-xl transition-colors"
              aria-label="Toggle mobile search"
            >
              <Search size={18} />
            </button>

            {/* Saved Wishlist */}
            <Link href="/saved" className="relative p-2 rounded-full text-[#1E1B18] hover:bg-[#F4EAE1]/50 transition-colors hidden sm:flex items-center justify-center">
              <Heart size={19} />
              {savedCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#2E4D3A] text-white text-[9px] font-bold flex items-center justify-center">
                  {savedCount > 9 ? '9+' : savedCount}
                </span>
              )}
            </Link>

            {/* Chat */}
            {isAuthenticated && (
              <Link href="/chat" className="relative p-2 rounded-full text-[#1E1B18] hover:bg-[#F4EAE1]/50 transition-colors">
                <MessageCircle size={19} />
                {unreadChats > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#2E4D3A] text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                    {unreadChats > 9 ? '9+' : unreadChats}
                  </span>
                )}
              </Link>
            )}

            {/* Notifications */}
            {isAuthenticated && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setIsNotifOpen(!isNotifOpen);
                    setIsUserMenuOpen(false);
                  }}
                  className="relative p-2 rounded-full text-[#1E1B18] hover:bg-[#F4EAE1]/50 transition-colors cursor-pointer"
                  aria-label="Notifications"
                >
                  <Bell size={19} />
                  {unreadNotifs > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#2E4D3A] text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadNotifs > 9 ? '9+' : unreadNotifs}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {isNotifOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-80 bg-[#FBF9F4] rounded-2xl shadow-xl border border-[#E9E4DB] overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 bg-[#F4EAE1]/50 border-b border-[#E9E4DB] flex items-center justify-between">
                        <span className="font-headings font-bold text-[#1E1B18] text-sm">Notifications</span>
                        <Link
                          href="/notifications"
                          onClick={() => setIsNotifOpen(false)}
                          className="text-[11px] font-semibold text-[#2E4D3A] hover:underline"
                        >
                          View all
                        </Link>
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y divide-[#E9E4DB]/60">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-xs text-[#7D7265]">
                            No notifications yet
                          </div>
                        ) : (
                          notifications.slice(0, 5).map((n) => (
                            <div
                              key={n.id}
                              className={`px-4 py-3 flex gap-3 cursor-pointer hover:bg-[#F4EAE1]/40 transition-colors ${!n.read ? 'bg-[#2E4D3A]/5' : ''
                                }`}
                            >
                              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#2E4D3A] mt-1.5 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-[#1E1B18] truncate">{n.title}</p>
                                <p className="text-[11px] text-[#7D7265] line-clamp-2 mt-0.5">{n.message}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Profile Avatar / Log in */}
            {!isAuthenticated ? (
              <div className="hidden sm:flex items-center gap-2">
                <Link href="/login">
                  <button className="px-3.5 py-2 rounded-full text-xs font-semibold text-[#1E1B18] hover:bg-[#F4EAE1]/60 transition-colors cursor-pointer">
                    Log in
                  </button>
                </Link>
              </div>
            ) : (
              <Link href="/profile" aria-label="Go to My Profile" title={user?.name || 'Profile'}>
                <div className="p-0.5 rounded-full hover:ring-2 hover:ring-[#2E4D3A]/30 transition-all cursor-pointer">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user?.name || 'User'}
                      className="w-9 h-9 rounded-full object-cover ring-1 ring-[#E9E4DB]"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0D9488] via-[#059669] to-[#9D174D] text-white font-serif font-bold text-xs flex items-center justify-center tracking-wider shadow-xs ring-1 ring-[#E9E4DB]">
                      {userInitials}
                    </div>
                  )}
                </div>
              </Link>
            )}

            {/* List an Item CTA */}
            <Link href="/items/new">
              <button
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#2E4D3A] hover:bg-[#233a2c] text-white font-medium text-xs tracking-wide shadow-xs hover:shadow-sm transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>List an Item</span>
              </button>
            </Link>

            {/* Mobile Hamburger */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-[#1E1B18] hover:bg-[#F4EAE1]/50 transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

          </div>
        </div>

        {/* Mobile Search Row */}
        <AnimatePresence>
          {isMobileSearchOpen && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={handlePerformSearch}
              className="md:hidden pt-2.5 overflow-hidden"
            >
              <div className="flex items-center bg-white rounded-full border border-[#E9E4DB] shadow-xs overflow-hidden h-10 px-3">
                <Search size={15} className="text-[#7D7265] mr-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items, clothes, tech..."
                  className="flex-1 text-xs text-[#1E1B18] focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#1E1B18] text-[#FBF9F4] rounded-full text-xs font-medium"
                >
                  Search
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      {/* ── 2. SEAMLESS CATEGORY STRIP ── */}
      <div className="border-t border-[#E9E4DB] bg-[#FBF9F4]/90 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 h-12">

          {/* Left: "All Categories" Dropdown */}
          <div
            className="relative shrink-0 flex items-center h-full"
            onMouseEnter={openBrowse}
            onMouseLeave={closeBrowse}
          >
            <button
              onClick={() => setIsBrowseOpen(!isBrowseOpen)}
              className="flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-[#1E1B18] hover:text-[#2E4D3A] py-1.5 pr-4 border-r border-[#E9E4DB] cursor-pointer transition-colors"
            >
              <Grid size={14} className="text-[#2E4D3A]" />
              <span>All Categories</span>
              <ChevronDown size={12} className={`opacity-60 transition-transform duration-150 ${isBrowseOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Center: Category Links */}
          <nav className="flex items-center gap-7 sm:gap-9 overflow-x-auto no-scrollbar py-1 text-xs sm:text-[13px] font-medium text-[#7D7265] whitespace-nowrap flex-1">
            {SUB_NAV_LINKS.map((link) => {
              const isActive = location.includes(link.href);
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`relative py-1.5 transition-colors cursor-pointer shrink-0 hover:text-[#1E1B18] ${isActive ? 'text-[#1E1B18] font-bold' : ''
                    }`}
                >
                  <span>{link.name}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2E4D3A] rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: AI Matcher */}
          <div className="hidden xl:flex items-center shrink-0 pl-2">
            <Link
              href="/recommendations"
              className="flex items-center gap-1.5 text-xs font-medium text-[#2E4D3A] hover:text-[#1E1B18] px-2 py-1 rounded-lg hover:bg-[#F4EAE1]/50 transition-colors"
            >
              <Sparkles size={12} />
              <span>AI Matcher</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── MEGA MENU ── */}
      <AnimatePresence>
        {isBrowseOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full bg-[#FBF9F4] border-b border-[#E9E4DB] shadow-xl z-40"
            onMouseEnter={openBrowse}
            onMouseLeave={closeBrowse}
          >
            <div className="max-w-7xl mx-auto px-6 lg:px-8 py-7">
              <div className="grid grid-cols-12 gap-8">

                {/* Dynamic Category Columns (Men, Women, Unisex) */}
                {categoryGroups.slice(0, 3).map((group, gIdx) => (
                  <div key={group.name} className="col-span-3 space-y-2.5">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-[#E9E4DB]">
                      {gIdx === 0 && <Shirt size={14} className="text-[#2E4D3A]" />}
                      {gIdx === 1 && <Layers size={14} className="text-[#2E4D3A]" />}
                      {gIdx === 2 && <Grid size={14} className="text-[#2E4D3A]" />}
                      <h4 className="font-headings font-bold text-xs uppercase tracking-wider text-[#1E1B18]">
                        {group.name}
                      </h4>
                    </div>
                    <div className="flex flex-col gap-1.5 text-xs text-[#7D7265]">
                      {group.subs.map((item) => (
                        <Link
                          key={item}
                          href={`/browse?category=${encodeURIComponent(group.name)}&q=${encodeURIComponent(item)}`}
                          onClick={() => setIsBrowseOpen(false)}
                          className="hover:text-[#1E1B18] transition-colors py-0.5 cursor-pointer"
                        >
                          {item}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Col 4: Info Card */}
                <div className="col-span-3 bg-[#F4EAE1]/70 border border-[#E9E4DB] p-5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2E4D3A]">
                      Circular Community
                    </span>
                    <h5 className="font-headings font-bold text-sm text-[#1E1B18] mt-1.5">
                      100% Cashless Swapping
                    </h5>
                    <p className="text-xs text-[#7D7265] mt-1 leading-relaxed">
                      Exchange quality items directly with other verified members across Pakistan.
                    </p>
                  </div>
                  <Link
                    href="/browse"
                    onClick={() => setIsBrowseOpen(false)}
                    className="mt-4 inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-full bg-[#2E4D3A] text-white font-medium text-xs hover:bg-[#233a2c] transition-colors"
                  >
                    <span>Browse All 50,000+ Items</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MOBILE DRAWER ── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-4/5 max-w-sm h-full bg-[#FBF9F4] shadow-2xl flex flex-col justify-between overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5">
                <div className="flex items-center justify-between pb-4 border-b border-[#E9E4DB]">
                  <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center">
                    <div className="w-14 h-9 flex items-center justify-start">
                      <img
                        src={logoImg}
                        alt="ReWearX"
                        className="h-8 w-auto object-contain transform scale-[1.6] origin-left"
                      />
                    </div>
                  </Link>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-[#F4EAE1] text-[#1E1B18]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="py-3 border-b border-[#E9E4DB]">
                  <span className="text-[10px] font-medium text-[#7D7265] uppercase block mb-1">Location</span>
                  <div className="relative flex items-center">
                    <MapPin size={12} className="text-[#2E4D3A] absolute left-2 pointer-events-none" />
                    <select
                      value={selectedCity}
                      onChange={(e) => {
                        setSelectedCity(e.target.value);
                        if (location.startsWith('/browse')) {
                          const params = new URLSearchParams(window.location.search);
                          if (e.target.value && e.target.value !== 'All Pakistan') {
                            params.set('location', e.target.value);
                          } else {
                            params.delete('location');
                          }
                          const qs = params.toString();
                          setLocation(qs ? `/browse?${qs}` : '/browse');
                        }
                      }}
                      className="w-full bg-[#F4EAE1]/50 border border-[#E9E4DB] rounded-xl pl-7 pr-3 py-2 text-xs font-semibold text-[#1E1B18] focus:outline-none focus:border-[#2E4D3A] cursor-pointer"
                    >
                      {LOCATIONS.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="py-3 space-y-2">
                  <span className="text-[10px] font-bold text-[#7D7265] uppercase block mb-1">Categories</span>
                  {categoryGroups.map((group) => (
                    <div key={group.name} className="space-y-1">
                      <Link
                        href={`/browse?category=${encodeURIComponent(group.name)}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block font-bold text-xs text-[#1E1B18] hover:text-[#2E4D3A]"
                      >
                        {group.name}
                      </Link>
                      {group.subs.length > 0 && (
                        <div className="pl-3 space-y-1 border-l border-[#E9E4DB]">
                          {group.subs.map((sub) => (
                            <Link
                              key={sub}
                              href={`/browse?category=${encodeURIComponent(sub)}`}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className="block text-[11px] text-[#7D7265] hover:text-[#1E1B18]"
                            >
                              {sub}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="py-3 border-t border-[#E9E4DB] space-y-1.5 text-xs text-[#7D7265]">
                  <Link href="/how-it-works" onClick={() => setIsMobileMenuOpen(false)} className="block py-1">How It Works</Link>
                  <Link href="/about" onClick={() => setIsMobileMenuOpen(false)} className="block py-1">About Us</Link>
                  <Link href="/contact" onClick={() => setIsMobileMenuOpen(false)} className="block py-1">Support</Link>
                </div>
              </div>

              <div className="p-4 bg-[#F4EAE1]/50 border-t border-[#E9E4DB]">
                {!isAuthenticated ? (
                  <div className="flex flex-col gap-2">
                    <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                      <button className="w-full py-2 rounded-full border border-[#E9E4DB] text-xs font-medium text-[#1E1B18]">
                        Log In
                      </button>
                    </Link>
                    <Link href="/signup" onClick={() => setIsMobileMenuOpen(false)}>
                      <button className="w-full py-2 rounded-full bg-[#2E4D3A] text-white text-xs font-medium">
                        Create Account
                      </button>
                    </Link>
                  </div>
                ) : (
                  <Link href="/items/new" onClick={() => setIsMobileMenuOpen(false)}>
                    <button className="w-full py-2 rounded-full bg-[#2E4D3A] text-white text-xs font-medium flex items-center justify-center gap-1.5">
                      <Plus size={14} /> List an Item
                    </button>
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </header>
  );
}
