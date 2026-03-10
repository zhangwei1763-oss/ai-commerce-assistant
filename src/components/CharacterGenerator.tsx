import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import { characterApi, resolveAssetUrl, type CharacterGroupRecord } from '../services/api';
import type { WorkflowApiConfigDraft } from '../lib/providerCatalog';
import type { GeneratedCharacterPreview } from '../types/character';

const STYLE_OPTIONS = ['专业主播', '亲和型', '时尚型', '活力型'] as const;

type DraftImage = GeneratedCharacterPreview & {
  name: string;
  groupName: string;
  description: string;
  saving: boolean;
  saved: boolean;
};

interface CharacterGeneratorProps {
  isOpen: boolean;
  imageConfig: WorkflowApiConfigDraft;
  groups: CharacterGroupRecord[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function CharacterGenerator({
  isOpen,
  imageConfig,
  groups,
  onClose,
  onSaved,
}: CharacterGeneratorProps) {
  const [stylePreset, setStylePreset] = useState<(typeof STYLE_OPTIONS)[number]>('专业主播');
  const [customPrompt, setCustomPrompt] = useState('');
  const [count, setCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<DraftImage[]>([]);
  const [previewImage, setPreviewImage] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');

  const groupOptions = useMemo(
    () => [{ value: '', label: '未分组' }, ...groups.map((group) => ({ value: group.name, label: group.name }))],
    [groups],
  );

  useEffect(() => {
    if (!isOpen) return;
    setStylePreset('专业主播');
    setCustomPrompt('');
    setCount(1);
    setIsGenerating(false);
    setMessage('');
    setDrafts([]);
    setPreviewImage('');
    setPreviewTitle('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!imageConfig.apiKey.trim()) {
      setMessage('请先在设置里完成生图模型配置');
      return;
    }
    setIsGenerating(true);
    setMessage('');
    const response = await characterApi.generate({
      apiKey: imageConfig.apiKey,
      provider: imageConfig.provider,
      apiEndpoint: imageConfig.apiEndpoint,
      modelName: imageConfig.modelName,
      stylePreset,
      customPrompt,
      count,
    });
    setIsGenerating(false);
    if (!response.ok || !response.data?.images?.length) {
      setMessage(response.message || '人物图生成失败');
      return;
    }

    setDrafts(
      response.data.images.map((item, index) => ({
        storageKey: item.storage_key,
        publicUrl: item.public_url,
        revisedPrompt: item.revised_prompt,
        fileSize: item.file_size,
        imageWidth: item.image_width,
        imageHeight: item.image_height,
        name: `${stylePreset}${index + 1}`,
        groupName: '',
        description: customPrompt.trim(),
        saving: false,
        saved: false,
      })),
    );
    setMessage(`已生成 ${response.data.images.length} 张候选图片`);
  };

  const handleSaveOne = async (index: number) => {
    const draft = drafts[index];
    if (!draft || !draft.name.trim() || draft.saved || draft.saving) return;

    setDrafts((prev) => prev.map((item, current) => (
      current === index ? { ...item, saving: true } : item
    )));

    const response = await characterApi.save({
      name: draft.name.trim(),
      groupName: draft.groupName.trim(),
      description: draft.description.trim(),
      stylePreset,
      promptText: customPrompt.trim() || draft.revisedPrompt || '',
      imageStorageKey: draft.storageKey,
      imagePublicUrl: draft.publicUrl,
      fileSize: draft.fileSize ?? undefined,
      imageWidth: draft.imageWidth ?? undefined,
      imageHeight: draft.imageHeight ?? undefined,
    });

    if (!response.ok) {
      setMessage(response.message || '保存人物图失败');
      setDrafts((prev) => prev.map((item, current) => (
        current === index ? { ...item, saving: false } : item
      )));
      return;
    }

    setDrafts((prev) => prev.map((item, current) => (
      current === index ? { ...item, saving: false, saved: true } : item
    )));
    await onSaved();
  };

  const handleSaveAll = async () => {
    for (let index = 0; index < drafts.length; index += 1) {
      // 顺序保存，避免同时多次提交把提示刷乱
      // eslint-disable-next-line no-await-in-loop
      await handleSaveOne(index);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 p-4 flex items-center justify-center">
      <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">生成人物图片</h2>
            <p className="mt-1 text-sm text-gray-500">先生成候选图，再选择分组并保存到人物库。</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0 flex-1 min-h-0">
          <div className="border-r border-gray-100 p-6 space-y-5 overflow-y-auto">
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2">风格预设</div>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStylePreset(option)}
                    className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                      stylePreset === option ? 'bg-accent text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">自定义提示词</label>
              <textarea
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
                placeholder="例如：28 岁女性，美妆带货主播，直播间补光，半身近景，真实皮肤质感"
                className="w-full h-32 rounded-2xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">生成数量</label>
              <select
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent bg-white"
              >
                <option value={1}>1 张</option>
                <option value={2}>2 张</option>
                <option value={3}>3 张</option>
                <option value={4}>4 张</option>
              </select>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
              当前使用：
              <br />
              Provider: {imageConfig.provider || '未配置'}
              <br />
              Model: {imageConfig.modelName || '未填写'}
            </div>

            {message && <div className="text-sm text-gray-600">{message}</div>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleGenerate();
                }}
                disabled={isGenerating}
                className="flex-1 inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {isGenerating ? '生成中...' : '开始生成'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveAll();
                }}
                disabled={!drafts.length}
                className="rounded-2xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                全部保存
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto">
            {drafts.length === 0 ? (
              <div className="h-full min-h-[360px] flex items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
                生成后的人物图会显示在这里
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {drafts.map((draft, index) => (
                  <div key={`${draft.storageKey}-${index}`} className="rounded-3xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                    <div className="aspect-square bg-gray-100">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewImage(resolveAssetUrl(draft.publicUrl));
                          setPreviewTitle(draft.name);
                        }}
                        className="h-full w-full"
                      >
                        <img src={resolveAssetUrl(draft.publicUrl)} alt={draft.name} className="h-full w-full object-cover cursor-zoom-in" />
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDrafts((prev) => prev.map((item, current) => (
                            current === index ? { ...item, name: value } : item
                          )));
                        }}
                        placeholder="人物名称"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                      <select
                        value={draft.groupName}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDrafts((prev) => prev.map((item, current) => (
                            current === index ? { ...item, groupName: value } : item
                          )));
                        }}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent bg-white"
                      >
                        {groupOptions.map((option) => (
                          <option key={option.value || 'ungrouped'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={draft.description}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDrafts((prev) => prev.map((item, current) => (
                            current === index ? { ...item, description: value } : item
                          )));
                        }}
                        placeholder="人物备注"
                        className="w-full h-20 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveOne(index);
                        }}
                        disabled={!draft.name.trim() || draft.saved || draft.saving}
                        className={`w-full rounded-xl px-4 py-2 text-sm font-medium ${
                          draft.saved ? 'bg-green-50 text-green-700' : 'bg-gray-900 text-white'
                        } disabled:opacity-60`}
                      >
                        {draft.saving ? '保存中...' : draft.saved ? '已保存' : '保存到人物库'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ImageLightbox
        isOpen={Boolean(previewImage)}
        imageUrl={previewImage}
        title={previewTitle}
        subtitle="单击空白处或右上角关闭"
        onClose={() => {
          setPreviewImage('');
          setPreviewTitle('');
        }}
      />
    </div>
  );
}
