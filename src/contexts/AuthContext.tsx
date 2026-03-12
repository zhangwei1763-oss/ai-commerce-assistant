/**
 * 认证上下文
 * 管理用户登录状态和认证信息
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, setAccessToken, getAccessToken } from '../services/api';

interface User {
  id: string;
  email: string;
  username?: string;
  display_name?: string;
  is_active: boolean;
  is_admin: boolean;
  license_key_masked?: string;
  license_key_name?: string;
  license_expires_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (cardKey: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // 初始化：检查本地存储的 token
  useEffect(() => {
    const initAuth = async () => {
      const token = getAccessToken();
      if (token) {
        try {
          const response = await authApi.getCurrentUser();
          if (response.ok && response.data) {
            setUser(response.data as User);
          } else {
            setAccessToken(null);
          }
        } catch {
          setAccessToken(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (cardKey: string) => {
    try {
      const response = await authApi.login(cardKey);
      if (response.ok && response.data) {
        const data = response.data as { access_token: string; user: User };
        setAccessToken(data.access_token);
        setUser(data.user);
        return { success: true, user: data.user };
      }
      return { success: false, message: response.message || response.detail };
    } catch {
      return { success: false, message: '登录失败，请稍后重试' };
    }
  };

  const logout = () => {
    setAccessToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    const response = await authApi.getCurrentUser();
    if (response.ok && response.data) {
      setUser(response.data as User);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
