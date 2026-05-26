# Báo cáo dọn dẹp file dự án (Cleanup Report)

Báo cáo này liệt kê các file và folder trong dự án, phân loại chúng theo mức độ có thể xóa và lý do.

---

## A. Chắc chắn có thể xóa (Definitely deletable)

Các file/folder này dường như không được sử dụng bởi ứng dụng hoặc quy trình build, và việc xóa chúng có mức độ rủi ro thấp đối với chức năng ứng dụng.

### 1. Folder `Task Log/` và tất cả các file `.md` bên trong

*   **Đường dẫn file/folder:** `Task Log/` (và các file `.md` bên trong, ví dụ: `Task Log/easy-script-studio-initial-build.md`, `Task Log/humanizer-ui-refactor.md`, v.v.)
*   **Lý do nghi là dư thừa:** Các file này là tài liệu hoặc nhật ký về các tác vụ phát triển trước đây. Chúng không phải là một phần của mã nguồn chạy ứng dụng hoặc quá trình build.
*   **Mức độ an toàn:** Cao (High)
*   **Có được import hoặc require ở đâu không:** Không. Đã kiểm tra toàn bộ codebase và không tìm thấy bất kỳ tham chiếu nào đến các file này trong mã nguồn JavaScript/TypeScript.
*   **Nếu xóa thì có rủi ro gì:** Mất đi lịch sử phát triển hoặc các ghi chú nội bộ. Sẽ không ảnh hưởng đến chức năng hoặc hiệu suất của ứng dụng.

---

## B. Có thể xóa nhưng cần xác nhận (Deletable with confirmation)

Các file/folder này có thể bị dư thừa nhưng cần xác nhận từ người phát triển để đảm bảo không có quy trình thủ công hoặc môi trường đặc biệt nào sử dụng chúng.

### 1. Các file Batch (`.bat`)

*   **Đường dẫn file/folder:**
    *   `Clean-Cache.bat`
    *   `clean-install.bat`
    *   `dev.bat`
    *   `Gemini GLC.bat`
    *   `install.bat`
    *   `Start.bat`
*   **Lý do nghi là dư thừa:** Các script batch này không được tham chiếu trong phần `scripts` của `package.json`. Điều này cho thấy chúng có thể là các script tiện ích thủ công, đã bị deprecated, hoặc đã được thay thế bằng các lệnh `npm` hoặc công cụ build khác (ví dụ: `npm run dev` thay cho `dev.bat`, `npm install` thay cho `install.bat`). Mục đích của `Gemini GLC.bat` và `Start.bat` chưa rõ ràng.
*   **Mức độ an toàn:** Trung bình (Medium) - Nếu chúng thực sự là các script thủ công không còn được sử dụng, việc xóa là an toàn. Tuy nhiên, nếu có quy trình phát triển, build hoặc khởi động ứng dụng nào đó vẫn dựa vào các script này mà không được ghi lại trong `package.json`, thì có rủi ro ảnh hưởng đến các quy trình đó.
*   **Có được import hoặc require ở đâu không:** Không. Đây là các script shell, không được import/require trực tiếp bởi mã JS/TS. Chúng cũng không được gọi từ `package.json`.
*   **Nếu xóa thì có rủi ro gì:** Một số quy trình thủ công liên quan đến phát triển, cài đặt, hoặc khởi động ứng dụng có thể bị gián đoạn nếu các script này vẫn được sử dụng. Cần xác nhận với nhóm phát triển.

---

## C. Không nên xóa (Not recommended to delete)

Các file/folder này là cần thiết cho hoạt động, cấu hình, hoặc build của dự án.

*   **Đường dẫn file/folder:**
    *   `package.json`
    *   `package-lock.json`
    *   `tsconfig.json`
    *   `vite.config.ts`
    *   `README.md`
    *   `index.html`
    *   `electron/main.cjs`
    *   `electron/preload.cjs`
    *   `src/main.tsx`
    *   `src/style.css`
    *   `src/types.d.ts`
    *   `src/vite-env.d.ts`
    *   `assets/icon/easy-script-studio-logo.ico`
*   **Lý do không nên xóa:**
    *   `package.json` & `package-lock.json`: Chứa thông tin về dự án, các dependencies và scripts cần thiết.
    *   `tsconfig.json`: Cấu hình cho TypeScript compiler.
    *   `vite.config.ts`: Cấu hình cho công cụ build Vite.
    *   `README.md`: Tài liệu chính của dự án.
    *   `index.html`: Điểm vào chính của giao diện người dùng (renderer process) cho cả môi trường web và Electron.
    *   `electron/main.cjs`: Script chính của Electron, quản lý cửa sổ, quá trình chính và các IPC handler.
    *   `electron/preload.cjs`: Script preload của Electron, cung cấp giao tiếp an toàn giữa renderer và main process.
    *   `src/main.tsx`: Điểm vào chính của ứng dụng React (UI).
    *   `src/style.css`: File CSS chứa các style toàn cục.
    *   `src/types.d.ts` & `src/vite-env.d.ts`: Các file khai báo kiểu TypeScript.
    *   `assets/icon/easy-script-studio-logo.ico`: Được xác nhận là được sử dụng bởi `electron/main.cjs` làm biểu tượng ứng dụng.
*   **Mức độ an toàn:** Thấp (Low) - Việc xóa bất kỳ file nào trong số này sẽ làm hỏng hoặc ngừng hoạt động của ứng dụng hoặc quá trình build.
*   **Có được import hoặc require ở đâu không:** Có. Tất cả đều được import/require trực tiếp, được cấu hình để sử dụng bởi hệ thống build hoặc bởi Electron runtime.
*   **Nếu xóa thì có rủi ro gì:** Ứng dụng sẽ không biên dịch, không chạy, hoặc mất đi các chức năng/giao diện quan trọng.

---

## D. Cần kiểm tra thủ công (Requires manual check)

Hiện tại, không có file nào được xác định rõ ràng là cần kiểm tra thủ công dựa trên phân tích import/require tự động. Các file `.bat` đã được đưa vào nhóm B vì chúng có khả năng là script thủ công.
