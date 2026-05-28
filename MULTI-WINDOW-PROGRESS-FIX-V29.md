# v29 — Multi-window Shell + Progress Text Fix

## Đã sửa

1. **Progress bar Dựng Video**
   - Track đổi sang nền tối `#1e293b`.
   - Text progress luôn màu trắng, không còn bị trùng nền trắng khi chưa fill.

2. **Mở app con bằng cửa sổ riêng**
   - Dashboard Easy Studio vẫn là cửa sổ chính.
   - Khi bấm app con ngoài Dashboard, app con mở bằng `BrowserWindow` riêng.
   - Mỗi app có title/icon riêng:
     - Easy Script
     - Easy Voice/Video
     - Easy Thumbnail
     - Easy Voice Việt
   - Nếu app đã mở, bấm lại card ngoài Dashboard sẽ focus cửa sổ cũ thay vì mở trùng.

3. **Home trong app con**
   - Khi bấm Home trong app con, cửa sổ app con sẽ đóng và focus lại Dashboard chính.

## Ghi chú

- Taskbar/installer vẫn dùng icon Easy Studio tổng.
- Titlebar của từng cửa sổ app con dùng icon riêng.
- Auto-update vẫn là update tổng Easy Studio, không tách riêng app con.
