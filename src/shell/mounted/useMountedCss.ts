import { useEffect } from 'react';

function prefixSelector(selector: string, scopeClass: string) {
  const scope = `.${scopeClass}`;
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith(scope)) return trimmed;
  if (trimmed === 'html' || trimmed === 'body' || trimmed === ':root') return scope;
  if (trimmed === '*') return `${scope} *`;
  if (trimmed.startsWith('html ') || trimmed.startsWith('body ')) {
    return `${scope} ${trimmed.replace(/^(html|body)\s+/, '')}`;
  }
  if (trimmed.startsWith('@')) return trimmed;
  return `${scope} ${trimmed}`;
}

function scopeCss(cssText: string, scopeClass: string) {
  return cssText.replace(/([^{}]+)\{([^{}]*)\}/g, (full, selectorText, body) => {
    const selector = String(selectorText).trim();
    if (!selector || selector.startsWith('@font-face') || selector.startsWith('@keyframes') || selector.startsWith('from') || selector.startsWith('to')) {
      return full;
    }
    if (selector.startsWith('@')) return full;
    const scopedSelector = selector
      .split(',')
      .map((part) => prefixSelector(part, scopeClass))
      .join(', ');
    return `${scopedSelector} {${body}}`;
  });
}

export function useMountedCss(cssText: string, styleId: string, scopeClass?: string) {
  useEffect(() => {
    const previous = document.getElementById(styleId);
    previous?.remove();

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = scopeClass ? scopeCss(cssText, scopeClass) : cssText;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, [cssText, styleId, scopeClass]);
}
