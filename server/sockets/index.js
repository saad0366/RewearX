'use strict';

const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/tokens');
const { User } = require('../models');
const env = require('../config/env');
const logger = require('../utils/logger');
const chatService = require('../services/chatService');
const notificationService = require('../services/notificationService');

const initSocketIO = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes('*')) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        try {
          const hostname = new URL(origin).hostname;
          if (hostname.endsWith('.vercel.app') || hostname === 'localhost') {
            return callback(null, true);
          }
        } catch (_) {}
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  const authenticateSocket = async socket => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) throw new Error('Authentication required');
    const decoded = verifyAccessToken(token);
    const user = await User.findByPk(decoded.id, { attributes: ['id', 'role', 'email', 'status'] });
    if (!user || user.status !== 'active') throw new Error('Account is not active');
    socket.data.user = { id: user.id, role: user.role, email: user.email };
  };

  io.use(async (socket, next) => {
    try {
      await authenticateSocket(socket);
      next();
    } catch (_) {
      logger.warn('Socket authentication rejected.');
      next(new Error('Authentication required or account is not active'));
    }
  });

  // Per-socket rate limiter for messages (token bucket)
  const messageBuckets = new Map();
  const rateLimit = (userId, max = 30, windowMs = 60_000) => {
    const now = Date.now();
    let bucket = messageBuckets.get(userId);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      messageBuckets.set(userId, bucket);
    }
    bucket.count += 1;
    return bucket.count <= max;
  };

  // ===== Presence tracking =====
  // userId -> { count: number, lastSeen: ISOString }
  const presence = new Map();

  const setOnline = (userId) => {
    const entry = presence.get(userId) || { count: 0, lastSeen: new Date().toISOString() };
    entry.count += 1;
    entry.lastSeen = new Date().toISOString();
    presence.set(userId, entry);
    if (entry.count === 1) {
      io.emit('presence:update', { userId, online: true, lastSeen: entry.lastSeen });
    }
  };

  const setOffline = (userId) => {
    const entry = presence.get(userId);
    if (!entry) return;
    entry.count = Math.max(0, entry.count - 1);
    entry.lastSeen = new Date().toISOString();
    if (entry.count === 0) {
      presence.set(userId, entry);
      io.emit('presence:update', { userId, online: false, lastSeen: entry.lastSeen });
    } else {
      presence.set(userId, entry);
    }
  };

  const getPresenceFor = (userIds) => {
    const list = Array.isArray(userIds) ? userIds : [];
    return list.map((id) => {
      const entry = presence.get(Number(id));
      return {
        userId: Number(id),
        online: !!(entry && entry.count > 0),
        lastSeen: entry?.lastSeen || null,
      };
    });
  };

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    // Recheck active accounts and token expiry on packets, including sockets blocked after login.
    socket.use(async (_packet, next) => {
      try {
        await authenticateSocket(socket);
        next();
      } catch (_) {
        next(new Error('Authentication required or account is not active'));
        socket.disconnect(true);
      }
    });
    logger.info(`Socket connected: ${socket.id} (user ${userId})`);

    // Personal room for direct notifications
    socket.join(`user:${userId}`);

    setOnline(userId);

    socket.emit('connected', { userId, socketId: socket.id });

    socket.on('presence:get', (payload, ack) => {
      const { userIds } = payload || {};
      const states = getPresenceFor(userIds);
      if (typeof ack === 'function') ack({ ok: true, states });
      else socket.emit('presence:state', { states });
    });

    socket.on('join-room', async (payload, ack) => {
      try {
        const { conversationId } = payload || {};
        if (!conversationId) throw new Error('conversationId required');
        await chatService.ensureParticipant(conversationId, userId);
        socket.join(`conversation:${conversationId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        socket.emit('error', { event: 'join-room', message: err.message });
      }
    });

    socket.on('leave-room', payload => {
      const { conversationId } = payload || {};
      if (conversationId) socket.leave(`conversation:${conversationId}`);
    });

    socket.on('send-message', async (payload, ack) => {
      try {
        const { conversationId, message, attachmentUrl } = payload || {};
        if (!conversationId || !message) throw new Error('conversationId and message required');
        if (!rateLimit(userId)) throw new Error('Message rate limit exceeded');
        if (typeof message !== 'string' || message.length > 5000) {
          throw new Error('Message must be 1-5000 characters');
        }

        const saved = await chatService.createMessage(conversationId, userId, {
          message: message.trim(),
          attachmentUrl,
        });

        const messagePayload = {
          id: saved.id,
          conversationId,
          senderId: saved.senderId,
          senderName: saved.sender?.name,
          senderAvatar: saved.sender?.profileImage,
          message: saved.message,
          attachmentUrl: saved.attachmentUrl,
          createdAt: saved.createdAt,
        };

        io.to(`conversation:${conversationId}`).emit('receive-message', messagePayload);
        if (typeof ack === 'function') ack({ ok: true, message: messagePayload });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        socket.emit('error', { event: 'send-message', message: err.message });
      }
    });

    const handleTyping = async (payload, event, ack) => {
      try {
        const { conversationId } = payload || {};
        if (!conversationId) throw new Error('conversationId required');
        await chatService.ensureParticipant(conversationId, userId);
        socket.to(`conversation:${conversationId}`).emit(event, {
          userId,
          ...(event === 'typing-indicator' ? { userName: socket.data.user.email } : {}),
          conversationId,
        });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        socket.emit('error', { event, message: err.message });
      }
    };
    socket.on('typing', (payload, ack) => handleTyping(payload, 'typing-indicator', ack));
    socket.on('stop-typing', (payload, ack) => handleTyping(payload, 'stop-typing-indicator', ack));

    socket.on('message-read', async payload => {
      try {
        const { conversationId, messageId } = payload || {};
        if (messageId) {
          const msg = await chatService.markMessageRead(messageId, userId, conversationId);
          if (msg) {
            io.to(`conversation:${msg.conversationId}`).emit('read-receipt', {
              messageId: msg.id,
              readBy: userId,
              readAt: msg.readAt,
            });
          }
        } else if (conversationId) {
          await chatService.markConversationRead(conversationId, userId);
          io.to(`conversation:${conversationId}`).emit('read-receipt', {
            conversationId,
            readBy: userId,
            readAt: new Date(),
          });
        }
      } catch (err) {
        socket.emit('error', { event: 'message-read', message: err.message });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (user ${userId}) reason=${reason}`);
      setOffline(userId);
    });
  });

  // Inject io reference into notification service for real-time pushes
  notificationService.setIO(io);

  return io;
};

module.exports = { initSocketIO };
