import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeLaughAsset } from "../services/laughAssetStorage";
import type { LaughAssetItem, LaughAssetType, LaughRoleFilter } from "../shared/types/timeline";

type FilterRole = LaughRoleFilter;

export function useLaughAssets() {
  const [laughAssets, setLaughAssets] = useState<LaughAssetItem[]>([]);
  const [loadingLaughAssets, setLoadingLaughAssets] = useState(false);
  const [laughMessage, setLaughMessage] = useState("");
  const [laughSearch, setLaughSearch] = useState("");
  const [laughRoleFilter, setLaughRoleFilter] = useState<FilterRole>("ALL");
  const [previewAssetId, setPreviewAssetId] = useState("");
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);

  const revokePreviewUrl = useCallback(() => {
    setPreviewAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const loadLaughAssets = useCallback(async () => {
    setLoadingLaughAssets(true);
    try {
      if (window.electronAPI?.listLaughAssets) {
        const result = await window.electronAPI.listLaughAssets();
        if (result?.ok) {
          const next = Array.isArray(result.assets) ? result.assets.map(normalizeLaughAsset) : [];
          setLaughAssets(next);
          return next;
        }
      }
      setLaughAssets([]);
      return [];
    } catch (error: any) {
      setLaughAssets([]);
      setLaughMessage(error?.message || "Không tải được file cười.");
      return [];
    } finally {
      setLoadingLaughAssets(false);
    }
  }, []);

  useEffect(() => {
    void loadLaughAssets();
    return () => revokePreviewUrl();
  }, [loadLaughAssets, revokePreviewUrl]);

  const importLaughAssets = useCallback(async (type: LaughAssetType) => {
    try {
      if (!window.electronAPI?.selectAudioFiles || !window.electronAPI?.importLaughAssets) {
        setLaughMessage("Tính năng thêm file cười chỉ hỗ trợ trong app desktop.");
        return;
      }
      const picker = await window.electronAPI.selectAudioFiles();
      if (picker?.canceled || !picker?.paths?.length) return;
      const result = await window.electronAPI.importLaughAssets({ files: picker.paths, role: "BOTH", type });
      if (!result?.ok) {
        setLaughMessage(result?.error || "Thêm file cười thất bại.");
        return;
      }
      const next = Array.isArray(result.assets) ? result.assets.map(normalizeLaughAsset) : [];
      setLaughAssets(next);
      setLaughMessage(`Đã thêm ${Number(result.importedCount || 0)} file cười.`);
    } catch (error: any) {
      setLaughMessage(error?.message || "Thêm file cười thất bại.");
    }
  }, []);

  const deleteLaughAsset = useCallback(async (assetId: string) => {
    try {
      if (!window.electronAPI?.deleteLaughAsset) return false;
      const result = await window.electronAPI.deleteLaughAsset({ assetId });
      if (!result?.ok) {
        setLaughMessage(result?.error || "Xóa file cười thất bại.");
        return false;
      }
      const next = Array.isArray(result.assets) ? result.assets.map(normalizeLaughAsset) : [];
      setLaughAssets(next);
      setLaughMessage("Đã xóa file cười.");
      if (previewAssetId === assetId) {
        setPreviewAssetId("");
        revokePreviewUrl();
      }
      return true;
    } catch (error: any) {
      setLaughMessage(error?.message || "Xóa file cười thất bại.");
      return false;
    }
  }, [previewAssetId, revokePreviewUrl]);

  const previewLaughAsset = useCallback(async (asset: LaughAssetItem | null | undefined) => {
    if (!asset?.filePath || !window.electronAPI?.readAudioFile) return null;
    revokePreviewUrl();
    const result = await window.electronAPI.readAudioFile({ filePath: asset.filePath });
    if (!result?.ok || !result?.arrayBuffer) {
      setLaughMessage(result?.error || "Không đọc được file cười.");
      return null;
    }
    const blob = new Blob([result.arrayBuffer], { type: result.mimeType || "audio/wav" });
    const url = URL.createObjectURL(blob);
    setPreviewAssetId(asset.id);
    setPreviewAudioUrl(url);
    return url;
  }, [revokePreviewUrl]);

  const openLaughAssetsFolder = useCallback(async () => {
    if (!window.electronAPI?.openLaughAssetsFolder) return;
    const result = await window.electronAPI.openLaughAssetsFolder();
    if (!result?.ok) {
      setLaughMessage(result?.error || "Không mở được thư mục file cười.");
    }
  }, []);

  const filteredLaughAssets = useMemo(() => {
    const keyword = laughSearch.trim().toLowerCase();
    return laughAssets.filter((item) => {
      if (laughRoleFilter !== "ALL" && item.role !== laughRoleFilter) return false;
      if (!keyword) return true;
      const haystack = [item.id, item.label, item.fileName, item.role, item.type].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [laughAssets, laughSearch, laughRoleFilter]);

  return {
    laughAssets,
    filteredLaughAssets,
    loadingLaughAssets,
    laughMessage,
    setLaughMessage,
    laughSearch,
    setLaughSearch,
    laughRoleFilter,
    setLaughRoleFilter,
    previewAssetId,
    previewAudioUrl,
    loadLaughAssets,
    importLaughAssets,
    deleteLaughAsset,
    previewLaughAsset,
    openLaughAssetsFolder,
    revokePreviewUrl
  };
}
