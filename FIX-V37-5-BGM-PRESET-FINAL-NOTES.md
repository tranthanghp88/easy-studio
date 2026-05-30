# FIX V37.5 — BGM + Preset UI Final Polish

## Easy Voice English
- Preset Manager giữ dạng text-list gọn.
- Tiêu đề preset căn trái.
- Chi tiết preset chỉ hiện khi bấm nút Chi tiết.
- Chi tiết hiển thị đúng format:
  - Speed A - Pitch A - Pause A
  - Speed R - Pitch R - Pause R
  - Pause Block
- Dấu tích chọn preset đổi thành checkbox vuông giống dòng "Dùng Preset mặc định của Voice".
- Bỏ nút Nghe thử trong Preset Manager để tránh lệch form.

## Easy Voice Việt
- Nút Thiết lập BGM sửa lại màu/icon, không bị trùng icon.
- UI BGM gọn lại, các nút sát nhau và giữ kích thước cố định.
- Danh sách BGM compact hơn, nút Xóa màu đỏ, dấu tích màu xanh.
- Thêm lựa chọn nguồn audio rõ ràng:
  - Audio vừa gen
  - Audio ngoài
- Khi chọn Audio ngoài, app chỉ ghép audio ngoài, không nối thêm audio vừa gen.
- Khi chọn Audio vừa gen, app chỉ ghép file vừa gen, không nối thêm audio ngoài.

## BGM Audio Polish
- Fade In BGM được hiểu là intro BGM trước khi voice bắt đầu.
  Ví dụ Fade In = 2s => BGM chạy trước 2s, sau đó voice mới vào.
- Fade Out chỉ áp dụng cho BGM ở cuối, không fade voice.
- BGM được tự loop/cut/trim theo độ dài final target.
- Output cuối được trim theo: voice duration + fade-in intro.
