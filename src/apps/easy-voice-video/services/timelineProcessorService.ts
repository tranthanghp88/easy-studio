import type { TimelineBlock, TimelineLaughAsset, LaughAssetItem, SubtitleCue } from "../shared/types/timeline";
import type { SpeakerSettings } from "./speakerPresets";

function round3(value: number) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

// TODO: Determine a default laugh duration if not provided by asset
const DEFAULT_LAUGH_DURATION = 0.5; // Example default
const DEFAULT_SUBTITLE_START_OFFSET_SECONDS = 0;

function normalizeLaughSubtitleText(text: unknown): string {
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
 // 80ms offset for subtitle start to account for pre-dialogue silence

/**
 * Xử lý timeline ban đầu, tính toán resolvedStart, resolvedEnd, resolvedDuration,
 * effectiveDuration cho mỗi TimelineBlock, tính đến cumulative pauses và reaction assets.
 * @param initialTimeline TimelineBlock[] ban đầu.
 * @param speakerSettings SpeakerSettings để xác định các rule tạm dừng tự động.
 * @param allLaughAssets Tất cả các LaughAssetItem có sẵn để lấy duration.
 * @returns TimelineBlock[] đã xử lý với timing tuyệt đối.
 */
export function processTimeline(
  initialTimeline: TimelineBlock[],
  speakerSettings: SpeakerSettings | undefined,
  allLaughAssets: LaughAssetItem[]
): { blocks: TimelineBlock[]; totalDuration: number; } {
  const processedTimeline: TimelineBlock[] = [];
  let cumulativeTime = 0; // Thời gian tuyệt đối hiện tại trên timeline

  for (const block of initialTimeline) {
    console.log(`--- Block ${block.blockId} ---`);
    console.log(`Cumulative Time before block: ${cumulativeTime}`);
    console.log(`Block text: ${block.text}`);
    console.log(`Speaker Settings in processTimeline: ${JSON.stringify(speakerSettings)}`);
    const originalBlockDuration = block.end - block.start; // Thời lượng hội thoại gốc của block

    // Tính toán resolvedStart và resolvedEnd
    const resolvedStart = round3(cumulativeTime);
    const resolvedEnd = round3(cumulativeTime + originalBlockDuration);
    const resolvedDuration = round3(resolvedEnd - resolvedStart);

    let effectiveBlockEnd = resolvedEnd; // Thời điểm block kết thúc, có thể kéo dài bởi laugh assets

    // Tính toán tác động của laugh assets đến effectiveDuration
    if (block.laughAssets && block.laughAssets.length > 0) {
      for (const timelineLaughAsset of block.laughAssets) {
        const fullLaughAsset = allLaughAssets.find((la) => la.id === timelineLaughAsset.asset.id);
        const laughDuration = fullLaughAsset ? round3(fullLaughAsset.duration || DEFAULT_LAUGH_DURATION) : DEFAULT_LAUGH_DURATION;
        const laughAbsoluteEnd = round3(resolvedStart + timelineLaughAsset.offsetSeconds + laughDuration);
        effectiveBlockEnd = Math.max(effectiveBlockEnd, laughAbsoluteEnd);
      }
    }

    const effectiveDuration = round3(effectiveBlockEnd - resolvedStart);

    // Calculate dialogue content start/end for subtitles
    let dialogueContentStart = round3(resolvedStart + DEFAULT_SUBTITLE_START_OFFSET_SECONDS);
    let dialogueContentEnd = effectiveBlockEnd; // Dialogue content ends where the block's dialogue ends.

    // Ensure dialogueContentStart doesn't exceed dialogueContentEnd for very short blocks
    if (dialogueContentStart >= dialogueContentEnd) {
      dialogueContentStart =  resolvedStart; // Fallback to resolvedStart if the offset makes it too late
      dialogueContentEnd = resolvedEnd; // Keep end same
    }

    // Tính toán blockPauseDuration từ speakerSettings (logic tương tự calculateCumulativeTimeline cũ)
    const blockPauseDuration = speakerSettings?.autoBlockPause
      ? (
          (speakerSettings.autoBlockPauseRules || []).find(
            (rule) => {
              return block.text && block.text.includes(rule.text);
            }
          )?.pause
            ? round3(Number((speakerSettings.autoBlockPauseRules || []).find((rule) => block.text && block.text.includes(rule.text))?.pause))
            : round3(speakerSettings?.blockPause || 0) // Sử dụng blockPause mặc định nếu autoBlockPause true nhưng không có rule nào khớp
        )
      : round3(speakerSettings?.blockPause || 0);
    // Cập nhật cumulativeTime cho block tiếp theo
    // cumulativeTime sẽ tiến tới cuối effectiveDuration của block hiện tại + pauseAfterSeconds + blockPauseDuration
    cumulativeTime = round3(effectiveBlockEnd + (block.pauseAfterSeconds || 0) + blockPauseDuration);
    console.log(`Cumulative Time after block calculation: ${cumulativeTime}`);

    processedTimeline.push({
      ...block,
      start: block.start, // Giữ lại giá trị gốc nếu cần
      end: block.end,     // Giữ lại giá trị gốc nếu cần
      resolvedStart,
      resolvedEnd,
      resolvedDuration,
      effectiveDuration,
      dialogueContentStart, // NEW
      dialogueContentEnd,   // NEW
      pauseAfterSeconds: block.pauseAfterSeconds, // Giữ lại giá trị gốc
    });
  }

  return {
    blocks: processedTimeline,
    totalDuration: cumulativeTime // cumulativeTime holds the total duration
  };
}

/**
 * Tạo SubtitleCue[] từ TimelineBlock[] đã xử lý, bao gồm cả cues cho laugh assets.
 * @param processedTimeline TimelineBlock[] đã xử lý với timing tuyệt đối.
 * @returns SubtitleCue[] sẵn sàng để export.
 */
export function generateSubtitleCues(
  processedTimeline: TimelineBlock[]
): SubtitleCue[] {
  const subtitleCues: SubtitleCue[] = [];

  for (const block of processedTimeline) {
    // Thêm Cue phụ đề cho hội thoại
    if (block.text && typeof block.dialogueContentStart === 'number' && typeof block.dialogueContentEnd === 'number' && block.dialogueContentStart < block.dialogueContentEnd) {
      console.log(
  "[SUB]",
  block.text,
  block.dialogueContentStart,
  block.dialogueContentEnd
);
      subtitleCues.push({
        start: block.dialogueContentStart,
        end: block.dialogueContentEnd,
        text: normalizeLaughSubtitleText(block.subtitle || block.text),
        role: block.role,
        pauseAfterSeconds: 0, // Pause đã được tính vào resolvedStart của block tiếp theo
      });
    }

    // Thêm Cue phụ đề cho laugh assets (nếu có)
    if (block.laughAssets && block.laughAssets.length > 0) {
      for (const timelineLaughAsset of block.laughAssets) {
        const laughCueStartRaw = round3(block.resolvedStart + timelineLaughAsset.offsetSeconds);
        const laughCueStart = round3(laughCueStartRaw + DEFAULT_SUBTITLE_START_OFFSET_SECONDS); // Apply offset
        const laughDuration = round3(timelineLaughAsset.asset.duration || DEFAULT_LAUGH_DURATION);
        const laughCueEnd = round3(laughCueStart + laughDuration);

        // Ensure laugh cue is valid and not too short
        if (laughCueEnd > laughCueStart) {
          subtitleCues.push({
            start: laughCueStart,
            end: laughCueEnd,
            text: "[laugh]",
            role: timelineLaughAsset.asset.role,
            pauseAfterSeconds: 0,
            });
            }
            }
            }
            }

            // Sắp xếp lại tất cả các cues theo thời gian bắt đầu
            subtitleCues.sort((a, b) => a.start - b.start);

            return subtitleCues;
            }

