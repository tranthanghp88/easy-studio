import React from "react";
import {
  FaChartBar,
  FaChevronLeft,
  FaChevronRight,
  FaDownload,
  FaFolderOpen,
  FaFileImport,
  FaKey,
  FaListUl,
  FaSearch,
  FaSpinner,
  FaStethoscope,
  FaSyncAlt,
  FaTimes,
  FaToggleOff,
  FaToggleOn,
  FaTrash
} from "react-icons/fa";

const KEY_PAGE_SIZES = [10, 25, 50, 100];

type KeyStat = {
  keyId: string;
  maskedKey: string;
  rawKey?: string;
  isActive: boolean;
  lastStatus: string;
  totalSuccess: number;
  totalFail: number;
  totalChars: number;
  lastUsedAt: string | null;
  lastError: string;
  updatedAt: string | null;
  quotaExceededCount?: number;
};

type KeySummary = {
  totalKeys: number;
  activeKeys: number;
  limitedKeys: number;
  invalidKeys: number;
  errorKeys: number;
  totalChars: number;
  totalSuccess: number;
  totalFail: number;
  keys: KeyStat[];
};

type LogItem = {
  id: string;
  time: string;
  type: string;
  keyLabel: string;
  status: string;
  chars: number;
  message: string;
};

type ManagerTab = "summary" | "keys" | "logs" | "vertex";

type CacheStats = {
  enabled: boolean;
  cacheDir: string;
  audioDir?: string;
  totalItems: number;
  totalBytes: number;
  totalSizeLabel: string;
  totalHits: number;
  totalMisses: number;
  totalSaves: number;
  lastHitAt: string | null;
  lastMissAt: string | null;
  lastSaveAt: string | null;
};

type KeyManagerPanelProps = {
  show: boolean;
  onClose: () => void;
  currentKey: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleImportKeys: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleTestAllKeys: () => Promise<void>;
  handleNormalizeKeys: () => Promise<void>;
  handleRemoveBadKeys: () => Promise<void>;
  handleClearAllKeys: () => Promise<void>;
  handleDeleteSelectedKeys: () => Promise<void>;
  handleDownloadLogs: () => Promise<void>;
  handleClearCache: () => Promise<void>;
  handleOpenCacheFolder: () => Promise<void>;
  handleDisableKey?: (keyId: string) => Promise<void>;
  handleEnableKey?: (keyId: string) => Promise<void>;
  fetchDashboardData: () => Promise<void>;
  testingKeys: boolean;
  normalizingKeys: boolean;
  removingBadKeys: boolean;
  clearingKeys: boolean;
  loadingStats: boolean;
  cacheStats: CacheStats | null;
  clearingCache: boolean;
  selectedKeys: string[];
  managerTab: ManagerTab;
  setManagerTab: React.Dispatch<React.SetStateAction<ManagerTab>>;
  keySummary: KeySummary | null;
  recentLogs: LogItem[];
  keySearch: string;
  setKeySearch: React.Dispatch<React.SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: React.Dispatch<React.SetStateAction<string>>;
  keyPageSize: number;
  setKeyPageSize: React.Dispatch<React.SetStateAction<number>>;
  pagedKeys: KeyStat[];
  filteredKeys: KeyStat[];
  currentKeyPage: number;
  totalKeyPages: number;
  setKeyPage: React.Dispatch<React.SetStateAction<number>>;
  selectedKeyIdsOnPage: boolean;
  setSelectedKeys: React.Dispatch<React.SetStateAction<string[]>>;
  handleClearLogs: () => Promise<void>;
  clearingLogs: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function getStatusBadgeClass(key: KeyStat) {
  if (!key.isActive || key.lastStatus === "invalid") {
    return "bg-red-100 text-red-700 border border-red-200";
  }
  if (key.lastStatus === "limited") {
    return "bg-amber-100 text-amber-700 border border-amber-200";
  }
  if (key.lastStatus === "active" || key.lastStatus === "unknown") {
    return "bg-green-100 text-green-700 border border-green-200";
  }
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function getRowClass(key: KeyStat, currentKey: string) {
  if (key.keyId === currentKey) return "bg-blue-50";
  if (!key.isActive || key.lastStatus === "invalid") return "bg-red-50";
  if (key.lastStatus === "limited" || key.totalFail > 0) return "bg-amber-50";
  if (key.totalSuccess > 0) return "bg-green-50";
  return "";
}

function TabButton({
  active,
  onClick,
  children,
  icon
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-2 rounded-xl border px-4 py-2 transition-all",
        active
          ? "border-purple-600 bg-purple-600 text-white shadow"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      ].join(" ")}
    >
      {icon}
      {children}
    </button>
  );
}

export default function KeyManagerPanel({
  show,
  onClose,
  currentKey,
  fileInputRef,
  handleImportKeys,
  handleTestAllKeys,
  handleNormalizeKeys,
  handleRemoveBadKeys,
  handleClearAllKeys,
  handleDeleteSelectedKeys,
  handleDownloadLogs,
  handleClearCache,
  handleOpenCacheFolder,
  handleDisableKey,
  handleEnableKey,
  fetchDashboardData,
  testingKeys,
  normalizingKeys,
  removingBadKeys,
  clearingKeys,
  loadingStats,
  cacheStats,
  clearingCache,
  selectedKeys,
  managerTab,
  setManagerTab,
  keySummary,
  recentLogs,
  keySearch,
  setKeySearch,
  statusFilter,
  setStatusFilter,
  keyPageSize,
  setKeyPageSize,
  pagedKeys,
  filteredKeys,
  currentKeyPage,
  totalKeyPages,
  setKeyPage,
  selectedKeyIdsOnPage,
  setSelectedKeys,
  handleClearLogs,
  clearingLogs
}: KeyManagerPanelProps) {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const vertexFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [vertexProfiles, setVertexProfiles] = React.useState<any[]>([]);
  const [activeVertexProfileId, setActiveVertexProfileId] = React.useState("");
  const [vertexProfileName, setVertexProfileName] = React.useState("");
  const [vertexProfileMessage, setVertexProfileMessage] = React.useState("");
  const [loadingVertexProfiles, setLoadingVertexProfiles] = React.useState(false);
  const [providerSettings, setProviderSettings] = React.useState({
    vertexEnabled: true,
    geminiEnabled: true,
    cloudApiKeyEnabled: false
  });
  const [providerMessage, setProviderMessage] = React.useState("");
  const [savingProviderSettings, setSavingProviderSettings] = React.useState(false);

  const apiBase = window.electronAPI?.isDesktop ? "http://127.0.0.1:3030" : "";
  const fetchVertexProfiles = React.useCallback(async () => {
    try {
      setLoadingVertexProfiles(true);
      const res = await fetch(`${apiBase}/api/vertex-profiles`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Không tải được Vertex profiles.");
      setVertexProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveVertexProfileId(String(data.activeProfileId || ""));
      setVertexProfileMessage(data.activeProfileId ? "Đã tải Vertex profiles." : "Chưa có Vertex profile active.");
    } catch (error: any) {
      setVertexProfileMessage(error?.message || "Không tải được Vertex profiles.");
    } finally {
      setLoadingVertexProfiles(false);
    }
  }, [apiBase]);

  const fetchProviderSettings = React.useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/provider-settings`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Không tải được cài đặt provider.");
      if (data.settings) {
        setProviderSettings({
          vertexEnabled: data.settings.vertexEnabled !== false,
          geminiEnabled: data.settings.geminiEnabled !== false,
          cloudApiKeyEnabled: data.settings.cloudApiKeyEnabled === true
        });
      }
    } catch (error: any) {
      setProviderMessage(error?.message || "Không tải được cài đặt provider.");
    }
  }, [apiBase]);

  async function updateProviderSetting(patch: Partial<typeof providerSettings>) {
    try {
      setSavingProviderSettings(true);
      const next = { ...providerSettings, ...patch };
      const res = await fetch(`${apiBase}/api/provider-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Không lưu được cài đặt provider.");
      setProviderSettings({
        vertexEnabled: data.settings?.vertexEnabled !== false,
        geminiEnabled: data.settings?.geminiEnabled !== false,
        cloudApiKeyEnabled: data.settings?.cloudApiKeyEnabled === true
      });
      setProviderMessage("Đã lưu cài đặt xoay key.");
    } catch (error: any) {
      setProviderMessage(error?.message || "Không lưu được cài đặt provider.");
    } finally {
      setSavingProviderSettings(false);
    }
  }

  React.useEffect(() => {
    if (show && managerTab === "vertex") {
      void fetchVertexProfiles();
      void fetchProviderSettings();
    }
  }, [show, managerTab, fetchVertexProfiles, fetchProviderSettings]);

  async function handleImportVertexProfile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setLoadingVertexProfiles(true);
      const credentialsJson = await file.text();
      const res = await fetch(`${apiBase}/api/vertex-profiles/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: vertexProfileName.trim() || file.name.replace(/\.json$/i, ""),
          credentialsJson,
          location: "us-central1",
          model: "gemini-2.5-flash-tts"
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Import Vertex profile thất bại.");
      setVertexProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveVertexProfileId(String(data.activeProfileId || data.profile?.id || ""));
      setVertexProfileName("");
      setVertexProfileMessage("Đã import và kích hoạt Vertex profile mới.");
      await fetchDashboardData();
    } catch (error: any) {
      setVertexProfileMessage(error?.message || "Import Vertex profile thất bại.");
      alert(error?.message || "Import Vertex profile thất bại.");
    } finally {
      setLoadingVertexProfiles(false);
    }
  }

  async function handleActivateVertexProfile(profileId: string) {
    try {
      setLoadingVertexProfiles(true);
      const res = await fetch(`${apiBase}/api/vertex-profiles/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Kích hoạt Vertex profile thất bại.");
      setVertexProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveVertexProfileId(String(data.activeProfileId || profileId));
      setVertexProfileMessage("Đã đổi Vertex profile active.");
      await fetchDashboardData();
    } catch (error: any) {
      setVertexProfileMessage(error?.message || "Kích hoạt Vertex profile thất bại.");
      alert(error?.message || "Kích hoạt Vertex profile thất bại.");
    } finally {
      setLoadingVertexProfiles(false);
    }
  }

  async function handleDeleteVertexProfile(profileId: string) {
    if (!window.confirm("Xóa Vertex profile này?")) return;
    try {
      setLoadingVertexProfiles(true);
      const res = await fetch(`${apiBase}/api/vertex-profiles/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Xóa Vertex profile thất bại.");
      setVertexProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveVertexProfileId(String(data.activeProfileId || ""));
      setVertexProfileMessage("Đã xóa Vertex profile.");
    } catch (error: any) {
      setVertexProfileMessage(error?.message || "Xóa Vertex profile thất bại.");
      alert(error?.message || "Xóa Vertex profile thất bại.");
    } finally {
      setLoadingVertexProfiles(false);
    }
  }

  if (!show) return null;

  const badKeyIds = (keySummary?.keys || [])
    .filter((item) => item.lastStatus === "error" || item.lastStatus === "invalid")
    .map((item) => item.keyId);
  const allKeyIds = filteredKeys.map((item) => item.keyId);

  const handleExportKeys = () => {
    const lines = (keySummary?.keys || [])
      .map((item, index) => {
        const label = String(item.keyId || `KEY_${index + 1}`).trim() || `KEY_${index + 1}`;
        const rawKey = String(item.rawKey || "").trim();
        return rawKey ? `${label}=${rawKey}` : "";
      })
      .filter(Boolean);

    if (!lines.length) {
      return;
    }

    const content = lines.join("\n");
    const blob = new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keys_export.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const summaryCards = [
    {
      label: "Tổng key",
      value: keySummary?.totalKeys ?? 0,
      className: "border-slate-200 bg-slate-50"
    },
    {
      label: "Active",
      value: keySummary?.activeKeys ?? 0,
      className: "border-green-200 bg-green-50"
    },
    {
      label: "Limited",
      value: keySummary?.limitedKeys ?? 0,
      className: "border-amber-200 bg-amber-50"
    },
    {
      label: "Invalid",
      value: keySummary?.invalidKeys ?? 0,
      className: "border-red-200 bg-red-50"
    },
    {
      label: "Error",
      value: keySummary?.errorKeys ?? 0,
      className: "border-rose-200 bg-rose-50"
    },
    {
      label: "Tổng ký tự",
      value: keySummary?.totalChars ?? 0,
      className: "border-blue-200 bg-blue-50"
    }
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-lg font-semibold text-slate-800">Key Manager</div>

        <div className="flex items-center gap-2">
          <div className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
            <div className="text-xs text-gray-500">Key đang dùng gần nhất</div>
            <div className="text-lg font-bold text-slate-800">{currentKey || "..."}</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-700 shadow-sm hover:bg-slate-50"
            title="Đóng Key Manager"
          >
            <FaTimes />
            Đóng
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        className="hidden"
        onChange={handleImportKeys}
      />

      <div className="flex flex-wrap gap-2">
        <TabButton
          active={managerTab === "summary"}
          onClick={() => setManagerTab("summary")}
          icon={<FaChartBar />}
        >
          Tổng quan
        </TabButton>

        <TabButton
          active={managerTab === "keys"}
          onClick={() => setManagerTab("keys")}
          icon={<FaKey />}
        >
          Keys
        </TabButton>

        <TabButton
          active={managerTab === "vertex"}
          onClick={() => setManagerTab("vertex")}
          icon={<FaKey />}
        >
          Vertex Profile
        </TabButton>
      </div>

      {managerTab === "summary" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {summaryCards.map((item) => (
              <div
                key={item.label}
                className={`rounded-xl border p-3 shadow-sm ${item.className}`}
              >
                <div className="text-xs text-gray-500">{item.label}</div>
                <div className="text-lg font-bold">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">TTS Cache</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={fetchDashboardData}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <FaSyncAlt />
                  Làm mới cache
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Xóa toàn bộ TTS cache?")) return;
                    await handleClearCache();
                  }}
                  disabled={clearingCache}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm text-white shadow disabled:opacity-60"
                >
                  {clearingCache ? <span className="animate-spin"><FaSpinner /></span> : <FaTrash />}
                  {clearingCache ? "Đang xóa..." : "Xóa cache"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await handleOpenCacheFolder();
                    } catch (error: any) {
                      alert(error?.message || "Không mở được thư mục cache");
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white shadow hover:bg-slate-700"
                >
                  <FaFolderOpen />
                  Mở thư mục cache
                </button>
                <button
                  type="button"
                  onClick={handleDownloadLogs}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow hover:bg-blue-700"
                >
                  <FaDownload />
                  Tải log
                </button>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  disabled={clearingLogs}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white shadow disabled:opacity-60"
                >
                  {clearingLogs ? <span className="animate-spin"><FaSpinner /></span> : <FaTrash />}
                  {clearingLogs ? "Đang xóa..." : "Clear log"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-gray-500">Số item cache</div>
                <div className="mt-1 text-lg font-bold">{cacheStats?.totalItems ?? 0}</div>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <div className="text-xs text-gray-500">Dung lượng</div>
                <div className="mt-1 text-lg font-bold">{cacheStats?.totalSizeLabel ?? "0 B"}</div>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <div className="text-xs text-gray-500">Cache hit</div>
                <div className="mt-1 text-lg font-bold text-green-700">{cacheStats?.totalHits ?? 0}</div>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <div className="text-xs text-gray-500">Cache miss</div>
                <div className="mt-1 text-lg font-bold text-amber-700">{cacheStats?.totalMisses ?? 0}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-gray-500">Lần lưu gần nhất</div>
                <div className="mt-1 font-semibold">{formatDateTime(cacheStats?.lastSaveAt ?? null)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-gray-500">Lần hit gần nhất</div>
                <div className="mt-1 font-semibold">{formatDateTime(cacheStats?.lastHitAt ?? null)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-gray-500">Thư mục cache</div>
                <div className="mt-1 break-all font-mono text-xs text-slate-700">{cacheStats?.cacheDir || "-"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-2 font-semibold">Tóm tắt nhanh</div>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-gray-500">Key đang dùng gần nhất</div>
                <div className="mt-1 font-bold text-blue-700">{currentKey || "..."}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-gray-500">Tổng success</div>
                <div className="mt-1 font-bold">{keySummary?.totalSuccess ?? 0}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-gray-500">Tổng fail</div>
                <div className="mt-1 font-bold">{keySummary?.totalFail ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {managerTab === "vertex" && (
        <div className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-800">Vertex + Gemini Key Pool</div>
            </div>
            <button
              type="button"
              onClick={() => void fetchVertexProfiles()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <FaSyncAlt />
              {loadingVertexProfiles ? "Đang tải..." : "Làm mới"}
            </button>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            Key hiển thị trong job/log đã đổi thành <b>VERTEX AI</b>. Profile active hiện tại: <b>{vertexProfiles.find((p) => p.id === activeVertexProfileId)?.name || "VERTEX AI"}</b>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-800">Xoay key TTS</div>
                <div className="text-xs text-slate-500">Bật/tắt nguồn tạo voice. Auto sẽ ưu tiên Vertex, nếu lỗi quota sẽ chuyển sang Gemini key pool.</div>
              </div>
              {savingProviderSettings ? <span className="text-xs text-slate-500">Đang lưu...</span> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border bg-white p-3 text-sm shadow-sm">
                <span>
                  <span className="block font-semibold text-slate-800">Vertex AI</span>
                  <span className="block text-xs text-slate-500">Service account / quota chính</span>
                </span>
                <input
                  type="checkbox"
                  checked={providerSettings.vertexEnabled}
                  onChange={(e) => void updateProviderSetting({ vertexEnabled: e.target.checked })}
                  className="h-5 w-5 accent-indigo-600"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border bg-white p-3 text-sm shadow-sm">
                <span>
                  <span className="block font-semibold text-slate-800">Gemini API Keys</span>
                  <span className="block text-xs text-slate-500">Danh sách AIza key fallback</span>
                </span>
                <input
                  type="checkbox"
                  checked={providerSettings.geminiEnabled}
                  onChange={(e) => void updateProviderSetting({ geminiEnabled: e.target.checked })}
                  className="h-5 w-5 accent-indigo-600"
                />
              </label>
            </div>
            {providerMessage ? <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">{providerMessage}</div> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={vertexProfileName}
              onChange={(e) => setVertexProfileName(e.target.value)}
              placeholder="Tên profile, ví dụ: Trial Account 2"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div>
              <input
                ref={vertexFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportVertexProfile}
              />
              <button
                type="button"
                onClick={() => vertexFileInputRef.current?.click()}
                disabled={loadingVertexProfiles}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white shadow disabled:opacity-60"
              >
                <FaFileImport />
                Import service-account JSON
              </button>
            </div>
          </div>

          {vertexProfileMessage ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{vertexProfileMessage}</div>
          ) : null}

          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left">Profile</th>
                  <th className="px-3 py-2 text-left">Project</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {vertexProfiles.length ? vertexProfiles.map((profile) => (
                  <tr key={profile.id} className={profile.id === activeVertexProfileId ? "border-t bg-blue-50" : "border-t bg-white"}>
                    <td className="px-3 py-2 font-medium">
                      {profile.name || profile.id}
                      {profile.id === activeVertexProfileId ? <span className="ml-2 rounded bg-blue-600 px-2 py-0.5 text-xs text-white">Active</span> : null}
                      {!profile.credentialsExists ? <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Missing JSON</span> : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{profile.projectId || "-"}</td>
                    <td className="px-3 py-2">{profile.location || "us-central1"}</td>
                    <td className="px-3 py-2">{profile.model || "gemini-2.5-flash-tts"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void handleActivateVertexProfile(profile.id)}
                          disabled={loadingVertexProfiles || profile.id === activeVertexProfileId || !profile.credentialsExists}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                        >
                          Dùng
                        </button>
                        {!profile.builtIn ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteVertexProfile(profile.id)}
                            disabled={loadingVertexProfiles}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            Xóa
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-3 py-4 text-slate-500">Chưa có Vertex profile. Hãy import service-account JSON.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {managerTab === "keys" && (
        <div className="space-y-3 rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-semibold">Danh sách Key</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700"
              >
                <FaFileImport />
                Import
              </button>

              <button
                type="button"
                onClick={handleExportKeys}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white shadow hover:bg-indigo-700"
              >
                <FaDownload />
                Export
              </button>

              <button
                type="button"
                onClick={handleTestAllKeys}
                disabled={testingKeys}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow disabled:opacity-60"
              >
                {testingKeys ? <span className="animate-spin"><FaSpinner /></span> : <FaStethoscope />}
                {testingKeys ? "Đang test..." : "Test all Keys"}
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteDialog(true)}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-white shadow hover:bg-rose-700"
              >
                <FaTrash />
                Xóa keys
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <span className="absolute left-3 top-3 text-gray-400">
                <FaSearch />
              </span>
              <input
                value={keySearch}
                onChange={(e) => setKeySearch(e.target.value)}
                placeholder="Tìm theo KEY_01, lỗi, status..."
                className="w-full rounded-xl border py-2 pl-9 pr-3"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border px-3 py-2"
            >
              <option value="all">Tất cả</option>
              <option value="active">Active</option>
              <option value="limited">Limited</option>
              <option value="invalid">Invalid</option>
              <option value="error">Error</option>
            </select>

            <select
              value={keyPageSize}
              onChange={(e) => setKeyPageSize(Number(e.target.value))}
              className="rounded-xl border px-3 py-2"
            >
              {KEY_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}/trang
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[460px] overflow-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedKeyIdsOnPage}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedKeys((prev) =>
                            Array.from(
                              new Set([...prev, ...pagedKeys.map((item) => item.keyId)])
                            )
                          );
                        } else {
                          const pageIds = new Set(pagedKeys.map((item) => item.keyId));
                          setSelectedKeys((prev) => prev.filter((id) => !pageIds.has(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Key</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Success</th>
                  <th className="px-3 py-2 text-right">Fail</th>
                  <th className="px-3 py-2 text-right">Quota hit</th>
                  <th className="px-3 py-2 text-right">Chars</th>
                  <th className="px-3 py-2 text-left">Last used</th>
                  <th className="px-3 py-2 text-left">Last error</th>
                  <th className="px-3 py-2 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pagedKeys.length ? (
                  pagedKeys.map((key) => (
                    <tr
                      key={key.keyId}
                      className={`border-t ${getRowClass(key, currentKey)} ${
                        key.lastStatus === "error" || key.lastStatus === "invalid"
                          ? "ring-1 ring-inset ring-red-200"
                          : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedKeys.includes(key.keyId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedKeys((prev) =>
                                Array.from(new Set([...prev, key.keyId]))
                              );
                            } else {
                              setSelectedKeys((prev) =>
                                prev.filter((id) => id !== key.keyId)
                              );
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">
                        {key.maskedKey}
                        {key.keyId === currentKey && (
                          <span className="ml-2 text-xs font-normal text-blue-700">
                            đang dùng
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded px-2 py-1 text-xs font-medium ${getStatusBadgeClass(
                            key
                          )}`}
                        >
                          {key.lastStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{key.totalSuccess}</td>
                      <td className="px-3 py-2 text-right">{key.totalFail}</td>
                      <td className="px-3 py-2 text-right">{key.quotaExceededCount || 0}</td>
                      <td className="px-3 py-2 text-right">{key.totalChars}</td>
                      <td className="px-3 py-2">{formatDateTime(key.lastUsedAt)}</td>
                      <td
                        className="max-w-[260px] truncate px-3 py-2"
                        title={key.lastError || ""}
                      >
                        {key.lastError || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-2">
                          {key.isActive ? (
                            <button
                              type="button"
                              onClick={() => handleDisableKey?.(key.keyId)}
                              disabled={!handleDisableKey}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                              title={handleDisableKey ? `Tắt ${key.keyId}` : "Chưa nối logic disable ở file cha"}
                            >
                              <FaToggleOff />
                              Disable
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleEnableKey?.(key.keyId)}
                              disabled={!handleEnableKey}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                              title={handleEnableKey ? `Bật lại ${key.keyId}` : "Chưa nối logic enable ở file cha"}
                            >
                              <FaToggleOn />
                              Enable
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-gray-500" colSpan={10}>
                      Không có key phù hợp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              Tổng {filteredKeys.length} key • Trang {currentKeyPage}/{totalKeyPages}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setKeyPage((p) => Math.max(1, p - 1))}
                disabled={currentKeyPage <= 1}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 disabled:opacity-50"
              >
                <FaChevronLeft />
                Prev
              </button>

              <button
                type="button"
                onClick={() => setKeyPage((p) => Math.min(totalKeyPages, p + 1))}
                disabled={currentKeyPage >= totalKeyPages}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 disabled:opacity-50"
              >
                Next
                <FaChevronRight />
              </button>
            </div>
          </div>
        </div>
      )}

      {managerTab === "logs" && (
        <div className="space-y-3 rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-semibold">Log realtime</div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadLogs}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white shadow"
              >
                <FaDownload />
                Tải log
              </button>

              <button
                type="button"
                onClick={handleClearLogs}
                disabled={clearingLogs}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-white shadow disabled:opacity-60"
              >
                {clearingLogs ? (
                  <span className="animate-spin">
                    <FaSpinner />
                  </span>
                ) : (
                  <FaTrash />
                )}
                {clearingLogs ? "Đang xóa..." : "Clear log"}
              </button>
            </div>
          </div>

          <div className="max-h-[460px] space-y-2 overflow-auto rounded-xl border bg-slate-950 p-3 font-mono text-xs text-green-300">
            {recentLogs.length ? (
              recentLogs.map((item) => (
                <div key={item.id} className="border-b border-slate-800 pb-2">
                  <div className="text-slate-400">
                    {formatDateTime(item.time)} | {item.type}
                  </div>
                  <div>
                    KEY [{item.keyLabel}] | STATUS [{item.status}] | chars={item.chars || 0}
                  </div>
                  <div className="text-slate-300">{item.message || "-"}</div>
                </div>
              ))
            ) : (
              <div className="text-slate-400">Chưa có log.</div>
            )}
          </div>
        </div>
      )}
      {showDeleteDialog ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="border-b px-5 py-4">
              <div className="text-lg font-semibold text-slate-800">Xóa key</div>
              <div className="mt-1 text-sm text-slate-500">Chọn key cần xóa.</div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={badKeyIds.length > 0 && badKeyIds.every((id) => selectedKeys.includes(id))} onChange={(e) => {
                  if (e.target.checked) setSelectedKeys(Array.from(new Set([...selectedKeys, ...badKeyIds])));
                  else setSelectedKeys(selectedKeys.filter((id) => !badKeyIds.includes(id)));
                }} />
                Chọn key lỗi
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={allKeyIds.length > 0 && allKeyIds.every((id) => selectedKeys.includes(id))} onChange={(e) => {
                  if (e.target.checked) setSelectedKeys(Array.from(new Set([...selectedKeys, ...allKeyIds])));
                  else setSelectedKeys(selectedKeys.filter((id) => !allKeyIds.includes(id)));
                }} />
                Chọn tất cả
              </label>
              <div className="text-sm text-slate-500">Đã chọn: {selectedKeys.length}</div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-3">
                {filteredKeys.map((key) => (
                  <label key={key.keyId} className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 hover:bg-slate-50">
                    <input type="checkbox" className="mt-1" checked={selectedKeys.includes(key.keyId)} onChange={(e) => {
                      if (e.target.checked) setSelectedKeys((prev) => Array.from(new Set([...prev, key.keyId])));
                      else setSelectedKeys((prev) => prev.filter((id) => id !== key.keyId));
                    }} />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{key.keyId}</div>
                      <div className="mt-1 text-sm text-slate-500">{key.maskedKey}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setShowDeleteDialog(false)} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800">Đóng</button>
              <button type="button" onClick={async () => { await handleDeleteSelectedKeys(); setShowDeleteDialog(false); }} disabled={!selectedKeys.length} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Xóa ({selectedKeys.length})</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
