/**
 * 注册页面
 * 支持邮箱注册和手机号验证码注册
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type RegisterMethod = 'email' | 'phone';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [method, setMethod] = useState<RegisterMethod>('email');

  // 邮箱注册表单
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [confirmEmailPassword, setConfirmEmailPassword] = useState('');
  const [username, setUsername] = useState('');

  // 手机号注册表单
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [confirmPhonePassword, setConfirmPhonePassword] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 倒计时
  React.useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 发送验证码
  const handleSendCode = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }

    setError('');
    setIsSendingCode(true);

    try {
      const response = await fetch('/api/sms/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (data.ok) {
        setCountdown(60);
        // 开发环境显示验证码
        if (data.dev_code) {
          setError(`验证码（开发模式）: ${data.dev_code}`);
          setTimeout(() => setError(''), 30000);
        } else {
          setError('验证码已发送');
          setTimeout(() => setError(''), 3000);
        }
      } else {
        setError(data.message || '发送失败');
      }
    } catch {
      setError('发送失败，请稍后重试');
    }

    setIsSendingCode(false);
  };

  // 邮箱注册
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (emailPassword !== confirmEmailPassword) {
      setError('两次密码输入不一致');
      return;
    }

    if (emailPassword.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }

    setIsLoading(true);
    const result = await register(email, emailPassword, username || undefined);
    if (result.success) {
      navigate('/');
    } else {
      setError(result.message || '注册失败');
    }
    setIsLoading(false);
  };

  // 手机号注册
  const handlePhoneRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^1\d{10}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }

    if (!/^\d{6}$/.test(smsCode)) {
      setError('请输入6位验证码');
      return;
    }

    if (phonePassword !== confirmPhonePassword) {
      setError('两次密码输入不一致');
      return;
    }

    if (phonePassword.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/sms/register-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          code: smsCode,
          password: phonePassword,
          username: username || undefined,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        // 保存 token 并跳转
        localStorage.setItem('access_token', data.access_token);
        navigate('/');
      } else {
        setError(data.detail || data.message || '注册失败');
      }
    } catch {
      setError('注册失败，请稍后重试');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo / 标题 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">AI 带货助手</h1>
            <p className="text-gray-500 mt-2">创建新账户</p>
          </div>

          {/* 注册方式切换 */}
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setMethod('email')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                method === 'email'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              邮箱注册
            </button>
            <button
              type="button"
              onClick={() => setMethod('phone')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                method === 'phone'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              手机注册
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              error.includes('验证码（开发模式）')
                ? 'bg-blue-50 text-blue-700'
                : 'bg-red-50 text-red-700'
            }`}>
              {error}
            </div>
          )}

          {/* 邮箱注册表单 */}
          {method === 'email' && (
            <form onSubmit={handleEmailRegister} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱地址
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  昵称（可选）
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="怎么称呼您？"
                />
              </div>

              <div>
                <label htmlFor="emailPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  密码
                </label>
                <input
                  id="emailPassword"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="至少 6 位"
                />
              </div>

              <div>
                <label htmlFor="confirmEmailPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  确认密码
                </label>
                <input
                  id="confirmEmailPassword"
                  type="password"
                  value={confirmEmailPassword}
                  onChange={(e) => setConfirmEmailPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="再次输入密码"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '注册中...' : '注册'}
              </button>
            </form>
          )}

          {/* 手机号注册表单 */}
          {method === 'phone' && (
            <form onSubmit={handlePhoneRegister} className="space-y-5">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  手机号
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  pattern="1\d{10}"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="请输入11位手机号"
                />
              </div>

              <div>
                <label htmlFor="smsCode" className="block text-sm font-medium text-gray-700 mb-1">
                  验证码
                </label>
                <div className="flex gap-2">
                  <input
                    id="smsCode"
                    type="text"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    required
                    pattern="\d{6}"
                    maxLength={6}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    placeholder="6位验证码"
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isSendingCode || countdown > 0}
                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {countdown > 0 ? `${countdown}秒` : isSendingCode ? '发送中...' : '发送验证码'}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="phonePassword" className="block text-sm font-medium text-gray-700 mb-1">
                  密码
                </label>
                <input
                  id="phonePassword"
                  type="password"
                  value={phonePassword}
                  onChange={(e) => setPhonePassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="至少 6 位"
                />
              </div>

              <div>
                <label htmlFor="confirmPhonePassword" className="block text-sm font-medium text-gray-700 mb-1">
                  确认密码
                </label>
                <input
                  id="confirmPhonePassword"
                  type="password"
                  value={confirmPhonePassword}
                  onChange={(e) => setConfirmPhonePassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="再次输入密码"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '注册中...' : '注册'}
              </button>
            </form>
          )}

          {/* 登录链接 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              已有账户？{' '}
              <a href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                立即登录
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
