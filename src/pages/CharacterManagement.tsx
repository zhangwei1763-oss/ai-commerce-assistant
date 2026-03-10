import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderPlus, Loader2, PencilLine, Plus, Trash2, Upload, X } from 'lucide-react';
import CharacterGenerator from '../components/CharacterGenerator';
import ImageLightbox from '../components/ImageLightbox';
import {
  characterApi,
  resolveAssetUrl,
  type CharacterGroupRecord,
  type CharacterRecord,
} from '../services/api';
import type { WorkflowApiConfigDraft } from '../lib/providerCatalog';

interface CharacterManagementProps {
  imageConfig: WorkflowApiConfigDraft;
  onOpenSettings: () => void;
}

type EditingState = {
  id: string;
  name: string;
  groupName: string;
  description: string;
} | null;

type UploadDraft = {
  file: File;
  name: string;
  groupName: string;
  description: string;
};

export default function CharacterManagement({
  imageConfig,
  onOpenSettings,
}: CharacterManagementProps) {
  const [items, setItems] = useState<CharacterRecord[]>([]);
  const [groups, setGroups] = useState<CharacterGroupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<EditingState>(null);
  const [activeGroup, setActiveGroup] = useState('全部');
  const [newGroupName, setNewGroupName] = useState('');
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null);
  const [previewItem, setPreviewItem] = useState<CharacterRecord | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const groupOptions = useMemo(
    () => [{ id: 'all', name: '全部', usage_count: items.length, created_at: '', updated_at: '' }, ...groups],
    [groups, items.length],
  );

  const filteredItems = useMemo(() => {
    if (activeGroup === '全部') return items;
    return items.filter((item) => (item.group_name || '未分组') === activeGroup);
  }, [activeGroup, items]);

  const groupedItems = useMemo(() => {
    const groupsMap = new Map<string, CharacterRecord[]>();
    filteredItems.forEach((item) => {
      const groupName = item.group_name || '未分组';
      const bucket = groupsMap.get(groupName) || [];
      bucket.push(item);
      groupsMap.set(groupName, bucket);
    });
    return Array.from(groupsMap.entries());
  }, [filteredItems]);

  const refreshAll = async () => {
    setIsLoading(true);
    const [charactersResponse, groupsResponse] = await Promise.all([
      characterApi.list({ limit: 100, offset: 0 }),
      characterApi.listGroups(),
    ]);

    if (!charactersResponse.ok || !charactersResponse.data) {
      setMessage(charactersResponse.message || '加载人物库失败');
      setItems([]);
    } else {
      setItems(charactersResponse.data.items);
    }

    if (!groupsResponse.ok || !groupsResponse.data) {
      setMessage((prev) => prev || groupsResponse.message || '加载分组失败');
      setGroups([]);
    } else {
      setGroups(groupsResponse.data);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (activeGroup === '全部') return;
    const exists = groups.some((group) => group.name === activeGroup);
    if (!exists && activeGroup !== '未分组') {
      setActiveGroup('全部');
    }
  }, [activeGroup, groups]);

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) {
      setMessage('请输入分组名称');
      return;
    }
    const response = await characterApi.createGroup({ name });
    if (!response.ok) {
      setMessage(response.message || '新增分组失败');
      return;
    }
    setNewGroupName('');
    setMessage('');
    await refreshAll();
    setActiveGroup(response.data?.name || '全部');
  };

  const handleDeleteGroup = async (group: CharacterGroupRecord) => {
    const confirmed = window.confirm(`确认删除分组“${group.name}”吗？该分组下的人物图会自动转为未分组。`);
    if (!confirmed) return;
    const response = await characterApi.deleteGroup(group.id);
    if (!response.ok) {
      setMessage(response.message || '删除分组失败');
      return;
    }
    if (activeGroup === group.name) {
      setActiveGroup('全部');
    }
    await refreshAll();
  };

  const handleUploadStart = (file: File) => {
    setUploadDraft({
      file,
      name: file.name.replace(/\.[^.]+$/, '') || '本地上传人物',
      groupName: '',
      description: '',
    });
    setMessage('');
  };

  const handleUploadSubmit = async () => {
    if (!uploadDraft) return;
    if (!uploadDraft.name.trim()) {
      setMessage('请填写人物名称');
      return;
    }
    const response = await characterApi.upload({
      file: uploadDraft.file,
      name: uploadDraft.name.trim(),
      groupName: uploadDraft.groupName.trim(),
      description: uploadDraft.description.trim(),
    });
    if (!response.ok) {
      setMessage(response.message || '上传人物图失败');
      return;
    }
    setUploadDraft(null);
    setMessage('');
    await refreshAll();
  };

  const handleDelete = async (characterId: string) => {
    const confirmed = window.confirm('删除后不会影响已生成的视频，但人物图会从人物库隐藏。确认删除吗？');
    if (!confirmed) return;
    const response = await characterApi.delete(characterId);
    if (!response.ok) {
      setMessage(response.message || '删除失败');
      return;
    }
    await refreshAll();
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const response = await characterApi.update(editing.id, {
      name: editing.name,
      groupName: editing.groupName,
      description: editing.description,
    });
    if (!response.ok) {
      setMessage(response.message || '更新失败');
      return;
    }
    setEditing(null);
    setMessage('');
    await refreshAll();
  };

  return (
    <>
      <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
          <div>
            <h2 className="text-title">人物管理</h2>
            <p className="mt-2 text-sm text-gray-500">集中生成、分组管理、维护带货主播人物图，并在第 3 步按脚本调用。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleUploadStart(file);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="inline-flex items-center rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Upload className="mr-2 h-4 w-4" />
              上传本地人物图
            </button>
            <button
              type="button"
              onClick={() => setIsGeneratorOpen(true)}
              className="inline-flex items-center rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              生成人物图
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 mb-6">
          当前生图配置：
          Provider {imageConfig.provider || '未配置'} / Model {imageConfig.modelName || '未填写'}
          {!imageConfig.apiKey.trim() && (
            <>
              {' '}，还没有可用 API Key，
              <button type="button" onClick={onOpenSettings} className="underline underline-offset-4">
                去设置里配置
              </button>
            </>
          )}
        </div>

        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {groupOptions.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroup(group.name)}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    activeGroup === group.name ? 'bg-accent text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {group.name}
                  {group.name !== '全部' && <span className="ml-2 text-xs opacity-80">{group.usage_count}</span>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="新增分组名称"
                className="min-w-[220px] rounded-2xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => { void handleCreateGroup(); }}
                className="inline-flex items-center rounded-2xl bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                新增分组
              </button>
            </div>
          </div>

          {groups.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {groups.map((group) => (
                <div key={group.id} className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
                  <span>{group.name}</span>
                  <button
                    type="button"
                    onClick={() => { void handleDeleteGroup(group); }}
                    className="ml-2 text-gray-400 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {message && <div className="mb-4 text-sm text-red-500">{message}</div>}

        {isLoading ? (
          <div className="min-h-[420px] flex items-center justify-center rounded-3xl border border-gray-200 bg-white">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="min-h-[420px] flex items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white text-sm text-gray-400">
            人物库为空，先生成或上传第一张人物图
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="min-h-[320px] flex items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white text-sm text-gray-400">
            当前分组下还没有人物图
          </div>
        ) : (
          <div className="space-y-8">
            {groupedItems.map(([groupName, groupItems]) => (
              <section key={groupName}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="inline-flex rounded-2xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                    {groupName}
                  </div>
                  <div className="text-sm text-gray-400">{groupItems.length} 张</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {groupItems.map((item) => {
                    const isEditing = editing?.id === item.id;
                    return (
                      <div key={item.id} className="rounded-3xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                        <div className="aspect-square bg-gray-100">
                          <button type="button" onClick={() => setPreviewItem(item)} className="h-full w-full">
                            <img src={resolveAssetUrl(item.image_public_url)} alt={item.name} className="h-full w-full object-cover cursor-zoom-in" />
                          </button>
                        </div>
                        <div className="p-4 space-y-3">
                          {isEditing ? (
                            <>
                              <input
                                type="text"
                                value={editing.name}
                                onChange={(event) => setEditing((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent"
                              />
                              <select
                                value={editing.groupName}
                                onChange={(event) => setEditing((prev) => (prev ? { ...prev, groupName: event.target.value } : prev))}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent bg-white"
                              >
                                <option value="">未分组</option>
                                {groups.map((group) => (
                                  <option key={group.id} value={group.name}>
                                    {group.name}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                value={editing.description}
                                onChange={(event) => setEditing((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                                className="w-full h-20 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent"
                              />
                              <div className="flex gap-2">
                                <button type="button" onClick={() => { void handleUpdate(); }} className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm text-white">
                                  保存
                                </button>
                                <button type="button" onClick={() => setEditing(null)} className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                                  取消
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-base font-semibold text-gray-900">{item.name}</h3>
                                  <p className="mt-1 text-xs text-gray-500">{item.style_preset || '未设置风格'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditing({ id: item.id, name: item.name, groupName: item.group_name || '', description: item.description || '' })}
                                    className="rounded-xl bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
                                  >
                                    <PencilLine className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { void handleDelete(item.id); }}
                                    className="rounded-xl bg-red-50 p-2 text-red-600 hover:bg-red-100"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                                {item.group_name || '未分组'}
                              </div>
                              <p className="min-h-[40px] text-sm text-gray-600">{item.description || '暂无备注'}</p>
                              <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                                创建时间 {new Date(item.created_at).toLocaleString()}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <CharacterGenerator
        isOpen={isGeneratorOpen}
        imageConfig={imageConfig}
        groups={groups}
        onClose={() => setIsGeneratorOpen(false)}
        onSaved={refreshAll}
      />

      {uploadDraft && (
        <div className="fixed inset-0 z-[60] bg-black/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">上传本地人物图</h3>
                <p className="mt-1 text-sm text-gray-500">支持 JPG / PNG / WEBP，最大 10MB。</p>
              </div>
              <button type="button" onClick={() => setUploadDraft(null)} className="text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                已选择文件：{uploadDraft.file.name}
              </div>
              <input
                type="text"
                value={uploadDraft.name}
                onChange={(event) => setUploadDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                placeholder="人物名称"
                className="w-full rounded-2xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
              <select
                value={uploadDraft.groupName}
                onChange={(event) => setUploadDraft((prev) => (prev ? { ...prev, groupName: event.target.value } : prev))}
                className="w-full rounded-2xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-accent bg-white"
              >
                <option value="">未分组</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
              <textarea
                value={uploadDraft.description}
                onChange={(event) => setUploadDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                placeholder="人物备注"
                className="w-full h-24 rounded-2xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 flex justify-end gap-3">
              <button type="button" onClick={() => setUploadDraft(null)} className="rounded-2xl bg-white px-4 py-2 text-sm text-gray-700 border border-gray-300">
                取消
              </button>
              <button type="button" onClick={() => { void handleUploadSubmit(); }} className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white">
                确认上传
              </button>
            </div>
          </div>
        </div>
      )}

      <ImageLightbox
        isOpen={Boolean(previewItem)}
        imageUrl={previewItem ? resolveAssetUrl(previewItem.image_public_url) : ''}
        title={previewItem?.name}
        subtitle={previewItem ? `${previewItem.group_name || '未分组'} · 单击空白处关闭` : ''}
        onClose={() => setPreviewItem(null)}
      />
    </>
  );
}
