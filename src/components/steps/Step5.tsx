import React, { useMemo, useRef, useState } from 'react';
import { Link, Zap, BarChart2, RefreshCw, Loader2, AlertCircle, UploadCloud, X } from 'lucide-react';
import type {
  GeneratedScript,
  Step1FormData,
  Step4FlowState,
  UploadedReferenceImage,
} from '../../App';

type Step5Props = {
  onNext: () => void;
  textApiKey: string;
  step1Data: Step1FormData;
  generatedScripts: GeneratedScript[];
  flowState: Step4FlowState;
  setFlowState: React.Dispatch<React.SetStateAction<Step4FlowState>>;
  onApplyGeneratedScripts: (scripts: GeneratedScript[]) => void;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`图片读取失败: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function Step5({
  textApiKey,
  step1Data,
  generatedScripts,
  flowState,
  setFlowState,
  onApplyGeneratedScripts,
}: Step5Props) {
  const [errorMessage, setErrorMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const { videoUrl, analysis, productImages } = flowState;
  const selectedCount = flowState.deriveCount ?? 10;
  const selectedDuration = flowState.deriveDurationSeconds ?? generatedScripts[0]?.durationSeconds ?? 15;

  const generateSummary = useMemo(
    () => `本次将按当前产品信息生成 ${selectedCount} 条 ${selectedDuration} 秒脚本，并回填到第2步脚本展示栏。`,
    [selectedCount, selectedDuration],
  );

  const handleUploadImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = event.target.files ? Array.from(event.target.files) : [];
    if (!files.length) return;

    try {
      const nextItems = await Promise.all(
        files.map(async (file) => ({
          id: `${file.name}-${file.lastModified}-${file.size}`,
          name: file.name,
          dataUrl: await fileToDataUrl(file),
        })),
      );

      setFlowState((prev) => {
        const existed = new Set(prev.productImages.map((item) => item.id));
        const merged: UploadedReferenceImage[] = [...prev.productImages];
        nextItems.forEach((item) => {
          if (!existed.has(item.id)) {
            merged.push(item);
            existed.add(item.id);
          }
        });
        return { ...prev, productImages: merged };
      });
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      event.target.value = '';
    }
  };

  const removeUploadedImage = (id: string) => {
    setFlowState((prev) => ({
      ...prev,
      productImages: prev.productImages.filter((item) => item.id !== id),
    }));
  };

  const handleAnalyze = async () => {
    if (isAnalyzing) return;
    if (!textApiKey.trim()) {
      setErrorMessage('请先在设置中填写文案 API Key 并测试连接');
      return;
    }
    if (!videoUrl.trim()) {
      setErrorMessage('请先输入爆款视频链接');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/analyze-viral-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: textApiKey,
          videoUrl: videoUrl.trim(),
          step1Data: {
            productName: step1Data.productName,
            coreSellingPoints: step1Data.coreSellingPoints,
            painPoints: step1Data.painPoints,
            priceAdvantage: step1Data.priceAdvantage,
            targetAudiences: step1Data.targetAudiences,
            imageDataUrls: productImages.map((item) => item.dataUrl),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.analysis) {
        throw new Error(data?.message || '爆款拆解失败');
      }
      setFlowState((prev) => ({
        ...prev,
        analysis: data.analysis,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '爆款拆解失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateScripts = async () => {
    if (isGenerating) return;
    if (!analysis) {
      setErrorMessage('请先完成 AI 深度拆解');
      return;
    }
    if (!textApiKey.trim()) {
      setErrorMessage('请先在设置中填写文案 API Key 并测试连接');
      return;
    }

    setIsGenerating(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/derive-viral-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: textApiKey,
          count: selectedCount,
          durationSeconds: selectedDuration,
          analysis,
          step1Data: {
            productName: step1Data.productName,
            coreSellingPoints: step1Data.coreSellingPoints,
            painPoints: step1Data.painPoints,
            priceAdvantage: step1Data.priceAdvantage,
            targetAudiences: step1Data.targetAudiences,
            imageDataUrls: productImages.map((item) => item.dataUrl),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !Array.isArray(data?.scripts) || !data.scripts.length) {
        throw new Error(data?.message || '新脚本生成失败');
      }
      onApplyGeneratedScripts(data.scripts as GeneratedScript[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '新脚本生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-title mb-4 flex-shrink-0">爆款数据回流 + 自我进化</h2>
      
      <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6 mb-6 flex-shrink-0">
        <h3 className="text-subtitle mb-4 flex items-center">
          <Link className="w-4 h-4 mr-2 text-accent" />
          输入爆款对标视频
        </h3>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleUploadImages(e);
          }}
        />
        <div className="flex space-x-3">
          <input
            type="text"
            value={videoUrl}
            onChange={(e) =>
              setFlowState((prev) => ({
                ...prev,
                videoUrl: e.target.value,
              }))
            }
            placeholder="粘贴抖音/快手爆款视频链接..."
            className="flex-1 border border-gray-300 rounded px-4 py-2 text-sm focus:border-accent outline-none"
          />
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="px-4 py-2 border border-dashed border-gray-300 text-gray-700 rounded hover:border-accent hover:text-accent hover:bg-blue-50 transition-colors text-btn flex items-center shadow-sm"
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            上传产品图片
          </button>
          <button
            type="button"
            onClick={() => {
              void handleAnalyze();
            }}
            disabled={isAnalyzing}
            className="px-6 py-2 bg-primary text-white rounded hover:bg-[#153A5B] transition-colors text-btn flex items-center shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            {isAnalyzing ? '拆解中...' : 'AI 深度拆解'}
          </button>
        </div>
        {productImages.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-2">已上传 {productImages.length} 张产品图，将一同传给 AI 分析与脚本生成</div>
            <div className="flex flex-wrap gap-2">
              {productImages.map((item) => (
                <div key={item.id} className="relative w-16 h-16 rounded border border-gray-200 overflow-hidden bg-gray-50 group">
                  <img src={item.dataUrl} alt={item.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeUploadedImage(item.id)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`删除${item.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="mt-3 text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-2 flex items-start">
            <AlertCircle className="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="col-span-2 bg-card rounded-lg shadow-sm border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-lg flex items-center">
            <BarChart2 className="w-4 h-4 mr-2 text-gray-500" />
            <h3 className="text-subtitle">爆款基因分析结果</h3>
          </div>
          <div className="p-5 overflow-y-auto space-y-5">
            {!analysis ? (
              <div className="h-full min-h-[320px] flex items-center justify-center text-sm text-gray-400">
                输入爆款视频链接后点击“AI 深度拆解”，这里会展示分析结果
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <div className="text-[11px] text-blue-600 mb-1">分镜一(开头)</div>
                    <div className="text-sm text-gray-700 leading-relaxed">{analysis.openingShot}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                    <div className="text-[11px] text-emerald-600 mb-1">视觉核心</div>
                    <div className="text-sm text-gray-700 leading-relaxed">{analysis.visualCore}</div>
                  </div>
                  <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                    <div className="text-[11px] text-orange-600 mb-1">核心痛点</div>
                    <div className="text-sm text-gray-700 leading-relaxed">{analysis.corePainPoint}</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-800 mb-2 border-l-3 border-accent pl-2">黄金3秒钩子分析</h4>
                  <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded text-justify whitespace-pre-wrap">
                    {analysis.hookAnalysis}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-800 mb-2 border-l-3 border-success pl-2">视觉核心拆解</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    {analysis.visualAnalysis.map((item) => (
                      <li key={item} className="flex items-start">
                        <span className="text-success mr-2">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-800 mb-2 border-l-3 border-warning pl-2">核心痛点转化逻辑</h4>
                  <p className="text-sm text-gray-600 bg-orange-50 p-3 rounded text-justify whitespace-pre-wrap">
                    {analysis.conversionAnalysis}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-800 mb-2 border-l-3 border-primary pl-2">为什么会爆</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded text-justify whitespace-pre-wrap">
                    {analysis.whyItWentViral}
                  </p>
                </div>

                {analysis.inferenceNote && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                    {analysis.inferenceNote}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        
        <div className="col-span-1 bg-card rounded-lg shadow-sm border border-gray-200 flex flex-col p-5">
          <h3 className="text-subtitle mb-4 text-center">闭环进化</h3>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <RefreshCw className="w-10 h-10 text-accent" />
            </div>
            <p className="text-sm text-gray-600 mb-6">
              已提取该爆款的底层逻辑<br/>
              可将其作为新的"AI大脑"模板<br/>
              生成下一批裂变脚本
            </p>
            <button
              type="button"
              onClick={() => {
                void handleGenerateScripts();
              }}
              disabled={!analysis || isGenerating}
              className="w-full py-3 bg-accent text-white rounded hover:bg-[#008CCF] transition-colors text-btn shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              {isGenerating ? '生成中...' : `按此逻辑生成${selectedCount}条新脚本`}
            </button>
            <div className="w-full mt-3 grid grid-cols-2 gap-3 text-left">
              <label className="block">
                <span className="text-[11px] text-gray-500 mb-1 block">生成条数</span>
                <select
                  value={selectedCount}
                  onChange={(e) =>
                    setFlowState((prev) => ({
                      ...prev,
                      deriveCount: Number(e.target.value),
                    }))
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-accent outline-none bg-white"
                >
                  {[5, 10, 15, 20].map((count) => (
                    <option key={count} value={count}>
                      {count} 条
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500 mb-1 block">脚本时长</span>
                <select
                  value={selectedDuration}
                  onChange={(e) =>
                    setFlowState((prev) => ({
                      ...prev,
                      deriveDurationSeconds: Number(e.target.value),
                    }))
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-accent outline-none bg-white"
                >
                  {[5, 10, 15].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} 秒
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
              {generateSummary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
