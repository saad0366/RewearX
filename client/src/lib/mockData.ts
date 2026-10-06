// Centralized mock data for the ReWearX client app.
// In production these would come from the API; here we keep them local
// so every page renders rich, realistic content out-of-the-box.

export interface User {
  id: string;
  name: string;
  bio?: string;
  avatar: string;
  rating: number;
  reviewCount: number;
  joined: string;
  location?: string;
  address?: string;
  phone?: string;
  gender?: 'Male' | 'Female' | 'Unisex';
  dob?: string;
  listingsCount: number;
  swapsCompleted: number;
  role: 'user' | 'admin';
}

export interface Item {
  id: string;
  title: string;
  description: string;
  images: string[];
  category: string;
  size: string;
  gender: 'Male' | 'Female' | 'Unisex';
  condition: 'New' | 'Like New' | 'Good' | 'Fair';
  color: string;
  brand?: string;
  location?: string;
  is_available: boolean;
  user_id: string;
  exchangePrefs?: string;
  createdAt: string;
  matchScore?: number;
  /** Embedded owner snippet, populated when fetched from the API. */
  owner?: { id: string; name: string; avatar: string; rating?: number };
}

export interface SwapRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  offeredItemId: string;
  offeredItem?: Item;
  requestedItem?: Item;
  requestedItemId: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  conversationId?: string;
  timeline?: { status: string; at: string }[];
  hasReviewed?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  attachmentUrl?: string;
  createdAt: string;
  readBy: string[];
}

export interface Conversation {
  id: string;
  participantIds: string[];
  swapId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export interface Notification {
  id: string;
  type:
    | 'swap_request'
    | 'swap_accepted'
    | 'swap_rejected'
    | 'swap_completed'
    | 'new_message'
    | 'review_received'
    | 'system';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  refId?: string;
}

export interface Review {
  id: string;
  fromUserId: string;
  toUserId: string;
  swapId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Address {
  id: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal: string;
  country: string;
  isDefault?: boolean;
}

// ─── USERS ──────────────────────────────────────────────────────────────────
export const users: User[] = [
  {
    id: 'u1',
    name: 'Sophie Larsen',
    bio: 'Editorial stylist, vintage hunter, and slow-fashion advocate based in Copenhagen.',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
    rating: 4.9,
    reviewCount: 47,
    joined: '2024-02-12',
    location: 'Copenhagen, DK',
    phone: '+45 20 33 22 11',
    gender: 'Female',
    dob: '1996-04-18',
    listingsCount: 12,
    swapsCompleted: 34,
    role: 'user',
  },
  {
    id: 'u2',
    name: 'James Kovac',
    bio: 'Tokyo-to-Milan minimalist. Trade carefully curated menswear pieces.',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=300',
    rating: 4.7,
    reviewCount: 28,
    joined: '2023-11-04',
    location: 'Milan, IT',
    gender: 'Male',
    listingsCount: 8,
    swapsCompleted: 21,
    role: 'user',
  },
  {
    id: 'u3',
    name: 'Aria Khatri',
    bio: 'Sustainable fashion grad student. Founder, @arias.archive.',
    avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&q=80&w=300',
    rating: 4.8,
    reviewCount: 19,
    joined: '2025-01-22',
    location: 'New York, US',
    gender: 'Female',
    listingsCount: 15,
    swapsCompleted: 12,
    role: 'user',
  },
  {
    id: 'u4',
    name: 'Marcus Hale',
    bio: 'Streetwear archivist. Y2K, archive denim, deadstock sneakers.',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300',
    rating: 4.6,
    reviewCount: 33,
    joined: '2024-07-19',
    location: 'Berlin, DE',
    gender: 'Male',
    listingsCount: 9,
    swapsCompleted: 18,
    role: 'user',
  },
  {
    id: 'me',
    name: 'Jane Doe',
    bio: 'New here — building a thoughtful, swap-only wardrobe.',
    avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&q=80&w=300',
    rating: 4.9,
    reviewCount: 11,
    joined: '2025-08-03',
    location: 'Lisbon, PT',
    phone: '+351 91 234 5678',
    gender: 'Female',
    dob: '1997-09-14',
    listingsCount: 6,
    swapsCompleted: 7,
    role: 'user',
  },
];

export const currentUser = users.find((u) => u.id === 'me')!;

// ─── CATEGORIES ─────────────────────────────────────────────────────────────
export const categories = [
  'Tops',
  'Bottoms',
  'Dresses',
  'Outerwear',
  'Footwear',
  'Bags',
  'Jewelry',
  'Accessories',
];

export const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const conditions: Item['condition'][] = ['New', 'Like New', 'Good', 'Fair'];
export const genders: Item['gender'][] = ['Male', 'Female', 'Unisex'];
export const colors = [
  { name: 'Cream', hex: '#f5efe1' },
  { name: 'Black', hex: '#111111' },
  { name: 'Sage', hex: '#9bb39a' },
  { name: 'Cognac', hex: '#9a6238' },
  { name: 'Sand', hex: '#d9c3a0' },
  { name: 'Navy', hex: '#1f2e4d' },
  { name: 'Ivory', hex: '#fbf9f4' },
  { name: 'Olive', hex: '#5a6a3c' },
];

export const PAKISTAN_CITIES = [
  'All Pakistan',
  'Islamabad',
  'Rawalpindi',
  'Lahore',
  'Karachi',
  'Peshawar',
  'Faisalabad',
  'Multan',
  'Quetta',
  'Abbottabad',
  'Sialkot',
  'Gujranwala',
  'Hyderabad',
  'Bahawalpur',
  'Sargodha',
  'Sukkur',
  'Mardan',
  'Gujrat',
  'Wah Cantt',
  'Kasur',
];

// ─── ITEMS ──────────────────────────────────────────────────────────────────
export const items: Item[] = [
  {
    id: 'i1',
    title: 'Vintage Zara Trench Coat',
    description:
      'Camel double-breasted trench in beautiful condition. Worn twice. Belted waist, deep pockets, oversized fit. From the FW21 capsule.',
    images: [
      'https://images.unsplash.com/photo-1559551409-dadc959f76b8?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1591369822096-ffd140ec948f?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Outerwear',
    size: 'M',
    gender: 'Female',
    condition: 'Like New',
    color: 'Cognac',
    brand: 'Zara',
    is_available: true,
    user_id: 'u1',
    exchangePrefs: 'Looking for knit cardigans (Arket, COS) or quality wool blazers in S/M.',
    createdAt: '2026-05-20',
    matchScore: 94,
  },
  {
    id: 'i2',
    title: 'A.P.C. Half-Moon Leather Bag',
    description:
      'The cult half-moon shape in supple cognac leather. Authentic, comes with dust bag.',
    images: [
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Bags',
    size: 'M',
    gender: 'Unisex',
    condition: 'Good',
    color: 'Cognac',
    brand: 'A.P.C.',
    is_available: true,
    user_id: 'u2',
    exchangePrefs: 'Open to bags of similar value, or quality leather goods.',
    createdAt: '2026-05-18',
    matchScore: 88,
  },
  {
    id: 'i3',
    title: 'Linen Slip Dress — Sage',
    description:
      'Hand-dyed linen midi slip dress. Bias-cut, sage green. Perfect for summer evenings.',
    images: [
      'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1583496661160-fb5886a13d44?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Dresses',
    size: 'S',
    gender: 'Female',
    condition: 'Like New',
    color: 'Sage',
    brand: 'Arket',
    is_available: true,
    user_id: 'u3',
    exchangePrefs: 'Trade for silk blouses or summer separates.',
    createdAt: '2026-05-15',
    matchScore: 92,
  },
  {
    id: 'i4',
    title: 'Levi\'s 501 Original — Archive Wash',
    description: 'True archive piece. Faded indigo, perfectly broken-in 501s. Selvedge edge.',
    images: [
      'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1582418702059-97ebafb35d09?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Bottoms',
    size: 'M',
    gender: 'Unisex',
    condition: 'Good',
    color: 'Navy',
    brand: 'Levi\'s',
    is_available: true,
    user_id: 'u4',
    exchangePrefs: 'Trade for vintage tees or denim jackets.',
    createdAt: '2026-05-12',
    matchScore: 85,
  },
  {
    id: 'i5',
    title: 'Cashmere Crewneck — Cream',
    description: 'Pure cashmere from The Row line. Soft, oversized, mens cut.',
    images: [
      'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Tops',
    size: 'L',
    gender: 'Unisex',
    condition: 'New',
    color: 'Cream',
    brand: 'COS',
    is_available: true,
    user_id: 'u2',
    createdAt: '2026-05-11',
    matchScore: 90,
  },
  {
    id: 'i6',
    title: 'Pleated Wool Midi Skirt',
    description: 'Olive pleated midi skirt. Wool blend, sits at the waist, falls beautifully.',
    images: [
      'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Bottoms',
    size: 'S',
    gender: 'Female',
    condition: 'Like New',
    color: 'Olive',
    brand: 'Uniqlo',
    is_available: true,
    user_id: 'u1',
    createdAt: '2026-05-09',
    matchScore: 80,
  },
  {
    id: 'i7',
    title: 'Vintage Western Boots',
    description: 'Tan leather Western boots. Stacked heel. Lightly worn, conditioned regularly.',
    images: [
      'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Footwear',
    size: 'M',
    gender: 'Female',
    condition: 'Good',
    color: 'Cognac',
    brand: 'Frye',
    is_available: true,
    user_id: 'u3',
    createdAt: '2026-05-08',
    matchScore: 78,
  },
  {
    id: 'i8',
    title: 'Silk Scarf — Hand-Painted',
    description: 'One-of-one hand-painted silk scarf. 90×90 cm. Soft yellow and sage tones.',
    images: [
      'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Accessories',
    size: 'L',
    gender: 'Unisex',
    condition: 'New',
    color: 'Ivory',
    brand: 'Independent',
    is_available: true,
    user_id: 'u3',
    createdAt: '2026-05-07',
    matchScore: 70,
  },
  // My (current user) items
  {
    id: 'i9',
    title: 'Black Wool Blazer',
    description: 'Tailored single-breasted blazer. Italian wool. Fits true to size M.',
    images: [
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Outerwear',
    size: 'M',
    gender: 'Female',
    condition: 'Like New',
    color: 'Black',
    brand: 'Mango',
    is_available: true,
    user_id: 'me',
    createdAt: '2026-05-06',
  },
  {
    id: 'i10',
    title: 'Linen Wide-Leg Trousers',
    description: 'Soft sand-coloured linen wide-leg trousers. Drawstring waist.',
    images: [
      'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Bottoms',
    size: 'S',
    gender: 'Female',
    condition: 'Good',
    color: 'Sand',
    brand: 'COS',
    is_available: true,
    user_id: 'me',
    createdAt: '2026-05-04',
  },
  {
    id: 'i11',
    title: 'White Cotton Shirt',
    description: 'Crisp white cotton shirt. Classic oversized fit.',
    images: [
      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Tops',
    size: 'M',
    gender: 'Female',
    condition: 'Like New',
    color: 'Ivory',
    brand: 'Everlane',
    is_available: true,
    user_id: 'me',
    createdAt: '2026-05-03',
  },
  {
    id: 'i12',
    title: 'Quilted Denim Jacket',
    description: 'Quilted lining denim jacket — perfect for layering. Mid-wash blue.',
    images: [
      'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?auto=format&fit=crop&q=80&w=1200',
    ],
    category: 'Outerwear',
    size: 'M',
    gender: 'Unisex',
    condition: 'Good',
    color: 'Navy',
    brand: 'Levi\'s',
    is_available: false,
    user_id: 'me',
    createdAt: '2026-04-28',
  },
];

// ─── SWAPS ──────────────────────────────────────────────────────────────────
export const swaps: SwapRequest[] = [
  {
    id: 's1',
    fromUserId: 'u1',
    toUserId: 'me',
    offeredItemId: 'i1',
    requestedItemId: 'i9',
    message: 'I love the cut of your blazer — would this trench be a fair trade?',
    status: 'pending',
    createdAt: '2026-05-25',
    updatedAt: '2026-05-25',
    timeline: [{ status: 'Requested', at: '2026-05-25' }],
  },
  {
    id: 's2',
    fromUserId: 'me',
    toUserId: 'u3',
    offeredItemId: 'i11',
    requestedItemId: 'i3',
    message: 'Hi Aria — sending good vibes. Love your slip dress!',
    status: 'accepted',
    createdAt: '2026-05-22',
    updatedAt: '2026-05-23',
    conversationId: 'c1',
    timeline: [
      { status: 'Requested', at: '2026-05-22' },
      { status: 'Accepted', at: '2026-05-23' },
    ],
  },
  {
    id: 's3',
    fromUserId: 'u4',
    toUserId: 'me',
    offeredItemId: 'i4',
    requestedItemId: 'i10',
    status: 'completed',
    createdAt: '2026-05-01',
    updatedAt: '2026-05-15',
    conversationId: 'c2',
    timeline: [
      { status: 'Requested', at: '2026-05-01' },
      { status: 'Accepted', at: '2026-05-03' },
      { status: 'Completed', at: '2026-05-15' },
    ],
  },
  {
    id: 's4',
    fromUserId: 'me',
    toUserId: 'u2',
    offeredItemId: 'i9',
    requestedItemId: 'i2',
    status: 'rejected',
    createdAt: '2026-04-22',
    updatedAt: '2026-04-24',
    timeline: [
      { status: 'Requested', at: '2026-04-22' },
      { status: 'Rejected', at: '2026-04-24' },
    ],
  },
  {
    id: 's5',
    fromUserId: 'u2',
    toUserId: 'me',
    offeredItemId: 'i5',
    requestedItemId: 'i11',
    message: 'Open to a swap? Happy to add a small extra.',
    status: 'pending',
    createdAt: '2026-05-27',
    updatedAt: '2026-05-27',
    timeline: [{ status: 'Requested', at: '2026-05-27' }],
  },
];

// ─── CONVERSATIONS & MESSAGES ───────────────────────────────────────────────
export const conversations: Conversation[] = [
  {
    id: 'c1',
    participantIds: ['me', 'u3'],
    swapId: 's2',
    lastMessage: 'Awesome — I\'ll ship tomorrow!',
    lastMessageAt: '2026-05-28T10:14:00Z',
    unreadCount: 2,
  },
  {
    id: 'c2',
    participantIds: ['me', 'u4'],
    swapId: 's3',
    lastMessage: 'Thank you so much, the jeans fit perfectly.',
    lastMessageAt: '2026-05-16T09:02:00Z',
    unreadCount: 0,
  },
  {
    id: 'c3',
    participantIds: ['me', 'u1'],
    lastMessage: 'Is this still available?',
    lastMessageAt: '2026-05-26T14:10:00Z',
    unreadCount: 1,
  },
];

export const messages: Message[] = [
  // c1
  { id: 'm1', conversationId: 'c1', senderId: 'me', text: 'Hi Aria! Loved your slip dress.', createdAt: '2026-05-23T09:00:00Z', readBy: ['me', 'u3'] },
  { id: 'm2', conversationId: 'c1', senderId: 'u3', text: 'Thank you — happy to swap! Your white shirt is gorgeous.', createdAt: '2026-05-23T09:04:00Z', readBy: ['me', 'u3'] },
  { id: 'm3', conversationId: 'c1', senderId: 'me', text: 'Perfect, shall we lock it in?', createdAt: '2026-05-23T09:06:00Z', readBy: ['me', 'u3'] },
  { id: 'm4', conversationId: 'c1', senderId: 'u3', text: 'Yes! Sending you my address now.', createdAt: '2026-05-23T09:10:00Z', readBy: ['me', 'u3'] },
  { id: 'm5', conversationId: 'c1', senderId: 'u3', text: 'Awesome — I\'ll ship tomorrow!', createdAt: '2026-05-28T10:14:00Z', readBy: ['u3'] },

  // c2
  { id: 'm6', conversationId: 'c2', senderId: 'u4', text: 'Hey, are the trousers still up for trade?', createdAt: '2026-05-02T12:00:00Z', readBy: ['me', 'u4'] },
  { id: 'm7', conversationId: 'c2', senderId: 'me', text: 'Yes! Excited to swap.', createdAt: '2026-05-02T12:30:00Z', readBy: ['me', 'u4'] },
  { id: 'm8', conversationId: 'c2', senderId: 'u4', text: 'Thank you so much, the jeans fit perfectly.', createdAt: '2026-05-16T09:02:00Z', readBy: ['me', 'u4'] },

  // c3
  { id: 'm9', conversationId: 'c3', senderId: 'u1', text: 'Is this still available?', createdAt: '2026-05-26T14:10:00Z', readBy: ['u1'] },
];

// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
export const notifications: Notification[] = [
  { id: 'n1', type: 'swap_request', title: 'New swap request', message: 'Sophie Larsen offered her Vintage Zara Trench Coat for your Black Wool Blazer.', createdAt: '2026-05-25T10:00:00Z', read: false, refId: 's1' },
  { id: 'n2', type: 'new_message', title: 'New message from Aria', message: 'Awesome — I\'ll ship tomorrow!', createdAt: '2026-05-28T10:14:00Z', read: false, refId: 'c1' },
  { id: 'n3', type: 'swap_accepted', title: 'Swap accepted', message: 'Aria Khatri accepted your swap request for the Linen Slip Dress.', createdAt: '2026-05-23T09:05:00Z', read: true, refId: 's2' },
  { id: 'n4', type: 'swap_completed', title: 'Swap completed!', message: 'Your swap with Marcus Hale is complete. Leave a review?', createdAt: '2026-05-15T17:00:00Z', read: true, refId: 's3' },
  { id: 'n5', type: 'review_received', title: 'You got a 5★ review', message: '"Sweet, fast, and the piece was even better than described."', createdAt: '2026-05-16T08:00:00Z', read: false },
  { id: 'n6', type: 'system', title: 'Welcome to ReWearX', message: 'Your circular fashion journey starts here. Try listing your first piece.', createdAt: '2026-05-01T08:00:00Z', read: true },
  { id: 'n7', type: 'swap_rejected', title: 'Swap declined', message: 'James Kovac declined your request.', createdAt: '2026-04-24T12:00:00Z', read: true, refId: 's4' },
];

// ─── REVIEWS ────────────────────────────────────────────────────────────────
export const reviews: Review[] = [
  { id: 'r1', fromUserId: 'u4', toUserId: 'me', swapId: 's3', rating: 5, comment: 'Sweet, fast, and the piece was even better than described.', createdAt: '2026-05-16' },
  { id: 'r2', fromUserId: 'u1', toUserId: 'me', swapId: 's3', rating: 5, comment: 'Communicative and lovely to swap with.', createdAt: '2026-04-12' },
  { id: 'r3', fromUserId: 'u2', toUserId: 'me', swapId: 's3', rating: 4, comment: 'Smooth swap. Would do again.', createdAt: '2026-03-30' },
];

// ─── SAVED ──────────────────────────────────────────────────────────────────
export const savedItemIds: string[] = ['i1', 'i3', 'i5', 'i7'];

// ─── ADDRESSES ──────────────────────────────────────────────────────────────
export const addresses: Address[] = [
  {
    id: 'a1',
    line1: 'Rua de Santa Catarina 102',
    city: 'Lisbon',
    state: 'Lisbon',
    postal: '1100-202',
    country: 'Portugal',
    isDefault: true,
  },
];

// ─── HELPERS ────────────────────────────────────────────────────────────────
export const getUser = (id: string): User | undefined => users.find((u) => u.id === id);
export const getItem = (id: string): Item | undefined => items.find((i) => i.id === id);
export const getUserItems = (userId: string): Item[] => items.filter((i) => i.user_id === userId);
export const getSavedItems = (): Item[] => items.filter((i) => savedItemIds.includes(i.id));
export const getRecommendations = (): Item[] =>
  items
    .filter((i) => i.user_id !== 'me')
    .slice(0, 8)
    .map((i) => ({ ...i, matchScore: i.matchScore ?? Math.floor(70 + Math.random() * 25) }))
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
