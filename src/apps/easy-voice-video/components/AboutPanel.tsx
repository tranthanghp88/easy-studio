import React, { useEffect, useState } from "react";

type AboutPanelProps = {
  showAbout: boolean;
  setShowAbout: (value: boolean) => void;
};

export default function AboutPanel({ showAbout, setShowAbout }: AboutPanelProps) {
  const [version, setVersion] = useState("...");

  useEffect(() => {
    let mounted = true;
    window.electronAPI?.getVersion?.()
      .then((v: string) => {
        if (mounted && v) setVersion(v);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="relative">
        <button
          onClick={() => setShowAbout(!showAbout)}
          className="border px-3 py-1 text-xs rounded"
        >
          About
        </button>

        {showAbout && (
          <div className="absolute bottom-10 right-0 w-80 bg-white border p-4 rounded-xl shadow-xl">
            <div className="font-semibold">Easy Voice/Video Studio</div>
            <div className="text-xs mt-2">Create by Trần Văn Thắng</div>
            <div className="text-xs mt-2">Version: {version}</div>
            <div className="mt-3 text-xs bg-gray-100 p-2 rounded">
              Cập nhật được quản lý ở Easy Studio Shell tổng.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
