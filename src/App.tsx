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
import AboutModal from './components/AboutModal';
import { useAuth } from './contexts/AuthContext';
import { userApi, type StoredApiKey } from './services/api';
import {
  getDefaultConfig,
  isTextProvider,
  isVideoProvider,
  normalizeWorkflowConfig,
  type WorkflowApiConfigDraft,
} from './lib/providerCatalog';

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
  const [isAboutOpen, setIsAboutOpen] = useState(false);
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

  const textConfig = normalizeWorkflowConfig({
    provider: storedTextApiKey?.provider,
    apiKey: storedTextApiKey?.api_key,
    apiEndpoint: storedTextApiKey?.api_endpoint,
    modelName: storedTextApiKey?.model_name,
  }, 'text');
  const videoConfig = normalizeWorkflowConfig({
    provider: storedVideoApiKey?.provider,
    apiKey: storedVideoApiKey?.api_key,
    apiEndpoint: storedVideoApiKey?.api_endpoint,
    modelName: storedVideoApiKey?.model_name,
  }, 'video');

  const textApiKey = textConfig.apiKey;
  const textProvider = textConfig.provider;
  const textApiEndpoint = textConfig.apiEndpoint;
  const textModelName = textConfig.modelName;
  const videoApiKey = videoConfig.apiKey;
  const videoApiEndpoint = videoConfig.apiEndpoint;
  const videoModelName = videoConfig.modelName;

  const pickLatestKey = (keys: StoredApiKey[], matcher: (item: StoredApiKey) => boolean) => {
    return keys
      .filter(matcher)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0] || null;
  };

  useEffect(() => {
    document.title = 'AI带货助手';
  }, []);

  useEffect(() => {
    const loadUserApiKeys = async () => {
      const response = await userApi.listApiKeys();
      if (!response.ok || !Array.isArray(response.data)) {
        setStoredTextApiKey(null);
        setStoredVideoApiKey(null);
        return;
      }

      const keys = response.data as StoredApiKey[];
      const nextTextKey = pickLatestKey(keys, (item) => isTextProvider(item.provider));
      const nextVideoKey = pickLatestKey(keys, (item) => isVideoProvider(item.provider));

      setStoredTextApiKey(nextTextKey);
      setStoredVideoApiKey(nextVideoKey);
    };

    if (user?.id) {
      void loadUserApiKeys();
    }
  }, [user?.id]);

  const handleSaveApiKeys = async (nextKeys: {
    text: WorkflowApiConfigDraft;
    video: WorkflowApiConfigDraft;
  }) => {
    const normalizedText = normalizeWorkflowConfig(nextKeys.text, 'text');
    const normalizedVideo = normalizeWorkflowConfig(nextKeys.video, 'video');
    const normalizedTextKey = normalizedText.apiKey.trim();
    const normalizedVideoKey = normalizedVideo.apiKey.trim();

    const cleanupCategoryKeys = async (
      keys: StoredApiKey[],
      matcher: (item: StoredApiKey) => boolean,
      keepProvider: string | null,
    ) => {
      for (const item of keys.filter(matcher)) {
        if (keepProvider && item.provider === keepProvider) continue;
        const response = await userApi.deleteApiKey(item.id);
        if (!response.ok) {
          throw new Error(response.message || `清理旧配置失败：${item.provider}`);
        }
      }
    };

    const currentKeysResponse = await userApi.listApiKeys();
    if (!currentKeysResponse.ok || !Array.isArray(currentKeysResponse.data)) {
      throw new Error(currentKeysResponse.message || '加载当前 API 配置失败');
    }
    const currentKeys = currentKeysResponse.data as StoredApiKey[];

    if (normalizedTextKey) {
      const response = await userApi.createApiKey({
        provider: normalizedText.provider,
        api_key: normalizedTextKey,
        api_endpoint: normalizedText.apiEndpoint.trim() || undefined,
        model_name: normalizedText.modelName.trim() || undefined,
      });
      if (!response.ok) {
        throw new Error(response.message || '文案 API Key 保存失败');
      }
      await cleanupCategoryKeys(currentKeys, (item) => isTextProvider(item.provider), normalizedText.provider);
    } else {
      await cleanupCategoryKeys(currentKeys, (item) => isTextProvider(item.provider), null);
    }

    if (normalizedVideoKey) {
      const response = await userApi.createApiKey({
        provider: normalizedVideo.provider,
        api_key: normalizedVideoKey,
        api_endpoint: normalizedVideo.apiEndpoint.trim() || undefined,
        model_name: normalizedVideo.modelName.trim() || undefined,
      });
      if (!response.ok) {
        throw new Error(response.message || '视频 API Key 保存失败');
      }
      await cleanupCategoryKeys(currentKeys, (item) => isVideoProvider(item.provider), normalizedVideo.provider);
    } else {
      await cleanupCategoryKeys(currentKeys, (item) => isVideoProvider(item.provider), null);
    }

    const latestKeys = await userApi.listApiKeys();
    if (!latestKeys.ok || !Array.isArray(latestKeys.data)) {
      throw new Error(latestKeys.message || '重新加载 API Key 失败');
    }

    const keys = latestKeys.data as StoredApiKey[];
    setStoredTextApiKey(pickLatestKey(keys, (item) => isTextProvider(item.provider)));
    setStoredVideoApiKey(pickLatestKey(keys, (item) => isVideoProvider(item.provider)));
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
            textProvider={textProvider}
            textApiEndpoint={textApiEndpoint}
            textModelName={textModelName}
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
            videoApiEndpoint={videoApiEndpoint}
            videoModelName={videoModelName}
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
            textProvider={textProvider}
            textApiEndpoint={textApiEndpoint}
            textModelName={textModelName}
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
        onOpenAbout={() => setIsAboutOpen(true)}
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
        textConfig={storedTextApiKey
          ? {
              provider: storedTextApiKey.provider,
              apiKey: storedTextApiKey.api_key,
              apiEndpoint: storedTextApiKey.api_endpoint,
              modelName: storedTextApiKey.model_name,
            }
          : getDefaultConfig('text')}
        videoConfig={storedVideoApiKey
          ? {
              provider: storedVideoApiKey.provider,
              apiKey: storedVideoApiKey.api_key,
              apiEndpoint: storedVideoApiKey.api_endpoint,
              modelName: storedVideoApiKey.model_name,
            }
          : getDefaultConfig('video')}
        onSave={handleSaveApiKeys}
      />
      <PromptTemplateModal
        isOpen={isPromptTemplatesOpen}
        onClose={() => setIsPromptTemplatesOpen(false)}
      />
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}
