import React from "react";
import { FaArrowDown, FaArrowUp, FaFolderOpen, FaLayerGroup, FaPlus, FaTimes, FaTrash } from "react-icons/fa";

type VideoMergeManagerPanelProps = {
  show: boolean;
  onClose: () => void;
  defaultOutputDir?: string;
  onOpenFolder?: (folderPath?: string) => void;
};

type VideoItem = {
  id: string;
  path: string;
  name: string;
};

function basename(filePath: string) {
  return String(filePath || "").split(/[\\/]/).pop() || filePath;
}

function dirname(filePath: string) {
  const value = String(filePath || "");
  const idx = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return idx >= 0 ? value.slice(0, idx) : "";
}

function uniqueItems(paths: string[], existing: VideoItem[]) {
  const seen = new Set(existing.map((item) => item.path));
  const result: VideoItem[] = [];
  for (const path of paths) {
    const clean = String(path || "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      path: clean,
      name: basename(clean)
    });
  }
  return result;
}

export default function VideoMergeManagerPanel({ show, onClose, defaultOutputDir, onOpenFolder }: VideoMergeManagerPanelProps) {
  const [items, setItems] = React.useState<VideoItem[]>([]);
  const [outputName, setOutputName] = React.useState("final-full-episode.mp4");
  const [outputDir, setOutputDir] = React.useState(defaultOutputDir || "");
  const [isMerging, setIsMerging] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [finalPath, setFinalPath] = React.useState("");

  React.useEffect(() => {
    if (!outputDir && defaultOutputDir) setOutputDir(defaultOutputDir);
  }, [defaultOutputDir, outputDir]);

  if (!show) return null;

  const canMerge = items.length >= 2 && !isMerging;

  async function handleAddVideos() {
    try {
      if (!window.electronAPI?.selectVideoFiles) {
        alert("Chức năng chọn video chỉ chạy trong app Electron.");
        return;
      }
      const res = await window.electronAPI.selectVideoFiles();
      const paths = Array.isArray(res?.paths) ? res.paths : [];
      if (res?.canceled || !paths.length) return;
      setItems((prev) => [...prev, ...uniqueItems(paths, prev)]);
      if (!outputDir && paths[0]) setOutputDir(dirname(paths[0]));
      setMessage(`Đã thêm ${paths.length} video.`);
    } catch (error: any) {
      setMessage(error?.message || "Không chọn được video.");
    }
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleMerge() {
    if (!window.electronAPI?.mergeVideoFiles) {
      alert("Chức năng ghép video chỉ chạy trong app Electron.");
      return;
    }
    if (items.length < 2) {
      alert("Cần chọn ít nhất 2 video.");
      return;
    }
    try {
      setIsMerging(true);
      setFinalPath("");
      setMessage("Đang ghép video... App sẽ ưu tiên concat nhanh, nếu khác chuẩn sẽ tự normalize.");
      const res = await window.electronAPI.mergeVideoFiles({
        files: items.map((item) => item.path),
        outputDir: outputDir || dirname(items[0]?.path || ""),
        outputName: outputName || "final-full-episode.mp4"
      });
      if (!res?.ok) throw new Error(res?.error || "Ghép video thất bại.");
      setFinalPath(res.path || "");
      setMessage(`Ghép xong ${res.count || items.length} video.`);
    } catch (error: any) {
      setMessage(error?.message || "Ghép video thất bại.");
      alert(error?.message || "Ghép video thất bại.");
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <FaLayerGroup className="text-amber-600" />
            Video Merge Manager
          </div>

        </div>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <FaTimes /> Đóng
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
          <div className="text-sm font-medium text-slate-800">Danh sách video</div>
        </div>
        <button type="button" onClick={handleAddVideos} disabled={isMerging} className="inline-flex items-center justify-center gap-2 self-center rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow disabled:opacity-60">
          <FaPlus /> Thêm video
        </button>
      </div>

      {items.length ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">Đã thêm {items.length} video</div> : null}

      <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border">
        {items.length ? (
          <div className="divide-y">
            {items.map((item, index) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 bg-white px-3 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800" title={item.name}>{item.name}</div>
                  <div className="truncate text-xs text-slate-500" title={item.path}>{item.path}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0 || isMerging} className="rounded-lg border px-2 py-2 text-slate-600 disabled:opacity-40" title="Đưa lên"><FaArrowUp /></button>
                  <button type="button" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1 || isMerging} className="rounded-lg border px-2 py-2 text-slate-600 disabled:opacity-40" title="Đưa xuống"><FaArrowDown /></button>
                  <button type="button" onClick={() => removeItem(item.id)} disabled={isMerging} className="rounded-lg bg-red-50 px-2 py-2 text-red-600 disabled:opacity-40" title="Xóa"><FaTrash /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-slate-500">Chưa chọn video nào.</div>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Tên file output</span>
          <input value={outputName} onChange={(e) => setOutputName(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="final-full-episode.mp4" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Thư mục output</span>
          <input value={outputDir} onChange={(e) => setOutputDir(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="Mặc định: cùng thư mục video đầu tiên" />
        </label>
      </div>

      {message && !message.startsWith("Đã thêm ") ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
      {finalPath ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          <div className="min-w-0 flex-1 break-all"><b>Final:</b> {finalPath}</div>
          <button type="button" onClick={() => onOpenFolder?.(dirname(finalPath))} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-white">
            <FaFolderOpen /> Mở thư mục
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={handleMerge} disabled={!canMerge} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 font-semibold text-white shadow disabled:opacity-50">
          {isMerging ? "Đang ghép..." : "Ghép thành video hoàn chỉnh"}
        </button>
      </div>
    </div>
  );
}
