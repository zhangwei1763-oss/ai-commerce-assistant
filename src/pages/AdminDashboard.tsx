import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  adminApi,
  type AdminUserStats,
  type LicenseKeyRecord,
} from '../services/api';

type StatusFilter = 'all' | 'active' | 'disabled';

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (selection) {
    selection.removeAllRanges();
    if (originalRange) {
      selection.addRange(originalRange);
    }
  }

  return copied;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const adminLabel = user?.display_name || user?.license_key_name || user?.license_key_masked || user?.email || '管理员';
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [licenseKeys, setLicenseKeys] = useState<LicenseKeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [generateQuantity, setGenerateQuantity] = useState(10);
  const [licenseNamePrefix, setLicenseNamePrefix] = useState('');
  const [licenseDurationDays, setLicenseDurationDays] = useState('30');
  const [licenseNote, setLicenseNote] = useState('');
  const [generateAdminKeys, setGenerateAdminKeys] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 3000);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, keysRes] = await Promise.all([
        adminApi.getStats(),
        adminApi.listLicenseKeys(),
      ]);

      if (!statsRes.ok) {
        throw new Error(statsRes.message || '统计数据加载失败');
      }

      if (!keysRes.ok) {
        throw new Error(keysRes.message || '卡密列表加载失败');
      }

      if (statsRes.ok && statsRes.data) {
        setStats(statsRes.data as AdminUserStats);
      }

      if (keysRes.ok && Array.isArray(keysRes.data)) {
        setLicenseKeys(keysRes.data as LicenseKeyRecord[]);
      } else {
        setLicenseKeys([]);
      }
      return true;
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '数据加载失败');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const ok = await loadData();
      if (ok) {
        showMessage('success', '数据已刷新');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGenerateLicenseKeys = async () => {
    if (generateQuantity < 1) {
      showMessage('error', '生成数量至少为 1');
      return;
    }

    const duration = licenseDurationDays.trim() ? Number(licenseDurationDays.trim()) : undefined;
    if (typeof duration === 'number' && (!Number.isFinite(duration) || duration <= 0)) {
      showMessage('error', '有效天数必须是正整数');
      return;
    }

    const response = await adminApi.generateLicenseKeys({
      quantity: generateQuantity,
      name_prefix: licenseNamePrefix.trim() || undefined,
      duration_days: duration,
      note: licenseNote.trim() || undefined,
      is_admin: generateAdminKeys,
    });

    if (!response.ok || !response.data) {
      showMessage('error', response.message || '卡密生成失败');
      return;
    }

    setLicenseNamePrefix('');
    setLicenseNote('');
    setGenerateAdminKeys(false);
    showMessage('success', `已生成 ${(response.data.items || []).length} 张卡密`);
    void loadData();
  };

  const handleToggleLicenseKeyStatus = async (item: LicenseKeyRecord) => {
    const nextStatus = item.status === 'active' ? 'disabled' : 'active';
    if (!confirm(`确定要将卡密 ${item.card_key} ${nextStatus === 'active' ? '启用' : '停用'}吗？`)) return;

    const response = await adminApi.updateLicenseKey(item.id, { status: nextStatus });
    if (response.ok) {
      showMessage('success', `卡密已${nextStatus === 'active' ? '启用' : '停用'}`);
      void loadData();
      return;
    }

    showMessage('error', response.message || '卡密更新失败');
  };

  const handleDeleteLicenseKey = async (item: LicenseKeyRecord) => {
    if (!confirm(`确定要删除卡密 ${item.card_key} 吗？删除后不可恢复。`)) return;

    const response = await adminApi.deleteLicenseKey(item.id);
    if (response.ok) {
      showMessage('success', '卡密已删除');
      void loadData();
      return;
    }

    showMessage('error', response.message || '删除失败');
  };

  const handleCopyLicenseKey = async (cardKey: string) => {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(cardKey);
      } else if (!fallbackCopyText(cardKey)) {
        throw new Error('copy_failed');
      }
      showMessage('success', `已复制卡密 ${cardKey}`);
    } catch {
      showMessage('error', '复制失败，请手动复制');
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredLicenseKeys = licenseKeys.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (!normalizedSearch) return true;

    return [
      item.card_key,
      item.name,
      item.note,
      item.bound_user_display_name,
      item.masked_card_key,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });

  return (
    <div className="h-screen overflow-y-auto bg-app-bg">
      <div className="max-w-7xl mx-auto space-y-6 px-4 py-6 md:px-6 md:py-8">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">卡密管理后台</h1>
            <p className="text-gray-500 mt-1">{adminLabel}</p>
            <p className="text-sm text-gray-400 mt-2">网页端只保留卡密发放、停用和回收，不再进入业务工作台。</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded">管理员</span>
            <button
              type="button"
              onClick={() => { void handleRefresh(); }}
              disabled={isRefreshing}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRefreshing ? '刷新中...' : '刷新数据'}
            </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-sm text-gray-500">总卡密数</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total_license_keys}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-sm text-gray-500">可用卡密</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.active_license_keys}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-sm text-gray-500">已激活卡密</div>
            <div className="text-2xl font-bold text-indigo-600 mt-1">{stats.used_license_keys}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-sm text-gray-500">已停用</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">{stats.disabled_license_keys}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="text-sm text-gray-500">已过期</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{stats.expired_license_keys}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900">生成新卡密</h2>
          <p className="text-sm text-gray-500 mt-1">生成后可直接复制给用户，用户在桌面客户端登录并自行填写 AI API Key。</p>

          <div className="space-y-4 mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">生成数量</label>
              <input
                type="number"
                min={1}
                max={200}
                value={generateQuantity}
                onChange={(event) => setGenerateQuantity(Number(event.target.value) || 1)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称前缀</label>
              <input
                type="text"
                value={licenseNamePrefix}
                onChange={(event) => setLicenseNamePrefix(event.target.value)}
                placeholder="例如：3月代理批次"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">有效天数</label>
              <input
                type="number"
                min={1}
                value={licenseDurationDays}
                onChange={(event) => setLicenseDurationDays(event.target.value)}
                placeholder="留空表示永久有效"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                rows={4}
                value={licenseNote}
                onChange={(event) => setLicenseNote(event.target.value)}
                placeholder="例如：给渠道商 A 的 30 天体验卡"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              />
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3">
              <input
                type="checkbox"
                checked={generateAdminKeys}
                onChange={(event) => setGenerateAdminKeys(event.target.checked)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-gray-800">生成管理员卡密</div>
                <div className="text-xs text-gray-500 mt-1">管理员卡密登录网页后只会进入当前卡密后台。</div>
              </div>
            </label>

            <button
              type="button"
              onClick={() => { void handleGenerateLicenseKeys(); }}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              生成卡密
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">卡密列表</h2>
              <p className="text-sm text-gray-500 mt-1">可查看卡密状态、绑定用户和最近使用时间。</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索卡密、名称、备注、绑定用户"
                className="w-full sm:w-72 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="all">全部状态</option>
                <option value="active">仅可用</option>
                <option value="disabled">仅停用</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-gray-500">加载中...</div>
          ) : filteredLicenseKeys.length === 0 ? (
            <div className="py-12 text-center text-gray-500">当前没有符合条件的卡密</div>
          ) : (
            <div className="space-y-4">
              {filteredLicenseKeys.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-semibold text-gray-900 break-all">{item.card_key}</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          item.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {item.status === 'active' ? '可用' : '已停用'}
                        </span>
                        {item.is_admin && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            管理员
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                        <div>名称：{item.name || '-'}</div>
                        <div>绑定用户：{item.bound_user_display_name || '-'}</div>
                        <div>创建时间：{formatDateTime(item.created_at)}</div>
                        <div>激活时间：{formatDateTime(item.activated_at)}</div>
                        <div>最近使用：{formatDateTime(item.last_used_at)}</div>
                        <div>到期时间：{formatDateTime(item.expires_at)}</div>
                          <div>登录次数：{item.activation_count}</div>
                        <div>有效天数：{item.duration_days ?? '永久'}</div>
                      </div>

                      {item.note && (
                        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 leading-6">
                          {item.note}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 xl:ml-6">
                      <button
                        type="button"
                        onClick={() => { void handleCopyLicenseKey(item.card_key); }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                      >
                        复制卡密
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleToggleLicenseKeyStatus(item); }}
                        className={`px-4 py-2 rounded-lg transition ${
                          item.status === 'active'
                            ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {item.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleDeleteLicenseKey(item); }}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition"
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
      </div>
    </div>
  );
}
