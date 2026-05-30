# FIX V37.6 — Preset/BGM final polish

## App English
- Ép tên preset căn trái trong Preset Manager.
- Giữ layout 1 dòng: Preset | Chi tiết | Sửa | checkbox.

## App Voice Việt
- Danh sách BGM dùng checkbox vuông giống Preset Manager.
- Nút Xóa BGM màu đỏ rõ hơn, không bị trắng trên nền sáng.
- Smart BGM bed:
  - BGM dài hơn audio: trim theo audio và auto fade-out 2s nếu bị cắt.
  - BGM ngắn hơn audio: phát BGM đầy đủ lần đầu, các vòng lặp sau bỏ qua intro ngắn để đỡ gãy đoạn, sau đó trim theo audio.
  - Fade In vẫn là intro BGM trước khi voice vào.
  - Fade Out chỉ áp dụng cho BGM, không fade voice.
