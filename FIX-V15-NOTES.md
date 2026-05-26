# Easy Studio v15

- Cleaned electron/main.cjs boot/register order.
- Removed the temporary script:generate-step override so the real Easy Script workflow handler can run.
- Force-registered missing file/dialog IPC handlers: dialog:select-folder, script:load-project, script:save-project, script:import-text, script:export-text.
- Upgraded Home buttons to a larger modern SVG icon style across Script, Voice, and Thumbnail.
- Added stronger CSS injection inside mounted app CSS so the Home button style is not overridden by app-local CSS.
