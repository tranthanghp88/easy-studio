# Easy Studio Shell UI Fix v4

## Thay đổi chính
- Khôi phục app Thumbnail bằng đúng source trong file `electron.zip` bạn gửi lại.
- Giữ giao diện Thumbnail theo App gốc, không dùng bản fallback viết lại flow.
- Thêm nút `← Home` riêng cho Thumbnail để quay về Dashboard.
- Giữ nút `← Home` của Voice.
- Giữ app Script ở kiểu standalone để tránh hỏng UI.

## Lưu ý quan trọng
File `electron.zip` bạn gửi có `src/App.tsx` dạng `window.thumbnailAPI` nhưng `src/style.css` có vẻ là style từ một phiên bản khác. Vì vậy bản v4 vẫn dùng CSS mount phù hợp với `App.tsx` hiện tại để tránh vỡ giao diện.

## Chạy app
```bat
npm install
npm run dev
```

Hoặc dùng:
```bat
Start Easy Studio.bat
```

## Có thể sửa chi tiết trong app con không?
Có. Nên sửa từng app một:
1. Script trước vì đã gần ổn.
2. Thumbnail sau khi xác nhận đúng bản gốc.
3. Voice cuối cùng vì phức tạp nhất.
