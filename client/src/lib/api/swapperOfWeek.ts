import { http } from './client';

export interface SwapperOfWeek {
  id: number;
  name: string;
  username: string;
  image: string | null;
  swaps: number;
  rating: number;
  rank: number;
  badge: string;
}

export const swapperOfWeekApi = {
  list: () => http.get<SwapperOfWeek[]>('/swapper-of-week'),
};
