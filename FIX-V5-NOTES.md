# Easy Studio Shell UI Fix v5

Đã sửa lại theo hướng giữ UI app con gốc hơn:

- Script: giữ CSS gốc và phục hồi nền sáng/gradient giống standalone. Nút Home trong Script vẫn trỏ về Dashboard.
- Voice: giữ nguyên UI hiện tại, không đụng sâu.
- Thumbnail: bỏ bản rewrite/fallback cũ, mount lại App Thumbnail gốc và map CSS theo class hiện tại. Có nút Home riêng về Dashboard.
- Shell: màn app con để background transparent để app con tự kiểm soát giao diện.

Lưu ý quan trọng: source Thumbnail bạn gửi có App.tsx dùng class `appShell/mainGrid`, nhưng style.css lại có nhiều class của một bản Thumbnail khác (`app/tabs/homeGrid/composerLayout`). Vì vậy bản này chỉ có thể làm UI ổn theo App.tsx hiện có. Nếu bạn muốn Thumb giống 100% bản đang chạy trên máy, cần gửi đúng zip Thumbnail mới nhất đang chạy ổn.
