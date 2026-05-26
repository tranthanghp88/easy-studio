// C:\007\electron\video\timelineProcessorService.cjs
// CommonJS cho Electron Main Process

function processTimeline(segments, pauseAfterSeconds = 0) {
    let currentTime = 0;
    const timelineBlocks = [];

    segments.forEach((seg, index) => {
        const duration = Number(seg.duration || 0);

        // START dùng absolute timeline thật
        const start = currentTime;
        const end = start + duration;

        timelineBlocks.push({
            id: seg.id || `block-${index}`,
            start,
            end,
            duration,
            text: seg.text || "",
            subtitle: seg.subtitle || seg.text || "",
            role: seg.role || "A",
            type: seg.type || "speech"
        });

        // move timeline
        currentTime = end;

    });

    return {
        blocks: timelineBlocks,
        totalDuration: currentTime
    };
}

module.exports = { processTimeline };