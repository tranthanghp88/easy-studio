import { parseBgmMarker, parsePauseMarker } from "./scriptMarkers";
import type { ScriptLine } from "../shared/types/script";
import type {
  BgmAsset,
  DialogueSegment,
  PauseSegment,
  CompositionSegment,
  MusicBed,
  SubtitleCue,
  TimelineBlock,
  CompositionPlan,
  BuildCompositionPlanParams,
  LaughAssetItem,
  TimelineLaughAsset,
  BgmMarker
} from "../shared/types/timeline";
import { processTimeline, generateSubtitleCues } from "./timelineProcessorService";
import type { SpeakerSettings } from "./speakerPresets";


function safeText(value: unknown) {
  return String(value || "").trim();
}

function round3(value: number) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function normalizeRole(role: unknown): "A" | "R" | "BOTH" {
  return role === "R" || role === "BOTH" || role === "A" ? role : "A";
}

function mapLaughSubtitle(text: string) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const clean = raw
    .toLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/[()\[\]{}]/g, " ")
    .replace(/[.!?,;:~…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const compact = clean.replace(/\s+/g, "");

  const isLaughWord = /^(?:ha){2,}h?$/.test(compact)
    || /^(?:he){2,}h?$/.test(compact)
    || /^(?:hi){2,}h?$/.test(compact)
    || /^(?:ho){2,}h?$/.test(compact)
    || compact === "lol"
    || compact === "laugh"
    || compact === "laughnaturally";

  if (clean === "[laugh]" || clean === "laugh" || clean === "laugh naturally" || compact === "[laugh]" || compact === "laughnaturally" || isLaughWord) {
    return "[laugh]";
  }

  return raw;
}

const DEFAULT_LAUGH_DURATION = 0.5; // Example default (Should be centralized with timelineProcessorService)

function getBlockKey(value: unknown, fallback: string | number) {
  const raw = safeText(value);
  return raw || String(fallback);
}

function groupByBlock(script: ScriptLine[]) {
  const map = new Map<string, ScriptLine[]>();
  const order: string[] = [];

  (script || []).forEach((line: ScriptLine, index) => {
    // Keep semantic block ids such as HOOK / CTA.
    // Do NOT Number(...) them, because Number("HOOK") becomes NaN.
    const blockId = getBlockKey(line?.blockId, index + 1);

    if (!map.has(blockId)) {
      map.set(blockId, []);
      order.push(blockId);
    }

    map.get(blockId)!.push(line);
  });

  return order.map((blockId) => map.get(blockId) || []).filter((items) => items.length > 0);
}


function findBgmAssetById(bgmAssets: BgmAsset[], id: string) {
  const needle = safeText(id).toLowerCase();
  return (
    (bgmAssets || []).find((item) => safeText(item.id).toLowerCase() === needle) ||
    (bgmAssets || []).find((item) => safeText(item.label).toLowerCase() === needle) ||
    null
  );
}

function normalizeTimeline(actualTimeline: TimelineBlock[]) {
  return (Array.isArray(actualTimeline) ? actualTimeline : [])
    .map((item, index) => ({
      blockId: Number(item?.blockId || index + 1),
      role: normalizeRole(item?.role),
      text: safeText(item?.text).replace(/\s+/g, " "),
      start: round3(Number(item?.start || 0)),
      end: round3(Number(item?.end || 0)),
      pauseAfterSeconds: round3(Math.max(0, Number(item?.pauseAfterSeconds || 0)))
    }))
    .filter((item) => item.text && item.end > item.start)
    .sort((a, b) => a.start - b.start);
}



export function buildCompositionPlan(params: {
  script: ScriptLine[];
  sourceDuration: number;
  bgmAssets: BgmAsset[];
  allLaughAssets: LaughAssetItem[];
  speakerSettings?: SpeakerSettings;
  actualTimeline?: TimelineBlock[];
}) {
  console.log("[mediaComposition] buildCompositionPlan: Starting with params", params); // DEBUG LOG
  const script = Array.isArray(params.script) ? params.script : [];
  const sourceDuration = Number(params.sourceDuration || 0);
  const bgmAssets = Array.isArray(params.bgmAssets) ? params.bgmAssets : [];

  if (!script.length) {
    throw new Error("Script trống, chưa thể dựng output.");
  }

  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    throw new Error("Không đọc được thời lượng audio nguồn.");
  }

  let initialTimeline: TimelineBlock[] = [];
  let fullyTimedTimeline: { blocks: TimelineBlock[]; totalDuration: number; }; // Di chuyển khai báo lên đây

  if (params.actualTimeline && params.actualTimeline.length) {
    // Existing-audio export path.
    // IMPORTANT: electron/main.cjs slices the original source audio using segment.start/end.
    // Therefore dialogue segment start/end MUST remain source-audio positions.
    // We only insert explicit pause segments into render order; we do not re-sort mixed timelines.
    const dialogueScriptLines = script.filter((line) => safeText(line?.text));
    const sourceBlocks = (Array.isArray(params.actualTimeline) ? params.actualTimeline : [])
      .filter((item: TimelineBlock) => safeText(item?.text) && Number(item?.end || 0) > Number(item?.start || 0))
      .sort((a: TimelineBlock, b: TimelineBlock) => Number(a.start || 0) - Number(b.start || 0));

    const blockPauseDuration = round3(Math.max(0, Number(params.speakerSettings?.blockPause || 0)));
    const hasLineLevelTiming = sourceBlocks.length >= dialogueScriptLines.length && dialogueScriptLines.length > 0;

    const segments: CompositionSegment[] = [];
    const subtitles: SubtitleCue[] = [];
    let sourceCursor = 0;
    let renderCursor = 0;
    let lastBlockId: string | undefined;

    const weights = dialogueScriptLines.map((line) => {
      const text = safeText(line.text);
      const words = text.split(/\s+/).filter(Boolean).length;
      return Math.max(1, words * 1.6 + text.length * 0.05);
    });
    const totalWeight = weights.reduce((sum, item) => sum + item, 0) || 1;

    dialogueScriptLines.forEach((line, index) => {
      const currentBlockId = getBlockKey(line?.blockId, index + 1);

      if (lastBlockId !== undefined && currentBlockId !== lastBlockId && blockPauseDuration > 0) {
        segments.push({
          type: "pause",
          duration: blockPauseDuration,
          start: round3(renderCursor),
          end: round3(renderCursor + blockPauseDuration),
          blockId: `pause-${lastBlockId}-${currentBlockId}`
        } as CompositionSegment);
        renderCursor = round3(renderCursor + blockPauseDuration);
      }

      const sourceBlock = hasLineLevelTiming ? sourceBlocks[index] : undefined;
      let sourceStart: number;
      let sourceEnd: number;

      if (sourceBlock) {
        sourceStart = round3(Number((sourceBlock as any).sourceStart ?? sourceBlock.start ?? 0));
        sourceEnd = round3(Number((sourceBlock as any).sourceEnd ?? sourceBlock.end ?? sourceStart));
      } else {
        // Fallback only when the runtime timeline is not line-level.
        // This is less precise, but it prevents dropping dialogue lines.
        const duration = index === dialogueScriptLines.length - 1
          ? Math.max(0.2, sourceDuration - sourceCursor)
          : Math.max(0.2, sourceDuration * (weights[index] / totalWeight));
        sourceStart = round3(sourceCursor);
        sourceEnd = round3(Math.min(sourceDuration, sourceCursor + duration));
        sourceCursor = sourceEnd;
      }

      const duration = round3(Math.max(0.05, sourceEnd - sourceStart));
      const subtitleText = mapLaughSubtitle(safeText((line as any).subtitle || line.text));
      const role = normalizeRole(line.role || sourceBlock?.role);

      segments.push({
        type: "dialogue",
        role,
        text: safeText(line.text) || safeText(sourceBlock?.text),
        sourceStart,
        sourceEnd,
        // main.cjs uses start/end for ffmpeg -ss/-to slicing from sourceAudioPath.
        start: sourceStart,
        end: sourceEnd,
        subtitle: subtitleText,
        blockId: currentBlockId
      } as CompositionSegment);

      if (subtitleText) {
        subtitles.push({
          start: round3(renderCursor),
          end: round3(renderCursor + duration),
          text: subtitleText,
          role
        } as SubtitleCue);
      }

      renderCursor = round3(renderCursor + duration);
      lastBlockId = currentBlockId;
    });

    console.log("[mediaComposition] existing-audio v5 plan", {
      scriptLineCount: dialogueScriptLines.length,
      sourceBlockCount: sourceBlocks.length,
      hasLineLevelTiming,
      blockPauseDuration,
      segments,
      subtitles
    });

    return {
      segments,
      musicBeds: [],
      subtitles,
      estimatedDuration: renderCursor
    };
  } else {
    // Build initialTimeline from script for TTS generation, integrating BGM markers and block pauses
    const blockGroups = groupByBlock(script);
    console.log("[mediaComposition] buildCompositionPlan: Processing block groups", blockGroups); // DEBUG LOG
    let cursor = 0; // Cumulative time for initialTimeline generation
    let lastBlockId: string | number | undefined = undefined;

    blockGroups.forEach((blockLines, blockGroupIndex) => {
      const currentBlockId = blockLines[0]?.blockId; // Semantic blockId
      console.log(`[mediaComposition] buildCompositionPlan: BlockGroup ${blockGroupIndex}, currentBlockId: ${currentBlockId}, lastBlockId: ${lastBlockId}`); // DEBUG LOG

      // Insert a pause segment if blockId changes and it's not the very first block
      if (lastBlockId !== undefined && currentBlockId !== undefined && lastBlockId !== currentBlockId) {
        const blockPauseDuration = Number(params.speakerSettings?.blockPause || 0);
        if (blockPauseDuration > 0) {
          console.log(`[mediaComposition] buildCompositionPlan: Inserting pause segment of duration ${blockPauseDuration}s between blockId ${lastBlockId} and ${currentBlockId}`); // DEBUG LOG
          initialTimeline.push({
            blockId: `pause-${lastBlockId}-${currentBlockId}`,
            text: undefined,
            subtitle: undefined,
            role: undefined,
            type: "pause",
            start: round3(cursor),
            end: round3(cursor + blockPauseDuration),
            resolvedStart: round3(cursor),
            resolvedEnd: round3(cursor + blockPauseDuration),
            pauseAfterSeconds: 0, // Pause segments don't have pauseAfterSeconds
            duration: blockPauseDuration,
          });
          cursor = round3(cursor + blockPauseDuration);
        }
      }

      const firstLineOfGroup = blockLines[0];
      const markerLines = Array.isArray(firstLineOfGroup?.markerLines) ? firstLineOfGroup.markerLines : [];
      const bgmMarkersForGroup: BgmMarker[] = [];

      markerLines.forEach((markerLine) => {
        const bgm = parseBgmMarker(markerLine);
        if (bgm?.id) {
          bgmMarkersForGroup.push(bgm);
        }
      });

      const dialogueLinesInGroup = blockLines.filter((line) => safeText(line?.text));
      const weightsInGroup = dialogueLinesInGroup.map((line) => {
        const text = safeText(line.text);
        const words = text.split(/\s+/).filter(Boolean).length;
        return Math.max(1, words * 1.6 + text.length * 0.05);
      });
      const totalWeightInGroup = weightsInGroup.reduce((sum, item) => sum + item, 0) || 1;

      if (dialogueLinesInGroup.length === 0 && bgmMarkersForGroup.length > 0) {
        const dummyDuration = 0.5;
        initialTimeline.push({
          blockId: currentBlockId,
          text: undefined,
          subtitle: undefined,
          role: undefined,
          type: "bgm_only", // A new type for blocks with only BGM marker
          start: round3(cursor),
          end: round3(cursor + dummyDuration),
          resolvedStart: round3(cursor),
          resolvedEnd: round3(cursor + dummyDuration),
          pauseAfterSeconds: firstLineOfGroup?.pauseSeconds || 0,
          duration: dummyDuration,
          laughAssets: undefined,
          bgmMarkers: bgmMarkersForGroup
        });
        cursor = round3(cursor + dummyDuration + (firstLineOfGroup?.pauseSeconds || 0));
      } else {
        dialogueLinesInGroup.forEach((line, indexInDialogueGroup) => {
          const blockDuration = Math.max(0.2, sourceDuration * (weightsInGroup[indexInDialogueGroup] / totalWeightInGroup));
          const start = cursor;
          const end = cursor + blockDuration;
  
          initialTimeline.push({
            blockId: currentBlockId, // Preserve semantic blockId
            role: line.role,
            text: line.text,
            subtitle: line.text, // Assume text is subtitle if not specified otherwise
            type: "dialogue",
            start: round3(start),
            end: round3(end),
            resolvedStart: round3(start), resolvedEnd: round3(end), // Will be re-calculated by processTimeline
            pauseAfterSeconds: line.pauseSeconds,
            duration: blockDuration,
            laughAssets: line.laughAssets ? line.laughAssets.map(scriptLaughAsset => {
              const fullLaughAsset = params.allLaughAssets.find((la: LaughAssetItem) => la.id === scriptLaughAsset.id);
              if (!fullLaughAsset) {
                console.warn(`[mediaComposition] LaughAssetItem with id ${scriptLaughAsset.id} not found.`);
                return undefined;
              }
              return {
                asset: fullLaughAsset,
                offsetSeconds: scriptLaughAsset.offsetSeconds
              };
            }).filter(Boolean) as TimelineLaughAsset[] : undefined,
            bgmMarkers: (indexInDialogueGroup === 0) ? bgmMarkersForGroup : undefined
          });
          cursor = end;
        });
      }
      lastBlockId = currentBlockId;
    });
    console.log("[mediaComposition] buildCompositionPlan: initialTimeline before processTimeline", initialTimeline); // DEBUG LOG
    fullyTimedTimeline = processTimeline(initialTimeline, params.speakerSettings, params.allLaughAssets);
    console.log("[mediaComposition] buildCompositionPlan: fullyTimedTimeline after processTimeline", fullyTimedTimeline); // DEBUG LOG
  }
  const finalSubtitleCues = generateSubtitleCues(fullyTimedTimeline.blocks);

  const segments: CompositionSegment[] = [];
  const musicBeds: MusicBed[] = [];
  const missingBgmIds = new Set<string>();

  // Xây dựng segments và musicBeds từ fullyTimedTimeline, bao gồm cả các pause blocks được chèn
  fullyTimedTimeline.blocks.forEach(block => {
    // Add dialogue segments
    if (block.type === "dialogue") {
      segments.push({
        type: "dialogue",
        role: normalizeRole(block.role),
        text: safeText(block.text),
        sourceStart: block.start,
        sourceEnd: block.end,
        start: block.resolvedStart,
        end: block.resolvedSpeechEnd || block.end, // Ensure to use speech end for dialogue segments
        subtitle: mapLaughSubtitle(block.subtitle || block.text || ""),
        blockId: block.blockId, // Preserve blockId
      });
    } else if (block.type === "pause") {
      // Add explicit pause segments (from between blocks or segment.pauseAfterSeconds)
      segments.push({
        type: "pause",
        duration: round3(Number(block.duration || Math.max(0, Number(block.resolvedEnd || 0) - Number(block.resolvedStart || 0)) || 0)),
        start: block.resolvedStart,
        end: block.resolvedEnd,
        blockId: block.blockId, // Preserve blockId
      });
    } else if (block.type === "bgm_only") {
      // Handle BGM only blocks
      segments.push({
        type: "pause", // Represent BGM only blocks as pauses in the segment array for now
        duration: round3(Number(block.duration || Math.max(0, Number(block.resolvedEnd || 0) - Number(block.resolvedStart || 0)) || 0)),
        start: block.resolvedStart,
        end: block.resolvedEnd,
        blockId: block.blockId, // Preserve blockId
      });
    }

    // Reaction segments (laugh assets) - these are added based on fullyTimedTimeline.blocks now
    if (block.laughAssets && block.laughAssets.length > 0) {
      block.laughAssets.forEach(timelineLaughAsset => {
        const laughStart = round3(block.resolvedStart + timelineLaughAsset.offsetSeconds);
        const laughDuration = round3(timelineLaughAsset.asset.duration || DEFAULT_LAUGH_DURATION);
        const laughEnd = round3(laughStart + laughDuration);

        segments.push({
          type: "reaction",
          assetId: timelineLaughAsset.asset.id,
          filePath: timelineLaughAsset.asset.filePath,
          start: laughStart,
          duration: laughDuration,
          end: laughEnd,
          blockId: block.blockId, // Preserve blockId
        });
      });
    }
  });

  // Generate musicBeds from fullyTimedTimeline
  fullyTimedTimeline.blocks.forEach(block => {
    if (block.bgmMarkers && block.bgmMarkers.length > 0) {
      block.bgmMarkers.forEach(bgmMarker => {
        const asset = findBgmAssetById(bgmAssets, bgmMarker.id);
        if (!asset?.filePath) {
          missingBgmIds.add(bgmMarker.id);
          return;
        }

        musicBeds.push({
          bgmId: bgmMarker.id,
          filePath: asset.filePath,
          start: round3(block.resolvedStart), // Start BGM at the resolvedStart of the associated block
          duration: Number.isFinite(Number(bgmMarker.duration)) ? Math.max(0.2, Number(bgmMarker.duration)) : undefined,
          volume: Number.isFinite(Number(bgmMarker.volume)) ? Number(bgmMarker.volume) : Number(asset.defaultVolume || 0.25),
          loop: String(bgmMarker.mode || "").toLowerCase() === "loop",
          duckVolume: 0.08, // Default value, can be configurable
          fadeOut: Number.isFinite(Number(bgmMarker.fadeOut)) ? Math.max(0, Number(bgmMarker.fadeOut)) : 2
        });
      });
    }
  });
  console.log("[mediaComposition] buildCompositionPlan: Final segments before sorting", segments); // DEBUG LOG
  segments.sort((a, b) => a.start - b.start);
  musicBeds.sort((a, b) => a.start - b.start); // Cần xây dựng logic cho musicBeds

  // Tính estimatedDuration từ fullyTimedTimeline (sử dụng totalDuration)
  const estimatedDuration = fullyTimedTimeline.totalDuration;

  if (missingBgmIds.size) {
    console.warn("[mediaComposition] Missing BGM assets:", [...missingBgmIds]);
  }

  const plan = {
    segments,
    musicBeds,
    subtitles: finalSubtitleCues,
    estimatedDuration
  };

  console.log("[mediaComposition] buildCompositionPlan: Returning plan", plan); // DEBUG LOG
  return plan;
}
