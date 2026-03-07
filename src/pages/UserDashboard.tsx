/**
 * 用户后台页面
 * 管理 API Keys 和账户设置
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userApi } from '../services/api';

interface ApiKey {
  id: string;
  provider: string;
  api_key: string;
  api_endpoint: string;
  model_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type ModalMode = 'add' | 'edit' | null;

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 表单状态
  const [provider, setProvider] = useState('DOUBAO');
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [modelName, setModelName] = useState('');

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    const response = await userApi.listApiKeys();
    if (response.ok && response.data) {
      setApiKeys(response.data as ApiKey[]);
    }
    setIsLoading(false);
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      showMessage('error', '请输入 API Key');
      return;
    }

    const response = await userApi.createApiKey({
      provider: provider.toUpperCase(),
      api_key: apiKey.trim(),
      api_endpoint: apiEndpoint.trim() || undefined,
      model_name: modelName.trim() || undefined,
    });

    if (response.ok) {
      showMessage('success', 'API Key 保存成功');
      loadApiKeys();
      handleCloseModal();
    } else {
      showMessage('error', response.message || '保存失败');
    }
  };

  const handleDelete = async (keyId: string) => {
    if (!confirm('确定要删除这个 API Key 吗？')) return;

    const response = await userApi.deleteApiKey(keyId);
    if (response.ok) {
      showMessage('success', '删除成功');
      loadApiKeys();
    } else {
      showMessage('error', '删除失败');
    }
  };

  const handleEdit = (key: ApiKey) => {
    setEditingKey(key);
    setProvider(key.provider);
    setApiKey(key.api_key);
    setApiEndpoint(key.api_endpoint);
    setModelName(key.model_name);
    setModalMode('edit');
  };

  const handleAdd = () => {
    setProvider('DOUBAO');
    setApiKey('');
    setApiEndpoint('');
    setModelName('');
    setModalMode('add');
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setEditingKey(null);
    setProvider('DOUBAO');
    setApiKey('');
    setApiEndpoint('');
    setModelName('');
  };

  const providerNames: Record<string, string> = {
    GEMINI: 'Gemini (Google)',
    DOUBAO: '豆包 (火山引擎)',
    SEEDANCE: 'Seedance (图生视频)',
  };

  const providerColors: Record<string, string> = {
    GEMINI: 'bg-blue-100 text-blue-800',
    DOUBAO: 'bg-green-100 text-green-800',
    SEEDANCE: 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 头部 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">用户后台</h1>
            <p className="text-gray-500 mt-1">
              {user?.email} {user?.is_admin && <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">管理员</span>}
            </p>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            退出登录
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* API Keys 管理 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">API Keys</h2>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            添加 API Key
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="mb-4">还没有配置 API Key</p>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              立即添加
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div key={key.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${providerColors[key.provider]}`}>
                        {providerNames[key.provider] || key.provider}
                      </span>
                      {key.is_active && (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                          启用中
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-sm text-gray-600 mb-1">
                      {key.api_key.substring(0, 8)}***{key.api_key.substring(key.api_key.length - 4)}
                    </div>
                    {key.model_name && (
                      <div className="text-sm text-gray-500">模型: {key.model_name}</div>
                    )}
                    {key.api_endpoint && (
                      <div className="text-sm text-gray-500 truncate">{key.api_endpoint}</div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleEdit(key)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      {modalMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {modalMode === 'add' ? '添加 API Key' : '编辑 API Key'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API 提供商</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="DOUBAO">豆包 (火山引擎)</option>
                  <option value="GEMINI">Gemini (Google)</option>
                  <option value="SEEDANCE">Seedance (图生视频)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="输入您的 API Key"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API 端点（可选）</label>
                <input
                  type="text"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="自定义 API 端点"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型名称（可选）</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="例如: ep-20250225204603-zcqr4"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
