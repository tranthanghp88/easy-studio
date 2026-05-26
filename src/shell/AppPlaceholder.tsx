import { EasyStudioAppMeta } from './appRegistry';

type Props = {
  app: EasyStudioAppMeta;
};

export function AppPlaceholder({ app }: Props) {
  const Icon = app.icon;
  return (
    <div className="placeholder-card">
      <div className="placeholder-icon"><Icon /></div>
      <h2>{app.name}</h2>
      <p>{app.description}</p>
      <div className="path-box">Folder cần gắn app: <strong>{app.folder}</strong></div>
      <p className="muted">Hiện tại đây là màn hình giữ chỗ để tránh làm vỡ 3 app cũ. Khi copy source vào folder app, ta sẽ thay placeholder này bằng component thật.</p>
    </div>
  );
}
