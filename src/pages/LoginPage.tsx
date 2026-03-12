/**
 * 卡密登录页面
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isDesktopClient } from '../lib/runtimeMode';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, logout } = useAuth();
  const redirectTo = searchParams.get('redirect') || '/';
  const desktopMode = isDesktopClient();

  const [cardKey, setCardKey] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const normalizeLoginMessage = (message?: string) => {
    if (!message) return '密码错误';
    if (message.includes('卡密不存在') || message.includes('格式不正确')) {
      return '密码错误';
    }
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(cardKey);
    if (result.success) {
      if (result.user?.is_admin) {
        navigate('/admin', { replace: true });
      } else if (!desktopMode) {
        logout();
        setError('无权限');
      } else {
        navigate(redirectTo === '/admin' ? '/' : redirectTo, { replace: true });
      }
    } else {
      setError(normalizeLoginMessage(result.message));
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#eff6ff_0%,#dbeafe_35%,#f8fafc_100%)] px-4">
      <div className="max-w-md w-full">
        <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl border border-white p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white text-xl font-bold shadow-lg shadow-blue-200 mb-4">
              AI
            </div>
            <h1 className="text-3xl font-bold text-gray-900">AI 带货助手</h1>
            <p className="text-gray-500 mt-2">
              {desktopMode ? '请输入管理员发放的卡密进行登录' : '网页端仅用于管理员卡密后台登录'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="cardKey" className="block text-sm font-medium text-gray-700 mb-1">
                卡密
              </label>
              <input
                id="cardKey"
                type="text"
                value={cardKey}
                onChange={(e) => setCardKey(e.target.value.toUpperCase())}
                required
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition font-mono tracking-[0.12em]"
                placeholder="XXXX-XXXX-XXXX-XXXX"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '登录中...' : '卡密登录'}
            </button>
          </form>

          <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-700 mb-1">说明</p>
            <p>
              {desktopMode
                ? '用户登录后请先在设置中填写自己的 AI API Key，卡密只负责软件授权。'
                : '网页端只保留管理员卡密后台；普通用户请在桌面客户端登录并填写自己的 AI API Key。'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
