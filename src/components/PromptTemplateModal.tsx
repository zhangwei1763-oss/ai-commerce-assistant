import React, { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Save } from 'lucide-react';
import { userApi, type PromptTemplateRecord } from '../services/api';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

interface PromptTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PromptTemplateModal({ isOpen, onClose }: PromptTemplateModalProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      void loadTemplates();
    }
  }, [isOpen]);

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

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = () => {
    setEditingId(null);
    setEditName('');
    setEditContent('');
    setIsEditing(true);
  };

  const handleEdit = (template: PromptTemplate) => {
    setEditingId(template.id);
    setEditName(template.name);
    setEditContent(template.content);
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    const response = await userApi.deletePromptTemplate(id);
    if (response.ok) {
      setTemplates((prev) => prev.filter((item) => item.id !== id));
      showMessage('success', '模板已删除');
    } else {
      showMessage('error', response.message || '删除失败');
    }
  };

  const handleSave = async () => {
    if (!editName.trim() || !editContent.trim()) return;

    setIsSaving(true);
    if (editingId) {
      const response = await userApi.updatePromptTemplate(editingId, {
        name: editName.trim(),
        content: editContent.trim(),
      });
      if (!response.ok || !response.data) {
        setIsSaving(false);
        showMessage('error', response.message || '更新失败');
        return;
      }
      setTemplates((prev) => prev.map((item) => (
        item.id === editingId ? response.data as PromptTemplateRecord : item
      )));
      showMessage('success', '模板已更新');
    } else {
      const response = await userApi.createPromptTemplate({
        name: editName.trim(),
        content: editContent.trim(),
      });
      if (!response.ok || !response.data) {
        setIsSaving(false);
        showMessage('error', response.message || '创建失败');
        return;
      }
      setTemplates((prev) => [response.data as PromptTemplateRecord, ...prev]);
      showMessage('success', '模板已创建');
    }
    setIsSaving(false);
    setIsEditing(false);
    setEditingId(null);
    setEditName('');
    setEditContent('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingId(null);
    setEditName('');
    setEditContent('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">提示词模版管理</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {message && (
            <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {message.text}
            </div>
          )}
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCreate}
                className="w-full mb-4 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                新建模版
              </button>

              {isLoading ? (
                <div className="text-center py-12 text-gray-400">
                  <p>加载中...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p>暂无模版，点击上方按钮创建第一个模版</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-800 mb-1">
                            {template.name}
                          </h3>
                          <p className="text-sm text-gray-500 line-clamp-2">
                            {template.content}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(template)}
                            className="p-1.5 text-gray-400 hover:text-accent hover:bg-gray-100 rounded transition-colors"
                            title="编辑"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleDelete(template.id); }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-800">
                {editingId ? '编辑模版' : '新建模版'}
              </h3>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  模版名称
                </label>
                <input
                  type="text"
                  placeholder="例如：产品介绍模版"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  提示词内容
                </label>
                <textarea
                  placeholder="输入提示词内容，可以使用 {{变量}} 来标记可替换的部分..."
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSave(); }}
                  disabled={!editName.trim() || !editContent.trim() || isSaving}
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-[#008CCF] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? '保存中...' : '确定'}
                </button>
              </div>
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-[#008CCF] transition-colors text-sm font-medium shadow-sm"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
