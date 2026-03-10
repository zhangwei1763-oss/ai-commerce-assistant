import type { CharacterRecord } from '../services/api';

export type GeneratedCharacterPreview = {
  storageKey: string;
  publicUrl: string;
  groupName?: string;
  revisedPrompt?: string;
  fileSize?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
};

export type ScriptCharacterSelection =
  | {
      source: 'saved';
      character: CharacterRecord;
    }
  | {
      source: 'upload';
      name: string;
      previewUrl: string;
      imageDataUrl: string;
    };
