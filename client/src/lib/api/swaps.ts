import { http, paginated } from './client';
import type { ApiSwap } from './types';

export interface CreateSwapPayload {
  receiverId: number;
  senderItemId: number;
  receiverItemId: number;
  message?: string;
}

export type SwapStatus = 'accepted' | 'rejected' | 'cancelled' | 'completed';

export const swapsApi = {
  create: (payload: CreateSwapPayload) => http.post<ApiSwap>('/swaps', payload),
  list: (params: { role?: 'sent' | 'received' | 'all'; status?: string; page?: number; limit?: number } = {}) =>
    paginated<ApiSwap>('/swaps', params as Record<string, unknown>),
  byId: (id: string | number) => http.get<ApiSwap>(`/swaps/${id}`),
  updateStatus: (id: string | number, status: SwapStatus) =>
    http.put<ApiSwap>(`/swaps/${id}/status`, { status }),
};
