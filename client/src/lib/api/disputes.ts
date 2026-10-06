import { http, paginated } from './client';
import type { ApiDispute } from './types';

export interface CreateDisputePayload {
  swapRequestId: number;
  reason: 'item_not_as_described' | 'damaged_item' | 'fake_brand' | 'missing_item' | 'never_shipped' | 'other';
  description: string;
}

export const disputesApi = {
  list: (page = 1, limit = 20) =>
    paginated<ApiDispute>('/disputes', { page, limit }),

  byId: (id: number | string) =>
    http.get<ApiDispute>(`/disputes/${id}`),

  create: (payload: CreateDisputePayload, files: File[]) => {
    const fd = new FormData();
    fd.append('swapRequestId', String(payload.swapRequestId));
    fd.append('reason', payload.reason);
    fd.append('description', payload.description);
    files.forEach((f) => fd.append('images', f));
    return http.upload<ApiDispute>('/disputes', fd);
  },

  addEvidence: (disputeId: number | string, files: File[], caption?: string) => {
    const fd = new FormData();
    if (caption) fd.append('caption', caption);
    files.forEach((f) => fd.append('images', f));
    return http.upload<ApiDispute>(`/disputes/${disputeId}/evidence`, fd);
  },

  // Admin tribunal endpoints
  listAdmin: (status?: string, page = 1, limit = 20) =>
    paginated<ApiDispute>('/disputes/admin/all', { status, page, limit }),

  resolveAdmin: (disputeId: number | string, status: string, resolutionNotes: string) =>
    http.put<ApiDispute>(`/disputes/admin/${disputeId}/resolve`, { status, resolutionNotes }),
};
