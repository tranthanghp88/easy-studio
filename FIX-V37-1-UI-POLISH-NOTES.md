# FIX V37.1 UI Polish

## Easy Voice Việt
- Đổi nút `Thiết lập` thành `Thiết lập lưu Audio`.
- Fade Out BGM mặc định về `0s` cho người dùng mới.
- Bỏ block `Auto Match Voice Length` khỏi UI; backend vẫn luôn tự cut/loop/trim BGM theo độ dài voice.
- Nút Nghe thử BGM chuyển trạng thái `Nghe thử` ⇄ `Dừng`.
- Thêm nút `Xuất MP3` ngay trong panel Thiết lập BGM.
- Danh sách BGM đã lưu chuyển sang dạng compact:
  - khung cố định
  - có scrollbar
  - mỗi item 1 dòng: tên file | Xóa | dấu tích chọn
- Khi không chọn audio ngoài, BGM sẽ dùng audio mới nhất sau khi Generate.

## Easy Voice English
- Preset Manager chuyển sang dạng compact:
  - Tên Preset | Chi tiết | Sửa | ✓
- `Chi tiết` màu xanh lá và hiển thị nội dung preset bên dưới danh sách.
- Thêm nút `Xóa Preset` cạnh nút `Tạo Preset`.
- Xóa preset theo dấu tích chọn.
- Danh sách preset có chiều cao cố định và scrollbar.

## Backend
- Fallback Fade Out trong Easy Voice Việt đổi từ 2s về 0s.

## Lưu ý
- Chưa làm Tone Preset Engine trong bản này.
- Nên test lại BGM preview/export MP3 và Preset Manager trước khi sang v38.
