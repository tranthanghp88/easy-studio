# Voice Video Modal Fix v21

Đã sửa riêng phần **Dựng Video** của app Easy Voice/Video.

Nguồn soát:
- `electron(1).zip`: source Shell đang lỗi
- `Rà soát(4).zip`: app Voice standalone đang chạy ổn

Nguyên nhân:
- CSS fallback/shared button trong Shell áp quá rộng vào toàn bộ `button`.
- Một số class responsive Tailwind như `md:flex-row` chưa được fallback, làm hàng nút trong modal bị xếp dọc và stretch full width.
- Modal `Dựng Video` và `Video Layout Manager` bị dính style đồng bộ button của Shell.

File đã sửa:
- `src/apps/easy-voice-video/voice-fallback.css`
- `src/apps/easy-voice-video/components/WaveformDialog.tsx`
- `src/apps/easy-voice-video/components/VideoLayoutManagerDialog.tsx`

Phạm vi sửa:
- Chỉ scope lại UI modal Dựng Video / Video Layout.
- Không sửa flow render, IPC, backend, timeline, subtitle.
