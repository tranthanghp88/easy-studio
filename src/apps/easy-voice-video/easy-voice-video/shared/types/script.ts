export type ScriptLine = {
  role: "A" | "R" | "BOTH";
  text: string;
  blockId?: string | number;
  pauseSeconds?: number;
  bgm?: {
    id: string;
    duration?: number;
    volume?: number;
    mode?: "once" | "loop";
    raw: string;
  } | null;
  markerLines?: string[];
  laughAssets?: Array<{ id: string; offsetSeconds: number; }>; // Thêm thuộc tính này
};
