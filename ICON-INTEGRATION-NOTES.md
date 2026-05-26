# Icon Integration Notes

This version includes the full Easy Studio icon system:

- `build/icons/easy-studio.ico` for the Windows app/taskbar/installer.
- `build/icons/easy-script.ico`, `easy-voice-video.ico`, `easy-thumbnail.ico` for dynamic titlebar icons.
- `public/icons/*.png` for the Dashboard app cards.
- `ICON-PACK/` contains the full reusable icon pack.

The existing `easy-studio:set-active-app` IPC handler updates the window title and titlebar icon when switching apps.

Expected titlebar behavior:

- Home → Easy Studio icon/title
- Easy Script → Easy Script icon/title
- Easy Voice/Video → Easy Voice/Video icon/title
- Easy Thumbnail → Easy Thumbnail icon/title

Windows taskbar/installer remains the Easy Studio icon because this is one executable shell app.
