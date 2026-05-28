import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ShellLayout } from './shell/ShellLayout';
import { HomeDashboard } from './shell/HomeDashboard';
import { AppPlaceholder } from './shell/AppPlaceholder';
import { appRegistry, EasyStudioAppId } from './shell/appRegistry';
import { DebugConsole } from './shell/DebugConsole';

const EasyScriptMount = lazy(() => import('./shell/mounted/EasyScriptMount'));
const EasyThumbnailMount = lazy(() => import('./shell/mounted/EasyThumbnailMount'));
const EasyVoiceVideoMount = lazy(() => import('./shell/mounted/EasyVoiceVideoMount'));
const EasyVoiceVietMount = lazy(() => import('./shell/mounted/EasyVoiceVietMount'));

function AppLoading() {
  return <div className="es-loading-screen">Đang mở app...</div>;
}

export default function App() {
  const launchedApp = useMemo(() => {
    try {
      const appId = new URLSearchParams(window.location.search).get('app');
      return appRegistry.some((app) => app.id === appId) ? (appId as EasyStudioAppId) : null;
    } catch {
      return null;
    }
  }, []);

  const [currentApp, setCurrentApp] = useState<EasyStudioAppId | 'home'>(launchedApp || 'home');
  const activeApp = currentApp === 'home' ? null : appRegistry.find((app) => app.id === currentApp);


  useEffect(() => {
    const title = currentApp === 'home' ? 'Easy Studio' : `Easy Studio — ${activeApp?.name ?? ''}`;
    document.title = title;
    (window as any).easyStudio?.setActiveApp?.({ appId: currentApp, title });
  }, [currentApp, activeApp?.name]);

  useEffect(() => {
    const goHome = () => {
      if (launchedApp) {
        (window as any).easyStudio?.closeCurrentAppWindow?.();
        return;
      }
      setCurrentApp('home');
    };
    window.addEventListener('easy-studio:navigate-home', goHome as EventListener);
    (window as any).easyStudioNavigateHome = goHome;
    return () => {
      window.removeEventListener('easy-studio:navigate-home', goHome as EventListener);
      delete (window as any).easyStudioNavigateHome;
    };
  }, [launchedApp]);

  function renderCurrentApp() {
    if (currentApp === 'home') return <HomeDashboard onOpenApp={openApp} />;
    if (currentApp === 'thumbnail') return <EasyThumbnailMount />;
    if (currentApp === 'script') return <EasyScriptMount />;
    if (currentApp === 'voice-video') return <EasyVoiceVideoMount />;
    if (currentApp === 'easy-voice-viet') return <EasyVoiceVietMount />;
    return activeApp ? <AppPlaceholder app={activeApp} /> : null;
  }

  const openApp = (id: EasyStudioAppId) => {
    const api = (window as any).easyStudio;
    if (api?.openAppWindow) {
      api.openAppWindow(id).catch(() => setCurrentApp(id));
      return;
    }
    setCurrentApp(id);
  };

  return (
    <ShellLayout
      currentApp={currentApp}
      activeAppName={activeApp?.name ?? 'Home'}
      onHome={() => setCurrentApp('home')}
      onOpenApp={openApp}
    >
      <Suspense fallback={<AppLoading />}>{renderCurrentApp()}</Suspense>
      <DebugConsole />
    </ShellLayout>
  );
}
