import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Send,
  Paperclip,
  ArrowLeft,
  MoreVertical,
  Search,
  Smile,
  Camera,
  Mic,
  Phone,
  Video,
  CheckCheck,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  Conversation,
  Message,
} from '../lib/mockData';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { chatApi } from '../lib/api';
import {
  adaptConversation,
  adaptMessage,
  ApiConversation,
  ApiMessage,
} from '../lib/api/types';
import { getSocket } from '../lib/socket';

interface ChatProps {
  params?: { conversationId?: string };
}

interface OtherInfo {
  id: string;
  name: string;
  avatar: string;
}

interface ConvWithMeta {
  ui: Conversation;
  raw: ApiConversation;
  other: OtherInfo;
  swapStatus?: string;
}

function groupMessagesByDay(msgs: Message[]) {
  const groups: { date: string; items: Message[] }[] = [];
  msgs.forEach((m) => {
    const d = new Date(m.createdAt).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.date === d) last.items.push(m);
    else groups.push({ date: d, items: [m] });
  });
  return groups;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDay(d: string) {
  const date = new Date(d);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yest.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatListTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatLastSeen(iso?: string | null) {
  if (!iso) return 'offline';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'offline';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'last seen just now';
  if (diff < 3600) return `last seen ${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `last seen ${Math.floor(diff / 3600)}h ago`;
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return `last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString())
    return `last seen yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function deriveOther(c: ApiConversation, currentUserId: string): OtherInfo {
  const swap = c.swapRequest;
  if (!swap) {
    return { id: '', name: 'Conversation', avatar: '' };
  }
  const isSender = String(swap.senderId) === currentUserId;
  const u = isSender ? swap.receiver : swap.sender;
  const id = isSender ? String(swap.receiverId) : String(swap.senderId);
  return {
    id,
    name: u?.name || `User ${id}`,
    avatar:
      u?.profileImage ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u?.name || id)}`,
  };
}

export default function Chat({ params }: ChatProps) {
  const conversationId = params?.conversationId;
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [listQuery, setListQuery] = useState('');
  const [convs, setConvs] = useState<ConvWithMeta[]>([]);
  const [messagesById, setMessagesById] = useState<Record<string, Message[]>>({});
  const [draft, setDraft] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [lastSeenById, setLastSeenById] = useState<Record<string, string>>({});
  const [navHeight, setNavHeight] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure dynamic navbar height so chat layout is perfectly positioned below navbar
  useEffect(() => {
    const updateNavHeight = () => {
      const headerEl = document.querySelector('header');
      if (headerEl) {
        setNavHeight(headerEl.clientHeight);
      }
    };

    updateNavHeight();

    const headerEl = document.querySelector('header');
    if (!headerEl) return;

    const observer = new ResizeObserver(() => {
      updateNavHeight();
    });

    observer.observe(headerEl);
    window.addEventListener('resize', updateNavHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateNavHeight);
    };
  }, []);

  const conv = useMemo(
    () => convs.find((c) => c.ui.id === conversationId),
    [convs, conversationId]
  );

  const msgs = useMemo(
    () => (conversationId ? messagesById[conversationId] || [] : []),
    [messagesById, conversationId]
  );

  // Load conversation list
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let cancelled = false;
    setLoadingList(true);
    chatApi
      .conversations(1, 50)
      .then(({ items }) => {
        if (cancelled) return;
        const mapped = items.map<ConvWithMeta>((c) => ({
          ui: adaptConversation(c, user.id),
          raw: c,
          other: deriveOther(c, user.id),
          swapStatus: c.swapRequest?.status,
        }));
        setConvs(mapped);
        setLoadingList(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[chat] failed to load conversations', err);
        toast(
          err instanceof Error ? `Couldn't load chats: ${err.message}` : "Couldn't load chats.",
          'error'
        );
        setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, toast]);

  // Resolve historical or off-page links through an authorized canonical lookup.
  useEffect(() => {
    if (!conversationId || !user || !isAuthenticated || loadingList || conv) return;
    let cancelled = false;
    chatApi.byId(conversationId).then(raw => {
      if (cancelled) return;
      const resolved: ConvWithMeta = { ui: adaptConversation(raw, user.id), raw,
        other: deriveOther(raw, user.id), swapStatus: raw.swapRequest?.status };
      setConvs(current => current.some(c => c.ui.id === resolved.ui.id) ? current : [resolved, ...current]);
      if (String(raw.id) !== conversationId) setLocation(`/chat/${raw.id}`, { replace: true });
    }).catch(() => { if (!cancelled) toast('This conversation is unavailable or you do not have access.', 'error'); });
    return () => { cancelled = true; };
  }, [conversationId, user, isAuthenticated, loadingList, conv, setLocation, toast]);

  // Load messages for active conversation
  useEffect(() => {
    if (!conversationId || !user) return;
    let cancelled = false;
    setLoadingMsgs(true);

    chatApi
      .messages(conversationId, 1, 100)
      .then(({ items }) => {
        if (cancelled) return;
        const mapped = items
          .map((m) => adaptMessage(m, user.id))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setMessagesById((prev) => ({ ...prev, [conversationId]: mapped }));
        setLoadingMsgs(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingMsgs(false);
      });

    chatApi.markRead(conversationId).catch(() => undefined);
    // Push a real-time read receipt to the sender
    try {
      getSocket().emit('message-read', { conversationId: Number(conversationId) });
    } catch {
      /* socket not ready */
    }
    setConvs((prev) =>
      prev.map((c) => (c.ui.id === conversationId ? { ...c, ui: { ...c.ui, unreadCount: 0 } } : c))
    );

    return () => {
      cancelled = true;
    };
  }, [conversationId, user]);

  // Socket.IO wiring
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const socket = getSocket();

    if (conversationId) {
      socket.emit('join-room', { conversationId });
    }

    const onMessage = (raw: ApiMessage) => {
      const cid = String(raw.conversationId);
      const m = adaptMessage(raw, user.id);
      setMessagesById((prev) => {
        const list = prev[cid] || [];
        if (list.some((x) => x.id === m.id)) return prev;
        return { ...prev, [cid]: [...list, m] };
      });
      setConvs((prev) =>
        prev.map((c) =>
          c.ui.id === cid
            ? {
                ...c,
                ui: {
                  ...c.ui,
                  lastMessage: m.text,
                  lastMessageAt: m.createdAt,
                  unreadCount:
                    cid === conversationId || m.senderId === user.id ? 0 : c.ui.unreadCount + 1,
                },
              }
            : c
        )
      );
      if (cid === conversationId && m.senderId !== user.id) {
        chatApi.markRead(cid).catch(() => undefined);
        // Notify the sender so they can update their read indicator
        socket.emit('message-read', { conversationId: Number(cid) });
      }
    };

    const onTypingStart = (data: { conversationId: number; userId: number }) => {
      if (String(data.conversationId) !== conversationId) return;
      if (String(data.userId) === user.id) return;
      setOtherTyping(true);
    };

    const onTypingStop = (data: { conversationId: number; userId: number }) => {
      if (String(data.conversationId) !== conversationId) return;
      if (String(data.userId) === user.id) return;
      setOtherTyping(false);
    };

    const onReadReceipt = (data: {
      conversationId?: number;
      messageId?: number;
      readBy: number;
    }) => {
      if (String(data.readBy) === user.id) return;
      const cid = data.conversationId !== undefined ? String(data.conversationId) : conversationId;
      if (!cid) return;
      setMessagesById((prev) => {
        const list = prev[cid];
        if (!list) return prev;
        return {
          ...prev,
          [cid]: list.map((m) => {
            const matches = data.messageId
              ? String(data.messageId) === m.id
              : m.senderId === user.id;
            if (!matches) return m;
            if (m.readBy.includes(String(data.readBy))) return m;
            return { ...m, readBy: [...m.readBy, String(data.readBy)] };
          }),
        };
      });
    };

    const onPresenceUpdate = (data: {
      userId: number;
      online: boolean;
      lastSeen?: string | null;
    }) => {
      const id = String(data.userId);
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (data.online) next.add(id);
        else next.delete(id);
        return next;
      });
      if (data.lastSeen) {
        setLastSeenById((prev) => ({ ...prev, [id]: data.lastSeen as string }));
      }
    };

    const onPresenceState = (data: {
      states: { userId: number; online: boolean; lastSeen?: string | null }[];
    }) => {
      const seen: Record<string, string> = {};
      for (const s of data.states || []) {
        const id = String(s.userId);
        if (s.lastSeen) seen[id] = s.lastSeen;
      }
      setOnlineUsers((prev) => {
        const merged = new Set(prev);
        for (const s of data.states || []) {
          const id = String(s.userId);
          if (s.online) merged.add(id);
          else merged.delete(id);
        }
        return merged;
      });
      setLastSeenById((prev) => ({ ...prev, ...seen }));
    };

    socket.on('receive-message', onMessage);
    socket.on('typing-indicator', onTypingStart);
    socket.on('stop-typing-indicator', onTypingStop);
    socket.on('read-receipt', onReadReceipt);
    socket.on('presence:update', onPresenceUpdate);
    socket.on('presence:state', onPresenceState);

    return () => {
      socket.off('receive-message', onMessage);
      socket.off('typing-indicator', onTypingStart);
      socket.off('stop-typing-indicator', onTypingStop);
      socket.off('read-receipt', onReadReceipt);
      socket.off('presence:update', onPresenceUpdate);
      socket.off('presence:state', onPresenceState);
      if (conversationId) socket.emit('leave-room', { conversationId });
    };
  }, [isAuthenticated, user, conversationId]);

  // Ask server for the current presence of every chat partner
  useEffect(() => {
    if (!isAuthenticated || !user || convs.length === 0) return;
    const ids = Array.from(
      new Set(convs.map((c) => c.other.id).filter((id) => !!id && id !== user.id))
    ).map((id) => Number(id));
    if (ids.length === 0) return;

    const socket = getSocket();
    const ask = () => {
      socket.emit(
        'presence:get',
        { userIds: ids },
        (resp: {
          ok: boolean;
          states?: { userId: number; online: boolean; lastSeen?: string | null }[];
        }) => {
          if (!resp?.ok || !resp.states) return;
          const onlineNext = new Set<string>();
          const seenNext: Record<string, string> = {};
          for (const s of resp.states) {
            const id = String(s.userId);
            if (s.online) onlineNext.add(id);
            if (s.lastSeen) seenNext[id] = s.lastSeen;
          }
          setOnlineUsers((prev) => {
            const merged = new Set(prev);
            for (const s of resp.states!) {
              const id = String(s.userId);
              if (s.online) merged.add(id);
              else merged.delete(id);
            }
            return merged;
          });
          setLastSeenById((prev) => ({ ...prev, ...seenNext }));
        }
      );
    };

    if (socket.connected) ask();
    socket.on('connect', ask);
    return () => {
      socket.off('connect', ask);
    };
  }, [isAuthenticated, user, convs]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs.length, conversationId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [draft]);

  if (!user) {
    return (
      <div className="pt-32">
        <EmptyState
          title="Sign in to view your messages"
          actionLabel="Sign in"
          onAction={() => setLocation('/login')}
        />
      </div>
    );
  }

  const filteredConvs = convs.filter((c) => {
    if (!listQuery.trim()) return true;
    const q = listQuery.toLowerCase();
    return (
      c.other.name.toLowerCase().includes(q) ||
      (c.ui.lastMessage || '').toLowerCase().includes(q)
    );
  });

  const handleSend = async () => {
    if (!conv) return;
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const sent = await chatApi.send(conv.ui.id, text.slice(0, 2000));
      const ui = adaptMessage(sent, user.id);
      setMessagesById((prev) => {
        const list = prev[conv.ui.id] || [];
        if (list.some((x) => x.id === ui.id)) return prev;
        return { ...prev, [conv.ui.id]: [...list, ui] };
      });
    } catch (err) {
      setDraft(text);
      toast(err instanceof Error ? err.message : 'Failed to send.', 'error');
    }
  };

  const sendTyping = (isTyping: boolean) => {
    if (!conv) return;
    const socket = getSocket();
    socket.emit(isTyping ? 'typing' : 'stop-typing', {
      conversationId: Number(conv.ui.id),
    });
  };

  const onChangeDraft = (v: string) => {
    setDraft(v);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(true);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 2000);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const groups = groupMessagesByDay(msgs);

  // ===== Sub-components =====

  const conversationListPane = (
    <div className="flex flex-col w-full h-full bg-background">
      <div className="px-3 sm:px-4 pt-3 pb-2 flex-shrink-0">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/40" />
          <input
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full pl-9 pr-3 py-2 rounded-full bg-muted/40 border border-transparent text-sm focus:outline-none focus:bg-background focus:border-border/60 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingList ? (
          <div className="flex items-center justify-center py-10 text-primary/40">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : filteredConvs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">No chats yet.</p>
          </div>
        ) : (
          filteredConvs.map((c) => {
            const active = c.ui.id === conversationId;
            return (
              <Link key={c.ui.id} href={`/chat/${c.ui.id}`}>
                <div
                  className={`flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors border-b border-border/30 ${
                    active
                      ? 'bg-accent/10 md:border-l-4 md:border-l-accent'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={c.other.avatar}
                      alt={c.other.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-background ${
                        onlineUsers.has(c.other.id) ? 'bg-green-500' : 'bg-muted-foreground/40'
                      }`}
                      title={
                        onlineUsers.has(c.other.id)
                          ? 'Online'
                          : formatLastSeen(lastSeenById[c.other.id])
                      }
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-primary text-sm truncate">{c.other.name}</p>
                      <span
                        className={`text-[11px] flex-shrink-0 ${
                          c.ui.unreadCount > 0 ? 'text-accent font-bold' : 'text-muted-foreground'
                        }`}
                      >
                        {formatListTime(c.ui.lastMessageAt || new Date().toISOString())}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {c.ui.lastMessage || 'Start the conversation…'}
                      </p>
                      {c.ui.unreadCount > 0 && (
                        <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                          {c.ui.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );

  const conversationPane = conv ? (
    <div className="flex flex-col w-full h-full bg-[#efeae2]">
      <header className="bg-primary text-white px-2 sm:px-4 py-2 flex items-center gap-1 sm:gap-2 flex-shrink-0 shadow-sm">
        <button
          onClick={() => setLocation('/chat')}
          aria-label="Back"
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10"
        >
          <ArrowLeft size={20} />
        </button>
        <Link href={`/users/${conv.other.id}`}>
          <img
            src={conv.other.avatar}
            alt={conv.other.name}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover cursor-pointer ring-2 ring-white/20"
          />
        </Link>
        <Link href={`/users/${conv.other.id}`} className="flex-1 min-w-0">
          <div className="cursor-pointer">
            <p className="font-semibold text-white truncate text-sm sm:text-base leading-tight">
              {conv.other.name}
            </p>
            <p className="text-[11px] text-white/70 truncate">
              {otherTyping
                ? 'typing…'
                : onlineUsers.has(conv.other.id)
                ? 'online'
                : formatLastSeen(lastSeenById[conv.other.id])}
            </p>
          </div>
        </Link>
        {conv.ui.swapId && (
          <Link href={`/swaps/${conv.ui.swapId}`} className="hidden md:block">
            <div className="flex items-center gap-2 mr-1">
              <Badge
                color={
                  conv.swapStatus === 'pending'
                    ? 'amber'
                    : conv.swapStatus === 'accepted'
                    ? 'green'
                    : conv.swapStatus === 'completed'
                    ? 'teal'
                    : 'gray'
                }
              >
                {conv.swapStatus || 'swap'}
              </Badge>
            </div>
          </Link>
        )}
        <button aria-label="Video call" className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-white/10">
          <Video size={18} />
        </button>
        <button aria-label="Voice call" className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-white/10">
          <Phone size={17} />
        </button>
        <button aria-label="More" className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-white/10">
          <MoreVertical size={18} />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 relative"
        style={{
          backgroundImage:
            "radial-gradient(rgba(34, 51, 51, 0.04) 1px, transparent 1px)",
          backgroundSize: '18px 18px',
        }}
      >
        <div className="max-w-3xl mx-auto flex flex-col gap-1">
          {loadingMsgs && (
            <div className="flex justify-center py-4 text-primary/40">
              <Loader2 className="animate-spin" size={20} />
            </div>
          )}
          {groups.map((g) => (
            <div key={g.date}>
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 rounded-md bg-white/90 backdrop-blur text-[10px] font-semibold text-primary/70 uppercase tracking-wider shadow-sm">
                  {formatDay(g.date)}
                </span>
              </div>
              {g.items.map((m, i) => {
                const mine = m.senderId === user.id;
                const prev = g.items[i - 1];
                const sameSender = prev && prev.senderId === m.senderId;
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className={`flex ${mine ? 'justify-end' : 'justify-start'} ${
                      sameSender ? 'mt-0.5' : 'mt-2.5'
                    }`}
                  >
                    <div
                      className={`relative max-w-[78%] sm:max-w-[65%] px-2.5 pt-1.5 pb-1 text-sm leading-snug shadow-sm ${
                        mine ? 'bg-[#d9fdd3] text-primary' : 'bg-white text-primary'
                      } ${
                        sameSender
                          ? 'rounded-2xl'
                          : mine
                          ? 'rounded-2xl rounded-tr-sm'
                          : 'rounded-2xl rounded-tl-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words pr-12 pl-1 pt-0.5">
                        {m.text}
                      </p>
                      <span className="absolute right-2 bottom-1 flex items-center gap-0.5 text-[9px] text-primary/50">
                        {formatTime(m.createdAt)}
                        {mine && (
                          <CheckCheck
                            size={12}
                            className={
                              m.readBy.length > 1 ? 'text-sky-500' : 'text-primary/40'
                            }
                          />
                        )}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}

          <AnimatePresence>
            {otherTyping && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex justify-start mt-2.5"
              >
                <div className="bg-white rounded-2xl rounded-tl-sm shadow-sm px-3 py-2.5 flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="bg-[#f0f2f5] px-2 sm:px-4 py-2 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-1.5 sm:gap-2">
          <div className="flex-1 bg-white rounded-3xl flex items-end px-1 py-1 shadow-sm">
            <button aria-label="Emoji" className="w-9 h-9 flex-shrink-0 flex items-center justify-center text-primary/50 hover:text-primary">
              <Smile size={20} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => onChangeDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={2000}
              rows={1}
              placeholder="Type a message"
              className="flex-1 resize-none bg-transparent border-0 outline-none px-1 py-2 text-sm placeholder:text-primary/40 max-h-32"
            />
            <button aria-label="Attach" className="w-9 h-9 flex-shrink-0 flex items-center justify-center text-primary/50 hover:text-primary">
              <Paperclip size={18} className="-rotate-45" />
            </button>
            <button aria-label="Camera" className="w-9 h-9 flex-shrink-0 flex items-center justify-center text-primary/50 hover:text-primary">
              <Camera size={18} />
            </button>
          </div>
          <button
            onClick={() => draft.trim() && handleSend()}
            aria-label={draft.trim() ? 'Send' : 'Voice message'}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90 active:scale-95 transition-transform shadow-md"
          >
            {draft.trim() ? <Send size={18} /> : <Mic size={18} />}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className="hidden md:flex flex-col flex-1 items-center justify-center bg-muted/20 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-3">
        <MessageCircle size={28} className="text-accent" />
      </div>
      <p className="font-headings text-lg font-bold text-primary">Select a conversation</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        Choose a chat from the left to start messaging — or open a swap and tap "Open chat".
      </p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 top-0 flex bg-background pt-[125px] sm:pt-[136px]"
      style={{ paddingTop: navHeight ? `${navHeight}px` : undefined }}
    >
      <aside
        className={`${
          conversationId ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 lg:w-96 flex-shrink-0 md:border-r md:border-border/60`}
      >
        {conversationListPane}
      </aside>

      <div className={`${conversationId ? 'flex' : 'hidden md:flex'} flex-1 min-w-0`}>
        {conversationPane}
      </div>
    </div>
  );
}
