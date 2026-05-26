# Easy Studio v12 Fix Notes

- Added real Easy Script IPC handlers (`script:generate-step`, `script:load-project`, save/export/import/settings/test provider).
- Added real Easy Voice file/media handlers from the original Voice app where possible.
- Fixed Voice folder picker so string path returned from Electron is saved correctly.
- Restored colorful Voice action buttons and ordered them: Tạo giọng | Dựng Video | Ghép Video | Key Manager.
- Restyled BGM Manager and Laugh Manager pills closer to the original Voice style.
- Unified Home buttons across child apps with a simple light rounded style.
- Removed the aggressive global button override that made every app button look the same and colorless.
- Added dynamic title update: Easy Studio / Easy Studio — app name.
- Kept child app update buttons hidden; update will be handled by Shell About later.

Recommended test order:
1. Dashboard opens each app.
2. Script: load project, generate step, save/export, translate/copy.
3. Voice: select folder, key manager import, BGM/Laugh manager, generate voice, render video, merge video.
4. Thumbnail: tabs, settings, prompt generation, analysis, compose/export.
