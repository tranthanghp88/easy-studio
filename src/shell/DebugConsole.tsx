import { useEffect, useMemo, useState } from 'react';

type LogLevel = 'log' | 'info' | 'warn' | 'error';

type DebugLog = {
  id: number;
  level: LogLevel;
  time: string;
  message: string;
};

function stringifyArg(value: unknown) {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ''}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function DebugConsole() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>([]);

  useEffect(() => {
    let id = 1;
    const add = (level: LogLevel, args: unknown[]) => {
      const message = args.map(stringifyArg).join(' ');
      const time = new Date().toLocaleTimeString();
      setLogs((prev) => [...prev.slice(-299), { id: id++, level, time, message }]);
    };

    const original = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console)
    };

    console.log = (...args: unknown[]) => { original.log(...args); add('log', args); };
    console.info = (...args: unknown[]) => { original.info(...args); add('info', args); };
    console.warn = (...args: unknown[]) => { original.warn(...args); add('warn', args); };
    console.error = (...args: unknown[]) => { original.error(...args); add('error', args); };

    const onError = (event: ErrorEvent) => {
      add('error', [`${event.message} at ${event.filename}:${event.lineno}:${event.colno}`]);
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      add('error', ['Unhandled promise rejection:', event.reason]);
    };
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey && event.shiftKey && (key === 'k' || key === 'i')) || key === 'f12') {
        event.preventDefault();
        setOpen((x) => !x);
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    window.addEventListener('keydown', onKey);

    add('info', ['Easy Studio Console ready. Press Ctrl+Shift+K to toggle.']);

    return () => {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useMemo(() => logs.filter((x) => x.level === 'error').length, [logs]);

  return (
    <>
      {open && (
        <section className="es-debug-panel">
          <header className="es-debug-header">
            <strong>Easy Studio Console</strong>
            <div className="es-debug-actions">
              <button onClick={() => setLogs([])}>Clear</button>
              <button onClick={() => setOpen(false)}>Close</button>
            </div>
          </header>
          <div className="es-debug-body">
            {logs.length === 0 && <div className="es-debug-empty">Chưa có log.</div>}
            {logs.map((log) => (
              <div key={log.id} className={`es-debug-line ${log.level}`}>
                <span className="es-debug-time">{log.time}</span>
                <span className="es-debug-level">{log.level}</span>
                <pre>{log.message}</pre>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
