import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Info, Check, Video, FileText, Shield, Users } from 'lucide-react';

const steps = [
  { id: 1, title: '构建AI大脑', desc: '定身份+喂产品' },
  { id: 2, title: '裂变脚本生成', desc: '批量生成不重样脚本' },
  { id: 3, title: 'AI视频生成', desc: 'Seedance自动出片' },
  { id: 4, title: '数据回流进化', desc: '爆款裂变闭环' },
];

interface SidebarProps {
  currentStep: number;
  setCurrentStep: (step: number) => void;
  completedSteps: number[];
  activeView?: 'workflow' | 'characters';
  onOpenCharacters: () => void;
  onOpenSettings: () => void;
  onOpenPromptTemplates: () => void;
  onOpenAbout: () => void;
}

export default function Sidebar({
  currentStep,
  setCurrentStep,
  completedSteps,
  activeView = 'workflow',
  onOpenCharacters,
  onOpenSettings,
  onOpenPromptTemplates,
  onOpenAbout,
}: SidebarProps) {
  const { user } = useAuth();
  return (
    <div className="w-[240px] bg-white border-r border-gray-200 flex flex-col h-full shadow-sm z-10">
      <div className="h-16 flex items-center px-4 border-b border-gray-100">
        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center mr-3">
          <Video className="text-white w-5 h-5" />
        </div>
        <span className="text-title text-primary">AI带货助手</span>
      </div>

      <div className="flex-1 py-4 overflow-y-auto">
        {steps.map((step) => {
          const isSelected = currentStep === step.id;
          const isCompleted = completedSteps.includes(step.id);

          return (
            <div
              key={step.id}
              onClick={() => setCurrentStep(step.id)}
              className={`relative flex items-center px-4 py-3 cursor-pointer transition-colors ${
                activeView === 'workflow' && isSelected ? 'bg-[#E5F3FF]' : 'hover:bg-gray-50'
              }`}
            >
              {activeView === 'workflow' && isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent"></div>
              )}

              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mr-3 flex-shrink-0 ${
                isCompleted
                  ? 'bg-success text-white'
                  : activeView === 'workflow' && isSelected
                    ? 'bg-accent text-white'
                    : 'bg-gray-200 text-gray-600'
              }`}>
                {isCompleted ? <Check className="w-4 h-4" /> : step.id}
              </div>

              <div className="flex flex-col">
                <span className={`text-body font-semibold ${activeView === 'workflow' && isSelected ? 'text-accent' : 'text-text-main'}`}>
                  {step.title}
                </span>
                <span className="text-[11px] text-text-sub mt-0.5">
                  {step.desc}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-100 p-2">
        <button
          type="button"
          onClick={onOpenCharacters}
          className={`w-full flex items-center px-4 py-2 rounded transition-colors ${
            activeView === 'characters'
              ? 'bg-[#E5F3FF] text-accent'
              : 'text-text-sub hover:bg-gray-50 hover:text-text-main'
          }`}
        >
          <Users className="w-4 h-4 mr-2" />
          <span className="text-body">人物管理</span>
        </button>
        {user?.is_admin && (
          <Link
            to="/admin"
            className="w-full flex items-center px-4 py-2 text-text-sub hover:bg-gray-50 hover:text-text-main rounded transition-colors"
          >
            <Shield className="w-4 h-4 mr-2" />
            <span className="text-body">管理员后台</span>
          </Link>
        )}
        <button
          onClick={onOpenPromptTemplates}
          className="w-full flex items-center px-4 py-2 text-text-sub hover:bg-gray-50 hover:text-text-main rounded transition-colors"
        >
          <FileText className="w-4 h-4 mr-2" />
          <span className="text-body">提示词模版</span>
        </button>
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center px-4 py-2 text-text-sub hover:bg-gray-50 hover:text-text-main rounded transition-colors"
        >
          <Settings className="w-4 h-4 mr-2" />
          <span className="text-body">设置</span>
        </button>
        <button
          type="button"
          onClick={onOpenAbout}
          className="w-full flex items-center px-4 py-2 text-text-sub hover:bg-gray-50 hover:text-text-main rounded transition-colors"
        >
          <Info className="w-4 h-4 mr-2" />
          <span className="text-body">关于</span>
        </button>
      </div>
    </div>
  );
}
