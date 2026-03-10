import React from 'react';
import { RefreshCw, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const stepTitles = [
  '构建AI大脑',
  '裂变脚本生成',
  'AI视频生成',
  '数据回流进化'
];

export default function TopBar({
  currentStep,
  title,
}: {
  currentStep: number;
  title?: string;
}) {
  const { user, logout } = useAuth();

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
      <div className="flex items-center text-text-sub text-body">
        <span>工作台</span>
        <ChevronRight className="w-4 h-4 mx-2" />
        <span className="text-text-main font-semibold">{title || stepTitles[currentStep - 1]}</span>
      </div>

      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-500 max-w-[220px] truncate">{user?.email}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center px-3 py-1.5 text-text-sub hover:bg-gray-100 rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          <span>刷新</span>
        </button>
        <button
          type="button"
          onClick={logout}
          className="flex items-center px-3 py-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          <LogOut className="w-4 h-4 mr-1.5" />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  );
}
