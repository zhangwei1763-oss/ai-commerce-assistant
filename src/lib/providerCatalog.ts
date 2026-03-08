export type ApiCapability = 'text' | 'video';

export type ProviderPreset = {
  id: string;
  capability: ApiCapability;
  label: string;
  shortLabel: string;
  description: string;
  recommendedEndpoint: string;
  endpointPlaceholder: string;
  modelPlaceholder: string;
  keyPlaceholder: string;
  helpText: string;
  modelSuggestions: string[];
};

export type WorkflowApiConfigDraft = {
  provider: string;
  apiKey: string;
  apiEndpoint: string;
  modelName: string;
};

export const TEXT_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'DOUBAO',
    capability: 'text',
    label: '火山方舟 Ark',
    shortLabel: 'Ark',
    description: '国内常用。通常填方舟推理接入点 Endpoint ID 作为模型名。',
    recommendedEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    endpointPlaceholder: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    modelPlaceholder: 'ep-xxxxxxxxxxxxxxxx',
    keyPlaceholder: '输入方舟 API Key',
    helpText: '文案链路走 OpenAI Chat Completions 兼容格式；方舟这里的 model 通常是已开通的推理接入点 ID。',
    modelSuggestions: ['ep-你的方舟推理接入点ID'],
  },
  {
    id: 'SILICONFLOW',
    capability: 'text',
    label: 'SiliconFlow',
    shortLabel: 'SiliconFlow',
    description: 'OpenAI 兼容，国内接入方便，模型名直接填平台模型 ID。',
    recommendedEndpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    endpointPlaceholder: 'https://api.siliconflow.cn/v1/chat/completions',
    modelPlaceholder: 'Qwen/Qwen2.5-72B-Instruct',
    keyPlaceholder: '输入 SiliconFlow API Key',
    helpText: '适合直接切换 DeepSeek、Qwen、GLM 等模型。要用图片参考时，建议选支持视觉的模型。',
    modelSuggestions: [
      'deepseek-ai/DeepSeek-V3',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-VL-72B-Instruct',
    ],
  },
  {
    id: 'ALIYUN_BAILIAN',
    capability: 'text',
    label: '阿里百炼',
    shortLabel: '百炼',
    description: 'DashScope OpenAI 兼容模式，适合 Qwen 系列。',
    recommendedEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    endpointPlaceholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    modelPlaceholder: 'qwen-plus',
    keyPlaceholder: '输入 DashScope API Key',
    helpText: '如果你想带图片一起生成文案，优先选 Qwen-VL 系列。',
    modelSuggestions: ['qwen-plus', 'qwen-max', 'qwen-vl-max'],
  },
  {
    id: 'OPENAI',
    capability: 'text',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    description: '国际通用。适合直接用 GPT 系列。',
    recommendedEndpoint: 'https://api.openai.com/v1/chat/completions',
    endpointPlaceholder: 'https://api.openai.com/v1/chat/completions',
    modelPlaceholder: 'gpt-4.1-mini',
    keyPlaceholder: '输入 OpenAI API Key',
    helpText: '如果要把第 1 步图片也一并送进模型，优先用支持视觉的 4o/4.1 系列。',
    modelSuggestions: ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4o'],
  },
  {
    id: 'DEEPSEEK',
    capability: 'text',
    label: 'DeepSeek',
    shortLabel: 'DeepSeek',
    description: 'DeepSeek 官方接口，适合 deepseek-chat / deepseek-reasoner。',
    recommendedEndpoint: 'https://api.deepseek.com/chat/completions',
    endpointPlaceholder: 'https://api.deepseek.com/chat/completions',
    modelPlaceholder: 'deepseek-chat',
    keyPlaceholder: '输入 DeepSeek API Key',
    helpText: 'DeepSeek 官方当前以文本模型为主，如果你启用了参考图片，建议改用支持视觉的提供商或清空图片再试。',
    modelSuggestions: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'CUSTOM_TEXT',
    capability: 'text',
    label: '自定义文本网关',
    shortLabel: '自定义',
    description: '适合 OpenAI Chat Completions 兼容网关或代理服务。',
    recommendedEndpoint: '',
    endpointPlaceholder: 'https://your-gateway.example.com/v1/chat/completions',
    modelPlaceholder: '填写该网关支持的模型名',
    keyPlaceholder: '输入该网关 API Key',
    helpText: '这里请填写完整的 Chat Completions URL，不会自动帮你补路径。',
    modelSuggestions: [],
  },
];

export const VIDEO_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'SEEDANCE',
    capability: 'video',
    label: '火山方舟 Seedance',
    shortLabel: 'Seedance',
    description: '当前第 3 步已接成真实异步图生视频任务链路。',
    recommendedEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    endpointPlaceholder: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    modelPlaceholder: 'doubao-seedance-1-0-lite-i2v-250428',
    keyPlaceholder: '输入 Seedance / 方舟视频 API Key',
    helpText: '视频链路会先创建远程任务，再轮询状态并把结果下载回本地存储。',
    modelSuggestions: ['doubao-seedance-1-0-lite-i2v-250428'],
  },
  {
    id: 'CUSTOM_VIDEO',
    capability: 'video',
    label: '自定义视频网关',
    shortLabel: '自定义',
    description: '适合兼容当前异步任务接口的第三方视频服务。',
    recommendedEndpoint: '',
    endpointPlaceholder: 'https://your-video-provider.example.com/api/v3/contents/generations/tasks',
    modelPlaceholder: '填写该视频服务支持的模型名',
    keyPlaceholder: '输入该视频服务 API Key',
    helpText: '这里请填写完整的异步任务创建 URL，服务需要支持创建任务和按 taskId 查询状态。',
    modelSuggestions: [],
  },
];

export const LEGACY_PROVIDER_META: Record<string, Pick<ProviderPreset, 'label' | 'shortLabel'>> = {
  GEMINI: {
    label: 'Gemini (旧配置)',
    shortLabel: 'Gemini',
  },
};

export const TEXT_PROVIDER_IDS = new Set([
  ...TEXT_PROVIDER_PRESETS.map((item) => item.id),
  'GEMINI',
]);

export const VIDEO_PROVIDER_IDS = new Set(VIDEO_PROVIDER_PRESETS.map((item) => item.id));

export function isTextProvider(provider?: string | null) {
  return TEXT_PROVIDER_IDS.has((provider || '').toUpperCase());
}

export function isVideoProvider(provider?: string | null) {
  return VIDEO_PROVIDER_IDS.has((provider || '').toUpperCase());
}

export function getProviderPreset(provider?: string | null, capability?: ApiCapability) {
  const normalized = (provider || '').toUpperCase();
  const pool = capability === 'video'
    ? VIDEO_PROVIDER_PRESETS
    : capability === 'text'
      ? TEXT_PROVIDER_PRESETS
      : [...TEXT_PROVIDER_PRESETS, ...VIDEO_PROVIDER_PRESETS];
  return pool.find((item) => item.id === normalized) || null;
}

export function getProviderDisplayName(provider?: string | null) {
  const preset = getProviderPreset(provider);
  if (preset) return preset.label;
  const legacy = LEGACY_PROVIDER_META[(provider || '').toUpperCase()];
  return legacy?.label || provider || '未命名提供商';
}

export function getDefaultConfig(capability: ApiCapability): WorkflowApiConfigDraft {
  const preset = capability === 'text' ? TEXT_PROVIDER_PRESETS[0] : VIDEO_PROVIDER_PRESETS[0];
  return {
    provider: preset.id,
    apiKey: '',
    apiEndpoint: preset.recommendedEndpoint,
    modelName: capability === 'text' && preset.id === 'DOUBAO'
      ? ''
      : preset.modelSuggestions[0] || '',
  };
}

export function normalizeWorkflowConfig(
  value: Partial<WorkflowApiConfigDraft> | null | undefined,
  capability: ApiCapability,
): WorkflowApiConfigDraft {
  const fallback = getDefaultConfig(capability);
  const provider = (value?.provider || fallback.provider).toUpperCase();
  const preset = getProviderPreset(provider, capability) || getProviderPreset(fallback.provider, capability)!;
  return {
    provider: preset.id,
    apiKey: value?.apiKey || '',
    apiEndpoint: value?.apiEndpoint || preset.recommendedEndpoint,
    modelName: value?.modelName || (preset.id === 'DOUBAO' ? '' : preset.modelSuggestions[0] || ''),
  };
}
