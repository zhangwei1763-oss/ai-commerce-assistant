import React, { useEffect, useMemo, useRef } from 'react';
import { UploadCloud, X } from 'lucide-react';
import type { Step1FormData } from '../../App';

const defaultAudiences = ['打工人', '宝妈', '学生党', '上班族', '全人群'];

type Step1Props = {
  onNext: () => void;
  formData: Step1FormData;
  setFormData: React.Dispatch<React.SetStateAction<Step1FormData>>;
};

export default function Step1({ onNext, formData, setFormData }: Step1Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const imagePreviews = useMemo(
    () =>
      formData.referenceImages.map((file) => ({
        key: `${file.name}-${file.lastModified}-${file.size}`,
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [formData.referenceImages],
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [imagePreviews]);

  const updateField = <K extends keyof Step1FormData>(key: K, value: Step1FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleAudience = (audience: string) => {
    setFormData((prev) => ({
      ...prev,
      targetAudiences: prev.targetAudiences.includes(audience)
        ? prev.targetAudiences.filter((item) => item !== audience)
        : [...prev.targetAudiences, audience],
    }));
  };

  const addCustomAudience = () => {
    const audience = formData.customAudienceInput.trim();
    if (!audience) return;
    setFormData((prev) => ({
      ...prev,
      targetAudiences: prev.targetAudiences.includes(audience)
        ? prev.targetAudiences
        : [...prev.targetAudiences, audience],
      customAudienceInput: '',
    }));
  };

  const removeAudience = (audience: string) => {
    setFormData((prev) => ({
      ...prev,
      targetAudiences: prev.targetAudiences.filter((item) => item !== audience),
    }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incomingFiles: File[] = event.target.files ? Array.from(event.target.files) : [];
    if (!incomingFiles.length) return;

    setFormData((prev) => {
      const existed = new Set(
        prev.referenceImages.map((file) => `${file.name}-${file.lastModified}-${file.size}`),
      );
      const merged: File[] = [...prev.referenceImages];
      incomingFiles.forEach((file) => {
        const key = `${file.name}-${file.lastModified}-${file.size}`;
        if (!existed.has(key)) {
          merged.push(file);
          existed.add(key);
        }
      });
      return { ...prev, referenceImages: merged };
    });
    event.target.value = '';
  };

  const removeImage = (key: string) => {
    setFormData((prev) => ({
      ...prev,
      referenceImages: prev.referenceImages.filter(
        (file) => `${file.name}-${file.lastModified}-${file.size}` !== key,
      ),
    }));
  };

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      <h2 className="text-title mb-6">构建AI带货大脑</h2>
      
      <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6 mb-6 hover:shadow-md transition-shadow">
        <div className="space-y-5">
          <div>
            <label className="block text-subtitle mb-1.5">产品名称</label>
            <input 
              type="text" 
              value={formData.productName}
              onChange={(e) => updateField('productName', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-body focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
              placeholder="例如：智能颈椎按摩仪"
            />
          </div>
          
          <div>
            <label className="block text-subtitle mb-1.5">核心卖点</label>
            <textarea 
              value={formData.coreSellingPoints}
              onChange={(e) => updateField('coreSellingPoints', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-body h-20 resize-none focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
              placeholder="最多3个，用逗号分隔。例如：TENS脉冲技术，42度恒温热敷，150g超轻便携"
            ></textarea>
          </div>
          
          <div>
            <label className="block text-subtitle mb-1.5">主要痛点</label>
            <textarea 
              value={formData.painPoints}
              onChange={(e) => updateField('painPoints', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-body h-20 resize-none focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
              placeholder="目标用户的核心痛点。例如：久坐低头导致颈椎酸痛僵硬，去按摩店太贵太耗时"
            ></textarea>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-subtitle mb-1.5">价格优势</label>
              <input 
                type="text" 
                value={formData.priceAdvantage}
                onChange={(e) => updateField('priceAdvantage', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-body focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
                placeholder="例如：原价299，直播间99"
              />
            </div>
            <div>
              <label className="block text-subtitle mb-1.5">目标人群</label>
              <div className="border border-gray-300 rounded p-2 bg-white">
                <div className="flex flex-wrap gap-2 mb-2">
                  {defaultAudiences.map((audience) => {
                    const checked = formData.targetAudiences.includes(audience);
                    return (
                      <button
                        key={audience}
                        type="button"
                        onClick={() => toggleAudience(audience)}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                          checked
                            ? 'bg-accent text-white border-accent'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-accent'
                        }`}
                      >
                        {audience}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.customAudienceInput}
                    onChange={(e) => updateField('customAudienceInput', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomAudience();
                      }
                    }}
                    placeholder="自定义人群，例如：银发族"
                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  />
                  <button
                    type="button"
                    onClick={addCustomAudience}
                    className="px-3 py-1.5 text-xs bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                  >
                    添加
                  </button>
                </div>
                {formData.targetAudiences.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formData.targetAudiences.map((audience) => (
                      <span
                        key={audience}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-blue-50 text-accent border border-blue-100"
                      >
                        {audience}
                        <button
                          type="button"
                          onClick={() => removeAudience(audience)}
                          className="text-gray-500 hover:text-red-500"
                          aria-label={`删除${audience}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-subtitle mb-1.5">产品参考图 (可选)</label>
            <div 
              onClick={handleUploadClick}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              <UploadCloud className="w-8 h-8 mb-2" />
              <span className="text-sm font-medium">点击或拖拽上传产品图片</span>
              <span className="text-xs text-gray-400 mt-1">支持 JPG, PNG 格式，用于辅助生成视频画面</span>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/jpeg, image/png" 
              onChange={handleFileChange}
              multiple 
            />
            {imagePreviews.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-success mb-2">已上传 {imagePreviews.length} 张参考图</p>
                <div className="grid grid-cols-3 gap-2">
                  {imagePreviews.map((item) => (
                    <div key={item.key} className="relative border border-gray-200 rounded overflow-hidden">
                      <img src={item.url} alt={item.name} className="w-full h-20 object-cover bg-gray-100" />
                      <div className="px-1.5 py-1 text-[10px] text-gray-600 truncate bg-white">
                        {item.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(item.key)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
                        aria-label={`删除${item.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <p className="text-subtext flex items-center">
          <span className="w-2 h-2 rounded-full bg-accent mr-2"></span>
          系统将调用豆包API，自动确认产品信息并准备生成脚本
        </p>
        <div className="flex space-x-3">
          <button 
            onClick={onNext}
            className="px-6 py-2 bg-accent text-white rounded hover:bg-[#008CCF] transition-colors text-btn shadow-sm"
          >
            开始生成视频脚本
          </button>
        </div>
      </div>
    </div>
  );
}
