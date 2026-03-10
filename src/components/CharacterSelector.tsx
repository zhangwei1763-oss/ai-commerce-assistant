import React, { useMemo, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { resolveAssetUrl, type CharacterRecord } from '../services/api';
import type { ScriptCharacterSelection } from '../types/character';

interface CharacterSelectorProps {
  isOpen: boolean;
  characters: CharacterRecord[];
  selected: ScriptCharacterSelection | null;
  onClose: () => void;
  onSelectCharacter: (character: CharacterRecord) => void;
  onSelectUpload: (payload: { name: string; previewUrl: string; imageDataUrl: string }) => void;
  onClear: () => void;
  onRefresh: () => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`图片读取失败: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function CharacterSelector({
  isOpen,
  characters,
  selected,
  onClose,
  onSelectCharacter,
  onSelectUpload,
  onClear,
  onRefresh,
}: CharacterSelectorProps) {
  const [keyword, setKeyword] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCharacters = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return characters;
    return characters.filter((item) =>
      item.name.toLowerCase().includes(normalized)
      || item.description.toLowerCase().includes(normalized)
      || item.style_preset.toLowerCase().includes(normalized)
      || item.group_name.toLowerCase().includes(normalized)
    );
  }, [characters, keyword]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">选择人物图</h2>
            <p className="mt-1 text-sm text-gray-500">一个脚本对应一张人物图。也可以直接上传本地人物参考图。</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索人物名称、备注、风格或分组"
              className="w-full rounded-2xl border border-gray-300 pl-9 pr-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void fileToDataUrl(file).then((imageDataUrl) => {
                  const previewUrl = URL.createObjectURL(file);
                  onSelectUpload({
                    name: file.name,
                    previewUrl,
                    imageDataUrl,
                  });
                  onClose();
                });
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center rounded-2xl border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              本地上传
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRefreshing(true);
                setRefreshFeedback(null);
                Promise.resolve(onRefresh())
                  .then((result) => setRefreshFeedback(result))
                  .catch((error) => {
                    setRefreshFeedback({
                      ok: false,
                      message: error instanceof Error ? error.message : '人物库刷新失败',
                    });
                  })
                  .finally(() => setIsRefreshing(false));
              }}
              disabled={isRefreshing}
              className="inline-flex items-center rounded-2xl border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              刷新人物库
            </button>
            <button
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
              className="inline-flex items-center rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              清空选择
            </button>
          </div>
        </div>

        {refreshFeedback?.message && (
          <div className={`mx-6 mt-4 rounded-2xl px-4 py-3 text-sm ${
            refreshFeedback.ok ? 'border border-emerald-100 bg-emerald-50 text-emerald-700' : 'border border-red-100 bg-red-50 text-red-600'
          }`}>
            {refreshFeedback.message}
          </div>
        )}

        {selected && (
          <div className="mx-6 mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            当前选择：
            {selected.source === 'saved' ? ` 人物库 / ${selected.character.name}` : ` 本地上传 / ${selected.name}`}
          </div>
        )}

        <div className="p-6 overflow-y-auto">
          {filteredCharacters.length === 0 ? (
            <div className="min-h-[300px] flex items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
              人物库里还没有可用人物图
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCharacters.map((item) => {
                const isActive = selected?.source === 'saved' && selected.character.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectCharacter(item);
                      onClose();
                    }}
                    className={`overflow-hidden rounded-3xl border text-left transition-all ${
                      isActive ? 'border-accent shadow-[0_0_0_3px_rgba(0,163,255,0.12)]' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="aspect-square bg-gray-100">
                      <img src={resolveAssetUrl(item.image_public_url)} alt={item.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-gray-400" />
                        <div className="font-medium text-gray-900">{item.name}</div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">{item.style_preset || '未设置风格'}</div>
                      <div className="mt-1 text-xs text-blue-600">{item.group_name || '未分组'}</div>
                      {item.description && <div className="mt-2 text-sm text-gray-600 line-clamp-2">{item.description}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
