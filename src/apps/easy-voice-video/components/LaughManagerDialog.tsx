
import React, { useEffect, useMemo, useState } from "react";
import type { LaughAssetItem, LaughAssetMode, LaughRoleFilter } from "../shared/types/timeline";

const TYPE_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "giggle", label: "Giggle" },
  { value: "long", label: "Long" },
  { value: "misc", label: "Misc" }
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  laughAssetMode: LaughAssetMode;
  setLaughAssetMode: (mode: LaughAssetMode) => void;
};

export default function LaughManagerDialog({ open, onClose, laughAssetMode, setLaughAssetMode }: Props) {
  const [assets, setAssets] = useState<LaughAssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<LaughRoleFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [importRole, setImportRole] = useState<"A"|"R"|"BOTH">("BOTH");
  const [importType, setImportType] = useState<"short"|"giggle"|"long"|"misc">("short");
  const [playingId, setPlayingId] = useState("");
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [libraryDir, setLibraryDir] = useState("");

  const loadAssets = async () => {
    if (!window.electronAPI?.listLaughAssets) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.listLaughAssets();
      if (result?.ok) {
        setAssets(Array.isArray(result.assets) ? (result.assets as LaughAssetItem[]) : []);
        setLibraryDir(String(result.libraryDir || ""));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadAssets();
  }, [open]);

  useEffect(() => () => {
    try { audio?.pause(); } catch {}
  }, [audio]);

  const filtered = useMemo(() => {
    return assets.filter((item) => {
      if (roleFilter !== "ALL" && item.role !== roleFilter) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      return true;
    });
  }, [assets, roleFilter, typeFilter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-800">Laugh Manager</div>
          </div>
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>Đóng</button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4 rounded-2xl border bg-slate-50 p-4">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Chế độ file laugh</div>
              <select
                value={laughAssetMode}
                onChange={(e) => setLaughAssetMode(e.target.value as LaughAssetMode)}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="off">Tắt - reaction cười dùng Gemini</option>
                <option value="auto">Bật - ưu tiên file có sẵn, thiếu thì dùng Gemini</option>
                <option value="force">Chỉ dùng file có sẵn</option>
              </select>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Thêm file mới</div>
              <div className="grid gap-2">
                <select value={importRole} onChange={(e) => setImportRole(e.target.value as "A"|"R"|"BOTH")} className="rounded-xl border px-3 py-2">
                  <option value="A">Role A</option>
                  <option value="R">Role R</option>
                  <option value="BOTH">Role BOTH</option>
                </select>
                <select value={importType} onChange={(e) => setImportType(e.target.value as any)} className="rounded-xl border px-3 py-2">
                  {TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <button
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                  onClick={async () => {
                    const picked = await window.electronAPI?.selectAudioFiles?.();
                    const files = Array.isArray(picked?.paths) ? picked.paths : [];
                    if (!files.length) return;
                    const result = await window.electronAPI?.importLaughAssets?.({ files, role: importRole, type: importType });
                    if (!result?.ok) {
                      alert(result?.error || "Import thất bại");
                      return;
                    }
                    await loadAssets();
                  }}
                >
                  Import file laugh
                </button>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Lọc hiển thị</div>
              <div className="grid gap-2">
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as LaughRoleFilter)} className="rounded-xl border px-3 py-2">
                  <option value="ALL">A / R / BOTH</option>
                  <option value="A">A</option>
                  <option value="R">R</option>
                  <option value="BOTH">BOTH</option>
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border px-3 py-2">
                  <option value="all">Tất cả loại</option>
                  {TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={async () => {
                    if (!libraryDir) return;
                    const result = await window.electronAPI?.openFolderPath?.({ path: libraryDir });
                    if (!result?.ok) alert(result?.error || "Không mở được thư mục");
                  }}
                >
                  Mở thư mục laugh
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-slate-800">Danh sách file ({filtered.length})</div>
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={loadAssets}>{loading ? "Đang tải..." : "Làm mới"}</button>
            </div>

            <div className="max-h-[520px] overflow-auto rounded-xl border">
              {!filtered.length ? (
                <div className="p-6 text-sm text-slate-500">Chưa có file laugh phù hợp.</div>
              ) : (
                <div className="divide-y">
                  {filtered.map((item) => (
                    <div key={item.id} className="grid gap-3 p-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div>
                        <div className="font-medium text-slate-800">{item.fileName}</div>
                        <div className="mt-1 text-xs text-slate-500">Role: {item.role} • Type: {item.type}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-lg border px-3 py-2 text-sm"
                          onClick={async () => {
                            try {
                              if (playingId === item.id && audio) {
                                audio.pause();
                                setPlayingId("");
                                return;
                              }
                              const r = await window.electronAPI?.readAudioFile?.({ filePath: item.filePath });
                              if (!r?.ok || !r?.arrayBuffer) {
                                alert(r?.error || "Không đọc được file");
                                return;
                              }
                              try { audio?.pause(); } catch {}
                              const blob = new Blob([new Uint8Array(r.arrayBuffer)], { type: "audio/wav" });
                              const url = URL.createObjectURL(blob);
                              const el = new Audio(url);
                              el.onended = () => setPlayingId("");
                              setAudio(el);
                              setPlayingId(item.id);
                              await el.play();
                            } catch (e: any) {
                              alert(e?.message || "Không phát được audio");
                            }
                          }}
                        >
                          {playingId === item.id ? "Dừng" : "Nghe thử"}
                        </button>
                        <button
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white"
                          onClick={async () => {
                            if (!window.confirm(`Xóa file ${item.fileName}?`)) return;
                            const result = await window.electronAPI?.deleteLaughAsset?.({ assetId: item.id });
                            if (!result?.ok) {
                              alert(result?.error || "Xóa thất bại");
                              return;
                            }
                            await loadAssets();
                          }}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
