import { http, paginated, request } from './client';
import type { ImageExtraction, ExtraHead } from '../listingImageAi';
import type { ApiItem, ApiCategory } from './types';

export interface ItemFilters {
  q?: string;
  categoryId?: number | string;
  gender?: 'male' | 'female' | 'unisex';
  condition?: 'new' | 'like_new' | 'good' | 'fair';
  size?: string;
  color?: string;
  brand?: string;
  page?: number;
  limit?: number;
}

export interface CreateItemPayload {
  title: string;
  reviewConfirmed?: boolean;
  trainingConsent?: boolean;
  description?: string;
  categoryId: number;
  size: string;
  gender: 'male' | 'female' | 'unisex';
  condition: 'new' | 'like_new' | 'good' | 'fair';
  color?: string;
  brand?: string;
  confirmedAttributes?: Partial<Record<ExtraHead,string|null>>;
}

export const itemsApi = {
  list: (filters: ItemFilters = {}) => paginated<ApiItem>('/items', filters as Record<string, unknown>),
  search: (filters: ItemFilters = {}) => paginated<ApiItem>('/search', filters as Record<string, unknown>),
  nlpSearch: (query: string, page = 1, limit = 20) =>
    paginated<ApiItem>(`/nlp-search`, { q: query, page, limit }),
  byUser: (userId: string | number, page = 1, limit = 20) =>
    paginated<ApiItem>(`/items/user/${userId}`, { page, limit }),
  byId: (id: string | number) => http.get<ApiItem>(`/items/${id}`),

  create: (payload: CreateItemPayload, files: File[]) => {
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') fd.append(k, k === 'confirmedAttributes' ? JSON.stringify(v) : String(v));
    });
    files.forEach((f) => fd.append('images', f));
    return http.upload<ApiItem>('/items', fd);
  },

  update: (id: string | number, payload: Partial<CreateItemPayload> & { isAvailable?: boolean }) =>
    http.put<ApiItem>(`/items/${id}`, payload),

  remove: (id: string | number) => http.delete(`/items/${id}`),

  addImages: (id: string | number, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    return http.upload<ApiItem>(`/items/${id}/images`, fd);
  },

  deleteImage: (itemId: string | number, imgId: string | number) =>
    http.delete(`/items/${itemId}/images/${imgId}`),

  setPrimary: (itemId: string | number, imgId: string | number) =>
    request<ApiItem>(`/items/${itemId}/images/${imgId}/primary`, { method: 'PUT' }),

  imageCapabilities: () => http.get<{confirmed_attributes:boolean;reason:string|null}>('/search/visual'),
  extractImage: (file: File, signal?: AbortSignal) => {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('mode', 'extract');
    return request<ImageExtraction>('/search/visual', { method: 'POST', formData: fd, signal });
  },

  visualSearch: (mode: 'have'|'want', attributes: Record<string, unknown>, page = 1, signal?: AbortSignal) =>
    request<{operation:'have'|'want';results:Array<ApiItem & {matchReasons:string[]}>;candidate_limited:boolean;pagination:{hasNext:boolean;currentPage:number;totalItems:number}}>(
      '/search/visual', {method:'POST',body:{mode,attributes,page,limit:20},signal}),

};


export const categoriesApi = {
  list: () => http.get<ApiCategory[]>('/categories'),
};
