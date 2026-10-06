import { http, paginated } from './client';
import type { ApiItem } from './types';

export const savedApi = {
  list: (page = 1, limit = 50) => paginated<ApiItem>('/saved', { page, limit }),
  save: (itemId: string | number) => http.post(`/saved/${itemId}`),
  unsave: (itemId: string | number) => http.delete(`/saved/${itemId}`),
};
