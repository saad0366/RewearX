import { http, paginated } from './client';
import type { ApiUser, ApiAddress, ApiReview } from './types';

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  phone?: string;
  gender?: 'male' | 'female' | 'other';
  profileImage?: string;
  dateOfBirth?: string;
  location?: string;
  address?: string;
}

export interface UserPreferences {
  preferredGender?: 'male' | 'female' | 'unisex' | 'any';
  preferredSizes?: string[];
  preferredColors?: string[];
  preferredStyles?: string[];
  preferredCategories?: (number | string)[];
  preferredCondition?: 'new' | 'like_new' | 'good' | 'fair' | 'any';
}

export const normalizePreferenceCategoryIds = (values: (number | string)[] = []): number[] =>
  values.map(Number).filter(id => Number.isSafeInteger(id) && id > 0);

export const usersApi = {
  me: () => http.get<ApiUser>('/users/me'),
  updateMe: (payload: UpdateProfilePayload) => http.put<ApiUser>('/users/me', payload),

  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return http.upload<ApiUser>('/users/me/avatar', fd);
  },

  byId: (id: string | number) => http.get<ApiUser>(`/users/${id}`),

  reviews: (id: string | number, page = 1, limit = 20) =>
    paginated<ApiReview>(`/users/${id}/reviews`, { page, limit }),

  preferences: () => http.get<UserPreferences | null>('/users/me/preferences'),
  updatePreferences: (prefs: UserPreferences) =>
    http.put<UserPreferences>('/users/me/preferences', prefs),

  addresses: () => http.get<ApiAddress[]>('/users/me/addresses'),
  addAddress: (payload: Omit<ApiAddress, 'id' | 'userId'>) =>
    http.post<ApiAddress>('/users/me/addresses', payload),
  deleteAddress: (id: string | number) => http.delete(`/users/me/addresses/${id}`),
};
