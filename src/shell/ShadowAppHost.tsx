import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  children: React.ReactNode;
  cssText?: string;
  rootClassName?: string;
};

export function ShadowAppHost({ children, cssText = '', rootClassName = '' }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; min-height: 100vh; width: 100%; }
      .shadow-app-root { min-height: 100vh; width: 100%; }
      ${cssText || ''}
    `;

    const root = document.createElement('div');
    root.className = ['shadow-app-root', rootClassName].filter(Boolean).join(' ');

    shadow.appendChild(style);
    shadow.appendChild(root);
    setMountNode(root);

    return () => {
      setMountNode(null);
      shadow.innerHTML = '';
    };
  }, [cssText, rootClassName]);

  return <div ref={hostRef} className="easy-studio-shadow-host">{mountNode ? createPortal(children, mountNode) : null}</div>;
}
