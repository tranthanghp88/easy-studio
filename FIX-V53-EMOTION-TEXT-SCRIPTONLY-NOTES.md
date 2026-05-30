# FIX V53 - Emotion Text Script Only

- Gemini/Vertex chỉ nhận script sạch, không prompt, không systemInstruction, không tag SCRIPT.
- Parser manual vẫn nhận:
  - `*text*` = nhấn mạnh
  - `~text~` = kéo dài
  - `||` = pause 250ms
  - `|||` = pause 600ms
- `*text*` được chuyển thành text cảm xúc nhẹ trước khi gửi TTS:
  - `*10%*` -> `10 PHẦN TRĂM!`
  - `*Đặc biệt!*` -> `ĐẶC BIỆT!`
- `~text~` được chuyển thành text kéo dài nhẹ, ví dụ kéo dài nguyên âm cuối.
- Thêm validate markup: nếu số dấu `*` hoặc `~` bị lẻ thì báo lỗi trước khi generate.
- Cache version mới: v53-emotion-text-scriptonly.
