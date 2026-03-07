import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  textApiKey: string;
  setTextApiKey: React.Dispatch<React.SetStateAction<string>>;
  videoApiKey: string;
  setVideoApiKey: React.Dispatch<React.SetStateAction<string>>;
}

export default function SettingsModal({
  isOpen,
  onClose,
  textApiKey,
  setTextApiKey,
  videoApiKey,
  setVideoApiKey,
}: SettingsModalProps) {
  const [textApiMessage, setTextApiMessage] = useState('');
  const [videoApiMessage, setVideoApiMessage] = useState('');

  const [textApiStatus, setTextApiStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [videoApiStatus, setVideoApiStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const runApiKeyTest = async (type: 'text' | 'video', apiKey: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      let response: Response;
      try {
        response = await fetch(new URL('/api/test-key', window.location.origin).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type, apiKey }),
          signal: controller.signal,
        });
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
          throw new Error('连接超时，请检查网络后重试');
        }
        throw new Error(fetchError instanceof Error ? fetchError.message : '网络请求失败');
      }

      const contentType = response.headers.get('content-type') || '';
      let rawText: string;
      try {
        rawText = await response.text();
      } catch {
        throw new Error('读取服务端响应失败');
      }
      const result = contentType.includes('application/json')
        ? JSON.parse(rawText || '{}')
        : { ok: false, message: rawText || '服务端返回非 JSON 响应' };
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || '连接测试失败');
      }
      return result?.message || '连接成功';
    } finally {
      clearTimeout(timeout);
    }
  };

  const testTextApi = async () => {
    if (!textApiKey) return;
    setTextApiStatus('testing');
    setTextApiMessage('');
    try {
      const message = await runApiKeyTest('text', textApiKey);
      setTextApiStatus('success');
      setTextApiMessage(message);
    } catch (error) {
      setTextApiStatus('error');
      setTextApiMessage(error instanceof Error ? error.message : '连接测试失败');
    }
  };

  const testVideoApi = async () => {
    if (!videoApiKey) return;
    setVideoApiStatus('testing');
    setVideoApiMessage('');
    try {
      const message = await runApiKeyTest('video', videoApiKey);
      setVideoApiStatus('success');
      setVideoApiMessage(message);
    } catch (error) {
      setVideoApiStatus('error');
      setVideoApiMessage(error instanceof Error ? error.message : '连接测试失败');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-[500px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">API 配置</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Text API Section */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              文案生成 API 接入 (豆包/DeepSeek 等)
            </label>
            <div className="flex space-x-3">
              <input
                type="password"
                placeholder="sk-..."
                value={textApiKey}
                onChange={(e) => {
                  setTextApiKey(e.target.value);
                  setTextApiStatus('idle');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void testTextApi();
                  }
                }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  void testTextApi();
                }}
                disabled={!textApiKey || textApiStatus === 'testing'}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[100px] justify-center"
              >
                {textApiStatus === 'testing' ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> 测试中</>
                ) : textApiStatus === 'success' ? (
                  <><CheckCircle2 className="w-4 h-4 mr-1.5 text-success" /> 连接成功</>
                ) : textApiStatus === 'error' ? (
                  <><XCircle className="w-4 h-4 mr-1.5 text-red-500" /> 连接失败</>
                ) : (
                  '测试连接'
                )}
              </button>
            </div>
            {(textApiStatus === 'success' || textApiStatus === 'error') && (
              <p className={`text-xs ${textApiStatus === 'success' ? 'text-success' : 'text-red-500'}`}>
                {textApiMessage}
              </p>
            )}
            <p className="text-xs text-gray-500">用于第2步：批量生成不重样带货脚本。</p>
          </div>

          {/* Video API Section */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Seedance 2.0 API 接入
            </label>
            <div className="flex space-x-3">
              <input
                type="password"
                placeholder="输入 Seedance API Key..."
                value={videoApiKey}
                onChange={(e) => {
                  setVideoApiKey(e.target.value);
                  setVideoApiStatus('idle');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void testVideoApi();
                  }
                }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  void testVideoApi();
                }}
                disabled={!videoApiKey || videoApiStatus === 'testing'}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[100px] justify-center"
              >
                {videoApiStatus === 'testing' ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> 测试中</>
                ) : videoApiStatus === 'success' ? (
                  <><CheckCircle2 className="w-4 h-4 mr-1.5 text-success" /> 连接成功</>
                ) : videoApiStatus === 'error' ? (
                  <><XCircle className="w-4 h-4 mr-1.5 text-red-500" /> 连接失败</>
                ) : (
                  '测试连接'
                )}
              </button>
            </div>
            {(videoApiStatus === 'success' || videoApiStatus === 'error') && (
              <p className={`text-xs ${videoApiStatus === 'success' ? 'text-success' : 'text-red-500'}`}>
                {videoApiMessage}
              </p>
            )}
            <p className="text-xs text-gray-500">用于第3步：根据脚本和提示词自动生成视频画面。</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-[#008CCF] transition-colors text-sm font-medium shadow-sm"
          >
            保存并关闭
          </button>
        </div>
      </div>
    </div>
  );
}
