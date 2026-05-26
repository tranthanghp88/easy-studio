# Easy Studio v14 fixes

- Home button enlarged and modernized.
- Re-registered critical IPC handlers directly in electron/main.cjs, including dialog:select-folder and Script load/save/import/export.
- Critical IPC handlers are registered both before and inside app.whenReady for stability.
- tsconfig moduleResolution switched to Bundler and nested app vite configs excluded from typecheck.
- AppPlaceholder icon type error fixed.

If terminal does not show `[easy-studio] critical IPC handlers registered`, you are not running this electron/main.cjs.
