/**
 * 管理员后台页面
 * 管理用户账号、权限，以及当前管理员自己的 API Key 和提示词模板。
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  adminApi,
  userApi,
  type AdminUserRecord,
  type AdminUserStats,
  type PromptTemplateRecord,
  type StoredApiKey,
} from '../services/api';

type ApiKeyModalMode = 'add' | 'edit' | null;
type TemplateModalMode = 'add' | 'edit' | null;

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

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<boolean | null>(true);

  const [apiKeys, setApiKeys] = useState<StoredApiKey[]>([]);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(true);
  const [apiKeyModalMode, setApiKeyModalMode] = useState<ApiKeyModalMode>(null);
  const [provider, setProvider] = useState('DOUBAO');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [modelName, setModelName] = useState('');

  const [templates, setTemplates] = useState<PromptTemplateRecord[]>([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(true);
  const [templateModalMode, setTemplateModalMode] = useState<TemplateModalMode>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void loadUserData();
  }, [statusFilter]);

  useEffect(() => {
    void loadOwnApiKeys();
    void loadOwnPromptTemplates();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 3000);
  };

  const loadUserData = async () => {
    setIsUserLoading(true);
    try {
      const usersRes = await adminApi.listUsers({
        limit: 100,
        is_active: typeof statusFilter === 'boolean' ? statusFilter : undefined,
      });
      if (usersRes.ok && Array.isArray(usersRes.data)) {
        setUsers(usersRes.data as AdminUserRecord[]);
      }

      const statsRes = await adminApi.getStats();
      if (statsRes.ok && statsRes.data) {
        setStats(statsRes.data as AdminUserStats);
      }
    } finally {
      setIsUserLoading(false);
    }
  };

  const loadOwnApiKeys = async () => {
    setIsApiKeysLoading(true);
    const response = await userApi.listApiKeys();
    if (response.ok && Array.isArray(response.data)) {
      setApiKeys(response.data as StoredApiKey[]);
    } else {
      setApiKeys([]);
    }
    setIsApiKeysLoading(false);
  };

  const loadOwnPromptTemplates = async () => {
    setIsTemplatesLoading(true);
    const response = await userApi.listPromptTemplates();
    if (response.ok && Array.isArray(response.data)) {
      setTemplates(response.data as PromptTemplateRecord[]);
    } else {
      setTemplates([]);
    }
    setIsTemplatesLoading(false);
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    if (!confirm(`确定要${currentStatus ? '禁用' : '启用'}此用户吗？`)) return;

    const res = await adminApi.updateUser(userId, {
      is_active: !currentStatus,
    });

    if (res.ok) {
      showMessage('success', `用户已${currentStatus ? '禁用' : '启用'}`);
      void loadUserData();
    } else {
      showMessage('error', res.message || '操作失败');
    }
  };

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    if (!confirm(`确定要${currentIsAdmin ? '取消' : '设置为'}管理员权限吗？`)) return;

    const res = await adminApi.updateUser(userId, {
      is_admin: !currentIsAdmin,
    });

    if (res.ok) {
      showMessage('success', currentIsAdmin ? '已取消管理员权限' : '已设为管理员');
      void loadUserData();
    } else {
      showMessage('error', res.message || '操作失败');
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`确定要删除用户 ${email} 吗？此操作不可恢复！`)) return;

    const res = await adminApi.deleteUser(userId);
    if (res.ok) {
      showMessage('success', '用户已删除');
      void loadUserData();
    } else {
      showMessage('error', res.message || '删除失败');
    }
  };

  const handleAddApiKey = () => {
    setProvider('DOUBAO');
    setApiKeyValue('');
    setApiEndpoint('');
    setModelName('');
    setApiKeyModalMode('add');
  };

  const handleEditApiKey = (key: StoredApiKey) => {
    setProvider(key.provider);
    setApiKeyValue(key.api_key);
    setApiEndpoint(key.api_endpoint || '');
    setModelName(key.model_name || '');
    setApiKeyModalMode('edit');
  };

  const closeApiKeyModal = () => {
    setApiKeyModalMode(null);
    setProvider('DOUBAO');
    setApiKeyValue('');
    setApiEndpoint('');
    setModelName('');
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyValue.trim()) {
      showMessage('error', '请输入 API Key');
      return;
    }

    const response = await userApi.createApiKey({
      provider: provider.toUpperCase(),
      api_key: apiKeyValue.trim(),
      api_endpoint: apiEndpoint.trim() || undefined,
      model_name: modelName.trim() || undefined,
    });

    if (response.ok) {
      showMessage('success', 'API Key 保存成功');
      closeApiKeyModal();
      void loadOwnApiKeys();
    } else {
      showMessage('error', response.message || 'API Key 保存失败');
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!confirm('确定要删除这个 API Key 吗？')) return;

    const response = await userApi.deleteApiKey(keyId);
    if (response.ok) {
      showMessage('success', 'API Key 已删除');
      void loadOwnApiKeys();
    } else {
      showMessage('error', response.message || '删除失败');
    }
  };

  const handleAddTemplate = () => {
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateContent('');
    setTemplateModalMode('add');
  };

  const handleEditTemplate = (template: PromptTemplateRecord) => {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateContent(template.content);
    setTemplateModalMode('edit');
  };

  const closeTemplateModal = () => {
    setTemplateModalMode(null);
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateContent('');
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !templateContent.trim()) {
      showMessage('error', '模板名称和内容不能为空');
      return;
    }

    if (editingTemplateId) {
      const response = await userApi.updatePromptTemplate(editingTemplateId, {
        name: templateName.trim(),
        content: templateContent.trim(),
      });
      if (response.ok) {
        showMessage('success', '提示词模板已更新');
        closeTemplateModal();
        void loadOwnPromptTemplates();
      } else {
        showMessage('error', response.message || '模板更新失败');
      }
      return;
    }

    const response = await userApi.createPromptTemplate({
      name: templateName.trim(),
      content: templateContent.trim(),
    });
    if (response.ok) {
      showMessage('success', '提示词模板已创建');
      closeTemplateModal();
      void loadOwnPromptTemplates();
    } else {
      showMessage('error', response.message || '模板创建失败');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('确定要删除这个提示词模板吗？')) return;

    const response = await userApi.deletePromptTemplate(templateId);
    if (response.ok) {
      showMessage('success', '提示词模板已删除');
      void loadOwnPromptTemplates();
    } else {
      showMessage('error', response.message || '删除失败');
    }
  };

  const filteredUsers = users.filter(
    (item) =>
      item.email.toLowerCase().includes(search.toLowerCase())
      || (item.username && item.username.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">用户与权限管理</h1>
            <p className="text-gray-500 mt-1">{user?.email}</p>
            <p className="text-sm text-gray-400 mt-2">当前页面同时管理用户权限、当前管理员账号的 API Key 与提示词模板。</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded">
              管理员
            </span>
            <Link
              to="/"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              返回工作台
            </Link>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              退出登录
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-gray-500 text-sm">总用户数</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total_users}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-gray-500 text-sm">活跃用户</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{stats.active_users}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-gray-500 text-sm">管理员</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">{stats.admin_users}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-gray-500 text-sm">今日新增</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{stats.new_users_today}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-xl font-semibold text-gray-900">用户账号与权限</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索邮箱或用户名..."
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <select
              value={statusFilter === null ? 'all' : statusFilter ? 'active' : 'inactive'}
              onChange={(e) => setStatusFilter(e.target.value === 'all' ? null : e.target.value === 'active')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="all">全部用户</option>
              <option value="active">活跃用户</option>
              <option value="inactive">已禁用</option>
            </select>
          </div>
        </div>

        {isUserLoading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">没有找到用户</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">邮箱</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">用户名</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">状态</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">注册时间</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{item.email}</div>
                      {item.id === user?.id && (
                        <span className="text-xs text-gray-400">(当前用户)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{item.username || '-'}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        {item.is_admin && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                            管理员
                          </span>
                        )}
                        {item.is_active ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                            活跃
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                            已禁用
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-sm">
                      {new Date(item.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        {item.id !== user?.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => { void handleToggleStatus(item.id, item.is_active); }}
                              className={`px-2 py-1 text-xs rounded ${
                                item.is_active
                                  ? 'text-orange-600 hover:bg-orange-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                            >
                              {item.is_active ? '禁用' : '启用'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleToggleAdmin(item.id, item.is_admin); }}
                              className="px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded"
                            >
                              {item.is_admin ? '取消管理员' : '设为管理员'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleDeleteUser(item.id, item.email); }}
                              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                            >
                              删除
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">我的 API Key 管理</h2>
              <p className="text-sm text-gray-500 mt-1">当前管理员账号的模型与视频接口配置。</p>
            </div>
            <button
              type="button"
              onClick={handleAddApiKey}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              添加 API Key
            </button>
          </div>

          {isApiKeysLoading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-4">还没有配置 API Key</p>
              <button
                type="button"
                onClick={handleAddApiKey}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                立即添加
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${providerColors[item.provider] || 'bg-gray-100 text-gray-700'}`}>
                          {providerNames[item.provider] || item.provider}
                        </span>
                        {item.is_active && (
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                            启用中
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-sm text-gray-600 mb-1">
                        {item.api_key.substring(0, 8)}***{item.api_key.substring(item.api_key.length - 4)}
                      </div>
                      {item.model_name && (
                        <div className="text-sm text-gray-500">模型: {item.model_name}</div>
                      )}
                      {item.api_endpoint && (
                        <div className="text-sm text-gray-500 truncate">{item.api_endpoint}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditApiKey(item)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleDeleteApiKey(item.id); }}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">我的提示词模板管理</h2>
              <p className="text-sm text-gray-500 mt-1">当前管理员账号登录后可直接复用这些模板。</p>
            </div>
            <button
              type="button"
              onClick={handleAddTemplate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              新建模板
            </button>
          </div>

          {isTemplatesLoading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-4">还没有提示词模板</p>
              <button
                type="button"
                onClick={handleAddTemplate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                立即创建
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 mb-1">{item.name}</h3>
                      <p className="text-sm text-gray-500 whitespace-pre-wrap line-clamp-3">{item.content}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditTemplate(item)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleDeleteTemplate(item.id); }}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {apiKeyModalMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {apiKeyModalMode === 'add' ? '添加 API Key' : '编辑 API Key'}
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
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
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
                type="button"
                onClick={closeApiKeyModal}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleSaveApiKey(); }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {templateModalMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {templateModalMode === 'add' ? '新建提示词模板' : '编辑提示词模板'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模板名称</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="例如：高客单痛点转化模板"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模板内容</label>
                <textarea
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  rows={10}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                  placeholder="输入提示词模板内容..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={closeTemplateModal}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleSaveTemplate(); }}
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
