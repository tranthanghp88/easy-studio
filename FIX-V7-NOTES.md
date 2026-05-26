# Fix V7

- Sửa đúng App Thumbnail gốc từ file `electron.zip`: app thật nằm trong `src/main.jsx`, không phải `src/App.tsx`.
- Tạo `src/apps/easy-thumbnail/src/App.mount.jsx` từ `main.jsx` để mount vào Shell mà không tự createRoot lần nữa.
- Mount lại Thumbnail bằng CSS gốc `src/style.css`, không dùng UI concept cũ nữa.
- Nối thêm IPC legacy `window.easyAPI` cho Thumbnail: config, save/copy, import font, analyze media, suggest style, check update.
