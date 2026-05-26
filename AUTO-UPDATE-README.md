# Easy Studio Auto Update

Auto update hiện được quản lý ở Shell tổng Easy Studio, không update riêng từng app con.

## Cách build thử

```bat
npm install
npm run dist:win
```

File build sẽ nằm trong thư mục `release/`.

## Cách dùng update thật

1. Mở `package.json`.
2. Sửa dòng publish URL:

```json
"publish": [
  { "provider": "generic", "url": "https://your-domain.com/easy-studio-updates/" }
]
```

3. Mỗi lần ra bản mới, tăng `version`, ví dụ `1.0.1`.
4. Chạy `npm run dist:win`.
5. Upload toàn bộ file update trong `release/` lên URL update.
6. Trong app bấm `About` → `Kiểm tra cập nhật`.

## Lưu ý

- Bản dev chạy bằng `npm run dev` sẽ báo: Auto update chỉ hoạt động sau khi build installer.
- App con Script/Voice/Thumbnail không cần nút update riêng.
- Người dùng chỉ cần update Easy Studio một lần.
