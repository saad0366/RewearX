import { http, paginated } from './client';
import type { ApiConversation, ApiMessage } from './types';

export const chatApi = {
  conversations: (page = 1, limit = 50) =>
    paginated<ApiConversation>('/conversations', { page, limit }),
  byId: (conversationId: string | number) => http.get<ApiConversation>(`/conversations/${conversationId}`),
  messages: (conversationId: string | number, page = 1, limit = 50) =>
    paginated<ApiMessage>(`/conversations/${conversationId}/messages`, { page, limit }),
  send: (conversationId: string | number, message: string, attachmentUrl?: string) =>
    http.post<ApiMessage>(`/conversations/${conversationId}/messages`, { message, attachmentUrl }),
  markRead: (conversationId: string | number) =>
    http.put(`/conversations/${conversationId}/read`),
};
