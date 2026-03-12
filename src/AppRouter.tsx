/**
 * 应用路由
 * 处理所有页面路由和认证守卫
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';

// 认证页面
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import WebClientNotice from './pages/WebClientNotice';

// 主应用
import App from './App';
import { isDesktopClient } from './lib/runtimeMode';

function AppRouterContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const desktopMode = isDesktopClient();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <Routes>
      {/* 认证路由 */}
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to={user?.is_admin ? '/admin' : desktopMode ? '/' : '/portal'} replace />
            : <LoginPage />
        }
      />
      <Route
        path="/register"
        element={<Navigate to="/login" replace />}
      />

      {/* 受保护路由 */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requireAdmin={true}>
            <Navigate to="/admin" replace />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin={true}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/portal"
        element={
          <ProtectedRoute>
            {user?.is_admin ? <Navigate to="/admin" replace /> : desktopMode ? <Navigate to="/" replace /> : <WebClientNotice />}
          </ProtectedRoute>
        }
      />

      {/* 主应用 */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            {user?.is_admin ? <Navigate to="/admin" replace /> : desktopMode ? <App /> : <Navigate to="/portal" replace />}
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function AppRouter() {
  return <AppRouterContent />;
}
