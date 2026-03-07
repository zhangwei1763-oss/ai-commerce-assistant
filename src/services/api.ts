/**
 * API 请求封装
 * 统一处理认证、错误、token 刷新等
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
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
  register: async (email: string, password: string, username?: string) => {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username }),
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
};

export default { request, setAccessToken, getAccessToken };
