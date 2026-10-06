import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authApi, RegisterPayload } from '../lib/api/auth';
import { usersApi, UpdateProfilePayload } from '../lib/api/users';
import { tokenStore, userStore } from '../lib/api/client';
import { adaptUser } from '../lib/api/types';
import type { User as UIUser } from '../lib/mockData';
import type { ApiUser } from '../lib/api/types';
import { disconnectSocket, reconnectWithToken } from '../lib/socket';

interface AuthContextValue {
  user: UIUser | null;
  apiUser: ApiUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<UIUser>;
  signUp: (payload: RegisterPayload) => Promise<string>;
  signOut: () => Promise<void>;
  updateUser: (partial: UpdateProfilePayload) => Promise<UIUser>;
  refresh: () => Promise<UIUser | null>;
}

const defaultAuthContext: AuthContextValue = {
  user: null,
  apiUser: null,
  isAuthenticated: false,
  isLoading: false,
  signIn: async () => { throw new Error('AuthProvider not ready'); },
  signUp: async () => { throw new Error('AuthProvider not ready'); },
  signOut: async () => {},
  updateUser: async () => { throw new Error('AuthProvider not ready'); },
  refresh: async () => null,
};

const AuthContext = createContext<AuthContextValue>(defaultAuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedRaw = userStore.get<ApiUser>();
  const [apiUser, setApiUser] = useState<ApiUser | null>(cachedRaw);
  const [user, setUser] = useState<UIUser | null>(cachedRaw ? adaptUser(cachedRaw) : null);
  const [isLoading, setIsLoading] = useState<boolean>(!!tokenStore.access);

  const setBoth = (u: ApiUser | null) => {
    setApiUser(u);
    setUser(u ? adaptUser(u) : null);
  };

  const refresh = useCallback(async (): Promise<UIUser | null> => {
    if (!tokenStore.access) {
      setBoth(null);
      return null;
    }
    try {
      const fresh = await authApi.me();
      const profile = await usersApi.me().catch(() => fresh);
      const merged: ApiUser = { ...fresh, ...profile };
      userStore.set(merged);
      setBoth(merged);
      return adaptUser(merged);
    } catch {
      tokenStore.clear();
      setBoth(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (tokenStore.access) {
      refresh().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string): Promise<UIUser> => {
    const data = await authApi.login(email, password);
    setBoth(data.user);
    reconnectWithToken();
    const refreshed = await refresh();
    return refreshed || adaptUser(data.user);
  };

  const signUp = async (payload: RegisterPayload): Promise<string> => {
    const data = await authApi.register(payload);
    return data.email;
  };

  const signOut = async (): Promise<void> => {
    disconnectSocket();
    await authApi.logout();
    setBoth(null);
  };

  const updateUser = async (partial: UpdateProfilePayload): Promise<UIUser> => {
    const updated = await usersApi.updateMe(partial);
    const merged = { ...(apiUser || ({} as ApiUser)), ...updated };
    userStore.set(merged);
    setBoth(merged);
    return adaptUser(merged);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        apiUser,
        isAuthenticated: !!user && !!tokenStore.access,
        isLoading,
        signIn,
        signUp,
        signOut,
        updateUser,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  return ctx || defaultAuthContext;
}
