import React, { useMemo, useState } from 'react';
import { Copy, CheckSquare, Loader2, FileText } from 'lucide-react';
import type { GeneratedScript, Step1FormData } from '../../App';
import PromptTemplateSelector from '../PromptTemplateSelector';
import { buildApiUrl } from '../../services/api';

type Step2Props = {
  onNext: () => void;
  step1Data: Step1FormData;
  textApiKey: string;
  textProvider: string;
  textApiEndpoint: string;
  textModelName: string;
  scripts: GeneratedScript[];
  setScripts: React.Dispatch<React.SetStateAction<GeneratedScript[]>>;
};

const styleOptions = ['口语化', '煽动性', '专业风', '亲和力'] as const;

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`图片读取失败: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

export default function Step2({
  onNext,
  step1Data,
  textApiKey,
  textProvider,
  textApiEndpoint,
  textModelName,
  scripts,
  setScripts,
}: Step2Props) {
  const [count, setCount] = useState(10);
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [styles, setStyles] = useState<string[]>(['口语化', '煽动性']);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isTemplateSelectorOpen, setIsTemplateSelectorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);

  const selectedStyleLabel = useMemo(() => styles.join('+') || '未选择风格', [styles]);

  const toggleStyle = (style: string) => {
    setStyles((prev) => (prev.includes(style) ? prev.filter((item) => item !== style) : [...prev, style]));
  };

  const copyScript = async (script: GeneratedScript) => {
    const content = [
      script.title,
      `钩子: ${script.hook}`,
      `口播文案: ${script.narration}`,
      `三分镜: ${script.storyboard.join(' / ')}`,
      `画面提示词: ${script.visualPrompt}`,
    ].join('\n');
    await navigator.clipboard.writeText(content);
  };

  const generateScripts = async () => {
    if (isGenerating) return;
    if (!textApiKey.trim()) {
      setErrorMessage('请先在设置中填写文案 API Key 并测试连接');
      return;
    }
    if (!step1Data.productName.trim()) {
      setErrorMessage('请先在第一步填写产品名称');
      return;
    }

    setErrorMessage('');
    setIsGenerating(true);
    setProgress(10);

    let progressTimer: number | undefined;
    try {
      progressTimer = window.setInterval(() => {
        setProgress((prev) => (prev >= 90 ? prev : prev + 3));
      }, 1000);

      const imageDataUrls = await Promise.all(
        step1Data.referenceImages.slice(0, 3).map((file) => toDataUrl(file)),
      );
      setProgress(35);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 130000);
      let response: Response;
      try {
        response = await fetch(buildApiUrl('/api/generate-scripts'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiKey: textApiKey,
            provider: textProvider,
            apiEndpoint: textApiEndpoint,
            modelName: textModelName,
            options: {
              count,
              durationSeconds,
              styles,
            },
            promptTemplate: selectedTemplate
              ? {
                  id: selectedTemplate.id,
                  name: selectedTemplate.name,
                  content: selectedTemplate.content,
                }
              : null,
            step1Data: {
              productName: step1Data.productName,
              coreSellingPoints: step1Data.coreSellingPoints,
              painPoints: step1Data.painPoints,
              priceAdvantage: step1Data.priceAdvantage,
              targetAudiences: step1Data.targetAudiences,
              imageDataUrls,
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      setProgress(80);

      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();
      const result = contentType.includes('application/json')
        ? JSON.parse(rawText || '{}')
        : { ok: false, message: rawText || '服务端返回非 JSON 响应' };

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || '文案生成失败');
      }

      const nextScripts: GeneratedScript[] = Array.isArray(result.scripts)
        ? result.scripts.map((item: any, index: number) => ({
            id: Number(item?.id || index + 1),
            title: String(item?.title || `脚本 ${index + 1}`),
            hook: String(item?.hook || ''),
            narration: String(item?.narration || ''),
            storyboard: Array.isArray(item?.storyboard)
              ? item.storyboard.map((part: unknown) => String(part))
              : [],
            visualPrompt: String(item?.visualPrompt || ''),
            durationSeconds: Number.isFinite(Number(item?.durationSeconds))
              ? Number(item.durationSeconds)
              : durationSeconds,
          }))
        : [];
      if (!nextScripts.length) {
        throw new Error('文案生成失败：未返回可用脚本');
      }

      setScripts(nextScripts);
      setProgress(100);
    } catch (error) {
      const msg =
        error instanceof DOMException && error.name === 'AbortError'
          ? `生成超时（模型正在思考中）。建议：减少生成数量（当前${count}条），或缩短脚本时长后重试。`
          : error instanceof Error
            ? error.message
            : '文案生成失败';
      setErrorMessage(msg);
    } finally {
      if (progressTimer !== undefined) window.clearInterval(progressTimer);
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-title mb-4 flex-shrink-0">批量生成带货脚本</h2>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-5 mb-4 flex-shrink-0">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="block text-subtitle mb-2">生成数量: {count}条</label>
            <input
              type="range"
              min="1"
              max="20"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-subtext mt-1">
              <span>1</span>
              <span>20</span>
            </div>
          </div>

          <div>
            <label className="block text-subtitle mb-2">脚本时长</label>
            <div className="flex space-x-4 mt-1">
              {[5, 10, 15].map((seconds) => (
                <label key={seconds} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="duration"
                    checked={durationSeconds === seconds}
                    onChange={() => setDurationSeconds(seconds)}
                    className="text-accent focus:ring-accent"
                  />
                  <span>{seconds}秒</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-subtitle mb-2">文案风格</label>
            <div className="flex flex-wrap gap-3 mt-1">
              {styleOptions.map((style) => (
                <label key={style} className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={styles.includes(style)}
                    onChange={() => toggleStyle(style)}
                    className="rounded text-accent focus:ring-accent"
                  />
                  <span>{style}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex justify-between items-center mb-3">
            <button
              type="button"
              onClick={() => { void generateScripts(); }}
              disabled={isGenerating}
              className="px-4 py-1.5 bg-accent text-white rounded hover:bg-[#008CCF] transition-colors text-sm shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center"
            >
              {isGenerating && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {isGenerating ? '生成中...' : '开始生成文案'}
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsTemplateSelectorOpen(true)}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                选择提示词模版
              </button>
              <span className="text-xs text-gray-500">
                输入源：第1步产品参数 + {Math.min(step1Data.referenceImages.length, 3)} 张参考图
              </span>
            </div>
          </div>
          {selectedTemplate && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-blue-800 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  当前提示词模版：{selectedTemplate.name}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate(null)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  清除
                </button>
              </div>
              <p className="text-xs text-blue-600 line-clamp-1">{selectedTemplate.content}</p>
            </div>
          )}
          <div className="flex justify-between text-subtext mb-1.5">
            <span>文案生成进度：{progress}%{isGenerating && progress < 90 ? '（AI 正在思考中...）' : ''}</span>
            <span className={isGenerating ? 'text-accent animate-pulse' : progress === 100 ? 'text-success' : 'text-gray-500'}>
              {isGenerating ? `生成 ${count} 条中...` : progress === 100 ? `已完成 ${scripts.length} 条` : '待开始'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-accent h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
          </div>
          {errorMessage && <p className="text-xs text-red-500 mt-2">{errorMessage}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-4">
        {scripts.length === 0 && (
          <div className="bg-card rounded-lg shadow-sm border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            点击“开始生成文案”后，这里会显示裂变脚本结果
          </div>
        )}
        {scripts.map((script) => (
          <div key={script.id} className="bg-card rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow relative group">
            <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => copyScript(script)}
                className="p-1.5 text-gray-400 hover:text-accent hover:bg-blue-50 rounded"
                title="复制"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center mb-3">
              <span className="bg-primary text-white text-xs px-2 py-0.5 rounded mr-2">{script.title}</span>
              <span className="text-subtext">{durationSeconds}秒 · {selectedStyleLabel}</span>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-3 border-r border-gray-100 pr-4">
                <div className="text-xs font-bold text-gray-500 mb-2">三分镜结构</div>
                <ul className="space-y-2 text-xs">
                  {script.storyboard.map((item) => (
                    <li key={item} className="flex items-start">
                      <span className="text-accent mr-1">■</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="col-span-5 border-r border-gray-100 pr-4">
                <div className="text-xs font-bold text-gray-500 mb-2">口播文案</div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{script.narration}</p>
              </div>
              <div className="col-span-4">
                <div className="text-xs font-bold text-gray-500 mb-2">画面提示词 (Seedance)</div>
                <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 h-full whitespace-pre-wrap">
                  {script.visualPrompt}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-auto flex-shrink-0">
        <button type="button" className="flex items-center px-4 py-2 text-text-main hover:bg-gray-100 rounded transition-colors text-btn">
          <CheckSquare className="w-4 h-4 mr-2 text-accent" />
          全选脚本
        </button>
        <button
          onClick={onNext}
          disabled={scripts.length === 0}
          className="px-6 py-2 bg-accent text-white rounded hover:bg-[#008CCF] transition-colors text-btn shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          下一步：生成视频
        </button>
      </div>

      <PromptTemplateSelector
        isOpen={isTemplateSelectorOpen}
        onClose={() => setIsTemplateSelectorOpen(false)}
        onSelect={(template) => setSelectedTemplate(template)}
        selectedTemplateId={selectedTemplate?.id}
      />
    </div>
  );
}
