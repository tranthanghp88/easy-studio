import type { ReactNode } from 'react';
import { EasyStudioAppId } from './appRegistry';

type Props = {
  currentApp: EasyStudioAppId | 'home';
  activeAppName: string;
  children: ReactNode;
  onHome: () => void;
  onOpenApp: (id: EasyStudioAppId) => void;
};

export function ShellLayout({ currentApp, children }: Props) {
  if (currentApp !== 'home') {
    return <div className="es-mounted-screen">{children}</div>;
  }

  return (
    <div className="es-root es-root-home-only">
      <main className="es-main es-home-main">
        <section className="es-content es-home-content">{children}</section>
      </main>
    </div>
  );
}
