import voiceCss from "../../apps/easy-voice-video/voice-fallback.css?inline";
import VoiceVideoApp from "../../apps/easy-voice-video/App";
import { useMountedCss } from "./useMountedCss";

function goHome() {
  window.dispatchEvent(new CustomEvent("easy-studio:navigate-home"));
}

export default function EasyVoiceVideoMount() {
  useMountedCss(voiceCss, "easy-voice-video-fallback-css");

  return (
    <div className="voice-video-scope">
      <button className="voice-home-button" onClick={goHome} type="button" title="Về trang chủ Easy Studio" aria-label="Về trang chủ Easy Studio">
        <svg className="es-home-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 10.2V20h4.6v-5.4h3.2V20h4.6v-9.8"/></svg>
      </button>
      <VoiceVideoApp />
    </div>
  );
}
