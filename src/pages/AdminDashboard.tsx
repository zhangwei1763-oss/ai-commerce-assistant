/**
 * 管理员后台页面
 * 用户管理、统计数据等
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: string;
  email: string;
  username?: string;
  phone?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login?: string;
}

interface UserStats {
  total_users: number;
  active_users: number;
  admin_users: number;
  new_users_today: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    loadData();
  }, [showInactive]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 加载用户列表
      const inactiveParam = showInactive ? '&is_active=false' : (showInactive === false ? '&is_active=true' : '');
      const usersRes = await fetch(`/api/admin/users?limit=100${inactiveParam}`);
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data);
      }

      // 加载统计数据
      const statsRes = await fetch('/api/admin/stats');
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch {
      // ignore
    }
    setIsLoading(false);
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    if (!confirm(`确定要${currentStatus ? '禁用' : '启用'}此用户吗？`)) return;

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentStatus }),
    });

    if (res.ok) {
      loadData();
    } else {
      alert('操作失败');
    }
  };

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    if (!confirm(`确定要${currentIsAdmin ? '取消' : '设置为'}管理员权限吗？`)) return;

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: !currentIsAdmin }),
    });

    if (res.ok) {
      loadData();
    } else {
      const error = await res.json();
      alert(error.detail || '操作失败');
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`确定要删除用户 ${email} 吗？此操作不可恢复！`)) return;

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      loadData();
    } else {
      const error = await res.json();
      alert(error.detail || '删除失败');
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.username && u.username.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">管理员后台</h1>
            <p className="text-gray-500 mt-1">{user?.email}</p>
          </div>
          <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded">
            管理员
          </span>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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

      {/* 用户列表 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-xl font-semibold text-gray-900">用户列表</h2>

          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索邮箱或用户名..."
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />

            <select
              value={showInactive ? 'inactive' : showInactive === false ? 'active' : 'all'}
              onChange={(e) => setShowInactive(e.target.value === 'all' ? null : e.target.value === 'active' ? false : true)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="all">全部用户</option>
              <option value="active">活跃用户</option>
              <option value="inactive">已禁用</option>
            </select>
          </div>
        </div>

        {isLoading ? (
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
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{u.email}</div>
                      {u.id === user?.id && (
                        <span className="text-xs text-gray-400">(当前用户)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{u.username || '-'}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        {u.is_admin && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                            管理员
                          </span>
                        )}
                        {u.is_active ? (
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
                      {new Date(u.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        {u.id !== user?.id && (
                          <>
                            <button
                              onClick={() => handleToggleStatus(u.id, u.is_active)}
                              className={`px-2 py-1 text-xs rounded ${
                                u.is_active
                                  ? 'text-orange-600 hover:bg-orange-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                            >
                              {u.is_active ? '禁用' : '启用'}
                            </button>
                            <button
                              onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                              className="px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded"
                            >
                              {u.is_admin ? '取消管理员' : '设为管理员'}
                            </button>
                            <button
                              onClick={() => handleDelete(u.id, u.email)}
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
    </div>
  );
}
