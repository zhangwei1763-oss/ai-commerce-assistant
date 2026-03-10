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

export function resolveAssetUrl(value: string) {
  if (!value) return value;
  return /^https?:\/\//.test(value) ? value : buildApiUrl(value);
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

export interface CharacterRecord {
  id: string;
  name: string;
  group_name: string;
  description: string;
  style_preset: string;
  prompt_text: string;
  image_storage_key: string;
  image_public_url: string;
  image_width?: number | null;
  image_height?: number | null;
  file_size?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterListPayload {
  items: CharacterRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface CharacterGroupRecord {
  id: string;
  name: string;
  usage_count: number;
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
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers: HeadersInit = {
    ...options.headers,
  };

  if (!isFormData && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json';
  }

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

export const characterApi = {
  list: async (params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (typeof params?.limit === 'number') searchParams.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') searchParams.set('offset', String(params.offset));
    const query = searchParams.toString();
    return request<CharacterListPayload>(`/api/characters${query ? `?${query}` : ''}`);
  },

  get: async (characterId: string) => {
    return request<CharacterRecord>(`/api/characters/${characterId}`);
  },

  listGroups: async () => {
    return request<CharacterGroupRecord[]>('/api/characters/groups');
  },

  createGroup: async (data: { name: string }) => {
    return request<CharacterGroupRecord>('/api/characters/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteGroup: async (groupId: string) => {
    return request<{ ok: boolean; affected: number }>(`/api/characters/groups/${groupId}`, {
      method: 'DELETE',
    });
  },

  generate: async (data: {
    apiKey: string;
    provider?: string;
    apiEndpoint?: string;
    modelName?: string;
    stylePreset: string;
    customPrompt: string;
    count: number;
    size?: string;
  }) => {
    return request<{
      ok: boolean;
      prompt: string;
      stylePreset: string;
      images: Array<{
        storage_key: string;
        public_url: string;
        revised_prompt?: string;
        file_size?: number | null;
        image_width?: number | null;
        image_height?: number | null;
      }>;
    }>('/api/characters/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  save: async (data: {
    name: string;
    groupName?: string;
    description?: string;
    stylePreset?: string;
    promptText?: string;
    imageStorageKey: string;
    imagePublicUrl: string;
    fileSize?: number | null;
    imageWidth?: number | null;
    imageHeight?: number | null;
  }) => {
    return request<CharacterRecord>('/api/characters/save', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  upload: async (data: { file: File; name: string; groupName?: string; description?: string }) => {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('name', data.name);
    if (data.groupName) formData.append('groupName', data.groupName);
    if (data.description) formData.append('description', data.description);
    return request<CharacterRecord>('/api/characters/upload', {
      method: 'POST',
      body: formData,
    });
  },

  update: async (characterId: string, data: { name: string; groupName?: string; description?: string }) => {
    return request<CharacterRecord>(`/api/characters/${characterId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (characterId: string) => {
    return request<{ ok: boolean }>(`/api/characters/${characterId}`, {
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
