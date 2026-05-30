# v32 — Wavebar Engine V2

Đã nâng cấp wavebar render trong Easy Voice/Video:

- Reactive Spread: sóng lan ra nhiều cột hơn, không còn chỉ 1-2 cột nhảy.
- Speaking Boost: tăng độ nhạy theo giọng nói.
- Smart Smoothing: lên nhanh hơn, xuống mềm hơn.
- Neon Glow: thêm glow nhẹ quanh thanh sóng.
- Peak Marker: thêm điểm sáng ở đầu cột khi cột đủ cao.
- Speaker Color: wavebar đổi màu theo role A / R / BOTH.
- Wave Style Presets trong Video Layout: Calm / Podcast / Energetic.
- Mirror Mode tùy chọn.
- Thêm các control mới trong UI Video Layout:
  - Wave Style
  - Mirror Mode
  - Peak Marker
  - Độ lan sóng
  - Độ glow
  - Màu voice A / R / BOTH

Gợi ý test:
1. Mở Video Layout.
2. Chọn preset Podcast trước.
3. Nếu muốn sóng mạnh hơn, chọn Energetic.
4. Render thử 20-30s audio để kiểm tra nhịp sóng trước khi render tập dài.
