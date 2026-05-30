# FIX V39 — Manual Tone Control + Segment Cache

## Easy Voice Việt

### Manual Tone Markup
- Thêm thanh thẻ giọng đọc dưới ô nhập text:
  - Nhấn mạnh: bôi đen text rồi bấm, app tự bọc `*text*`.
  - Pause ngắn: chèn `||`.
  - Pause dài: chèn `|||`.
- Backend hiểu các ký hiệu này là chỉ dẫn đọc, không đọc thành chữ.

### Money Phrase Atomic
- Cụm tiền như `5 triệu đồng`, `190 ngàn đồng`, `4 triệu đồng` được giữ liền mạch.
- Không tự chèn pause giữa số và đơn vị tiền.

### Segment Cache
- Cache key tính cả text + markup + voice + provider + tone preset.
- Đổi một cụm nhấn mạnh sẽ chỉ làm cache miss ở chunk liên quan.
- Với quảng cáo, chunk được chia nhỏ hơn để tận dụng cache tốt hơn.

### SRT Clean Text
- Subtitle/SRT không hiển thị dấu `*`, `||`, `|||`.
