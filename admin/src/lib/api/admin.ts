import { http, paginated } from './client';
import type { ApiUser, ApiReport, ApiItem, ApiStats } from './types';

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'blocked' | 'pending';
  role?: 'user' | 'admin';
}

export interface ListReportsParams {
  page?: number;
  limit?: number;
  status?: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
}

export interface ListItemsParams {
  page?: number;
  limit?: number;
  search?: string;
  available?: boolean;
}

export const adminApi = {
  users: (params: ListUsersParams = {}) =>
    paginated<ApiUser>('/admin/users', params as Record<string, unknown>),

  setUserStatus: (id: string | number, status: 'active' | 'blocked') =>
    http.put<ApiUser>(`/admin/users/${id}/status`, { status }),

  reports: (params: ListReportsParams = {}) =>
    paginated<ApiReport>('/admin/reports', params as Record<string, unknown>),

  updateReport: (
    id: string | number,
    payload: { status: 'pending' | 'reviewed' | 'resolved' | 'dismissed'; adminNotes?: string }
  ) => http.put<ApiReport>(`/admin/reports/${id}`, payload),

  items: (params: ListItemsParams = {}) =>
    paginated<ApiItem>('/admin/items', params as Record<string, unknown>),

  removeItem: (id: string | number) => http.delete<ApiItem>(`/admin/items/${id}`),

  stats: () => http.get<ApiStats>('/admin/stats'),

  disputes: (params: { page?: number; limit?: number; status?: string } = {}) =>
    paginated<any>('/disputes/admin/all', params as Record<string, unknown>),

  resolveDispute: (id: string | number, payload: { status: string; resolutionNotes: string; blockUserId?: number }) =>
    http.put<any>(`/disputes/admin/${id}/resolve`, payload),
};
