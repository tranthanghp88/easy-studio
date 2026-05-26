const { ipcMain, shell, app } = require("electron");

function registerTemporaryShellHandlers() {
  const safeHandle = (channel, handler) => {
    try {
      ipcMain.handle(channel, handler);
    } catch {}
  };

  safeHandle("settings:load", async () => ({}));
  safeHandle("settings:save", async (_event, data) => data || {});
  safeHandle("app:get-version", async () => app.getVersion());
  safeHandle("app:get-update-status", async () => ({
    status: "idle",
    message: ""
  }));

  safeHandle("file:list-laugh-assets", async () => []);
  safeHandle("file:list-bgm-assets", async () => []);

  safeHandle("thumbnail:settings:get", async () => ({
    geminiApiKey: "",
    conceptModel: "gemini-2.5-flash",
    imageModel: "gemini-2.5-flash-image-preview",
    updateFeedUrl: "",
    defaultChannelName: "Easy English Channel"
  }));

  safeHandle("thumbnail:settings:save", async (_event, data) => data);

  safeHandle("thumbnail:concepts:generate", async () => {
    throw new Error("Thumbnail IPC chưa được nối handler thật.");
  });

  safeHandle("thumbnail:image:generate", async () => {
    throw new Error("Thumbnail Image IPC chưa được nối handler thật.");
  });

  safeHandle("thumbnail:image:save", async () => ({
    canceled: true
  }));

  safeHandle("thumbnail:open-external", async (_event, url) => {
    if (url) await shell.openExternal(url);
  });

  safeHandle("thumbnail:updates:check", async () => ({
    ok: true
  }));
}

module.exports = {
  registerTemporaryShellHandlers
};