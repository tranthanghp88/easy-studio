import type { TimelineBlock, BlockItem, TimelineLaughAsset, LaughAssetItem, TimelineMode } from "../shared/types/timeline";
import type { ScriptLine } from "../shared/types/script";
import type { SpeakerSettings } from "./speakerPresets";

function round3(value: number) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

/**
 * Existing-audio timeline builder.
 * IMPORTANT:
 * - keeps dialogue order stable
 * - respects pauseSeconds
 * - keeps subtitle/audio on same timeline
 * - prevents subtitle drift
 */
export function createTimelineForExistingAudio(
  script: ScriptLine[],
  sourceDuration: number,
  allLaughAssets: LaughAssetItem[]
): TimelineBlock[] {

  const dialogueLines = (script || []).filter(line => !!line?.text);

  if (!dialogueLines.length) {
    return [];
  }

  const totalPauseDuration = dialogueLines.reduce((sum, line) => {
    return sum + Math.max(0, Number(line.pauseSeconds || 0));
  }, 0);

  const usableDuration = Math.max(
    0.2,
    sourceDuration - totalPauseDuration
  );

  const weights = dialogueLines.map((line) => {
    const text = String(line.text || "");
    const words = text.split(/\s+/).filter(Boolean).length;

    return Math.max(
      1,
      words * 1.6 + text.length * 0.05
    );
  });

  const totalWeight =
    weights.reduce((sum, item) => sum + item, 0) || 1;

  let cursor = 0;

  const timeline: TimelineBlock[] = [];

  dialogueLines.forEach((line, index) => {

    const blockDuration = Math.max(
      0.2,
      usableDuration * (weights[index] / totalWeight)
    );

    const start = round3(cursor);

    const end =
      index === dialogueLines.length - 1
        ? round3(start + blockDuration)
        : round3(start + blockDuration);

    const pauseAfterSeconds = round3(
      Math.max(0, Number(line.pauseSeconds || 0))
    );

    timeline.push({
      blockId: line.blockId,
      role: line.role,
      text: line.text,

      start,
      end,

      resolvedStart: start,
      resolvedEnd: end,
      resolvedDuration: round3(end - start),
      effectiveDuration: round3(end - start),

      pauseAfterSeconds,

      laughAssets: line.laughAssets
        ? line.laughAssets
            .map(scriptLaughAsset => {

              const fullLaughAsset = allLaughAssets.find(
                (la: LaughAssetItem) =>
                  la.id === scriptLaughAsset.id
              );

              if (!fullLaughAsset) {
                console.warn(
                  `LaughAssetItem with id ${scriptLaughAsset.id} not found.`
                );
                return undefined;
              }

              return {
                asset: fullLaughAsset,
                offsetSeconds: scriptLaughAsset.offsetSeconds
              };
            })
            .filter(Boolean) as TimelineLaughAsset[]
        : undefined
    });

    cursor = round3(end + pauseAfterSeconds);
  });

  return timeline;
}

/**
 * Timeline wrapper service
 */
export class TimelineService {

  private _timeline: TimelineBlock[] = [];
  private _totalDuration: number = 0;

  constructor(initialTimeline: TimelineBlock[] = []) {
    this.setTimeline(initialTimeline);
  }

  setTimeline(timeline: TimelineBlock[]) {
    this._timeline = timeline;

    if (!this._timeline.length) {
      this._totalDuration = 0;
      return;
    }

    const lastBlock =
      this._timeline[this._timeline.length - 1];

    this._totalDuration = round3(
      Number(lastBlock.resolvedEnd || 0) +
      Number(lastBlock.pauseAfterSeconds || 0)
    );
  }

  get timeline(): TimelineBlock[] {
    return [...this._timeline];
  }

  get totalDuration(): number {
    return this._totalDuration;
  }

  getBlockAtTime(time: number): TimelineBlock | undefined {

    return this._timeline.find(
      block =>
        time >= Number(block.resolvedStart || 0) &&
        time < Number(block.resolvedEnd || 0)
    );
  }

  getSubtitles(): {
    start: number;
    end: number;
    text?: string;
    role?: "A" | "R" | "BOTH";
  }[] {

    return this._timeline.map(block => ({
      start: Number(block.resolvedStart || 0),
      end: Number(block.resolvedEnd || 0),
      text: block.text || "",
      role: block.role,
    }));
  }

  getReactionAssetPositions(): Array<{
    blockId?: string | number;
    globalTime: number;
    asset: LaughAssetItem;
    offsetSeconds: number;
  }> {

    const positions: Array<{
      blockId?: string | number;
      globalTime: number;
      asset: LaughAssetItem;
      offsetSeconds: number;
    }> = [];

    this._timeline.forEach(block => {

      if (block.laughAssets && block.laughAssets.length > 0) {

        block.laughAssets.forEach(laughAsset => {

          positions.push({
            blockId: block.blockId,

            globalTime:
              Number(block.resolvedStart || 0) +
              Number(laughAsset.offsetSeconds || 0),

            asset: laughAsset.asset,

            offsetSeconds: laughAsset.offsetSeconds
          });
        });
      }
    });

    return positions.sort(
      (a, b) => a.globalTime - b.globalTime
    );
  }
}
