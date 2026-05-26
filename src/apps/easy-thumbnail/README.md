# Easy Thumbnail Studio v7.1 Final Clean

## Có gì mới

- Home mở shell 3 app: Easy Script, Easy Voice/Video, Easy Thumbnail.
- Nút Home lớn và đẹp hơn.
- Nút Cập nhật hiển thị popup trạng thái.
- Bỏ badge version trên UI.
- Chỉ giữ nút Copy + Mở Flow, bỏ ImageFX.
- Tab Phân tích hỗ trợ ảnh và video mẫu.
- Video mẫu được dùng để phân tích style và tạo prompt thumbnail tương tự.
- Composer có live preview.
- Preview nhỏ hơn, có Fit/75%/50%.
- Vị trí X/Y có số âm/dương và vạch mốc - / 0 / +.
- Có nút random bố cục text, căn trên/giữa/dưới.
- Character Profile Manager.
- Dropdown đồng bộ nhân vật: Không bật / tên profile.
- Chế độ text: AI render text / chừa khoảng trống / Composer render text.
- Import font thủ công.
- UI tiếng Việt sạch hơn.

## Chạy app

```bash
npm install
npm run start
```

Hoặc bấm:

```text
start-dev.bat
```


## Fix

- Sửa lỗi `Identifier 'fontOptions' has already been declared`.


## Update v7.2

- Composer có thêm `🎲 Random đẹp`: random font, màu chữ, viền, shadow, vị trí.
- Composer có thêm `🤖 AI chọn style`: dùng Gemini phân tích ảnh nền và tự chọn font/màu/vị trí phù hợp.


## Update v7.3

- Thêm panel `Gợi ý AI` dưới Zoom Preview trong tab Ghép Thumbnail.
- AI có thể gợi ý font ngoài app kèm từ khóa tìm tải.
- Hiển thị số cho cỡ chữ, làm tối nền, độ dày viền, đổ bóng, X/Y.


## Update v7.4

- Phân tích video không gửi nguyên video lên Gemini nữa.
- App tự trích xuất 3 keyframe từ video, cho chọn frame rồi gửi ảnh frame đi phân tích.
- Giảm lỗi 503/quá tải, nhanh hơn và nhẹ quota hơn.


## Update v7.5

- Thêm retry tự động khi Gemini báo 503/429/quá tải.
- Thêm fallback model: 2.5 Flash Lite → 2.0 Flash Lite → 2.0 Flash → 2.5 Flash.
- Thêm chế độ phân tích Nhanh/Sâu.
- Mặc định dùng model nhẹ hơn để giảm lỗi high demand.
