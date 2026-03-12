import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function WebClientNotice() {
  const { user, logout } = useAuth();
  const userLabel = user?.display_name || user?.license_key_name || user?.license_key_masked || user?.email || '当前账号';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#eff6ff_0%,#dbeafe_35%,#f8fafc_100%)] px-4">
      <div className="max-w-2xl w-full bg-white/95 backdrop-blur rounded-3xl shadow-2xl border border-white p-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white text-xl font-bold shadow-lg shadow-blue-200 mb-5">
          AI
        </div>
        <h1 className="text-3xl font-bold text-gray-900">网页端仅保留卡密后台</h1>
        <p className="text-gray-600 mt-3 leading-7">
          当前登录账号为 <span className="font-medium text-gray-900">{userLabel}</span>。
          普通用户不再通过网页进入业务系统，请改用 Windows 桌面客户端登录。
        </p>

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800 leading-7">
          <p className="font-medium text-blue-900">桌面客户端使用方式</p>
          <p className="mt-1">1. 打开安装包并输入管理员发放的卡密。</p>
          <p>2. 登录后先在“设置”里填写你自己的 AI API Key。</p>
          <p>3. 卡密只负责软件授权，AI 调用额度和费用走你自己的服务商账号。</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={logout}
            className="px-5 py-3 rounded-xl bg-gray-900 text-white hover:bg-black transition"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
