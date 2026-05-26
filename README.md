# Easy Studio Shell Base

Đây là khung shell tổng, chưa bao gồm code của 3 app con.

## Cấu trúc

```text
src/apps/easy-script/
src/apps/easy-voice-video/
src/apps/easy-thumbnail/
```

Copy source từng app vào đúng folder trên, sau đó thay `AppPlaceholder` bằng component thật của từng app.

## Chạy thử

```bash
npm install
npm run dev
```

## Lưu ý

Không copy `node_modules`, `dist`, `build output`, `logs`, `temp`, `cache`, `.env`, file key JSON vào shell nếu không cần.
