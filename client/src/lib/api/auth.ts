import { http, tokenStore, userStore } from './client';
import type { ApiAuthResponse, ApiUser } from './types';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  gender: 'male' | 'female' | 'other';
  phone?: string;
  dateOfBirth?: string;
}

export interface RegisterResponse {
  otpSent: boolean;
  email: string;
}

export const authApi = {
  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    return http.post<RegisterResponse>('/auth/register', payload, { auth: false });
  },

  async login(email: string, password: string): Promise<ApiAuthResponse> {
    const data = await http.post<ApiAuthResponse>('/auth/login', { email, password });
    tokenStore.set(data.accessToken, data.refreshToken);
    userStore.set(data.user);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await http.post('/auth/logout');
    } catch {
      /* swallow */
    } finally {
      tokenStore.clear();
    }
  },

  async me(): Promise<ApiUser> {
    const user = await http.get<ApiUser>('/auth/me');
    userStore.set(user);
    return user;
  },

  forgotPassword(email: string) {
    return http.post('/auth/forgot-password', { email });
  },

  verifyResetOtp(email: string, otp: string): Promise<{ resetToken: string }> {
    return http.post('/auth/verify-reset-otp', { email, otp });
  },

  resetPassword(token: string, password: string) {
    return http.post('/auth/reset-password', { token, password });
  },

  verifyEmail(token: string) {
    return http.get(`/auth/verify-email/${token}`);
  },

  resendVerification() {
    return http.post('/auth/resend-verification');
  },

  async verifyOtp(email: string, otp: string): Promise<ApiAuthResponse> {
    const data = await http.post<ApiAuthResponse>('/auth/verify-otp', { email, otp }, { auth: false });
    tokenStore.set(data.accessToken, data.refreshToken);
    userStore.set(data.user);
    return data;
  },

  resendOtp(email: string) {
    return http.post('/auth/resend-otp', { email }, { auth: false });
  },

  changePassword(currentPassword: string, newPassword: string) {
    return http.post('/auth/change-password', { currentPassword, newPassword });
  },
};
