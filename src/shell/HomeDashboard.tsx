import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { appRegistry, EasyStudioAppId } from './appRegistry';

type Props = {
  onOpenApp: (id: EasyStudioAppId) => void;
};


function AppIcon({ type, name }: { type: string; name: string }) {
  const iconMap: Record<string, string> = {
    script: './icons/easy-script.png',
    voice: './icons/easy-voice-video.png',
    thumbnail: './icons/easy-thumbnail.png',
    'easy-voice-viet': './icons/easy-voice-viet.png'
  };

  return <img className="es-app-icon-img" src={iconMap[type] || './icons/easy-studio.png'} alt={name} />;
}

export function HomeDashboard({ onOpenApp }: Props) {
  const [showAbout, setShowAbout] = useState(false);
  const [version, setVersion] = useState('');
  const [updateMessage, setUpdateMessage] = useState('Ấn để kiểm tra bản cập nhật.');
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const api = (window as any).easyStudio;
    api?.getVersion?.().then((v: string) => setVersion(v || '')).catch(() => {});
    api?.getUpdateStatus?.().then((s: any) => {
      if (s?.status && s.status !== 'idle') setUpdateMessage(mapUpdateMessage(s));
    }).catch(() => {});
    return api?.onUpdateStatus?.((payload: any) => {
      setUpdateMessage(mapUpdateMessage(payload));
      if (payload?.status === 'downloaded' || payload?.readyToInstall || payload?.status === 'installing') setUpdateReady(true);
    });
  }, []);

  async function checkUpdate() {
    setUpdateReady(false);
    setUpdateMessage('Đang kiểm tra bản cập nhật...');
    try {
      const res = await (window as any).easyStudio?.checkForUpdates?.();
      if (res?.status || res?.message) setUpdateMessage(mapUpdateMessage(res));
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : 'Không kiểm tra được bản cập nhật.');
    }
  }

  function mapUpdateMessage(payload: any) {
    const status = payload?.status;
    if (status === 'checking') return 'Đang kiểm tra bản cập nhật.';
    if (status === 'available') return 'Đang tải bản cập nhật.';
    if (status === 'downloading') return 'Đang tải bản cập nhật.';
    if (status === 'downloaded' || status === 'installing') return 'Đang cài đặt bản cập nhật.';
    if (status === 'none') return 'Không có bản cập nhật mới.';
    if (status === 'dev') return 'Auto update chỉ hoạt động sau khi build installer.';
    if (status === 'error') return payload?.message || 'Không kiểm tra được bản cập nhật.';
    return payload?.message || 'Ấn để kiểm tra bản cập nhật.';
  }

  return (
    <div className="es-dashboard es-dashboard-clean">
      <button className="es-about-button es-update-trigger-button" type="button" onClick={() => setShowAbout(true)} aria-label="Mở panel update" title="Kiểm tra cập nhật">
        <RefreshCw className="es-update-trigger-icon" size={24} strokeWidth={2.5} />
      </button>

      <section className="es-studio-title">
        <img className="es-studio-logo-img" src="./icons/easy-studio.png" alt="Easy Studio" />
        <h1>EASY STUDIO</h1>
      </section>

      <section className="es-app-grid es-app-grid-clean">
        {appRegistry.map((app) => (
          <button className="es-app-card es-app-card-clean" key={app.id} onClick={() => onOpenApp(app.id)}>
            <div className="es-app-icon" aria-hidden="true"><AppIcon type={(app as any).icon} name={app.name} /></div>
            <div className="es-app-card-title">{app.name}</div>
          </button>
        ))}
      </section>

      {showAbout && (
        <div className="es-modal-backdrop" role="dialog" aria-modal="true">
          <section className="es-about-modal">
            <button className="es-modal-close" type="button" onClick={() => setShowAbout(false)} aria-label="Đóng">
              <X size={18} />
            </button>
            <div className="es-modal-icon"><img src="./icons/easy-studio.png" alt="Easy Studio" /></div>
            <h2>Easy Studio</h2>
            <p>Created by: Trần Văn Thắng</p>
            {version && <div className="es-version-line">Phiên bản: <b>{version}</b></div>}
            <div className="es-about-note es-update-single-status">
              {updateMessage}
            </div>
            <div className="es-update-actions">
              <button className="es-update-primary" type="button" onClick={checkUpdate}>Kiểm tra bản cập nhật</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
