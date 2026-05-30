# FIX V31 — Icon + Popup Title

Đã sửa:
- Đổi app name/productName sang `Easy Studio` để popup/dialog không còn hiện `easy-studio-shell`.
- Thêm `app.setName('Easy Studio')` trong `electron/main.cjs`.
- BrowserWindow chính dùng icon `build/icons/easy-studio.ico` ngay trong constructor.
- `getIconPath()` ưu tiên icon ngoài `app.asar` tại `process.resourcesPath/build/icons`.
- Thêm `build/icons` vào `extraResources` để icon taskbar/installer ổn định hơn sau khi build.

Sau khi build lại, nếu taskbar vẫn cache icon cũ:
- Gỡ bản cài cũ.
- Cài lại bản mới.
- Hoặc restart Windows Explorer / restart máy để Windows clear icon cache.
