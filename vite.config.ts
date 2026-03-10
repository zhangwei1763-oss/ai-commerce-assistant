import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

type ApiTestType = 'text' | 'video';
type Step1DataPayload = {
  productName?: string;
  coreSellingPoints?: string;
  painPoints?: string;
  priceAdvantage?: string;
  targetAudiences?: string[];
  imageDataUrls?: string[];
};

type ScriptGenRequest = {
  apiKey: string;
  options?: {
    count?: number;
    durationSeconds?: number;
    styles?: string[];
  };
  promptTemplate?: {
    id?: string;
    name?: string;
    content?: string;
  } | null;
  step1Data?: Step1DataPayload;
};

type ViralAnalysisPayload = {
  openingShot?: string;
  visualCore?: string;
  corePainPoint?: string;
  whyItWentViral?: string;
  hookAnalysis?: string;
  visualAnalysis?: string[];
  conversionAnalysis?: string;
  inferenceNote?: string;
};

type ViralAnalyzeRequest = {
  apiKey: string;
  videoUrl?: string;
  step1Data?: Step1DataPayload;
};

type ViralDeriveRequest = {
  apiKey: string;
  count?: number;
  durationSeconds?: number;
  step1Data?: Step1DataPayload;
  analysis?: ViralAnalysisPayload | null;
};

type ProbeResult = {
  ok: boolean;
  endpoint: string;
  model?: string;
  status?: number;
  reason?: string;
  warning?: string;
};

const DEFAULT_TEXT_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DEFAULT_VIDEO_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const ARK_MODELS_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/models';
const DEFAULT_TEXT_MODEL = 'ep-20260225204603-zcqr4';
const DEFAULT_VIDEO_MODEL = 'ep-20260225204954-4sqgz';
const VIDEO_TEST_IMAGE_URL =
  'https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png';

function getArkModel(type: ApiTestType, env: Record<string, string>) {
  if (type === 'text') {
    return (env.ARK_TEXT_MODEL || env.ARK_MODEL || DEFAULT_TEXT_MODEL).trim();
  }
  return (env.ARK_VIDEO_MODEL || env.ARK_MODEL || DEFAULT_VIDEO_MODEL).trim();
}

function getTestEndpoint(type: ApiTestType, env: Record<string, string>) {
  if (type === 'text') {
    return (env.ARK_TEXT_TEST_ENDPOINT || DEFAULT_TEXT_ENDPOINT).trim();
  }
  return (env.ARK_VIDEO_TEST_ENDPOINT || DEFAULT_VIDEO_ENDPOINT).trim();
}

function buildRequestPayload(type: ApiTestType, model: string) {
  if (type === 'text') {
    return {
      model,
      max_output_tokens: 10,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Hi',
            },
          ],
        },
      ],
    };
  }

  return {
    model,
    content: [
      {
        type: 'text',
        text: '无人机以极快速度穿越复杂障碍 --duration 5 --camerafixed false --watermark true',
      },
      {
        type: 'image_url',
        image_url: {
          url: VIDEO_TEST_IMAGE_URL,
        },
      },
    ],
  };
}

async function probeEndpoint(
  type: ApiTestType,
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestPayload(type, model)),
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true, endpoint, model, status: response.status };
    }

    let errorMessage = '';
    try {
      const errorBody = await response.json();
      errorMessage = errorBody?.error?.message || errorBody?.message || '';
    } catch {
      errorMessage = '';
    }

    if (response.status === 400 && /model/i.test(errorMessage)) {
      // Model mismatch should not be treated as API key failure.
      // Fallback to Ark model-list auth probe so "test connection" can report key validity.
      const authProbe = await probeApiKeyAuth(apiKey);
      if (authProbe.ok) {
        return {
          ok: true,
          endpoint,
          model,
          status: response.status,
          warning: `API Key 可用，但当前模型不可用：${model}`,
        };
      }
      return {
        ok: false,
        endpoint,
        model,
        status: response.status,
        reason: `模型不可用: ${model}`,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        endpoint,
        model,
        status: response.status,
        reason: 'API Key 无效或无权限',
      };
    }

    return {
      ok: false,
      endpoint,
      model,
      status: response.status,
      reason: errorMessage || `接口返回状态码 ${response.status}`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? '请求超时，请检查网络或稍后重试'
        : error instanceof Error
          ? error.message
          : '网络请求失败';
    return {
      ok: false,
      endpoint,
      model,
      reason: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeApiKeyAuth(apiKey: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ARK_MODELS_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true, endpoint: ARK_MODELS_ENDPOINT, status: response.status };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        endpoint: ARK_MODELS_ENDPOINT,
        status: response.status,
        reason: 'API Key 无效或无权限',
      };
    }

    return {
      ok: false,
      endpoint: ARK_MODELS_ENDPOINT,
      status: response.status,
      reason: `鉴权探测失败，状态码 ${response.status}`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? '鉴权探测超时，请检查网络'
        : error instanceof Error
          ? error.message
          : '鉴权探测失败';
    return {
      ok: false,
      endpoint: ARK_MODELS_ENDPOINT,
      reason: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function jsonResponse(res: any, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function extractArkOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const chunks: string[] = [];
  const output = Array.isArray(payload?.output) ? payload.output : [];
  output.forEach((item: any) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((block: any) => {
      if (typeof block?.text === 'string' && block.text.trim()) {
        chunks.push(block.text);
      }
      if (typeof block?.output_text === 'string' && block.output_text.trim()) {
        chunks.push(block.output_text);
      }
    });
  });
  return chunks.join('\n').trim();
}

function parseModelJson(rawText: string) {
  const cleaned = rawText.trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidate = fencedMatch?.[1]?.trim() || cleaned;
  const objectStart = jsonCandidate.indexOf('{');
  const objectEnd = jsonCandidate.lastIndexOf('}');
  const arrayStart = jsonCandidate.indexOf('[');
  const arrayEnd = jsonCandidate.lastIndexOf(']');

  let parseTarget = jsonCandidate;
  if (objectStart >= 0 && objectEnd > objectStart && (arrayStart < 0 || objectStart < arrayStart)) {
    parseTarget = jsonCandidate.slice(objectStart, objectEnd + 1);
  } else if (arrayStart >= 0 && arrayEnd > arrayStart) {
    parseTarget = jsonCandidate.slice(arrayStart, arrayEnd + 1);
  }

  return JSON.parse(parseTarget);
}

function parseScriptsFromModelText(rawText: string, count: number, durationSeconds: number) {
  const parsed = parseModelJson(rawText);
  if (!Array.isArray(parsed)) return [];

  return parsed.slice(0, count).map((item: any, index: number) => ({
    id: index + 1,
    title: String(item?.title || `脚本 ${index + 1}`),
    hook: String(item?.hook || ''),
    narration: String(item?.narration || ''),
    storyboard: Array.isArray(item?.storyboard)
      ? item.storyboard.map((part: unknown) => String(part))
      : [],
    visualPrompt: String(item?.visualPrompt || ''),
    durationSeconds,
  }));
}

async function callArkTextModel(
  env: Record<string, string>,
  apiKey: string,
  prompt: string,
  imageDataUrls: string[] = [],
) {
  const model = getArkModel('text', env);
  const endpoint = getTestEndpoint('text', env);
  const imageBlocks = imageDataUrls
    .filter((item) => typeof item === 'string' && item.startsWith('data:image/'))
    .slice(0, 3)
    .map((imageUrl) => ({
      type: 'input_image',
      image_url: imageUrl,
    }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
              ...imageBlocks,
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `模型调用失败，状态码 ${response.status}`;
    try {
      const errorBody = await response.json();
      message = errorBody?.error?.message || errorBody?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const payload = await response.json();
  const rawText = extractArkOutputText(payload);
  if (!rawText) {
    throw new Error('模型返回为空，请重试');
  }
  return rawText;
}

function getStoryboardTimings(durationSeconds: number) {
  const hookEnd = durationSeconds <= 5 ? 2 : 3;
  let closeStart = durationSeconds <= 5 ? durationSeconds - 1 : durationSeconds <= 10 ? durationSeconds - 3 : durationSeconds - 5;
  closeStart = Math.max(hookEnd + 1, closeStart);
  if (closeStart >= durationSeconds) {
    closeStart = durationSeconds - 1;
  }
  return { hookEnd, closeStart };
}

function buildScriptPrompt(request: ScriptGenRequest) {
  const count = Math.max(1, Math.min(20, Number(request.options?.count || 10)));
  const durationSeconds = Math.max(5, Math.min(60, Number(request.options?.durationSeconds || 15)));
  const styles = Array.isArray(request.options?.styles) && request.options?.styles.length
    ? request.options?.styles
    : ['口语化'];
  const info = request.step1Data || {};
  const audienceText = (info.targetAudiences || []).join('、') || '全人群';
  const templateName = String(request.promptTemplate?.name || '').trim();
  const templateContent = String(request.promptTemplate?.content || '').trim();
  const { hookEnd, closeStart } = getStoryboardTimings(durationSeconds);
  const templateRule = templateContent
    ? `
提示词模板（优先遵循）：
- 模板名称：${templateName || '未命名模板'}
- 模板内容：
${templateContent}

执行要求：
- 在不违背产品信息和脚本要求的前提下，严格按上述模板的表达方式、结构和约束输出。
`
    : '';

  const prompt = `
你现在是一位拥有10年操盘经验的抖音/TikTok/视频号金牌带货短视频编导，
深谙人性弱点、下沉市场痛点、短视频算法推流机制以及极速转化爆款逻辑。
你的文案风格口语化、接地气、极具煽动性，能瞬间在竖屏信息流中抓住用户注意力并引导下单，
请基于下列产品信息生成 ${count} 条不重样的短视频脚本。
必须输出 JSON 数组，不要输出任何解释文字，不要 Markdown。

产品信息：
- 产品名称：${info.productName || ''}
- 核心卖点：${info.coreSellingPoints || ''}
- 主要痛点：${info.painPoints || ''}
- 价格优势：${info.priceAdvantage || ''}
- 目标人群：${audienceText}
${templateRule}

脚本要求：
- 每条脚本时长：${durationSeconds} 秒
- 文案风格：${styles.join('、')}
- 结构固定为三段：0-${hookEnd}秒钩子、${hookEnd}-${closeStart}秒卖点展示、${closeStart}-${durationSeconds}秒转化收口
- 脚本之间开头钩子与表达方式必须差异化

输出 JSON 数组，每项结构如下：
{
  "title": "脚本 1：xxx",
  "hook": "一句开头钩子",
  "narration": "完整口播文案",
  "storyboard": ["0-${hookEnd}秒：...", "${hookEnd}-${closeStart}秒：...", "${closeStart}-${durationSeconds}秒：..."],
  "visualPrompt": "用于视频生成的画面提示词"
}
`;

  return { prompt, count, durationSeconds, styles };
}

function buildStep1Summary(info: Step1DataPayload = {}) {
  return {
    productName: String(info.productName || '').trim(),
    coreSellingPoints: String(info.coreSellingPoints || '').trim(),
    painPoints: String(info.painPoints || '').trim(),
    priceAdvantage: String(info.priceAdvantage || '').trim(),
    audienceText: (info.targetAudiences || []).join('、') || '全人群',
  };
}

function normalizeVisualAnalysis(input: unknown) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/\n|；|;/)
      .map((item) => item.replace(/^[\-•\d.\s]+/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeViralAnalysis(input: any): Required<ViralAnalysisPayload> {
  const visualAnalysis = normalizeVisualAnalysis(input?.visualAnalysis);
  return {
    openingShot: String(input?.openingShot || '').trim(),
    visualCore: String(input?.visualCore || '').trim(),
    corePainPoint: String(input?.corePainPoint || '').trim(),
    whyItWentViral: String(input?.whyItWentViral || '').trim(),
    hookAnalysis: String(input?.hookAnalysis || '').trim(),
    visualAnalysis: visualAnalysis.length ? visualAnalysis : ['未提取到可用的视觉拆解，请重试。'],
    conversionAnalysis: String(input?.conversionAnalysis || '').trim(),
    inferenceNote: String(input?.inferenceNote || '').trim(),
  };
}

function buildViralAnalysisPrompt(request: ViralAnalyzeRequest) {
  const info = buildStep1Summary(request.step1Data);
  return `
你是一位擅长复盘短视频爆款逻辑的带货增长分析师。现在需要对一个爆款对标视频做复盘。

视频链接：${String(request.videoUrl || '').trim()}
当前产品信息：
- 产品名称：${info.productName || '未填写'}
- 核心卖点：${info.coreSellingPoints || '未填写'}
- 核心痛点：${info.painPoints || '未填写'}
- 价格优势：${info.priceAdvantage || '未填写'}
- 目标人群：${info.audienceText}

请严格围绕下面这段任务执行，并把中括号里的内容补全：
“老板，我们之前生成的视频中跑出了超级爆款！现在需复盘并无限放大。爆款视频特征：分镜一(开头)：[填写]视觉核心是：[填写]核心痛点是：[填写]请执行：①拆解为什么会爆？”

输出要求：
1. 如果你能直接利用链接信息分析，就按链接内容输出。
2. 如果你无法直接访问链接真实内容，不要假装看过视频；请基于链接、当前产品信息和带货爆款常见结构进行高可信推断，并在 inferenceNote 中明确说明“以下为推断性拆解”。
3. 只返回 JSON，不要 Markdown，不要额外说明。

请按以下 JSON 结构返回：
{
  "openingShot": "分镜一(开头)的核心描述",
  "visualCore": "视觉核心是什么",
  "corePainPoint": "视频击中的核心痛点",
  "whyItWentViral": "整体为什么会爆，包含节奏、情绪、转化闭环",
  "hookAnalysis": "对开头钩子的拆解",
  "visualAnalysis": ["视觉拆解要点1", "视觉拆解要点2", "视觉拆解要点3"],
  "conversionAnalysis": "核心痛点如何被放大并完成转化",
  "inferenceNote": "如果是推断，请写明；如果不是推断，返回空字符串"
}
`;
}

function buildViralDerivePrompt(request: ViralDeriveRequest) {
  const count = Math.max(1, Math.min(20, Number(request.count || 10)));
  const durationSeconds = Math.max(5, Math.min(60, Number(request.durationSeconds || 15)));
  const info = buildStep1Summary(request.step1Data);
  const analysis = normalizeViralAnalysis(request.analysis || {});
  const { hookEnd, closeStart } = getStoryboardTimings(durationSeconds);

  const prompt = `
你是一位擅长“同款逻辑裂变”的带货短视频编导。

先阅读以下爆款复盘：
- 分镜一(开头)：${analysis.openingShot}
- 视觉核心：${analysis.visualCore}
- 核心痛点：${analysis.corePainPoint}
- 为什么会爆：${analysis.whyItWentViral}
- 黄金3秒钩子分析：${analysis.hookAnalysis}
- 视觉核心拆解：${analysis.visualAnalysis.join('；')}
- 核心痛点转化逻辑：${analysis.conversionAnalysis}
${analysis.inferenceNote ? `- 补充说明：${analysis.inferenceNote}` : ''}

当前产品信息：
- 产品名称：${info.productName || '未填写'}
- 核心卖点：${info.coreSellingPoints || '未填写'}
- 主要痛点：${info.painPoints || '未填写'}
- 价格优势：${info.priceAdvantage || '未填写'}
- 目标人群：${info.audienceText}

现在执行指令：“按同款逻辑生成${count}条新脚本”

要求：
- 保留上面爆款视频的钩子结构、节奏打法、视觉组织方式和痛点转化逻辑
- 但内容必须替换为当前产品，不能直接复制原视频表述
- 每条脚本时长：${durationSeconds} 秒
- 结构固定为三段：0-${hookEnd}秒钩子、${hookEnd}-${closeStart}秒卖点展示、${closeStart}-${durationSeconds}秒转化收口
- 输出 ${count} 条不重样脚本
- 只返回 JSON 数组，不要 Markdown，不要解释

每项必须使用以下格式：
{
  "title": "脚本 1：xxx",
  "hook": "一句开头钩子",
  "narration": "完整口播文案",
  "storyboard": ["0-${hookEnd}秒：...", "${hookEnd}-${closeStart}秒：...", "${closeStart}-${durationSeconds}秒：..."],
  "visualPrompt": "用于视频生成的画面提示词"
}
`;

  return { prompt, count, durationSeconds };
}

function createGenerateScriptsHandler(env: Record<string, string>) {
  return async (req: any, res: any, next: () => void) => {
    const requestPath = String(req.url || '').split('?')[0];
    if (requestPath !== '/api/generate-scripts' && requestPath !== '/api/generate-scripts/') return next();
    if (req.method !== 'POST') {
      return jsonResponse(res, 405, { ok: false, message: 'Method Not Allowed' });
    }

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });

    req.on('end', async () => {
      try {
        const parsed = (body ? JSON.parse(body) : {}) as ScriptGenRequest;
        const apiKey = String(parsed.apiKey || '').trim();
        if (!apiKey) {
          return jsonResponse(res, 400, { ok: false, message: '缺少文案 API Key' });
        }

        if (!String(parsed.step1Data?.productName || '').trim()) {
          return jsonResponse(res, 400, { ok: false, message: '请先在第一步填写产品名称' });
        }

        const { prompt, count, durationSeconds } = buildScriptPrompt(parsed);
        const rawText = await callArkTextModel(env, apiKey, prompt, parsed.step1Data?.imageDataUrls || []);
        const scripts = parseScriptsFromModelText(rawText, count, durationSeconds);
        if (!scripts.length) {
          return jsonResponse(res, 502, {
            ok: false,
            message: '模型返回格式无法解析，请重试',
          });
        }

        return jsonResponse(res, 200, {
          ok: true,
          scripts,
        });
      } catch (error) {
        const message =
          error instanceof Error && error.name === 'AbortError'
            ? '生成超时，请稍后重试'
            : error instanceof Error
              ? error.message
              : '服务端异常';
        return jsonResponse(res, 500, { ok: false, message });
      }
    });
  };
}

function createAnalyzeViralVideoHandler(env: Record<string, string>) {
  return async (req: any, res: any, next: () => void) => {
    const requestPath = String(req.url || '').split('?')[0];
    if (requestPath !== '/api/analyze-viral-video' && requestPath !== '/api/analyze-viral-video/') return next();
    if (req.method !== 'POST') {
      return jsonResponse(res, 405, { ok: false, message: 'Method Not Allowed' });
    }

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });

    req.on('end', async () => {
      try {
        const parsed = (body ? JSON.parse(body) : {}) as ViralAnalyzeRequest;
        const apiKey = String(parsed.apiKey || '').trim();
        const videoUrl = String(parsed.videoUrl || '').trim();
        if (!apiKey) {
          return jsonResponse(res, 400, { ok: false, message: '缺少文案 API Key' });
        }
        if (!videoUrl) {
          return jsonResponse(res, 400, { ok: false, message: '请先输入爆款视频链接' });
        }

        const rawText = await callArkTextModel(
          env,
          apiKey,
          buildViralAnalysisPrompt(parsed),
          parsed.step1Data?.imageDataUrls || [],
        );
        const analysis = normalizeViralAnalysis(parseModelJson(rawText));

        return jsonResponse(res, 200, {
          ok: true,
          analysis,
        });
      } catch (error) {
        return jsonResponse(res, 500, {
          ok: false,
          message: error instanceof Error ? error.message : '爆款拆解失败',
        });
      }
    });
  };
}

function createDeriveViralScriptsHandler(env: Record<string, string>) {
  return async (req: any, res: any, next: () => void) => {
    const requestPath = String(req.url || '').split('?')[0];
    if (requestPath !== '/api/derive-viral-scripts' && requestPath !== '/api/derive-viral-scripts/') return next();
    if (req.method !== 'POST') {
      return jsonResponse(res, 405, { ok: false, message: 'Method Not Allowed' });
    }

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });

    req.on('end', async () => {
      try {
        const parsed = (body ? JSON.parse(body) : {}) as ViralDeriveRequest;
        const apiKey = String(parsed.apiKey || '').trim();
        if (!apiKey) {
          return jsonResponse(res, 400, { ok: false, message: '缺少文案 API Key' });
        }
        if (!parsed.analysis) {
          return jsonResponse(res, 400, { ok: false, message: '请先完成爆款拆解' });
        }

        const { prompt, count, durationSeconds } = buildViralDerivePrompt(parsed);
        const rawText = await callArkTextModel(
          env,
          apiKey,
          prompt,
          parsed.step1Data?.imageDataUrls || [],
        );
        const scripts = parseScriptsFromModelText(rawText, count, durationSeconds);
        if (!scripts.length) {
          return jsonResponse(res, 502, { ok: false, message: '新脚本生成失败：模型返回无法解析' });
        }

        return jsonResponse(res, 200, {
          ok: true,
          scripts,
        });
      } catch (error) {
        return jsonResponse(res, 500, {
          ok: false,
          message: error instanceof Error ? error.message : '新脚本生成失败',
        });
      }
    });
  };
}

/* ── 视频生成：提交任务 ── */
function createGenerateVideoHandler(env: Record<string, string>) {
  return async (req: any, res: any, next: () => void) => {
    const requestPath = String(req.url || '').split('?')[0];
    if (requestPath !== '/api/generate-video' && requestPath !== '/api/generate-video/') return next();
    if (req.method !== 'POST') {
      return jsonResponse(res, 405, { ok: false, message: 'Method Not Allowed' });
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });

    req.on('end', async () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const apiKey = String(parsed.apiKey || '').trim();
        if (!apiKey) {
          return jsonResponse(res, 400, { ok: false, message: '缺少 Seedance API Key' });
        }

        const prompt = String(parsed.prompt || '').trim();
        if (!prompt) {
          return jsonResponse(res, 400, { ok: false, message: '缺少画面提示词' });
        }
        const style = String(parsed.style || '').trim();
        const imageUrl = String(parsed.imageUrl || '').trim();
        const durationRaw = Number(parsed.durationSeconds);
        const durationSeconds = Number.isFinite(durationRaw)
          ? Math.min(60, Math.max(3, Math.round(durationRaw)))
          : 15;
        if (!imageUrl || !imageUrl.startsWith('data:image/')) {
          return jsonResponse(res, 400, { ok: false, message: '图生视频必须提供参考图片' });
        }

        const model = getArkModel('video', env);
        const endpoint = getTestEndpoint('video', env);

        // 构建 Seedance 请求体
        const contentItems: any[] = [
          {
            type: 'text',
            text: `${style ? `画面风格：${style}。` : ''}${prompt} --duration ${durationSeconds} --camerafixed false --watermark true`,
          },
        ];
        contentItems.push({
          type: 'image_url',
          image_url: { url: imageUrl },
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model, content: contentItems }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          let errMsg = `Seedance 任务提交失败，状态码 ${response.status}`;
          try {
            const errBody = await response.json();
            errMsg = errBody?.error?.message || errBody?.message || errMsg;
          } catch { /* ignore */ }
          return jsonResponse(res, response.status, { ok: false, message: errMsg });
        }

        const payload = await response.json();
        const taskId = payload?.id || payload?.task_id || '';
        if (!taskId) {
          return jsonResponse(res, 502, { ok: false, message: '未返回任务 ID' });
        }

        return jsonResponse(res, 200, { ok: true, taskId });
      } catch (error) {
        const message = error instanceof Error ? error.message : '服务端异常';
        return jsonResponse(res, 500, { ok: false, message });
      }
    });
  };
}

/* ── 视频生成：查询任务状态 ── */
function createVideoStatusHandler(env: Record<string, string>) {
  return async (req: any, res: any, next: () => void) => {
    const requestPath = String(req.url || '').split('?')[0];
    if (requestPath !== '/api/video-status' && requestPath !== '/api/video-status/') return next();
    if (req.method !== 'POST') {
      return jsonResponse(res, 405, { ok: false, message: 'Method Not Allowed' });
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });

    req.on('end', async () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const apiKey = String(parsed.apiKey || '').trim();
        const taskId = String(parsed.taskId || '').trim();
        if (!apiKey || !taskId) {
          return jsonResponse(res, 400, { ok: false, message: '缺少 apiKey 或 taskId' });
        }

        const endpoint = getTestEndpoint('video', env);
        const statusUrl = `${endpoint}/${taskId}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let response: Response;
        try {
          response = await fetch(statusUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          return jsonResponse(res, response.status, { ok: false, message: `查询失败：${response.status}` });
        }

        const payload = await response.json();
        const rawStatus = String(payload?.status || payload?.state || payload?.task_status || '').toLowerCase();
        const status =
          rawStatus === 'completed' || rawStatus === 'succeeded'
            ? 'completed'
            : rawStatus === 'failed' || rawStatus === 'error'
              ? 'failed'
              : 'processing';

        const videoUrl =
          payload?.content?.video_url ||
          payload?.output?.video_url ||
          payload?.video_url ||
          payload?.result?.video_url ||
          payload?.result?.url ||
          payload?.data?.video_url ||
          payload?.data?.url ||
          (Array.isArray(payload?.output) ? payload.output.find((item: any) => item?.video_url || item?.url)?.video_url || payload.output.find((item: any) => item?.url)?.url : '') ||
          (Array.isArray(payload?.content) ? payload.content.find((item: any) => item?.video_url || item?.url)?.video_url || payload.content.find((item: any) => item?.url)?.url : '') ||
          '';

        const progress = Number(payload?.progress || payload?.percent || payload?.percentage || 0);
        const error = payload?.error?.message || payload?.error || payload?.message || '';

        return jsonResponse(res, 200, {
          ok: true,
          status,
          videoUrl,
          progress,
          error,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '查询异常';
        return jsonResponse(res, 500, { ok: false, message });
      }
    });
  };
}

function createApiTestHandler(env: Record<string, string>) {
  return async (req: any, res: any, next: () => void) => {
    const requestPath = String(req.url || '').split('?')[0];
    if (requestPath !== '/api/test-key' && requestPath !== '/api/test-key/') return next();
    if (req.method !== 'POST') {
      return jsonResponse(res, 405, { ok: false, message: 'Method Not Allowed' });
    }

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });

    req.on('end', async () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const type = parsed?.type as ApiTestType;
        const apiKey = String(parsed?.apiKey || '').trim();

        if ((type !== 'text' && type !== 'video') || !apiKey) {
          return jsonResponse(res, 400, {
            ok: false,
            message: '参数错误：需要 type(text|video) 和 apiKey',
          });
        }

        const model = getArkModel(type, env);
        if (!model) {
          return jsonResponse(res, 500, {
            ok: false,
            message: `未配置 ${type === 'text' ? 'ARK_TEXT_MODEL' : 'ARK_VIDEO_MODEL'} 或 ARK_MODEL`,
          });
        }

        const endpoint = getTestEndpoint(type, env);
        if (!endpoint) {
          return jsonResponse(res, 500, {
            ok: false,
            message: '未配置可用的测试端点',
          });
        }

        const result = await probeEndpoint(type, endpoint, apiKey, model);
        if (result.ok) {
          const message = result.warning
            ? `连接成功（${endpoint} / ${model}）。${result.warning}`
            : `连接成功（${endpoint} / ${model}）`;
          return jsonResponse(res, 200, {
            ok: true,
            message,
          });
        }

        const authFailed = result.status === 401 || result.status === 403;
        if (authFailed) {
          return jsonResponse(res, 401, {
            ok: false,
            message: '连接失败：API Key 无效或无权限',
            details: [result],
          });
        }

        return jsonResponse(res, 502, {
          ok: false,
          message: '连接失败：未能连通测试端点',
          details: [result],
        });
      } catch (error) {
        return jsonResponse(res, 500, {
          ok: false,
          message: error instanceof Error ? error.message : '服务端异常',
        });
      }
    });
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/storage': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
