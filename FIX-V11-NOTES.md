# Fix v11

- Đổi nút Dashboard `About / Update` thành `About`.
- Đổi icon Easy Voice / Video ngoài Dashboard sang icon micro phòng thu dạng SVG custom.
- App Script: đưa nút Home sang cụm nút bên phải.
- App Script: đổi lựa chọn `Podcast 2 speakers - A/R` thành nhãn tiếng Việt `Podcast 2 người nói - A/R` nhưng vẫn giữ value cũ để không ảnh hưởng prompt/backend.
- Gia cố style nút thống nhất hơn cho Script, Voice và Thumbnail.
- Ẩn nút update riêng trong Thumbnail mount bằng CSS.

Lưu ý: chưa chạy build trong sandbox vì folder không có node_modules/vite. Sau khi giải nén, chạy `npm install` rồi `npm run dev`.
