import thumbnailCss from "../../apps/easy-thumbnail/src/style.css?inline";
import ThumbnailApp from "../../apps/easy-thumbnail/src/App.mount.jsx";
import { useMountedCss } from "./useMountedCss";

const shellBridgeCss = `
.easy-thumbnail-shell-host { min-height: 100vh; width: 100%; overflow: auto; background: #f7f9ff; }
/* v13 unified icon-only Home button */
.es-mounted-screen :is(.home-button, .voice-home-button, .homeBtn),
.easy-script-shell-host .home-button,
.voice-video-scope .voice-home-button,
.easy-thumbnail-shell-host .homeBtn {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
  padding: 0 !important;
  border-radius: 14px !important;
  border: 1px solid rgba(15, 23, 42, .10) !important;
  background: #ffffff !important;
  color: #2563eb !important;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .10) !important;
  display: inline-grid !important;
  place-items: center !important;
  line-height: 1 !important;
  font-size: 0 !important;
  gap: 0 !important;
  text-indent: 0 !important;
  overflow: hidden !important;
}
.es-mounted-screen :is(.home-button, .voice-home-button, .homeBtn):hover,
.easy-script-shell-host .home-button:hover,
.voice-video-scope .voice-home-button:hover,
.easy-thumbnail-shell-host .homeBtn:hover {
  background: #eff6ff !important;
  border-color: rgba(37, 99, 235, .28) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 14px 30px rgba(37, 99, 235, .18) !important;
}
.es-mounted-screen :is(.es-home-icon, .homeIconBtn),
.easy-script-shell-host .es-home-icon,
.voice-video-scope .es-home-icon,
.easy-thumbnail-shell-host .homeIconBtn {
  width: 22px !important;
  height: 22px !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #2563eb !important;
  display: inline-grid !important;
  place-items: center !important;
  font-size: 22px !important;
  line-height: 1 !important;
  font-weight: 900 !important;
}


/* v15 premium shared Home button - visible and modern */
.es-mounted-screen :is(.home-button, .voice-home-button, .homeBtn),
.easy-script-shell-host .home-button,
.voice-video-scope .voice-home-button,
.easy-thumbnail-shell-host .homeBtn {
  width: 66px !important;
  height: 66px !important;
  min-width: 66px !important;
  min-height: 66px !important;
  padding: 0 !important;
  border-radius: 22px !important;
  border: 1px solid rgba(37, 99, 235, .42) !important;
  background: linear-gradient(145deg, #ffffff 0%, #e0f2fe 46%, #dbeafe 100%) !important;
  color: #0b63f6 !important;
  box-shadow: 0 22px 48px rgba(37, 99, 235, .28), inset 0 1px 0 rgba(255,255,255,.95) !important;
  display: inline-grid !important;
  place-items: center !important;
  line-height: 1 !important;
  font-size: 0 !important;
  gap: 0 !important;
  text-indent: 0 !important;
  overflow: hidden !important;
  cursor: pointer !important;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease !important;
  position: relative !important;
  z-index: 50 !important;
}
.es-mounted-screen :is(.home-button, .voice-home-button, .homeBtn)::after,
.easy-script-shell-host .home-button::after,
.voice-video-scope .voice-home-button::after,
.easy-thumbnail-shell-host .homeBtn::after {
  content: '' !important;
  position: absolute !important;
  inset: 8px !important;
  border-radius: 17px !important;
  border: 1px solid rgba(255,255,255,.75) !important;
  pointer-events: none !important;
}
.es-mounted-screen :is(.home-button, .voice-home-button, .homeBtn):hover,
.easy-script-shell-host .home-button:hover,
.voice-video-scope .voice-home-button:hover,
.easy-thumbnail-shell-host .homeBtn:hover {
  background: linear-gradient(145deg, #ffffff 0%, #bfdbfe 100%) !important;
  border-color: rgba(37, 99, 235, .68) !important;
  transform: translateY(-2px) scale(1.04) !important;
  box-shadow: 0 26px 56px rgba(37, 99, 235, .34), inset 0 1px 0 rgba(255,255,255,.98) !important;
}
.es-mounted-screen :is(.es-home-icon, .homeIconBtn, .es-home-svg),
.easy-script-shell-host :is(.es-home-icon, .es-home-svg),
.voice-video-scope :is(.es-home-icon, .es-home-svg),
.easy-thumbnail-shell-host :is(.homeIconBtn, .es-home-svg) {
  width: 34px !important;
  height: 34px !important;
  display: block !important;
  color: #0b63f6 !important;
  stroke: currentColor !important;
  fill: none !important;
  stroke-width: 2.4 !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
  filter: drop-shadow(0 5px 10px rgba(37,99,235,.22)) !important;
}
.easy-thumbnail-shell-host .homeText { display: none !important; }


/* === Easy Studio Home Button Final Fix ===
   Giữ 1 nút Home của app con, bỏ overlay của Shell.
   Đồng bộ icon Home dạng premium ở Script / Voice / Thumbnail.
*/
.es-shell-home-button-fixed {
  display: none !important;
}

.es-mounted-screen :is(.home-button, .voice-home-button, .homeBtn),
.easy-script-shell-host .home-button,
.voice-video-scope .voice-home-button,
.easy-thumbnail-shell-host .homeBtn {
  width: 66px !important;
  height: 66px !important;
  min-width: 66px !important;
  min-height: 66px !important;
  padding: 0 !important;
  border-radius: 22px !important;
  border: 1px solid rgba(37, 99, 235, .42) !important;
  background: linear-gradient(145deg, #ffffff 0%, #e0f2fe 46%, #dbeafe 100%) !important;
  color: #0b63f6 !important;
  box-shadow: 0 22px 48px rgba(37, 99, 235, .28), inset 0 1px 0 rgba(255,255,255,.95) !important;
  display: inline-grid !important;
  place-items: center !important;
  line-height: 1 !important;
  font-size: 0 !important;
  gap: 0 !important;
  text-indent: 0 !important;
  overflow: hidden !important;
  cursor: pointer !important;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease !important;
  z-index: 100000 !important;
}

.es-mounted-screen :is(.home-button, .voice-home-button, .homeBtn)::after,
.easy-script-shell-host .home-button::after,
.voice-video-scope .voice-home-button::after,
.easy-thumbnail-shell-host .homeBtn::after {
  content: '' !important;
  position: absolute !important;
  inset: 8px !important;
  border-radius: 17px !important;
  border: 1px solid rgba(255,255,255,.75) !important;
  pointer-events: none !important;
}

.es-mounted-screen :is(.home-button, .voice-home-button, .homeBtn):hover,
.easy-script-shell-host .home-button:hover,
.voice-video-scope .voice-home-button:hover,
.easy-thumbnail-shell-host .homeBtn:hover {
  background: linear-gradient(145deg, #ffffff 0%, #bfdbfe 100%) !important;
  border-color: rgba(37, 99, 235, .68) !important;
  transform: translateY(-2px) scale(1.04) !important;
  box-shadow: 0 26px 56px rgba(37, 99, 235, .34), inset 0 1px 0 rgba(255,255,255,.98) !important;
}

.es-mounted-screen :is(.es-home-icon, .homeIconBtn, .es-home-svg),
.easy-script-shell-host :is(.es-home-icon, .es-home-svg),
.voice-video-scope :is(.es-home-icon, .es-home-svg),
.easy-thumbnail-shell-host :is(.homeIconBtn, .es-home-svg) {
  width: 34px !important;
  height: 34px !important;
  display: block !important;
  color: #0b63f6 !important;
  stroke: currentColor !important;
  fill: none !important;
  stroke-width: 2.4 !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
  filter: drop-shadow(0 5px 10px rgba(37,99,235,.22)) !important;
}

/* Voice không có topbar riêng nên cố định về góc phải trên, không lệch trái. */
.voice-video-scope .voice-home-button {
  position: fixed !important;
  top: 52px !important;
  right: 42px !important;
  left: auto !important;
}

/* Thumbnail / Script dùng nút Home trong topbar sẵn có, không hiện chữ kèm theo. */
.easy-thumbnail-shell-host .homeText,
.easy-script-shell-host .home-button span:not(.es-home-icon) {
  display: none !important;
}


`;

export default function EasyThumbnailMount() {
  useMountedCss(thumbnailCss + "\n" + shellBridgeCss, "easy-thumbnail-original-app-css-v7");

  return (
    <div className="easy-thumbnail-shell-host">
      <ThumbnailApp />
    </div>
  );
}
