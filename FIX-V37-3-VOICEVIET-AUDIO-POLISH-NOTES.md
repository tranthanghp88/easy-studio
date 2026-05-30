# FIX V37.3 — Voice Việt UI + Audio Polish

## Easy Voice Việt UI
- Đổi flow BGM: bỏ checkbox/nút kích hoạt BGM ngoài màn hình chính.
- Nút `Thiết lập BGM` luôn mở được để chọn/lưu BGM sau khi gen voice.
- BGM không còn được mix trực tiếp trong bước `Tạo giọng`; chỉ mix khi nghe thử/xuất MP3 trong panel BGM.
- Panel BGM được làm gọn:
  - Danh sách BGM cố định chiều cao, có thanh cuộn.
  - Mỗi BGM là 1 dòng: tên file | Xóa | ✓.
  - Các nút thao tác cùng một hàng, kích thước cố định: Thêm BGM, Nghe thử/Dừng, Mở thư mục BGM, Xuất MP3, Xong.
- Fade Out mặc định 0s.
- Nút Nghe thử/Dừng giữ nguyên kích thước, không làm nhảy layout.

## BGM Audio Polish
- Voice luôn là timeline chính.
- BGM dài hơn voice: tự cắt theo độ dài voice.
- BGM ngắn hơn voice: tự loop để đủ độ dài voice.
- Khi loop BGM, app tự skip một đoạn intro ngắn để điểm lặp ít bị hụt.
- `amix=duration=first` đảm bảo output không dài hơn voice.
- Fade Out cuối BGM vẫn có thể chỉnh, mặc định 0s.
- Không dùng file preview/mix làm source lần sau để tránh lỗi âm lượng nhỏ dần.

## English Preset Manager
- Preset Manager tiếp tục dùng dạng text-list, không card/block lớn.
- Khi bấm Chi tiết, thông tin preset hiển thị dạng:
  - Speed A - Pitch A - Pause A
  - Speed R - Pitch R - Pause R
  - Pause Block
