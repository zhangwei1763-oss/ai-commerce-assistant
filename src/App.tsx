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

function safeGetStorage(key: string) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeSetStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors from restricted environments.
  }
}

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromptTemplatesOpen, setIsPromptTemplatesOpen] = useState(false);
  const [textApiKey, setTextApiKey] = useState('');
  const [videoApiKey, setVideoApiKey] = useState('');
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

  useEffect(() => {
    const savedTextKey = safeGetStorage('ark_text_api_key');
    const savedVideoKey = safeGetStorage('ark_video_api_key');
    setTextApiKey(savedTextKey);
    setVideoApiKey(savedVideoKey);
  }, []);

  useEffect(() => {
    safeSetStorage('ark_text_api_key', textApiKey);
  }, [textApiKey]);

  useEffect(() => {
    safeSetStorage('ark_video_api_key', videoApiKey);
  }, [videoApiKey]);

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
        setTextApiKey={setTextApiKey}
        videoApiKey={videoApiKey}
        setVideoApiKey={setVideoApiKey}
      />
      <PromptTemplateModal
        isOpen={isPromptTemplatesOpen}
        onClose={() => setIsPromptTemplatesOpen(false)}
      />
    </div>
  );
}
