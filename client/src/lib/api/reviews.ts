import { http } from './client';
import type { ApiReview } from './types';

export interface CreateReviewPayload {
  swapRequestId: number;
  revieweeId: number;
  rating: number;
  comment?: string;
}

export const reviewsApi = {
  create: (payload: CreateReviewPayload) => http.post<ApiReview>('/reviews', payload),
};
