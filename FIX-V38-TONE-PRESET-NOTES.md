# FIX V38 — Tone Preset Engine

## Easy Voice Việt

Added a lightweight Tone Preset Engine behind the existing UI.

### UI impact
- No big UI redesign.
- Existing modes remain:
  - Quảng cáo
  - Đọc truyện
  - Review phim

### Backend behavior
When generating voice, app now runs:

Input text → Word dictionary → Tone Processor → Pacing Processor → Gemini/Vertex TTS

### Quảng cáo
- More energetic prompt.
- Brighter pitch instruction.
- Faster list-reading instruction.
- Slower emphasis for offers/prices.
- Auto emphasis for:
  - giảm %
  - số tiền
  - ưu đãi
  - chỉ còn
  - miễn phí
  - mua X tặng Y

### Đọc truyện
- Softer and slower pacing.
- Better pauses after long sentences/dialogue.

### Review phim
- More cinematic/suspense style.
- Adds subtle pauses around important dramatic words.

## Note
This version does not expose a raw SSML editor. SSML/prompt-like control is handled behind the scenes so the user only chooses a tone preset.
