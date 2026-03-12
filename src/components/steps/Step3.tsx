import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, Film, History, Image as ImageIcon, Loader2, Play, Sparkles, Trash2, User, Users, X } from 'lucide-react';
import type { GeneratedScript, Step1FormData, Step3VideoTask } from '../../App';
import CharacterSelector from '../CharacterSelector';
import { buildApiUrl, characterApi, type CharacterRecord } from '../../services/api';
import type { ScriptCharacterSelection } from '../../types/character';

type Step3Props = {
  onNext: () => void;
  generatedScripts: GeneratedScript[];
  videoApiKey?: string;
  videoApiEndpoint?: string;
  videoModelName?: string;
  imageApiKey?: string;
  imageApiProvider?: string;
  imageApiEndpoint?: string;
  imageModelName?: string;
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

type ReferenceImagePayload = {
  imageUrl: string;
  label: string;
};

type CharacterRefreshResult = {
  ok: boolean;
  message: string;
};

type VideoTaskHistoryItem = Step3VideoTask & {
  historyId: string;
  createdAt: string;
  updatedAt: string;
};

type FrameImageTask = {
  scriptId: number;
  scriptTitle: string;
  status: 'idle' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  prompt: string;
  error?: string;
  revisedPrompt?: string;
  updatedAt: string;
};

const VIDEO_TASK_HISTORY_STORAGE_KEY = 'ai-helper-video-task-history';

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

function createTaskHistoryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readTaskHistory() {
  if (typeof window === 'undefined') return [] as VideoTaskHistoryItem[];
  try {
    const raw = window.localStorage.getItem(VIDEO_TASK_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as VideoTaskHistoryItem[] : [];
  } catch {
    return [];
  }
}

function formatHistoryTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function getTaskStatusLabel(status: Step3VideoTask['status']) {
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '生成失败';
  if (status === 'processing') return '生成中';
  return '等待中';
}

function getTaskStatusClassName(status: Step3VideoTask['status']) {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'failed') return 'bg-rose-100 text-rose-700';
  if (status === 'processing') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

function buildFirstFramePrompt({
  script,
  step1Data,
  renderStyle,
  hasCharacter,
  referenceCount,
}: {
  script: ScriptItem;
  step1Data: Step1FormData;
  renderStyle: string;
  hasCharacter: boolean;
  referenceCount: number;
}) {
  const audienceText = step1Data.targetAudiences.length ? step1Data.targetAudiences.join('、') : '全人群';
  const scriptContent = script.prompt.replace(/\n{3,}/g, '\n\n').trim();
  const referenceInstruction = hasCharacter
    ? referenceCount > 1
      ? '已提供人物图与多张产品图，请综合所有参考图，严格保持人物形象与产品外观一致。'
      : '已提供人物图，请严格保持人物形象一致，同时准确还原产品外观。'
    : referenceCount > 1
      ? '已提供多张产品图，请综合所有产品参考图，严格保持产品外观、包装、颜色和材质一致。'
      : '已提供产品参考图，请严格保持产品外观、包装、颜色和材质一致。';

  return `
你是一位电商短视频导演，现在要为一条带货视频生成“首帧图”，用于后续图生视频。

目标：
- 只生成 1 张竖屏 9:16 的首帧图
- 首帧必须直接进入真实带货场景，不要出现拼贴、分屏、对比图、参考板、字幕、海报排版、边框、水印或任何文字
- 画面要有短视频前 1 秒的抓人感，适合信息流停留
- 构图优先使用半身近景、手持展示、产品特写或直播间/居家实景带货视角
- 画面风格：${renderStyle}
- ${referenceInstruction}

产品信息：
- 产品名称：${step1Data.productName || '未填写'}
- 核心卖点：${step1Data.coreSellingPoints || '未填写'}
- 主要痛点：${step1Data.painPoints || '未填写'}
- 价格优势：${step1Data.priceAdvantage || '未填写'}
- 目标人群：${audienceText}

视频脚本标题：
${script.title}

视频脚本内容：
${scriptContent || '未填写脚本内容'}

输出要求：
- 只输出一张完整首帧图
- 人物表情自然、动作真实，产品主体清晰可见
- 强调“正在真实展示/讲解产品”的瞬间，而不是静态商品海报
- 如果脚本里有场景或镜头重点，请优先体现在首帧图中
`.trim();
}

export default function Step3({
  onNext,
  generatedScripts,
  videoApiKey,
  videoApiEndpoint,
  videoModelName,
  imageApiKey,
  imageApiProvider,
  imageApiEndpoint,
  imageModelName,
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
  const [savedCharacters, setSavedCharacters] = useState<CharacterRecord[]>([]);
  const [characterSelections, setCharacterSelections] = useState<Record<number, ScriptCharacterSelection | undefined>>({});
  const [isCharacterLoading, setIsCharacterLoading] = useState(false);
  const [characterMessage, setCharacterMessage] = useState('');
  const [characterMessageType, setCharacterMessageType] = useState<'success' | 'error' | ''>('');
  const [selectorScriptId, setSelectorScriptId] = useState<number | null>(null);
  const [frameTasks, setFrameTasks] = useState<FrameImageTask[]>([]);
  const [isBatchGeneratingFrames, setIsBatchGeneratingFrames] = useState(false);
  const [frameMessage, setFrameMessage] = useState('');
  const [frameMessageType, setFrameMessageType] = useState<'success' | 'error' | ''>('');
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<number>>(new Set());
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloadMessageType, setDownloadMessageType] = useState<'success' | 'error' | ''>('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [taskHistory, setTaskHistory] = useState<VideoTaskHistoryItem[]>(() => readTaskHistory());
  const [isHistoryRefreshing, setIsHistoryRefreshing] = useState(false);
  const [historyRefreshMessage, setHistoryRefreshMessage] = useState('');
  const [historyRefreshMessageType, setHistoryRefreshMessageType] = useState<'success' | 'error' | ''>('');
  const productInputRef = useRef<HTMLInputElement>(null);
  const knownDownloadableIdsRef = useRef<Set<number>>(new Set());

  const applyTaskPatch = (task: Step3VideoTask, patch: Partial<Step3VideoTask>): Step3VideoTask => {
    const createdAt = patch.createdAt ?? task.createdAt ?? new Date().toISOString();
    return {
      ...task,
      ...patch,
      historyId: patch.historyId ?? task.historyId ?? createTaskHistoryId(),
      createdAt,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
  };

  const applyHistoryPatch = (task: VideoTaskHistoryItem, patch: Partial<Step3VideoTask>): VideoTaskHistoryItem => {
    const createdAt = task.createdAt || new Date().toISOString();
    return {
      ...task,
      ...patch,
      historyId: task.historyId,
      createdAt,
      updatedAt: new Date().toISOString(),
    };
  };

  const applyFrameTaskPatch = (task: FrameImageTask, patch: Partial<FrameImageTask>): FrameImageTask => ({
    ...task,
    ...patch,
    updatedAt: new Date().toISOString(),
  });

  const upsertFrameTask = (script: ScriptItem, patch: Partial<FrameImageTask>) => {
    setFrameTasks((prev) => {
      const existing = prev.find((item) => item.scriptId === script.id);
      if (existing) {
        return prev.map((item) => (
          item.scriptId === script.id
            ? applyFrameTaskPatch(item, patch)
            : item
        ));
      }

      return [
        ...prev,
        {
          scriptId: script.id,
          scriptTitle: script.title,
          status: 'idle',
          prompt: patch.prompt || '',
          imageUrl: '',
          error: '',
          revisedPrompt: '',
          updatedAt: new Date().toISOString(),
          ...patch,
        },
      ];
    });
  };

  const loadCharacters = async ({ manual = false }: { manual?: boolean } = {}): Promise<CharacterRefreshResult> => {
    setIsCharacterLoading(true);
    try {
      const response = await characterApi.list({ limit: 100, offset: 0 });
      if (!response.ok || !response.data) {
        const message = response.message || '人物库加载失败';
        setCharacterMessage(message);
        setCharacterMessageType('error');
        return { ok: false, message };
      }

      const nextItems = response.data.items;
      const nextIds = new Set(nextItems.map((item) => item.id));
      setSavedCharacters(nextItems);
      setCharacterSelections((prev) => {
        const nextState: Record<number, ScriptCharacterSelection | undefined> = {};
        Object.entries(prev as Record<string, ScriptCharacterSelection | undefined>).forEach(([key, value]) => {
          if (value?.source === 'saved' && !nextIds.has(value.character.id)) {
            return;
          }
          nextState[Number(key)] = value;
        });
        return nextState;
      });

      if (manual) {
        const message = `人物库已刷新，共 ${nextItems.length} 张人物图`;
        setCharacterMessage(message);
        setCharacterMessageType('success');
        return { ok: true, message };
      }

      setCharacterMessage('');
      setCharacterMessageType('');
      return { ok: true, message: '' };
    } finally {
      setIsCharacterLoading(false);
    }
  };

  const replaceCharacterSelection = (scriptId: number, nextSelection?: ScriptCharacterSelection) => {
    setCharacterSelections((prev) => {
      const current = prev[scriptId];
      if (current?.source === 'upload' && (!nextSelection || nextSelection.source !== 'upload' || nextSelection.previewUrl !== current.previewUrl)) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return {
        ...prev,
        [scriptId]: nextSelection,
      };
    });
  };

  useEffect(() => {
    void loadCharacters();
  }, []);

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
    setFrameTasks((prev) => {
      const validIds = new Set(nextScripts.map((item) => item.id));
      return prev
        .filter((task) => validIds.has(task.scriptId))
        .map((task) => {
          const matched = nextScripts.find((item) => item.id === task.scriptId);
          return matched ? { ...task, scriptTitle: matched.title } : task;
        });
    });
    setCharacterSelections((prev) => {
      const validIds = new Set(nextScripts.map((item) => item.id));
      const nextState: Record<number, ScriptCharacterSelection | undefined> = {};
      Object.entries(prev as Record<string, ScriptCharacterSelection | undefined>).forEach(([key, value]) => {
        const scriptId = Number(key);
        if (!validIds.has(scriptId)) {
          if (value?.source === 'upload') {
            URL.revokeObjectURL(value.previewUrl);
          }
          return;
        }
        nextState[scriptId] = value;
      });
      return nextState;
    });
    setGenerateError('');
    setFrameMessage('');
    setFrameMessageType('');
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
      Object.values(characterSelections as Record<string, ScriptCharacterSelection | undefined>).forEach((item) => {
        if (item?.source === 'upload') {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [characterSelections, productImages]);

  const selectedScripts = useMemo(() => scripts.filter((s) => s.selected), [scripts]);
  const selectedCount = selectedScripts.length;
  const finishedCount = videoTasks.filter((t) => t.status === 'completed' || t.status === 'failed').length;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setProductImages((prev) => [...prev, item]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setProductImages((prev) => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const updatePrompt = (id: number, nextPrompt: string) => {
    setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, prompt: nextPrompt } : s)));
  };

  const toggleSelect = (id: number) => {
    setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)));
  };

  const resolveCharacterReference = (scriptId: number): ReferenceImagePayload | null => {
    const selection = characterSelections[scriptId];
    if (selection?.source === 'saved') {
      return {
        imageUrl: selection.character.image_public_url,
        label: `人物库 / ${selection.character.name}`,
      };
    }
    if (selection?.source === 'upload') {
      return {
        imageUrl: selection.imageDataUrl,
        label: `本地上传 / ${selection.name}`,
      };
    }
    return null;
  };

  const resolveProductReference = (fallbackIndex: number): ReferenceImagePayload | null => {
    const fallback = productImages[fallbackIndex % Math.max(productImages.length, 1)];
    if (fallback) {
      return {
        imageUrl: fallback.base64,
        label: `产品图 / ${fallback.file.name}`,
      };
    }
    return null;
  };

  const resolveVideoReferences = (scriptId: number, fallbackIndex: number) => {
    const character = resolveCharacterReference(scriptId);
    const product = resolveProductReference(fallbackIndex);
    return {
      character,
      product,
      hasAny: Boolean(character?.imageUrl || product?.imageUrl),
    };
  };

  const resolveFrameReferenceImages = (scriptId: number) => {
    const references: string[] = [];
    const character = resolveCharacterReference(scriptId);
    if (character?.imageUrl) {
      references.push(character.imageUrl);
    }

    productImages.forEach((item) => {
      if (item.base64) {
        references.push(item.base64);
      }
    });

    return Array.from(new Set(references)).filter(Boolean).slice(0, 4);
  };

  const generateFrameForScript = async (script: ScriptItem) => {
    if (!imageApiKey?.trim()) {
      throw new Error('请先在设置中配置并测试生图 API Key');
    }
    if (!imageApiEndpoint?.trim()) {
      throw new Error('请先在设置中填写生图 API 端点');
    }
    if (!imageModelName?.trim()) {
      throw new Error('请先在设置中填写生图模型名称');
    }

    const referenceImages = resolveFrameReferenceImages(script.id);
    if (!referenceImages.length) {
      throw new Error('请至少上传一张产品图，或为该脚本绑定人物图');
    }

    const prompt = buildFirstFramePrompt({
      script,
      step1Data,
      renderStyle,
      hasCharacter: Boolean(resolveCharacterReference(script.id)?.imageUrl),
      referenceCount: referenceImages.length,
    });

    upsertFrameTask(script, {
      status: 'processing',
      prompt,
      error: '',
    });

    const response = await fetch(buildApiUrl('/api/generate-frame-image'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: imageApiKey,
        provider: imageApiProvider,
        apiEndpoint: imageApiEndpoint,
        modelName: imageModelName,
        prompt,
        referenceImages,
        scriptTitle: script.title,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || data?.detail || '首帧图生成失败');
    }

    upsertFrameTask(script, {
      status: 'completed',
      prompt,
      imageUrl: String(data.imageUrl || ''),
      revisedPrompt: String(data.revisedPrompt || ''),
      error: '',
    });
  };

  const handleBatchGenerateFrames = async () => {
    if (isBatchGeneratingFrames) return;
    if (!selectedScripts.length) {
      setFrameMessageType('error');
      setFrameMessage('请至少勾选一个脚本');
      return;
    }

    setIsBatchGeneratingFrames(true);
    setFrameMessage('');
    setFrameMessageType('');

    let successCount = 0;
    let failedCount = 0;

    for (const script of selectedScripts) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await generateFrameForScript(script);
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : '首帧图生成失败';
        upsertFrameTask(script, {
          status: 'failed',
          error: message,
          prompt: frameTaskByScriptId.get(script.id)?.prompt || '',
        });
      }
    }

    setFrameMessageType(failedCount > 0 ? 'error' : 'success');
    setFrameMessage(
      failedCount > 0
        ? `首帧图已生成 ${successCount} 张，失败 ${failedCount} 张`
        : `已生成 ${successCount} 张首帧图，后续生成视频时会优先使用这些首帧图`,
    );
    setIsBatchGeneratingFrames(false);
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

    const hasAnyImage = selectedScripts.some((script, index) => {
      const frameTask = frameTaskByScriptId.get(script.id);
      return Boolean((frameTask?.status === 'completed' && frameTask.imageUrl) || resolveVideoReferences(script.id, index).hasAny);
    });
    if (!hasAnyImage) {
      setGenerateError('请先生成首帧图，或至少上传产品图 / 绑定人物图');
      return;
    }

    setGenerateError('');
    setIsGenerating(true);
    const startedAt = new Date().toISOString();
    const pendingTasks = selectedScripts.map((script) => ({
      scriptId: script.id,
      scriptTitle: script.title,
      taskId: '',
      status: 'pending' as const,
      progress: 0,
      error: '',
      historyId: createTaskHistoryId(),
      createdAt: startedAt,
      updatedAt: startedAt,
    }));
    const pendingTaskMap = new Map<number, Step3VideoTask>(pendingTasks.map((task) => [task.scriptId, task] as const));
    setVideoTasks(pendingTasks);

    try {
      const submittedTasks: Step3VideoTask[] = [];
      const submissionErrors: string[] = [];

      for (let i = 0; i < selectedScripts.length; i += 1) {
        const script = selectedScripts[i];
        const prompt = normalizePrompt(script);
        const durationSeconds = resolveDurationSeconds(script);
        const frameTask = frameTaskByScriptId.get(script.id);
        const frameImageUrl = frameTask?.status === 'completed' ? String(frameTask.imageUrl || '').trim() : '';
        const references = resolveVideoReferences(script.id, i);
        const shouldUseFrameImage = Boolean(frameImageUrl);

        if (!shouldUseFrameImage && !references.hasAny) {
          const message = '请为该脚本选择人物图，或补充至少一张产品图';
          submissionErrors.push(`${script.title}: ${message}`);
          setVideoTasks((prev) => prev.map((task) => (
            task.scriptId === script.id ? applyTaskPatch(task, { status: 'failed', progress: 0, error: message }) : task
          )));
          continue;
        }

        try {
          const response = await fetch(buildApiUrl('/api/generate-video'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: videoApiKey,
              apiEndpoint: videoApiEndpoint,
              modelName: videoModelName,
              prompt,
              style: renderStyle,
              imageUrl: shouldUseFrameImage ? frameImageUrl : references.character?.imageUrl || references.product?.imageUrl || '',
              characterImageUrl: shouldUseFrameImage ? '' : references.character?.imageUrl || '',
              productImageUrl: shouldUseFrameImage ? '' : references.product?.imageUrl || '',
              durationSeconds,
            }),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data?.ok) {
            throw new Error(data?.message || data?.detail || `脚本 ${script.title} 视频任务提交失败`);
          }

          const baseTask = pendingTaskMap.get(script.id);
          submittedTasks.push({
            scriptId: script.id,
            scriptTitle: script.title,
            taskId: String(data.taskId || ''),
            status: 'processing',
            progress: 10,
            error: '',
            historyId: baseTask?.historyId,
            createdAt: baseTask?.createdAt,
            updatedAt: new Date().toISOString(),
          });
          setVideoTasks((prev) =>
            prev.map((task) =>
              task.scriptId === script.id
                ? applyTaskPatch(task, { status: 'processing', progress: 10, taskId: String(data.taskId || ''), error: '' })
                : task,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : '视频任务提交失败';
          submissionErrors.push(`${script.title}: ${message}`);
          setVideoTasks((prev) =>
            prev.map((task) =>
              task.scriptId === script.id
                ? applyTaskPatch(task, { status: 'failed', progress: 0, error: message })
                : task,
            ),
          );
        }
      }

      if (!submittedTasks.length) {
        setGenerateError(submissionErrors.join('；') || '视频任务提交失败');
        return;
      }

      const pollingStartedAt = Date.now();
      const timeoutMs = 10 * 60 * 1000;
      let remaining = new Set(submittedTasks.map((task) => task.scriptId));
      let failedCount = submissionErrors.length;

      while (remaining.size > 0) {
        if (Date.now() - pollingStartedAt > timeoutMs) {
          setVideoTasks((prev) =>
            prev.map((task) =>
              remaining.has(task.scriptId)
                ? applyTaskPatch(task, { status: 'failed', error: '生成超时，请稍后重试', progress: 0 })
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
            remaining.delete(task.scriptId);
            failedCount += 1;
            const message = statusData?.message || statusData?.detail || `脚本 ${task.scriptTitle} 状态查询失败`;
            setVideoTasks((prev) =>
              prev.map((item) =>
                item.scriptId === task.scriptId
                  ? applyTaskPatch(item, {
                      status: 'failed',
                      progress: 0,
                      error: message,
                    })
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
                  ? applyTaskPatch(item, {
                      status: 'completed',
                      progress: 100,
                      videoUrl: statusData.videoUrl || '',
                      error: '',
                    })
                  : item,
              ),
            );
          } else if (status === 'failed') {
            remaining.delete(task.scriptId);
            failedCount += 1;
            setVideoTasks((prev) =>
              prev.map((item) =>
                item.scriptId === task.scriptId
                  ? applyTaskPatch(item, {
                      status: 'failed',
                      progress: 0,
                      error: statusData.error || '生成失败',
                    })
                  : item,
              ),
            );
          } else {
            setVideoTasks((prev) =>
              prev.map((item) =>
                item.scriptId === task.scriptId
                  ? applyTaskPatch(item, {
                      status: 'processing',
                      progress: Math.max(item.progress, Number(statusData.progress || 35)),
                    })
                  : item,
              ),
            );
          }
        }
      }

      if (failedCount > 0) {
        setGenerateError(`共有 ${failedCount} 个视频任务失败，请查看预览区错误信息`);
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

  const frameTaskByScriptId = useMemo(() => {
    const map = new Map<number, FrameImageTask>();
    frameTasks.forEach((task) => {
      map.set(task.scriptId, task);
    });
    return map;
  }, [frameTasks]);

  const completedFrameCount = useMemo(
    () => frameTasks.filter((task) => task.status === 'completed' && task.imageUrl).length,
    [frameTasks],
  );

  const downloadableTasks = useMemo(() => selectedScripts
    .map((script) => taskByScriptId.get(script.id))
    .filter((task): task is Step3VideoTask => Boolean(task?.status === 'completed' && task.videoUrl)), [selectedScripts, taskByScriptId]);

  const selectedDownloadableCount = downloadableTasks.filter((task) => selectedVideoIds.has(task.scriptId)).length;
  const allDownloadableSelected = downloadableTasks.length > 0 && selectedDownloadableCount === downloadableTasks.length;
  const refreshableHistoryTasks = useMemo(
    () => taskHistory.filter((task) => (task.status === 'pending' || task.status === 'processing') && Boolean(task.taskId)),
    [taskHistory],
  );

  useEffect(() => {
    const validIds = new Set<number>(downloadableTasks.map((task) => task.scriptId));
    const knownIds = knownDownloadableIdsRef.current;
    setSelectedVideoIds((prev) => {
      const next = new Set<number>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        }
      });
      validIds.forEach((id) => {
        if (!knownIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
    knownDownloadableIdsRef.current = new Set(validIds);
  }, [downloadableTasks]);

  useEffect(() => {
    if (typeof window === 'undefined' || videoTasks.length === 0) return;

    setTaskHistory((prev) => {
      const historyMap = new Map<string, VideoTaskHistoryItem>(prev.map((item) => [item.historyId, item] as const));
      videoTasks.forEach((task) => {
        const historyId = task.historyId || createTaskHistoryId();
        const previous = historyMap.get(historyId);
        historyMap.set(historyId, {
          ...previous,
          ...task,
          historyId,
          createdAt: task.createdAt || previous?.createdAt || new Date().toISOString(),
          updatedAt: task.updatedAt || new Date().toISOString(),
        });
      });

      return Array.from(historyMap.values())
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 100);
    });
  }, [videoTasks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIDEO_TASK_HISTORY_STORAGE_KEY, JSON.stringify(taskHistory));
  }, [taskHistory]);

  useEffect(() => {
    if (!isHistoryOpen) return;
    void refreshHistoryTasks({ silent: true });
  }, [isHistoryOpen]);

  useEffect(() => {
    if (!isHistoryOpen || refreshableHistoryTasks.length === 0 || typeof window === 'undefined') {
      return;
    }

    const timerId = window.setInterval(() => {
      void refreshHistoryTasks({ silent: true });
    }, 5000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isHistoryOpen, refreshableHistoryTasks.length, taskHistory, videoApiKey]);

  const toggleVideoSelection = (scriptId: number) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(scriptId)) {
        next.delete(scriptId);
      } else {
        next.add(scriptId);
      }
      return next;
    });
  };

  const toggleSelectAllVideos = () => {
    setSelectedVideoIds(() => {
      if (allDownloadableSelected) {
        return new Set();
      }
      return new Set(downloadableTasks.map((task) => task.scriptId));
    });
  };

  const getVideoExtension = (videoUrl: string) => {
    try {
      const pathname = new URL(videoUrl, window.location.href).pathname;
      const ext = pathname.split('.').pop()?.toLowerCase();
      if (ext && ext.length <= 5) {
        return `.${ext}`;
      }
    } catch {
      return '.mp4';
    }
    return '.mp4';
  };

  const buildVideoFilename = (task: Step3VideoTask) => {
    const safeTitle = task.scriptTitle.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || `video-${task.scriptId}`;
    return `${safeTitle}${getVideoExtension(task.videoUrl || '')}`;
  };

  const downloadVideo = async (task: Step3VideoTask) => {
    if (!task.videoUrl) {
      throw new Error(`${task.scriptTitle} 没有可下载地址`);
    }

    const anchor = document.createElement('a');
    anchor.rel = 'noopener';

    try {
      const response = await fetch(task.videoUrl);
      if (!response.ok) {
        throw new Error(`${task.scriptTitle} 下载失败`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      anchor.href = objectUrl;
      anchor.download = buildVideoFilename(task);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return;
    } catch {
      anchor.href = task.videoUrl;
      anchor.target = '_blank';
      anchor.download = buildVideoFilename(task);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  };

  const handleBatchDownload = async () => {
    const tasksToDownload = downloadableTasks.filter((task) => selectedVideoIds.has(task.scriptId));
    if (!tasksToDownload.length) {
      setDownloadMessageType('error');
      setDownloadMessage('请先勾选至少一个已生成视频');
      return;
    }

    setIsBatchDownloading(true);
    setDownloadMessage('');
    setDownloadMessageType('');

    const failedTitles: string[] = [];

    for (const task of tasksToDownload) {
      try {
        await downloadVideo(task);
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      } catch {
        failedTitles.push(task.scriptTitle);
      }
    }

    if (failedTitles.length) {
      setDownloadMessageType('error');
      setDownloadMessage(`以下视频下载失败：${failedTitles.join('、')}`);
    } else {
      setDownloadMessageType('success');
      setDownloadMessage(`已开始下载 ${tasksToDownload.length} 个视频`);
    }

    setIsBatchDownloading(false);
  };

  const refreshHistoryTasks = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (isHistoryRefreshing) return;

    const tasksToRefresh = taskHistory.filter(
      (task) => (task.status === 'pending' || task.status === 'processing') && Boolean(task.taskId),
    );

    if (!tasksToRefresh.length) {
      if (!silent) {
        setHistoryRefreshMessageType('success');
        setHistoryRefreshMessage('当前没有需要刷新的历史任务');
      }
      return;
    }

    if (!videoApiKey?.trim()) {
      setHistoryRefreshMessageType('error');
      setHistoryRefreshMessage('请先在设置中配置视频 API Key，再刷新历史任务');
      return;
    }

    if (!silent) {
      setHistoryRefreshMessage('');
      setHistoryRefreshMessageType('');
    }

    setIsHistoryRefreshing(true);

    const updates: VideoTaskHistoryItem[] = [];
    let completedCount = 0;
    let processingCount = 0;
    let failedCount = 0;

    try {
      for (const task of tasksToRefresh) {
        try {
          const response = await fetch(buildApiUrl('/api/video-status'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: videoApiKey, taskId: task.taskId }),
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok || !data?.ok) {
            const message = data?.message || data?.detail || '历史任务状态查询失败';
            updates.push(applyHistoryPatch(task, { status: 'failed', progress: 0, error: message }));
            failedCount += 1;
            continue;
          }

          const status = String(data.status || '').toLowerCase();
          if (status === 'completed') {
            updates.push(
              applyHistoryPatch(task, {
                status: 'completed',
                progress: 100,
                videoUrl: String(data.videoUrl || task.videoUrl || ''),
                error: '',
              }),
            );
            completedCount += 1;
          } else if (status === 'failed') {
            updates.push(
              applyHistoryPatch(task, {
                status: 'failed',
                progress: 0,
                error: String(data.error || data.message || '生成失败'),
              }),
            );
            failedCount += 1;
          } else {
            updates.push(
              applyHistoryPatch(task, {
                status: 'processing',
                progress: Math.max(task.progress, Number(data.progress || 35)),
                error: '',
              }),
            );
            processingCount += 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '历史任务状态查询失败';
          updates.push(applyHistoryPatch(task, { status: 'failed', progress: 0, error: message }));
          failedCount += 1;
        }
      }

      if (updates.length > 0) {
        const updateMap = new Map<string, VideoTaskHistoryItem>(updates.map((task) => [task.historyId, task] as const));

        setTaskHistory((prev) =>
          prev
            .map((task) => updateMap.get(task.historyId) || task)
            .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
            .slice(0, 100),
        );

        setVideoTasks((prev) =>
          prev.map((task) => {
            const matchedHistoryTask = (task.historyId && updateMap.get(task.historyId))
              || updates.find((item) => item.taskId && item.taskId === task.taskId);
            if (!matchedHistoryTask) return task;
            return applyTaskPatch(task, {
              status: matchedHistoryTask.status,
              progress: matchedHistoryTask.progress,
              videoUrl: matchedHistoryTask.videoUrl,
              error: matchedHistoryTask.error,
              taskId: matchedHistoryTask.taskId,
            });
          }),
        );
      }

      if (!silent) {
        setHistoryRefreshMessageType('success');
        setHistoryRefreshMessage(
          `已刷新 ${tasksToRefresh.length} 个任务：${completedCount} 个完成，${processingCount} 个生成中，${failedCount} 个失败`,
        );
      }
    } finally {
      setIsHistoryRefreshing(false);
    }
  };

  const handleClearTaskHistory = () => {
    setTaskHistory([]);
    setHistoryRefreshMessage('');
    setHistoryRefreshMessageType('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(VIDEO_TASK_HISTORY_STORAGE_KEY);
    }
  };

  const selectorSelection = selectorScriptId ? characterSelections[selectorScriptId] || null : null;

  return (
    <div className="max-w-6xl mx-auto min-h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-4">
      <h2 className="text-title mb-4 flex-shrink-0">AI视频生成</h2>

      <div className="grid grid-cols-12 gap-6 mb-6 flex-shrink-0">
        <div className="col-span-5 bg-card rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col max-h-[420px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-subtitle">脚本选择 (双击编辑提示词)</h3>
            <span className="text-xs text-gray-500">每个脚本可单独绑定人物图</span>
          </div>
          {scripts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 py-6">暂无脚本，请先在第2步生成文案</div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto pr-2">
              {scripts.map((script) => {
                const selection = characterSelections[script.id];
                return (
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
                      <div className="p-2">
                        <div className="flex items-start cursor-pointer" onDoubleClick={() => setEditingId(script.id)}>
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
                        <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium text-gray-500">人物图</div>
                              <div className="text-xs text-gray-700 truncate">
                                {selection?.source === 'saved'
                                  ? `人物库 / ${selection.character.name}`
                                  : selection?.source === 'upload'
                                    ? `本地上传 / ${selection.name}`
                                    : '未选择，将回退到产品图'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectorScriptId(script.id)}
                                className="rounded-lg bg-white px-3 py-1.5 text-xs text-gray-700 border border-gray-200 hover:border-gray-300"
                              >
                                选择人物图
                              </button>
                              {selection && (
                                <button
                                  type="button"
                                  onClick={() => replaceCharacterSelection(script.id)}
                                  className="rounded-lg bg-white px-2 py-1.5 text-xs text-gray-500 border border-gray-200 hover:border-gray-300"
                                >
                                  清空
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
            <label className="block text-sm text-gray-600 mb-2">产品参考图</label>
            <input ref={productInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            <div className="flex flex-wrap gap-3 mb-3">
              <button
                type="button"
                onClick={() => productInputRef.current?.click()}
                className="flex items-center px-4 py-2 border border-dashed border-gray-300 rounded hover:border-accent hover:text-accent hover:bg-blue-50 transition-colors text-sm text-gray-600"
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                添加产品图片
              </button>
                              <button
                                type="button"
                                onClick={() => { void loadCharacters({ manual: true }); }}
                                disabled={isCharacterLoading}
                                className="flex items-center px-4 py-2 border border-gray-300 rounded hover:border-accent hover:text-accent hover:bg-blue-50 transition-colors text-sm text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Users className={`w-4 h-4 mr-2 ${isCharacterLoading ? 'animate-pulse' : ''}`} />
                                刷新人物库
              </button>
            </div>

            {productImages.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-gray-500 mb-1 block">产品图片 ({productImages.length})</span>
                <div className="flex flex-wrap gap-2">
                  {productImages.map((img, i) => (
                    <div key={`p-${i}`} className="relative group w-14 h-14 rounded border border-gray-200 overflow-hidden">
                      <img src={img.preview} alt={`产品图${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage(i)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-5">
              当前逻辑：
              每个脚本都可单独绑定人物图；如果同时存在人物图和产品图，系统会先自动拼接成一张“左侧人物参考 + 右侧产品参考”的组合图，再提交给视频模型。
              这张组合图只用于识别人物和产品，不应直接出现在视频首帧中。
              如果只存在其中一种素材，则仅提交该素材。
              {characterMessage && (
                <div className={`mt-2 ${characterMessageType === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {characterMessage}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-amber-900">首帧图生成</div>
                  <div className="mt-1 text-xs leading-5 text-amber-800">
                    先根据脚本和参考图批量生成首帧图，再去生成视频。后续视频生成会优先使用首帧图作为图生视频输入源。
                  </div>
                  <div className="mt-2 text-[11px] leading-5 text-amber-700">
                    当前生图模型：{imageModelName || '未配置'}。
                    单张效果不满意时可在卡片里单独重生；单图重生更适合 1.5 类模型，人物图 + 多张产品图参考时更建议使用 2.0 类模型。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { void handleBatchGenerateFrames(); }}
                  disabled={isBatchGeneratingFrames || selectedCount === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBatchGeneratingFrames ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isBatchGeneratingFrames ? '批量生成中...' : '批量生成首帧图'}
                </button>
              </div>
              {frameMessage && (
                <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                  frameMessageType === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {frameMessage}
                </div>
              )}
              <div className="mt-3 text-xs text-amber-800">
                已生成首帧图 {completedFrameCount}/{selectedCount || scripts.length || 0} 张
              </div>
            </div>
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
        <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-lg flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 className="text-subtitle">视频预览区</h3>
            <span className="text-xs text-gray-500">按脚本展示生成进度与视频结果</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">
              已选 {selectedDownloadableCount}/{downloadableTasks.length} 个成片
            </span>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            >
              <History className="w-3.5 h-3.5" />
              历史任务
            </button>
            <button
              type="button"
              onClick={toggleSelectAllVideos}
              disabled={downloadableTasks.length === 0}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {allDownloadableSelected ? '取消全选' : '全选成片'}
            </button>
            <button
              type="button"
              onClick={() => { void handleBatchDownload(); }}
              disabled={selectedDownloadableCount === 0 || isBatchDownloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              {isBatchDownloading ? '下载中...' : '批量下载'}
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[460px] pr-2">
          {scripts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">暂无脚本数据，请先在第2步生成文案</div>
          ) : selectedCount === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">请先勾选脚本</div>
          ) : (
            <div className="space-y-3">
              {downloadMessage && (
                <div className={`rounded-lg px-3 py-2 text-xs ${
                  downloadMessageType === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {downloadMessage}
                </div>
              )}
              <div className="grid grid-cols-3 gap-4">
              {selectedScripts.map((script, index) => {
                const task = taskByScriptId.get(script.id);
                const frameTask = frameTaskByScriptId.get(script.id);
                const selection = characterSelections[script.id];
                const characterReference = resolveCharacterReference(script.id);
                const productReference = resolveProductReference(index);
                const isSelectableVideo = Boolean(task?.status === 'completed' && task.videoUrl);
                const isVideoSelected = selectedVideoIds.has(script.id);
                return (
                  <div key={script.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="aspect-[9/16] bg-gray-100 relative flex items-center justify-center">
                      {isSelectableVideo && (
                        <label className="absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-full bg-white/90 px-2 py-1 text-[11px] text-gray-700 shadow-sm">
                          <input
                            type="checkbox"
                            checked={isVideoSelected}
                            onChange={() => toggleVideoSelection(script.id)}
                            className="rounded text-accent focus:ring-accent"
                          />
                          选中
                        </label>
                      )}
                      {!task && (
                        <>
                          {frameTask?.status === 'processing' && (
                            <div className="flex flex-col items-center text-amber-600">
                              <Loader2 className="w-8 h-8 animate-spin mb-2" />
                              <span className="text-xs">首帧图生成中</span>
                            </div>
                          )}
                          {frameTask?.status === 'failed' && (
                            <div className="p-3 text-center text-amber-700 text-xs">
                              <AlertCircle className="w-5 h-5 mx-auto mb-1" />
                              {frameTask.error || '首帧图生成失败'}
                            </div>
                          )}
                          {frameTask?.status === 'completed' && frameTask.imageUrl && (
                            <img src={frameTask.imageUrl} alt={`${script.title} 首帧图`} className="w-full h-full object-cover" />
                          )}
                          {!frameTask && (
                            <div className="flex flex-col items-center text-gray-400">
                              <Film className="w-10 h-10 mb-2" />
                              <span className="text-xs">待生成首帧图</span>
                            </div>
                          )}
                        </>
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
                    <div className="p-2 bg-white text-xs border-t border-gray-100">
                      <div className="truncate text-center">{script.title}</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void generateFrameForScript(script).catch((error) => {
                              const message = error instanceof Error ? error.message : '首帧图生成失败';
                              upsertFrameTask(script, {
                                status: 'failed',
                                error: message,
                                prompt: frameTask?.prompt || '',
                              });
                              setFrameMessageType('error');
                              setFrameMessage(`${script.title}：${message}`);
                            });
                          }}
                          disabled={frameTask?.status === 'processing'}
                          className="flex-1 rounded-lg bg-amber-100 px-2 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {frameTask?.status === 'processing'
                            ? '首帧图生成中...'
                            : frameTask?.status === 'completed'
                              ? '重新生成首帧图'
                              : '生成首帧图'}
                        </button>
                        {frameTask?.status === 'completed' && frameTask.imageUrl && (
                          <button
                            type="button"
                            onClick={() => window.open(frameTask.imageUrl, '_blank', 'noopener,noreferrer')}
                            className="rounded-lg bg-gray-100 px-2 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
                          >
                            查看
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-gray-500 truncate">
                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {selection?.source === 'saved'
                            ? selection.character.name
                            : selection?.source === 'upload'
                              ? selection.name
                              : '未设置人物图'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-gray-500 truncate">
                        <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {productReference?.label || (characterReference ? '未设置产品图，将仅使用人物图' : '未设置产品图')}
                        </span>
                      </div>
                      {frameTask?.status === 'completed' && (
                        <div className="mt-1 truncate text-[11px] text-emerald-600">
                          已生成首帧图，生成视频时会优先使用
                        </div>
                      )}
                      {frameTask?.status === 'failed' && frameTask.error && (
                        <div className="mt-1 line-clamp-2 text-[11px] text-rose-600">
                          首帧图失败：{frameTask.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
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

      <CharacterSelector
        isOpen={selectorScriptId !== null}
        characters={savedCharacters}
        selected={selectorSelection}
        onClose={() => setSelectorScriptId(null)}
        onRefresh={loadCharacters}
        onSelectCharacter={(character) => {
          if (selectorScriptId !== null) {
            replaceCharacterSelection(selectorScriptId, { source: 'saved', character });
          }
        }}
        onSelectUpload={(payload) => {
          if (selectorScriptId !== null) {
            replaceCharacterSelection(selectorScriptId, {
              source: 'upload',
              name: payload.name,
              previewUrl: payload.previewUrl,
              imageDataUrl: payload.imageDataUrl,
            });
          }
        }}
        onClear={() => {
          if (selectorScriptId !== null) {
            replaceCharacterSelection(selectorScriptId);
          }
        }}
      />

      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-4xl max-h-[80vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">历史任务</h3>
                <p className="text-sm text-gray-500 mt-1">查看本机已经运行过的视频任务，并向服务器补查仍在生成中的任务状态。</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void refreshHistoryTasks(); }}
                  disabled={isHistoryRefreshing || refreshableHistoryTasks.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isHistoryRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
                  {isHistoryRefreshing ? '刷新中...' : '刷新状态'}
                </button>
                <button
                  type="button"
                  onClick={handleClearTaskHistory}
                  disabled={taskHistory.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  清空历史
                </button>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(80vh-88px)] overflow-y-auto px-6 py-5">
              {historyRefreshMessage && (
                <div className={`mb-4 rounded-xl px-3 py-2 text-xs ${
                  historyRefreshMessageType === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {historyRefreshMessage}
                </div>
              )}
              {taskHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center text-sm text-gray-400">
                  还没有历史任务记录
                </div>
              ) : (
                <div className="space-y-3">
                  {taskHistory.map((task) => (
                    <div key={task.historyId} className="rounded-2xl border border-gray-200 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium text-gray-900">{task.scriptTitle}</div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getTaskStatusClassName(task.status)}`}>
                              {getTaskStatusLabel(task.status)}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-500 md:grid-cols-2">
                            <div>任务ID：{task.taskId || '-'}</div>
                            <div>进度：{task.progress}%</div>
                            <div>创建时间：{formatHistoryTime(task.createdAt)}</div>
                            <div>最近更新：{formatHistoryTime(task.updatedAt)}</div>
                          </div>
                          {task.error && (
                            <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
                              {task.error}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {task.videoUrl && (
                            <button
                              type="button"
                              onClick={() => { void downloadVideo(task); }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white hover:bg-black"
                            >
                              <Download className="w-3.5 h-3.5" />
                              下载视频
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
