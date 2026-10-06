/**
 * Lightweight HTTP client built on `fetch`.
 * - Auto-injects the JWT from localStorage.
 * - Auto-refreshes on 401 (TokenExpiredError) once.
 * - Standardised response envelope handling.
 * - Multipart form support.
 */

export const getApiUrl = (): string => {
  const envUrl = (import.meta.env.VITE_API_URL || '/api/v1') as string;
  // If the web application is served over HTTPS (e.g. Vercel), convert absolute http:// backend URLs to relative /api/v1
  // to avoid browser Mixed Content blocking and route through Vercel's rewrite proxy seamlessly.
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && envUrl.startsWith('http://')) {
    try {
      const parsed = new URL(envUrl);
      return parsed.pathname.startsWith('/api') ? parsed.pathname : '/api/v1';
    } catch {
      return '/api/v1';
    }
  }
  return envUrl;
};

export const API_URL = getApiUrl();
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000') as string;

const ACCESS_TOKEN_KEY = 'rwx.accessToken';
const REFRESH_TOKEN_KEY = 'rwx.refreshToken';
const USER_KEY = 'rwx.user';

export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export const userStore = {
  get<T = unknown>(): T | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  set(user: unknown) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(USER_KEY);
  },
};

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  pagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
    hasNext: boolean;
    hasPrev: boolean;
    [key: string]: unknown;
  };
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  formData?: FormData;
  signal?: AbortSignal;
  retry?: boolean;
  auth?: boolean; // default true; set false to skip auth header (login/register)
}

const buildUrl = (path: string, query?: Record<string, unknown>): string => {
  const currentApiUrl = getApiUrl();
  let targetPath = path;

  // If running over HTTPS, ensure path is relative or HTTPS to prevent mixed content blocking
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    if (targetPath.startsWith('http://')) {
      try {
        const parsed = new URL(targetPath);
        targetPath = parsed.pathname + parsed.search;
      } catch {
        // Fallback
      }
    }
  }

  const base = targetPath.startsWith('http') ? '' : currentApiUrl;
  const fullPath = (base.endsWith('/') ? base.slice(0, -1) : base) + (targetPath.startsWith('/') ? targetPath : '/' + targetPath);
  const url = new URL(fullPath, window.location.origin);

  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v)) {
        v.forEach((val) => url.searchParams.append(k, String(val)));
      } else {
        url.searchParams.set(k, String(v));
      }
    });
  }
  return url.toString();
};

let refreshPromise: Promise<boolean> | null = null;

const tryRefresh = async (): Promise<boolean> => {
  if (refreshPromise) return refreshPromise;
  const refresh = tokenStore.refresh;
  if (!refresh) return false;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as ApiResponse<{ accessToken: string; refreshToken: string }>;
      if (!json.success || !json.data?.accessToken) return false;
      tokenStore.set(json.data.accessToken, json.data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
};

export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, formData, signal, auth = true } = opts;
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;

  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (auth && tokenStore.access) {
    headers.Authorization = `Bearer ${tokenStore.access}`;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: payload,
    signal,
  });

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    /* non-JSON response */
  }

  if (res.status === 401 && auth && !opts.retry) {
    const ok = await tryRefresh();
    if (ok) return request<T>(path, { ...opts, retry: true });
    tokenStore.clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, json?.message || 'Session expired. Please log in.', json?.details);
  }

  if (!res.ok || !json?.success) {
    throw new ApiError(
      res.status,
      json?.message || `Request failed with status ${res.status}`,
      json?.details
    );
  }

  // Attach pagination if present, on the data object
  if (json.pagination && Array.isArray(json.data)) {
    (json.data as unknown as { __pagination?: typeof json.pagination }).__pagination = json.pagination;
  }
  return json.data;
}

export const http = {
  get: <T = unknown>(path: string, query?: Record<string, unknown>) =>
    request<T>(path, { method: 'GET', query }),
  post: <T = unknown>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T = unknown>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T = unknown>(path: string, formData: FormData, method: 'POST' | 'PUT' = 'POST') =>
    request<T>(path, { method, formData }),
};

export interface Pagination {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export async function paginated<T>(
  path: string,
  query?: Record<string, unknown>
): Promise<{ items: T[]; pagination: Pagination }> {
  const data = await request<T[]>(path, { method: 'GET', query });
  const pagination = (data as unknown as { __pagination?: Pagination }).__pagination ?? {
    totalItems: Array.isArray(data) ? data.length : 0,
    totalPages: 1,
    currentPage: 1,
    pageSize: Array.isArray(data) ? data.length : 0,
    hasNext: false,
    hasPrev: false,
  };
  return { items: Array.isArray(data) ? data : [], pagination };
}
