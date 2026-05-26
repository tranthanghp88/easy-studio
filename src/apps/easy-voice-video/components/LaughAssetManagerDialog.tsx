import React from "react";
import { FaFolderOpen, FaLaughBeam, FaPlus, FaSearch, FaTimes, FaTrash } from "react-icons/fa";
import type { LaughAssetItem, LaughAssetType, LaughRoleFilter, LaughAssetMode } from "../shared/types/timeline";

type FilterRole = LaughRoleFilter; // Định nghĩa lại FilterRole sử dụng LaughRoleFilter

type Props = {
  show: boolean;
  onClose: () => void;
  assets: LaughAssetItem[]; // Sử dụng LaughAssetItem
  loading: boolean;
  message: string;
  search: string;
  setSearch: (value: string) => void;
  filterRole: FilterRole;
  setFilterRole: (value: FilterRole) => void;
  importType: LaughAssetType;
  setImportType: (value: LaughAssetType) => void;
  laughAssetMode: LaughAssetMode; // Sử dụng LaughAssetMode
  setLaughAssetMode: (value: LaughAssetMode) => void;
  reactionCacheMode: "contextual" | "bypass";
  setReactionCacheMode: (value: "contextual" | "bypass") => void;
  onImport: () => void;
  onDelete: (assetId: string) => void;
  onPreview: (asset: LaughAssetItem) => void; // Sử dụng LaughAssetItem
  onOpenFolder: () => void;
  previewAssetId?: string;
  previewAudioUrl?: string | null;
};

const roleLabelMap: Record<FilterRole, string> = {
  ALL: "Tất cả",
  A: "A",
  R: "R",
  BOTH: "Cả hai"
};

export default function LaughAssetManagerDialog(props: Props) {
  const {
    show,
    onClose,
    assets,
    loading,
    message,
    search,
    setSearch,
    filterRole,
    setFilterRole,
    importType,
    setImportType,
    laughAssetMode,
    setLaughAssetMode,
    reactionCacheMode,
    setReactionCacheMode,
    onImport,
    onDelete,
    onPreview,
    onOpenFolder,
    previewAssetId,
    previewAudioUrl
  } = props;

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Quản lý file cười / phản ứng</div>
            <div className="text-sm text-slate-500">Thêm, xóa, nghe thử và chỉnh cách app dùng laugh asset.</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"><FaTimes /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Cách dùng laugh asset</span>
              <select value={laughAssetMode} onChange={(e) => setLaughAssetMode((e.target.value || "auto") as any)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="off">Tắt</option>
                <option value="fallback">Tự động dự phòng</option>
                <option value="force">Luôn ưu tiên file cười</option>
              </select>
              <div className="text-xs text-slate-500">
                Tắt: bỏ qua file cười. Tự động dự phòng: chỉ dùng khi reaction không gen ổn. Luôn ưu tiên: gặp reaction là dùng asset trước.
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Bộ nhớ đệm reaction</span>
              <select value={reactionCacheMode} onChange={(e) => setReactionCacheMode((e.target.value || "contextual") as any)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="contextual">Lưu cache theo ngữ cảnh</option>
                <option value="bypass">Luôn gen mới</option>
              </select>
              <div className="text-xs text-slate-500">
                Lưu cache theo ngữ cảnh sẽ nhanh hơn. Luôn gen mới sẽ bám context tốt hơn nhưng tốn thời gian hơn.
              </div>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onImport} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"><FaPlus />Thêm file cười</button>
            <button type="button" onClick={onOpenFolder} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800"><FaFolderOpen />Mở thư mục</button>

            <label className="min-w-[180px] space-y-1">
              <span className="block text-xs font-medium text-slate-600">Loại mặc định khi thêm file</span>
              <select value={importType} onChange={(e) => setImportType((e.target.value || "misc") as LaughAssetType)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="short">Ngắn</option>
                <option value="giggle">Cười khúc khích</option>
                <option value="long">Dài</option>
                <option value="misc">Khác</option>
              </select>
            </label>

            <label className="min-w-[180px] space-y-1">
              <span className="block text-xs font-medium text-slate-600">Lọc theo vai trò</span>
              <select value={filterRole} onChange={(e) => setFilterRole((e.target.value || "ALL") as FilterRole)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="ALL">Tất cả</option>
                <option value="A">A</option>
                <option value="R">R</option>
                <option value="BOTH">Cả hai</option>
              </select>
            </label>

            <div className="relative min-w-[240px] flex-1 self-end">
              <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên file, vai trò, loại..." className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm" />
            </div>
          </div>

          {message ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

          <div className="max-h-[56vh] space-y-3 overflow-auto pr-1">
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Đang tải danh sách file cười...</div>
            ) : assets.length ? assets.map((asset) => (
              <div key={asset.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700"><FaLaughBeam /></span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">{asset.label}</div>
                        <div className="truncate text-xs text-slate-500">#{asset.id}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Vai trò: {roleLabelMap[asset.role]}</span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Loại: {asset.type}</span>
                    </div>
                    <div className="mt-2 break-all text-xs text-slate-400">{asset.fileName}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onPreview(asset)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200">Nghe thử</button>
                    <button type="button" onClick={() => onDelete(asset.id)} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"><FaTrash /></button>
                  </div>
                </div>
                {previewAudioUrl && previewAssetId === asset.id ? (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3"><audio controls src={previewAudioUrl} className="w-full" /></div>
                ) : null}
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Chưa có file cười nào. Hãy thêm file wav/mp3 để bắt đầu.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
