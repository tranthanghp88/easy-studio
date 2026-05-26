import voiceVietCss from '../../apps/easy-voice-viet/src/style.css?inline';
import EasyVoiceViet from '../../apps/easy-voice-viet/src/main';
import { useMountedCss } from './useMountedCss';

const shellCss = `
.easy-voice-viet-scope {
  min-height: 100vh;
  width: 100%;
  position: relative;
  background: #eef3fb;
}
.easy-voice-viet-scope .voice-home-button {
  position: fixed !important;
  top: 22px !important;
  right: 22px !important;
  z-index: 99999 !important;
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
  cursor: pointer !important;
}
.easy-voice-viet-scope .voice-home-button:hover {
  transform: translateY(-2px) !important;
  background: linear-gradient(145deg, #ffffff 0%, #dbeafe 44%, #bfdbfe 100%) !important;
  box-shadow: 0 26px 60px rgba(37, 99, 235, .36), inset 0 1px 0 rgba(255,255,255,1) !important;
}
.easy-voice-viet-scope .es-home-svg {
  width: 34px !important;
  height: 34px !important;
  stroke: currentColor !important;
  stroke-width: 2.35 !important;
  fill: none !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
}
`;

function goHome() {
  window.dispatchEvent(new CustomEvent('easy-studio:navigate-home'));
}

export default function EasyVoiceVietMount() {
  useMountedCss(voiceVietCss, 'easy-voice-viet-css');
  useMountedCss(shellCss, 'easy-voice-viet-shell-css');

  return (
    <div className="easy-voice-viet-scope">
      <button className="voice-home-button" onClick={goHome} type="button" title="Về trang chủ Easy Studio" aria-label="Về trang chủ Easy Studio">
        <svg className="es-home-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 10.2V20h4.6v-5.4h3.2V20h4.6v-9.8"/></svg>
      </button>
      <EasyVoiceViet />
    </div>
  );
}
