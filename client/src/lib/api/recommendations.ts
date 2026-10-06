import { http } from './client';
import type { ApiRecommendation } from './types';

export const recommendationsApi = {
  list: (limit = 20, refresh = false) =>
    http.get<ApiRecommendation[]>('/recommendations', { limit, refresh }),
};
