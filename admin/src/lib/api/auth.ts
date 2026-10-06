import { http, tokenStore, userStore } from './client';
import type { ApiUser } from './types';

interface LoginResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
}

export const authApi = {
  async login(email: string, password: string): Promise<ApiUser> {
    const data = await http.post<LoginResponse>('/auth/login', { email, password }, { auth: false });
    tokenStore.set(data.accessToken, data.refreshToken);
    userStore.set(data.user);
    return data.user;
  },

  async me(): Promise<ApiUser> {
    return http.get<ApiUser>('/auth/me');
  },

  async logout(): Promise<void> {
    try {
      const refresh = tokenStore.refresh;
      if (refresh) await http.post('/auth/logout', { refreshToken: refresh });
    } catch {
      /* noop */
    }
    tokenStore.clear();
  },
};
