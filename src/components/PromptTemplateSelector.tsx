import React, { useState, useEffect } from 'react';
import { X, FileText, Check } from 'lucide-react';
import { userApi, type PromptTemplateRecord } from '../services/api';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

interface PromptTemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: PromptTemplate) => void;
  selectedTemplateId?: string;
}

export default function PromptTemplateSelector({
  isOpen,
  onClose,
  onSelect,
  selectedTemplateId,
}: PromptTemplateSelectorProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void loadTemplates();
    }
  }, [isOpen, selectedTemplateId]);

  const loadTemplates = async () => {
    setIsLoading(true);
    const response = await userApi.listPromptTemplates();
    if (response.ok && Array.isArray(response.data)) {
      setTemplates(response.data as PromptTemplateRecord[]);
    } else {
      setTemplates([]);
    }
    setIsLoading(false);
  };

  const handleSelect = (template: PromptTemplate) => {
    onSelect(template);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-[500px] max-h-[70vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">选择提示词模版</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">加载中...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">暂无可用模版</p>
              <p className="text-xs mt-1">请先在侧边栏"提示词模版"中创建模版</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => {
                const isSelected = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelect(template)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <h3 className={`font-medium ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                            {template.name}
                          </h3>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
