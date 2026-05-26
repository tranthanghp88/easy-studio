export function pad3(value: number) {
  return String(value).padStart(3, "0");
}

export type MergePreviewFile = {
  name: string;
  handle?: any;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
};

export type MergePreview = {
  files: MergePreviewFile[];
  validFiles: MergePreviewFile[];
  warnings: string[];
  missingSequences: number[];
};

/**
 * Deprecated no-op helpers for the removed WAV Folder Merge feature.
 * They remain exported only to keep older local imports compile-safe.
 */
export async function buildMergePreview(_source?: any): Promise<MergePreview> {
  return { files: [], validFiles: [], warnings: [], missingSequences: [] };
}

export async function scanMergePreview(_filePrefix?: string, _source?: any): Promise<{
  preview: MergePreview;
  nextSequence: number;
  message: string;
}> {
  return {
    preview: { files: [], validFiles: [], warnings: [], missingSequences: [] },
    nextSequence: 1,
    message: "Tính năng gộp WAV cũ đã được gỡ bỏ."
  };
}

export function createWavBlobFromPcm(
  pcm: Uint8Array,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16
): Blob {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset++, value.charCodeAt(i));
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + pcm.length, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitsPerSample, true); offset += 2;
  writeString("data");
  view.setUint32(offset, pcm.length, true); offset += 4;
  new Uint8Array(buffer, 44).set(pcm);

  return new Blob([buffer], { type: "audio/wav" });
}
