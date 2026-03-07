import React from 'react';
import { CheckCircle2, Activity } from 'lucide-react';

export default function StatusBar() {
  return (
    <div className="h-8 bg-primary text-white flex items-center justify-between px-4 text-[12px]">
      <div className="flex items-center">
        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-400" />
        <span>就绪</span>
      </div>
      
      <div className="flex items-center">
        <span>当前任务进度: 0%</span>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="flex items-center">
          <Activity className="w-3.5 h-3.5 mr-1.5 text-green-400" />
          <span>豆包 API: 已连接</span>
        </div>
        <div className="flex items-center">
          <Activity className="w-3.5 h-3.5 mr-1.5 text-green-400" />
          <span>Seedance API: 已连接</span>
        </div>
      </div>
    </div>
  );
}
