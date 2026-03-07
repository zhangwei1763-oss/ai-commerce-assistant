import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import StatusBar from './components/StatusBar';
import Step1 from './components/steps/Step1';
import Step2 from './components/steps/Step2';
import Step3 from './components/steps/Step3';
import Step5 from './components/steps/Step5';
import SettingsModal from './components/SettingsModal';
import PromptTemplateModal from './components/PromptTemplateModal';
import { useAuth } from './contexts/AuthContext';
import { userApi, type StoredApiKey } from './services/api';

export type Step1FormData = {
  productName: string;
  coreSellingPoints: string;
  painPoints: string;
  priceAdvantage: string;
  targetAudiences: string[];
  customAudienceInput: string;
  referenceImages: File[];
};

export type GeneratedScript = {
  id: number;
  title: string;
  hook: string;
  narration: string;
  storyboard: string[];
  visualPrompt: string;
  durationSeconds?: number;
};

export type Step3VideoTask = {
  scriptId: number;
  scriptTitle: string;
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
};

export type ViralAnalysis = {
  openingShot: string;
  visualCore: string;
  corePainPoint: string;
  whyItWentViral: string;
  hookAnalysis: string;
  visualAnalysis: string[];
  conversionAnalysis: string;
  inferenceNote?: string;
};

export type UploadedReferenceImage = {
  id: string;
  name: string;
  dataUrl: string;
};

export type Step4FlowState = {
  videoUrl: string;
  analysis: ViralAnalysis | null;
  productImages: UploadedReferenceImage[];
  deriveCount?: number;
  deriveDurationSeconds?: number;
};

export default function App() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromptTemplatesOpen, setIsPromptTemplatesOpen] = useState(false);
  const [storedTextApiKey, setStoredTextApiKey] = useState<StoredApiKey | null>(null);
  const [storedVideoApiKey, setStoredVideoApiKey] = useState<StoredApiKey | null>(null);
  const [step1Data, setStep1Data] = useState<Step1FormData>({
    productName: '',
    coreSellingPoints: '',
    painPoints: '',
    priceAdvantage: '',
    targetAudiences: [],
    customAudienceInput: '',
    referenceImages: [],
  });
  const [generatedScripts, setGeneratedScripts] = useState<GeneratedScript[]>([]);
  const [step3VideoTasks, setStep3VideoTasks] = useState<Step3VideoTask[]>([]);
  const [step4FlowState, setStep4FlowState] = useState<Step4FlowState>({
    videoUrl: 'https://v.douyin.com/idXyZ123/',
    analysis: null,
    productImages: [],
  });

  const textApiKey = storedTextApiKey?.api_key || '';
  const videoApiKey = storedVideoApiKey?.api_key || '';

  useEffect(() => {
    const loadUserApiKeys = async () => {
      const response = await userApi.listApiKeys();
      if (!response.ok || !Array.isArray(response.data)) {
        setStoredTextApiKey(null);
        setStoredVideoApiKey(null);
        return;
      }

      const keys = response.data as StoredApiKey[];
      const nextTextKey = keys.find((item) => item.provider === 'DOUBAO')
        || keys.find((item) => item.provider === 'GEMINI')
        || null;
      const nextVideoKey = keys.find((item) => item.provider === 'SEEDANCE') || null;

      setStoredTextApiKey(nextTextKey);
      setStoredVideoApiKey(nextVideoKey);
    };

    if (user?.id) {
      void loadUserApiKeys();
    }
  }, [user?.id]);

  const handleSaveApiKeys = async (nextKeys: {
    textApiKey: string;
    videoApiKey: string;
  }) => {
    const normalizedTextKey = nextKeys.textApiKey.trim();
    const normalizedVideoKey = nextKeys.videoApiKey.trim();

    if (normalizedTextKey) {
      const response = await userApi.createApiKey({
        provider: 'DOUBAO',
        api_key: normalizedTextKey,
      });
      if (!response.ok) {
        throw new Error(response.message || '文案 API Key 保存失败');
      }
      if (storedTextApiKey?.id && storedTextApiKey.provider !== 'DOUBAO') {
        const cleanupResponse = await userApi.deleteApiKey(storedTextApiKey.id);
        if (!cleanupResponse.ok) {
          throw new Error(cleanupResponse.message || '旧文案 API Key 清理失败');
        }
      }
    } else if (storedTextApiKey?.id) {
      const response = await userApi.deleteApiKey(storedTextApiKey.id);
      if (!response.ok) {
        throw new Error(response.message || '文案 API Key 删除失败');
      }
    }

    if (normalizedVideoKey) {
      const response = await userApi.createApiKey({
        provider: 'SEEDANCE',
        api_key: normalizedVideoKey,
      });
      if (!response.ok) {
        throw new Error(response.message || '视频 API Key 保存失败');
      }
    } else if (storedVideoApiKey?.id) {
      const response = await userApi.deleteApiKey(storedVideoApiKey.id);
      if (!response.ok) {
        throw new Error(response.message || '视频 API Key 删除失败');
      }
    }

    const latestKeys = await userApi.listApiKeys();
    if (!latestKeys.ok || !Array.isArray(latestKeys.data)) {
      throw new Error(latestKeys.message || '重新加载 API Key 失败');
    }

    const keys = latestKeys.data as StoredApiKey[];
    setStoredTextApiKey(keys.find((item) => item.provider === 'DOUBAO') || null);
    setStoredVideoApiKey(keys.find((item) => item.provider === 'SEEDANCE') || null);
  };

  const handleNext = () => {
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep]);
    }
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const applyGeneratedScripts = (nextScripts: GeneratedScript[]) => {
    setStep3VideoTasks([]);
    setGeneratedScripts(nextScripts);
    setCurrentStep(2);
  };

  const handleSetScripts: React.Dispatch<React.SetStateAction<GeneratedScript[]>> = (next) => {
    setStep3VideoTasks([]);
    setGeneratedScripts(next);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1
            onNext={handleNext}
            formData={step1Data}
            setFormData={setStep1Data}
          />
        );
      case 2:
        return (
          <Step2
            onNext={handleNext}
            step1Data={step1Data}
            textApiKey={textApiKey}
            scripts={generatedScripts}
            setScripts={handleSetScripts}
          />
        );
      case 3:
        return (
          <Step3
            onNext={handleNext}
            generatedScripts={generatedScripts}
            videoApiKey={videoApiKey}
            step1Data={step1Data}
            videoTasks={step3VideoTasks}
            setVideoTasks={setStep3VideoTasks}
          />
        );
      case 4:
        return (
          <Step5
            onNext={handleNext}
            textApiKey={textApiKey}
            step1Data={step1Data}
            generatedScripts={generatedScripts}
            flowState={step4FlowState}
            setFlowState={setStep4FlowState}
            onApplyGeneratedScripts={applyGeneratedScripts}
          />
        );
      default:
        return (
          <Step1
            onNext={handleNext}
            formData={step1Data}
            setFormData={setStep1Data}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-full bg-app-bg overflow-hidden text-text-main">
      <Sidebar
        currentStep={currentStep}
        setCurrentStep={setCurrentStep}
        completedSteps={completedSteps}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenPromptTemplates={() => setIsPromptTemplatesOpen(true)}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar currentStep={currentStep} />
        <main className="flex-1 overflow-y-auto p-6">
          {renderStep()}
        </main>
        <StatusBar />
      </div>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        textApiKey={textApiKey}
        videoApiKey={videoApiKey}
        onSave={handleSaveApiKeys}
      />
      <PromptTemplateModal
        isOpen={isPromptTemplatesOpen}
        onClose={() => setIsPromptTemplatesOpen(false)}
      />
    </div>
  );
}
