import React from 'react';
import { X, Mail, Sparkles, Clapperboard, LineChart } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">关于 AI带货助手</h2>
            <p className="mt-1 text-sm text-gray-500">短视频带货内容生成与迭代工作台</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-gray-700">
            AI带货助手面向短视频电商内容生产场景，围绕产品信息整理、批量脚本生成、AI 视频生成和爆款回流迭代，提供一套可持续复用的工作流。
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <Sparkles className="mb-3 h-5 w-5 text-accent" />
              <h3 className="mb-2 text-sm font-semibold text-gray-900">脚本生成</h3>
              <p className="text-xs leading-5 text-gray-500">
                结合产品卖点、人群痛点和提示词模板，批量生成不同风格的短视频带货脚本。
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <Clapperboard className="mb-3 h-5 w-5 text-accent" />
              <h3 className="mb-2 text-sm font-semibold text-gray-900">视频出片</h3>
              <p className="text-xs leading-5 text-gray-500">
                基于图生视频模型发起任务、查询进度并回传结果，减少人工剪辑和素材拼接成本。
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <LineChart className="mb-3 h-5 w-5 text-accent" />
              <h3 className="mb-2 text-sm font-semibold text-gray-900">回流迭代</h3>
              <p className="text-xs leading-5 text-gray-500">
                通过爆款拆解和同款裂变，把高表现内容的结构沉淀成下一轮生成输入。
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="mb-2 text-sm font-semibold text-gray-900">开发者联系方式</div>
            <a
              href="mailto:zhangwei1763@gmail.com"
              className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
            >
              <Mail className="h-4 w-4" />
              zhangwei1763@gmail.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
