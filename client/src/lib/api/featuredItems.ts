import { http } from './client';

export interface FeaturedItem {
  id: number;
  title: string;
  description: string | null;
  category: string;
  size: string;
  gender: string;
  condition: string;
  color: string | null;
  brand: string | null;
  owner: string;
  ownerId: number;
  ownerImage: string | null;
  images: string[];
  createdAt: string;
}

export const featuredItemsApi = {
  list: () => http.get<FeaturedItem[]>('/featured-items'),
};
