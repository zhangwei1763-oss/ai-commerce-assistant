/**
 * API 请求封装
 * 统一处理认证、错误、token 刷新等
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function buildApiUrl(endpoint: string) {
  if (/^https?:\/\//.test(endpoint)) return endpoint;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${normalizedEndpoint}`;
}

// 内部 token 存储
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
  if (token) {
    localStorage.setItem('access_token', token);
  } else {
    localStorage.removeItem('access_token');
  }
}

export function getAccessToken(): string | null {
  if (_accessToken) return _accessToken;
  const stored = localStorage.getItem('access_token');
  if (stored) {
    _accessToken = stored;
    return stored;
  }
  return null;
}

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  detail?: string;
}

export interface StoredApiKey {
  id: string;
  provider: string;
  api_key: string;
  api_endpoint: string;
  model_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplateRecord {
  id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  username?: string;
  phone?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login?: string;
}

export interface AdminUserStats {
  total_users: number;
  active_users: number;
  admin_users: number;
  new_users_today: number;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = buildApiUrl(endpoint);
  const token = getAccessToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        message: data?.detail || data?.message || `请求失败: ${response.status}`,
      };
    }

    return {
      ok: true,
      data: data as T,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '网络请求失败',
    };
  }
}

// 认证 API
export const authApi = {
  sendEmailCode: async (email: string) => {
    return request('/api/auth/send-email-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  register: async (email: string, code: string, password: string, username?: string) => {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, code, password, username }),
    });
  },

  login: async (email: string, password: string) => {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getCurrentUser: async () => {
    return request('/api/auth/me');
  },

  logout: async () => {
    return request('/api/auth/logout', { method: 'POST' });
  },
};

// 用户 API
export const userApi = {
  getProfile: async () => {
    return request('/api/user/profile');
  },

  listApiKeys: async () => {
    return request('/api/user/apikeys');
  },

  createApiKey: async (data: {
    provider: string;
    api_key: string;
    api_endpoint?: string;
    model_name?: string;
  }) => {
    return request('/api/user/apikeys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteApiKey: async (keyId: string) => {
    return request(`/api/user/apikeys/${keyId}`, {
      method: 'DELETE',
    });
  },

  listPromptTemplates: async () => {
    return request('/api/user/prompt-templates');
  },

  createPromptTemplate: async (data: {
    name: string;
    content: string;
  }) => {
    return request('/api/user/prompt-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePromptTemplate: async (templateId: string, data: {
    name: string;
    content: string;
  }) => {
    return request(`/api/user/prompt-templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deletePromptTemplate: async (templateId: string) => {
    return request(`/api/user/prompt-templates/${templateId}`, {
      method: 'DELETE',
    });
  },
};

export const adminApi = {
  listUsers: async (params?: {
    limit?: number;
    is_active?: boolean;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (typeof params?.limit === 'number') {
      searchParams.set('limit', String(params.limit));
    }
    if (typeof params?.is_active === 'boolean') {
      searchParams.set('is_active', String(params.is_active));
    }
    if (params?.search?.trim()) {
      searchParams.set('search', params.search.trim());
    }
    const query = searchParams.toString();
    return request(`/api/admin/users${query ? `?${query}` : ''}`);
  },

  getStats: async () => {
    return request('/api/admin/stats');
  },

  updateUser: async (userId: string, data: {
    is_active?: boolean;
    is_admin?: boolean;
  }) => {
    return request(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteUser: async (userId: string) => {
    return request(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
  },
};

export default { request, setAccessToken, getAccessToken };
