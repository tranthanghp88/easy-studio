import React from "react";
import { FaCheck, FaFileImport, FaKey, FaSyncAlt, FaTimes, FaTrash } from "react-icons/fa";

type VertexProfile = {
  id: string;
  name: string;
  projectId?: string;
  location?: string;
  model?: string;
  credentialsPath?: string;
  credentialsExists?: boolean;
  isActive?: boolean;
  builtIn?: boolean;
};

type VertexProfileManagerPanelProps = {
  show: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export default function VertexProfileManagerPanel({ show, onClose, onChanged }: VertexProfileManagerPanelProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [profiles, setProfiles] = React.useState<VertexProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = React.useState("");
  const [profileName, setProfileName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const apiBase = window.electronAPI?.isDesktop ? "http://127.0.0.1:3030" : "";

  const activeProfile = React.useMemo(() => profiles.find((p) => p.id === activeProfileId), [profiles, activeProfileId]);

  const fetchProfiles = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/vertex-profiles`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Không tải được Vertex profiles.");
      setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveProfileId(String(data.activeProfileId || ""));
      setMessage("Đã tải Vertex profiles.");
    } catch (error: any) {
      setMessage(error?.message || "Không tải được Vertex profiles.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  React.useEffect(() => {
    if (show) void fetchProfiles();
  }, [show, fetchProfiles]);

  if (!show) return null;

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setLoading(true);
      setMessage("Đang import service-account JSON...");
      const credentialsJson = await file.text();
      const res = await fetch(`${apiBase}/api/vertex-profiles/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName.trim() || file.name.replace(/\.json$/i, ""),
          credentialsJson,
          location: "us-central1",
          model: "gemini-2.5-flash-tts"
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Import Vertex profile thất bại.");
      setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveProfileId(String(data.activeProfileId || data.profile?.id || ""));
      setProfileName("");
      setMessage("Đã import và kích hoạt Vertex profile mới.");
      onChanged?.();
    } catch (error: any) {
      setMessage(error?.message || "Import Vertex profile thất bại.");
      alert(error?.message || "Import Vertex profile thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(profileId: string) {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/vertex-profiles/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Không kích hoạt được profile.");
      setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveProfileId(String(data.activeProfileId || profileId));
      setMessage("Đã đổi active Vertex profile.");
      onChanged?.();
    } catch (error: any) {
      setMessage(error?.message || "Không kích hoạt được profile.");
      alert(error?.message || "Không kích hoạt được profile.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(profileId: string) {
    if (!confirm("Xóa Vertex profile này? File credential đã import cũng sẽ bị xóa khỏi thư mục app.")) return;
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/vertex-profiles/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Không xóa được profile.");
      setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveProfileId(String(data.activeProfileId || ""));
      setMessage("Đã xóa Vertex profile.");
      onChanged?.();
    } catch (error: any) {
      setMessage(error?.message || "Không xóa được profile.");
      alert(error?.message || "Không xóa được profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <FaKey className="text-indigo-600" />
            Vertex Profile Manager
          </div>
          <div className="mt-1 text-sm text-slate-500">Import nhiều tài khoản Vertex AI và chọn profile active mà không sửa code.</div>
        </div>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <FaTimes /> Đóng
        </button>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
        Key/job hiển thị là <b>VERTEX AI</b>. Profile active: <b>{activeProfile?.name || "Chưa chọn"}</b>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Tên profile, ví dụ: Trial Account 2" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white shadow disabled:opacity-60">
          <FaFileImport /> Import JSON
        </button>
        <button type="button" onClick={() => void fetchProfiles()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-slate-700 shadow-sm disabled:opacity-60">
          <FaSyncAlt className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>

      {message ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">Profile</th>
              <th className="px-3 py-2 text-left">Project</th>
              <th className="px-3 py-2 text-left">Model</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length ? profiles.map((profile) => (
              <tr key={profile.id} className={profile.id === activeProfileId ? "border-t bg-indigo-50" : "border-t bg-white"}>
                <td className="px-3 py-3 font-medium text-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{profile.name || profile.id}</span>
                    {profile.id === activeProfileId ? <span className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white">Active</span> : null}
                    {profile.builtIn ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Default</span> : null}
                    {!profile.credentialsExists ? <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Missing JSON</span> : null}
                  </div>
                  <div className="mt-1 max-w-md truncate font-mono text-xs text-slate-500" title={profile.credentialsPath}>{profile.credentialsPath || "-"}</div>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-slate-700">{profile.projectId || "-"}<div className="mt-1 text-slate-500">{profile.location || "us-central1"}</div></td>
                <td className="px-3 py-3 text-slate-700">{profile.model || "gemini-2.5-flash-tts"}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => void handleActivate(profile.id)} disabled={loading || profile.id === activeProfileId || !profile.credentialsExists} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"><FaCheck /> Dùng</button>
                    {!profile.builtIn ? <button type="button" onClick={() => void handleDelete(profile.id)} disabled={loading} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"><FaTrash /> Xóa</button> : null}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Chưa có Vertex profile. Hãy import service-account JSON.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
