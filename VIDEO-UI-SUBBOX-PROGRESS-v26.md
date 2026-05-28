# v26 — Video UI / Subtitle Box / Progress Fix

- Giữ lại `latestFinalVideoPath`, `latestFinalOutputFolderPath`, audio path và background path sau khi render để nút **Mở thư mục** vẫn biết nơi mở.
- Không destroy WaveSurfer ngay sau khi xuất video, tránh panel Dựng Video mất trạng thái.
- Progress bar trong panel Dựng Video chạy theo timer UI trong lúc pipeline FFmpeg đang xử lý.
- Thêm `Subtitle Box Width` vào Video Layout Manager.
- Subtitle render ra video dùng `boxWidth` để tính giới hạn dòng, tự xuống dòng và căn giữa.
- Thêm/giữ `Wave Height` trong UI để chỉnh chiều cao wavebar.

Lưu ý: nguyên nhân nút Mở thư mục báo không có thư mục là do bản trước clear `latestFinalVideoPath`, `waveAudioPath`, `waveBackgroundImagePath` trong `finally` ngay sau khi render xong.
