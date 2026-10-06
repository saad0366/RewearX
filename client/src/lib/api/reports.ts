import { http } from './client';

export interface CreateReportPayload {
  reportedUserId: number;
  reportedItemId?: number;
  reason: string;
  description?: string;
}

export const reportsApi = {
  create: (payload: CreateReportPayload) => http.post('/reports', payload),
};
