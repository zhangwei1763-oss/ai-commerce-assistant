import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Film, Image as ImageIcon, User, Loader2, X, AlertCircle } from 'lucide-react';
import type { GeneratedScript, Step1FormData, Step3VideoTask } from '../../App';
import { buildApiUrl } from '../../services/api';

type Step3Props = {
  onNext: () => void;
  generatedScripts: GeneratedScript[];
  videoApiKey?: string;
  step1Data: Step1FormData;
  videoTasks: Step3VideoTask[];
  setVideoTasks: React.Dispatch<React.SetStateAction<Step3VideoTask[]>>;
};

type ScriptItem = {
  id: number;
  title: string;
  prompt: string;
  selected: boolean;
  durationSeconds?: number;
};

type UploadImage = {
  file: File;
  preview: string;
  base64: string;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`图片读取失败: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function normalizePrompt(script: ScriptItem) {
  const visualMatch = script.prompt.match(/【画面提示词】\s*([\s\S]*?)(?=【|$)/);
  return visualMatch ? visualMatch[1].trim() : script.prompt;
}

function resolveDurationSeconds(script: ScriptItem) {
  if (Number.isFinite(script.durationSeconds)) {
    return Math.min(60, Math.max(3, Number(script.durationSeconds)));
  }
  const matches = Array.from(script.prompt.matchAll(/(\d+)\s*秒/g));
  if (!matches.length) return 15;
  const last = matches[matches.length - 1];
  const value = Number(last[1]);
  if (!Number.isFinite(value)) return 15;
  return Math.min(60, Math.max(3, value));
}

export default function Step3({
  onNext,
  generatedScripts,
  videoApiKey,
  step1Data,
  videoTasks,
  setVideoTasks,
}: Step3Props) {
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [renderStyle, setRenderStyle] = useState('实景风 (推荐带货)');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [productImages, setProductImages] = useState<UploadImage[]>([]);
  const [personImages, setPersonImages] = useState<UploadImage[]>([]);
  const productInputRef = useRef<HTMLInputElement>(null);
  const personInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nextScripts = generatedScripts.map((s) => {
      const parts: string[] = [];
      if (s.storyboard.length) {
        parts.push('【三分镜结构】\n' + s.storyboard.map((item) => `■ ${item}`).join('\n'));
      }
      if (s.narration) {
        parts.push('【口播文案】\n' + s.narration);
      }
      if (s.visualPrompt) {
        parts.push('【画面提示词】\n' + s.visualPrompt);
      }
      return {
        id: s.id,
        title: s.title || `脚本 ${s.id}`,
        prompt: parts.join('\n\n') || s.narration || '（无内容）',
        selected: true,
        durationSeconds: s.durationSeconds,
      };
    });
    setScripts(nextScripts);
    setVideoTasks((prev) => {
      const validIds = new Set(nextScripts.map((item) => item.id));
      return prev.filter((task) => validIds.has(task.scriptId));
    });
    setGenerateError('');
  }, [generatedScripts, setVideoTasks]);

  useEffect(() => {
    let cancelled = false;

    const loadStep1Images = async () => {
      if (!step1Data.referenceImages.length) return;
      const items: UploadImage[] = [];
      for (const file of step1Data.referenceImages) {
        const base64 = await fileToDataUrl(file);
        items.push({
          file,
          base64,
          preview: URL.createObjectURL(file),
        });
      }
      if (!cancelled) {
        setProductImages((prev) => (prev.length ? prev : items));
      } else {
        items.forEach((item) => URL.revokeObjectURL(item.preview));
      }
    };

    void loadStep1Images();
    return () => {
      cancelled = true;
    };
  }, [step1Data.referenceImages]);

  useEffect(() => {
    return () => {
      productImages.forEach((img) => URL.revokeObjectURL(img.preview));
      personImages.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, [productImages, personImages]);

  const selectedScripts = useMemo(() => scripts.filter((s) => s.selected), [scripts]);
  const selectedCount = selectedScripts.length;
  const finishedCount = videoTasks.filter((t) => t.status === 'completed' || t.status === 'failed').length;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'product' | 'person') => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const item: UploadImage = {
          file,
          base64: String(reader.result || ''),
          preview: URL.createObjectURL(file),
        };
        if (type === 'product') {
          setProductImages((prev) => [...prev, item]);
        } else {
          setPersonImages((prev) => [...prev, item]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (type: 'product' | 'person', index: number) => {
    if (type === 'product') {
      setProductImages((prev) => {
        const item = prev[index];
        if (item) URL.revokeObjectURL(item.preview);
        return prev.filter((_, i) => i !== index);
      });
    } else {
      setPersonImages((prev) => {
        const item = prev[index];
        if (item) URL.revokeObjectURL(item.preview);
        return prev.filter((_, i) => i !== index);
      });
    }
  };

  const updatePrompt = (id: number, nextPrompt: string) => {
    setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, prompt: nextPrompt } : s)));
  };

  const toggleSelect = (id: number) => {
    setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)));
  };

  const handleStartGenerate = async () => {
    if (isGenerating) return;
    if (!selectedScripts.length) {
      setGenerateError('请至少勾选一个脚本');
      return;
    }
    if (!videoApiKey?.trim()) {
      setGenerateError('请先在设置中配置并测试视频 API Key');
      return;
    }

    const allImages = [...productImages, ...personImages];
    if (!allImages.length) {
      setGenerateError('请至少上传 1 张参考图片（产品图或人物图）');
      return;
    }

    setGenerateError('');
    setIsGenerating(true);
    setVideoTasks(
      selectedScripts.map((script) => ({
        scriptId: script.id,
        scriptTitle: script.title,
        taskId: '',
        status: 'pending',
        progress: 0,
      })),
    );

    try {
      const submittedTasks: Step3VideoTask[] = [];
      for (let i = 0; i < selectedScripts.length; i++) {
        const script = selectedScripts[i];
        const pickedImage = allImages[i % allImages.length];
        const prompt = normalizePrompt(script);
        const durationSeconds = resolveDurationSeconds(script);
        const response = await fetch(buildApiUrl('/api/generate-video'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: videoApiKey,
            prompt,
            style: renderStyle,
            imageUrl: pickedImage.base64,
            durationSeconds,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) {
          throw new Error(data?.message || `脚本 ${script.title} 视频任务提交失败`);
        }

        submittedTasks.push({
          scriptId: script.id,
          scriptTitle: script.title,
          taskId: String(data.taskId || ''),
          status: 'processing',
          progress: 10,
        });
        setVideoTasks((prev) =>
          prev.map((task) =>
            task.scriptId === script.id ? { ...task, status: 'processing', progress: 10, taskId: String(data.taskId || '') } : task,
          ),
        );
      }

      const startedAt = Date.now();
      const timeoutMs = 10 * 60 * 1000;
      let remaining = new Set(submittedTasks.map((task) => task.scriptId));

      while (remaining.size > 0) {
        if (Date.now() - startedAt > timeoutMs) {
          setVideoTasks((prev) =>
            prev.map((task) =>
              remaining.has(task.scriptId)
                ? { ...task, status: 'failed', error: '生成超时，请稍后重试', progress: 0 }
                : task,
            ),
          );
          setGenerateError('视频生成超时（10分钟），请稍后重试');
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
        const currentTasks = submittedTasks.filter((task) => remaining.has(task.scriptId));

        for (const task of currentTasks) {
          const statusRes = await fetch(buildApiUrl('/api/video-status'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: videoApiKey, taskId: task.taskId }),
          });
          const statusData = await statusRes.json().catch(() => ({}));

          if (!statusRes.ok || !statusData?.ok) {
            setVideoTasks((prev) =>
              prev.map((item) =>
                item.scriptId === task.scriptId
                  ? {
                      ...item,
                      status: 'processing',
                      progress: Math.min(90, item.progress + 8),
                    }
                  : item,
              ),
            );
            continue;
          }

          const status = String(statusData.status || '').toLowerCase();
          if (status === 'completed') {
            remaining.delete(task.scriptId);
            setVideoTasks((prev) =>
              prev.map((item) =>
                item.scriptId === task.scriptId
                  ? {
                      ...item,
                      status: 'completed',
                      progress: 100,
                      videoUrl: statusData.videoUrl || '',
                      error: '',
                    }
                  : item,
              ),
            );
          } else if (status === 'failed') {
            remaining.delete(task.scriptId);
            setVideoTasks((prev) =>
              prev.map((item) =>
                item.scriptId === task.scriptId
                  ? {
                      ...item,
                      status: 'failed',
                      progress: 0,
                      error: statusData.error || '生成失败',
                    }
                  : item,
              ),
            );
          } else {
            setVideoTasks((prev) =>
              prev.map((item) =>
                item.scriptId === task.scriptId
                  ? {
                      ...item,
                      status: 'processing',
                      progress: Math.max(item.progress, Number(statusData.progress || 35)),
                    }
                  : item,
              ),
            );
          }
        }
      }
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : '视频生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const taskByScriptId = useMemo(() => {
    const map = new Map<number, Step3VideoTask>();
    videoTasks.forEach((task) => {
      map.set(task.scriptId, task);
    });
    return map;
  }, [videoTasks]);

  return (
    <div className="max-w-6xl mx-auto min-h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-4">
      <h2 className="text-title mb-4 flex-shrink-0">AI视频生成</h2>

      <div className="grid grid-cols-12 gap-6 mb-6 flex-shrink-0">
        <div className="col-span-5 bg-card rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col max-h-[420px]">
          <h3 className="text-subtitle mb-3">脚本选择 (双击编辑提示词)</h3>
          {scripts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 py-6">暂无脚本，请先在第2步生成文案</div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto pr-2">
              {scripts.map((script) => (
                <div key={script.id} className="border border-gray-100 rounded hover:border-gray-300 transition-colors">
                  {editingId === script.id ? (
                    <div className="p-3 bg-blue-50/50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-gray-700">{script.title}</span>
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs bg-accent text-white px-2 py-1 rounded">
                          完成
                        </button>
                      </div>
                      <textarea
                        className="w-full text-xs p-2 border border-gray-300 rounded outline-none focus:border-accent h-24 resize-none"
                        value={script.prompt}
                        onChange={(e) => updatePrompt(script.id, e.target.value)}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="flex items-start p-2 cursor-pointer" onDoubleClick={() => setEditingId(script.id)}>
                      <input
                        type="checkbox"
                        checked={script.selected}
                        onChange={() => toggleSelect(script.id)}
                        className="rounded text-accent focus:ring-accent mr-3 mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{script.title}</div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">{script.prompt}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-7 bg-card rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col max-h-[420px] overflow-y-auto pr-2">
          <h3 className="text-subtitle mb-3">视频渲染配置</h3>
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">画面风格</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-accent outline-none bg-white"
                value={renderStyle}
                onChange={(e) => setRenderStyle(e.target.value)}
              >
                <option>实景风 (推荐带货)</option>
                <option>电影质感</option>
                <option>动漫风</option>
                <option>简约风</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">生成数量</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700">
                已选中 <span className="font-bold text-accent">{selectedCount}</span> 个脚本
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-2">参考图片</label>
            <input ref={productInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e, 'product')} />
            <input ref={personInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e, 'person')} />
            <div className="flex space-x-3 mb-3">
              <button type="button" onClick={() => productInputRef.current?.click()} className="flex items-center px-4 py-2 border border-dashed border-gray-300 rounded hover:border-accent hover:text-accent hover:bg-blue-50 transition-colors text-sm text-gray-600">
                <ImageIcon className="w-4 h-4 mr-2" />
                添加产品图片
              </button>
              <button type="button" onClick={() => personInputRef.current?.click()} className="flex items-center px-4 py-2 border border-dashed border-gray-300 rounded hover:border-accent hover:text-accent hover:bg-blue-50 transition-colors text-sm text-gray-600">
                <User className="w-4 h-4 mr-2" />
                添加人物图片
              </button>
            </div>

            {productImages.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-gray-500 mb-1 block">产品图片 ({productImages.length})</span>
                <div className="flex flex-wrap gap-2">
                  {productImages.map((img, i) => (
                    <div key={`p-${i}`} className="relative group w-14 h-14 rounded border border-gray-200 overflow-hidden">
                      <img src={img.preview} alt={`产品图${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage('product', i)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {personImages.length > 0 && (
              <div>
                <span className="text-xs text-gray-500 mb-1 block">人物图片 ({personImages.length})</span>
                <div className="flex flex-wrap gap-2">
                  {personImages.map((img, i) => (
                    <div key={`u-${i}`} className="relative group w-14 h-14 rounded border border-gray-200 overflow-hidden">
                      <img src={img.preview} alt={`人物图${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage('person', i)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 border-t border-gray-100">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>视频生成进度：{finishedCount}/{selectedCount}</span>
              <span className={isGenerating ? 'text-accent animate-pulse' : finishedCount === selectedCount && selectedCount > 0 ? 'text-green-500' : 'text-gray-400'}>
                {isGenerating ? '生成中...' : finishedCount === selectedCount && selectedCount > 0 ? '已完成' : '待开始'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div className="bg-accent h-2 rounded-full transition-all duration-700" style={{ width: selectedCount > 0 ? `${(finishedCount / selectedCount) * 100}%` : '0%' }}></div>
            </div>
            {generateError && (
              <div className="text-xs text-red-500 mb-3 bg-red-50 p-2 rounded flex items-start">
                <AlertCircle className="w-3.5 h-3.5 mr-1 mt-0.5" />
                <span>{generateError}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleStartGenerate}
              disabled={isGenerating || selectedCount === 0}
              className={`w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-white font-medium text-sm shadow transition-all duration-200 ${
                isGenerating || selectedCount === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-gradient-to-r from-accent to-[#008CCF] hover:shadow-md'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在生成视频
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  开始生成视频
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200 flex flex-col min-h-0">
        <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-lg flex justify-between items-center">
          <h3 className="text-subtitle">视频预览区</h3>
          <span className="text-xs text-gray-500">按脚本展示生成进度与视频结果</span>
        </div>

        <div className="p-4 overflow-y-auto max-h-[460px] pr-2">
          {scripts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">暂无脚本数据，请先在第2步生成文案</div>
          ) : selectedCount === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">请先勾选脚本</div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {selectedScripts.map((script) => {
                const task = taskByScriptId.get(script.id);
                return (
                  <div key={script.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="aspect-[9/16] bg-gray-100 relative flex items-center justify-center">
                      {!task && (
                        <div className="flex flex-col items-center text-gray-400">
                          <Film className="w-10 h-10 mb-2" />
                          <span className="text-xs">待渲染</span>
                        </div>
                      )}
                      {task?.status === 'processing' && (
                        <div className="flex flex-col items-center text-gray-600">
                          <Loader2 className="w-8 h-8 animate-spin mb-2 text-accent" />
                          <span className="text-xs">渲染中 {task.progress}%</span>
                        </div>
                      )}
                      {task?.status === 'failed' && (
                        <div className="p-3 text-center text-red-500 text-xs">
                          <AlertCircle className="w-5 h-5 mx-auto mb-1" />
                          {task.error || '生成失败'}
                        </div>
                      )}
                      {task?.status === 'completed' && task.videoUrl && (
                        <video src={task.videoUrl} controls className="w-full h-full object-cover bg-black" />
                      )}
                      {task?.status === 'completed' && !task.videoUrl && (
                        <div className="p-3 text-center text-xs text-gray-600">
                          已完成，但未返回可播放地址
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-white text-xs text-center border-t border-gray-100 truncate">
                      {script.title}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4 mt-auto flex-shrink-0">
        <button
          onClick={onNext}
          className="px-6 py-2 bg-accent text-white rounded hover:bg-[#008CCF] transition-colors text-btn shadow-sm"
        >
          下一步：数据回流进化
        </button>
      </div>
    </div>
  );
}
