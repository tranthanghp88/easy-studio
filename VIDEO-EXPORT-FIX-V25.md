# v25 — Voice Video Export Fix

Đã sửa đúng 2 lỗi người dùng báo:

1. Không xuất được video
- Root cause: Wavebar overlay render dùng rawvideo pipe vào FFmpeg với kích thước wavebar bị lẻ, ví dụ height=115.
- H.264 yuv420p cần width/height chẵn. Khi kích thước lẻ, FFmpeg đóng stdin sớm và Electron báo `write EOF`.
- Fix: ép width/height wavebar overlay thành số chẵn trước khi render.

2. Progress bar trong UI Dựng Video không chạy rõ
- Tăng nhịp progress timer để thanh tiến trình chạy thấy rõ hơn trong lúc main-process đang dựng video.
- Progress dừng ở 96% cho đến khi export trả về success rồi mới lên 100%.

Không đụng:
- timeline
- subtitle timing
- plan.subtitles
- voice backend
- IPC chính
