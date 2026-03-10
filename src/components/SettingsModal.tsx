import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2, RotateCcw } from 'lucide-react';
import { buildApiUrl } from '../services/api';
import {
  getProviderPreset,
  IMAGE_PROVIDER_PRESETS,
  normalizeWorkflowConfig,
  TEXT_PROVIDER_PRESETS,
  VIDEO_PROVIDER_PRESETS,
  type ApiCapability,
  type ProviderPreset,
  type WorkflowApiConfigDraft,
} from '../lib/providerCatalog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  textConfig: WorkflowApiConfigDraft;
  videoConfig: WorkflowApiConfigDraft;
  imageConfig: WorkflowApiConfigDraft;
  onSave: (payload: {
    text: WorkflowApiConfigDraft;
    video: WorkflowApiConfigDraft;
    image: WorkflowApiConfigDraft;
  }) => Promise<void>;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

type ApiCardStatus = {
  status: ConnectionStatus;
  message: string;
};

function ProviderSelect({
  presets,
  value,
  onChange,
}: {
  presets: ProviderPreset[];
  value: string;
  onChange: (nextProvider: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none bg-white"
    >
      {presets.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {preset.label}
        </option>
      ))}
    </select>
  );
}

function ApiConfigCard({
  title,
  capability,
  draft,
  status,
  onDraftChange,
  onResetToPreset,
  onTest,
}: {
  title: string;
  capability: ApiCapability;
  draft: WorkflowApiConfigDraft;
  status: ApiCardStatus;
  onDraftChange: (nextDraft: WorkflowApiConfigDraft) => void;
  onResetToPreset: () => void;
  onTest: () => Promise<void>;
}) {
  const presets = capability === 'text'
    ? TEXT_PROVIDER_PRESETS
    : capability === 'video'
      ? VIDEO_PROVIDER_PRESETS
      : IMAGE_PROVIDER_PRESETS;
  const preset = getProviderPreset(draft.provider, capability) || presets[0];

  const updateDraft = (patch: Partial<WorkflowApiConfigDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };

  const applyProvider = (nextProvider: string) => {
    const nextPreset = getProviderPreset(nextProvider, capability) || presets[0];
      updateDraft({
        provider: nextPreset.id,
        apiEndpoint: nextPreset.recommendedEndpoint,
        modelName: capability === 'text' && nextPreset.id === 'DOUBAO' ? '' : nextPreset.modelSuggestions[0] || '',
      });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{preset.description}</p>
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {preset.shortLabel}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">提供商</label>
            <ProviderSelect presets={presets} value={draft.provider} onChange={applyProvider} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">模型名称</label>
            <input
              type="text"
              value={draft.modelName}
              onChange={(event) => updateDraft({ modelName: event.target.value })}
              placeholder={preset.modelPlaceholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        {preset.modelSuggestions.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-gray-500">常用模型</div>
            <div className="flex flex-wrap gap-2">
              {preset.modelSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => updateDraft({ modelName: item })}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    draft.modelName === item
                      ? 'bg-accent text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-500">API 端点</label>
            <button
              type="button"
              onClick={onResetToPreset}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              恢复推荐地址
            </button>
          </div>
          <input
            type="text"
            value={draft.apiEndpoint}
            onChange={(event) => updateDraft({ apiEndpoint: event.target.value })}
            placeholder={preset.endpointPlaceholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">API Key</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="password"
              value={draft.apiKey}
              onChange={(event) => updateDraft({ apiKey: event.target.value })}
              placeholder={preset.keyPlaceholder}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
            <button
              type="button"
              onClick={() => {
                void onTest();
              }}
              disabled={!draft.apiKey.trim() || !draft.modelName.trim() || status.status === 'testing'}
              className="min-w-[108px] rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
            >
              {status.status === 'testing' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  测试中
                </>
              ) : status.status === 'success' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-success" />
                  已连通
                </>
              ) : status.status === 'error' ? (
                <>
                  <XCircle className="w-4 h-4 mr-1.5 text-red-500" />
                  失败
                </>
              ) : (
                '测试连接'
              )}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-5">
          <div className="font-medium text-slate-700 mb-1">接入说明</div>
          <p>{preset.helpText}</p>
          {status.message && (
            <p className={`mt-2 ${status.status === 'success' ? 'text-green-600' : status.status === 'error' ? 'text-red-500' : 'text-slate-600'}`}>
              {status.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsModal({
  isOpen,
  onClose,
  textConfig,
  videoConfig,
  imageConfig,
  onSave,
}: SettingsModalProps) {
  const [draftTextConfig, setDraftTextConfig] = useState(() => normalizeWorkflowConfig(textConfig, 'text'));
  const [draftVideoConfig, setDraftVideoConfig] = useState(() => normalizeWorkflowConfig(videoConfig, 'video'));
  const [draftImageConfig, setDraftImageConfig] = useState(() => normalizeWorkflowConfig(imageConfig, 'image'));
  const [textStatus, setTextStatus] = useState<ApiCardStatus>({ status: 'idle', message: '' });
  const [videoStatus, setVideoStatus] = useState<ApiCardStatus>({ status: 'idle', message: '' });
  const [imageStatus, setImageStatus] = useState<ApiCardStatus>({ status: 'idle', message: '' });
  const [saveMessage, setSaveMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!isOpen) return;
    setDraftTextConfig(normalizeWorkflowConfig(textConfig, 'text'));
    setDraftVideoConfig(normalizeWorkflowConfig(videoConfig, 'video'));
    setDraftImageConfig(normalizeWorkflowConfig(imageConfig, 'image'));
    setTextStatus({ status: 'idle', message: '' });
    setVideoStatus({ status: 'idle', message: '' });
    setImageStatus({ status: 'idle', message: '' });
    setSaveMessage('');
    setSaveStatus('idle');
  }, [imageConfig, isOpen, textConfig, videoConfig]);

  if (!isOpen) return null;

  const runApiKeyTest = async (type: ApiCapability, draft: WorkflowApiConfigDraft) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(buildApiUrl('/api/test-key'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          provider: draft.provider,
          apiKey: draft.apiKey.trim(),
          apiEndpoint: draft.apiEndpoint.trim(),
          modelName: draft.modelName.trim(),
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text().catch(() => '');
      const result = contentType.includes('application/json')
        ? JSON.parse(rawText || '{}')
        : { ok: false, message: rawText || '服务端返回非 JSON 响应' };
      const detailReason = Array.isArray(result?.details) && result.details[0]?.reason
        ? String(result.details[0].reason)
        : '';
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || detailReason || '连接测试失败');
      }
      return result?.message || '连接成功';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('连接超时，请检查网络后重试');
      }
      throw new Error(error instanceof Error ? error.message : '网络请求失败');
    } finally {
      clearTimeout(timeout);
    }
  };

  const validateConfig = (draft: WorkflowApiConfigDraft, capability: ApiCapability) => {
    if (!draft.apiKey.trim()) return;
    const label = capability === 'text' ? '文案' : capability === 'video' ? '视频' : '生图';
    if (!draft.modelName.trim()) {
      throw new Error(`${label}模型名称不能为空`);
    }
    if (!draft.apiEndpoint.trim()) {
      throw new Error(`${label} API 端点不能为空`);
    }
  };

  const testTextApi = async () => {
    setTextStatus({ status: 'testing', message: '' });
    try {
      validateConfig(draftTextConfig, 'text');
      const message = await runApiKeyTest('text', draftTextConfig);
      setTextStatus({ status: 'success', message });
    } catch (error) {
      setTextStatus({ status: 'error', message: error instanceof Error ? error.message : '连接测试失败' });
    }
  };

  const testVideoApi = async () => {
    setVideoStatus({ status: 'testing', message: '' });
    try {
      validateConfig(draftVideoConfig, 'video');
      const message = await runApiKeyTest('video', draftVideoConfig);
      setVideoStatus({ status: 'success', message });
    } catch (error) {
      setVideoStatus({ status: 'error', message: error instanceof Error ? error.message : '连接测试失败' });
    }
  };

  const testImageApi = async () => {
    setImageStatus({ status: 'testing', message: '' });
    try {
      validateConfig(draftImageConfig, 'image');
      const message = await runApiKeyTest('image', draftImageConfig);
      setImageStatus({ status: 'success', message });
    } catch (error) {
      setImageStatus({ status: 'error', message: error instanceof Error ? error.message : '连接测试失败' });
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    setSaveMessage('');
    try {
      validateConfig(draftTextConfig, 'text');
      validateConfig(draftVideoConfig, 'video');
      validateConfig(draftImageConfig, 'image');
      await onSave({
        text: normalizeWorkflowConfig(draftTextConfig, 'text'),
        video: normalizeWorkflowConfig(draftVideoConfig, 'video'),
        image: normalizeWorkflowConfig(draftImageConfig, 'image'),
      });
      setSaveStatus('success');
      setSaveMessage('已保存到数据库，下次登录会自动加载当前提供商和模型配置');
      onClose();
    } catch (error) {
      setSaveStatus('error');
      setSaveMessage(error instanceof Error ? error.message : '保存失败');
    }
  };

  const resetPreset = (capability: ApiCapability, provider: string) => {
    const preset = getProviderPreset(provider, capability);
    if (!preset) return;
    const updater = capability === 'text' ? setDraftTextConfig : setDraftVideoConfig;
    updater((prev) => ({
      ...prev,
      apiEndpoint: preset.recommendedEndpoint,
      modelName: prev.modelName || (preset.id === 'DOUBAO' ? '' : preset.modelSuggestions[0] || ''),
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">模型与 API 配置</h2>
            <p className="text-sm text-gray-500 mt-1">每条工作流都需要提供商、模型名称、API 端点和 API Key 一起匹配。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ApiConfigCard
              title="第 2 / 4 步 文案模型"
              capability="text"
              draft={draftTextConfig}
              status={textStatus}
              onDraftChange={(nextDraft) => {
                setDraftTextConfig(nextDraft);
                setTextStatus({ status: 'idle', message: '' });
              }}
              onResetToPreset={() => resetPreset('text', draftTextConfig.provider)}
              onTest={testTextApi}
            />
            <ApiConfigCard
              title="第 3 步 视频模型"
              capability="video"
              draft={draftVideoConfig}
              status={videoStatus}
              onDraftChange={(nextDraft) => {
                setDraftVideoConfig(nextDraft);
                setVideoStatus({ status: 'idle', message: '' });
              }}
              onResetToPreset={() => resetPreset('video', draftVideoConfig.provider)}
              onTest={testVideoApi}
            />
            <ApiConfigCard
              title="人物图 生图模型"
              capability="image"
              draft={draftImageConfig}
              status={imageStatus}
              onDraftChange={(nextDraft) => {
                setDraftImageConfig(nextDraft);
                setImageStatus({ status: 'idle', message: '' });
              }}
              onResetToPreset={() => resetPreset('image', draftImageConfig.provider)}
              onTest={testImageApi}
            />
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 leading-5">
            当前建议：
            文案优先选择 OpenAI 兼容文本接口；如果你会传参考图片，请尽量选支持视觉的模型。
            视频当前最稳的是火山方舟 Seedance；其他视频服务只有在它兼容“异步建任务 + taskId 查状态”时才能直接接入。
            人物图建议单独配置 Seedream 或兼容的 images/generations 网关，避免和文案 / 视频模型混用。
          </div>

          {saveStatus === 'error' && (
            <p className="text-sm text-red-500">{saveMessage}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            保存后会加密写入数据库，登录后自动回填到当前用户配置。
          </div>
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={saveStatus === 'saving'}
            className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-[#008CCF] transition-colors text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center"
          >
            {saveStatus === 'saving' && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {saveStatus === 'saving' ? '保存中...' : '保存并关闭'}
          </button>
        </div>
      </div>
    </div>
  );
}
