import { http, paginated } from './client';
import type { ApiNotification } from './types';

export const notificationsApi = {
  list: (page = 1, limit = 20) => paginated<ApiNotification>('/notifications', { page, limit }),
  unreadCount: () => http.get<{ unread: number }>('/notifications/unread-count'),
  markRead: (id: string | number) => http.put(`/notifications/${id}/read`),
  markAllRead: () => http.put('/notifications/read-all'),
};
