# Easy Studio Shell - bản đã sửa mount cơ bản

Đã sửa:
- Thêm `src/shell/mounted/EasyThumbnailMount.tsx`
- Thêm `src/shell/mounted/EasyScriptMount.tsx`
- Thêm `src/shell/mounted/EasyVoiceVideoMount.tsx`
- Tạo `src/apps/easy-script/src/App.mount.tsx` để mount Easy Script mà không tự `createRoot`
- Sửa `src/App.tsx` để mở app thật theo `currentApp`
- Sửa `tsconfig.json`: `allowJs`, `jsx`, `ignoreDeprecations`
- Bổ sung dependency còn thiếu vào `package.json`: `wavesurfer.js`, `react-icons`, `@google/genai`, `electron-updater`, server deps của Voice...
- Gộp khai báo preload API cơ bản vào `electron/preload.cjs`

Lưu ý:
- Đây là bước mount UI/app cơ bản.
- Các IPC handler sâu của từng app, đặc biệt Voice/Video và Thumbnail image generation, có thể cần merge tiếp vào `electron/main.cjs`.
- Chạy lại:
  npm install
  npm run dev

## Layout fix v2
- Khi mở app con, Shell không còn bọc bằng sidebar/header nữa.
- App con chạy full-screen để tránh vỡ CSS.
- Thêm nút nổi `← Home` ở góc phải trên.
- Scope lại rule `h1` của Shell để không đè style app con.
