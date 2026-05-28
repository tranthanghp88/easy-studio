# v27 fixes

- Fix progress bar fill in Dựng Video panel with explicit inline gradient width.
- Speed up FFmpeg export presets to ultrafast and lighter CRF.
- Subtitle wrapping now uses subtitle box width + estimated rendered text width instead of plain character truncation. Long captions no longer lose tail text.
- Video Layout Manager: Sub A / Sub R / BOTH are displayed on one horizontal row.
- Live Preview wavebar now uses the same visual height box as the render overlay, improving preview-to-render position match.
- Wavebar overlay render now uses nullish fallback instead of `||`, so y=0/x=0 values are respected.
