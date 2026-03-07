import React from 'react';
import { Download, RefreshCw, HelpCircle, ChevronRight } from 'lucide-react';

const stepTitles = [
  '构建AI大脑',
  '裂变脚本生成',
  'AI视频生成',
  '数据回流进化'
];

export default function TopBar({ currentStep }: { currentStep: number }) {
  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
      <div className="flex items-center text-text-sub text-body">
        <span>工作台</span>
        <ChevronRight className="w-4 h-4 mx-2" />
        <span className="text-text-main font-semibold">{stepTitles[currentStep - 1]}</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <button className="flex items-center px-3 py-1.5 text-text-sub hover:bg-gray-100 rounded transition-colors">
          <Download className="w-4 h-4 mr-1.5" />
          <span>导出</span>
        </button>
        <button className="flex items-center px-3 py-1.5 text-text-sub hover:bg-gray-100 rounded transition-colors">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          <span>刷新</span>
        </button>
        <button className="flex items-center px-3 py-1.5 text-text-sub hover:bg-gray-100 rounded transition-colors">
          <HelpCircle className="w-4 h-4 mr-1.5" />
          <span>帮助</span>
        </button>
      </div>
    </div>
  );
}
