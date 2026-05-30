# FIX V36 — Karaoke Active Word Mode

## Đã sửa

- Karaoke subtitle không còn tô màu tích lũy.
- Toàn bộ câu giữ màu nền/base theo style đang chọn.
- Chỉ từ đang được đọc mới đổi màu highlight.
- Khi chuyển sang từ tiếp theo, từ cũ tự quay lại màu base.
- Giữ khoảng trắng giữa các từ, tránh lỗi chữ dính vào nhau.

## Logic màu

### speakerToWhite
- Base: màu speaker A/R/BOTH.
- Active word: trắng + glow nhẹ.

### whiteToSpeaker
- Base: trắng.
- Active word: màu speaker A/R/BOTH + glow nhẹ.

## File chính đã sửa

- `src/apps/easy-voice-video/electron/video/subtitle-layout.cjs`
- `src/apps/easy-voice-video/easy-voice-video/electron/video/subtitle-layout.cjs`
