# Easy Studio v9 fixes

## Đã sửa trong bản này

1. Dashboard Shell chuyển sang tông sáng.
2. Bỏ panel mô tả dài, thay bằng tiêu đề EASY STUDIO ở giữa.
3. Ẩn menu Electron.
4. Bỏ sidebar/cột trái ở Dashboard.
5. 3 app card chỉ hiển thị icon + tên app.
6. App Script:
   - Đổi Easy English Script Studio -> Easy Script Studio.
   - Xóa các dòng mô tả dư.
   - Dịch panel tạo script sang tiếng Việt.
   - Đổi placeholder Script Preview / Bản dịch mẫu.
   - Bỏ nút Check Update trong app con.
7. App Voice:
   - Đổi tiêu đề ENGLISH VOICE GENERATOR -> EASY VOICE/VIDEO STUDIO.
   - About không còn check update riêng.
   - Tự khởi động backend Voice tại http://127.0.0.1:3030 để import Gemini/Vertex key không còn lỗi Failed to fetch.
8. App Thumbnail:
   - Bỏ nút Cập nhật riêng.
   - Chuyển theme sáng hơn.
   - Làm nổi bật title.
9. Auto-update:
   - App con không tự update riêng nữa.
   - Update sau này chỉ đặt ở Easy Studio Shell tổng.

## Cách chạy

Chạy file:
Start Easy Studio.bat

Hoặc:
npm install
npm run dev

## Lưu ý về key Voice

Lỗi "Failed to fetch" trước đó do backend Voice chưa được Shell khởi động.
Bản v9 đã tự start server `src/apps/easy-voice-video/server/index.mjs` khi mở Electron.
