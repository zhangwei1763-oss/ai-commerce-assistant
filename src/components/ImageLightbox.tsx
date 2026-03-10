import React from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  isOpen: boolean;
  imageUrl: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

export default function ImageLightbox({
  isOpen,
  imageUrl,
  title,
  subtitle,
  onClose,
}: ImageLightboxProps) {
  if (!isOpen || !imageUrl) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 p-4 flex items-center justify-center" onClick={onClose}>
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-0 top-0 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/75"
        >
          <X className="h-5 w-5" />
        </button>
        {(title || subtitle) && (
          <div className="mb-4 text-white pr-14">
            {title && <div className="text-lg font-semibold">{title}</div>}
            {subtitle && <div className="mt-1 text-sm text-white/75">{subtitle}</div>}
          </div>
        )}
        <div className="min-h-0 flex-1 flex items-center justify-center rounded-3xl overflow-hidden bg-black/30">
          <img src={imageUrl} alt={title || '预览图片'} className="max-h-[80vh] w-auto max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
