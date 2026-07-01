import { useSyncStatus } from "@/lib/hooks/useSyncStatus";
import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CheckCircle2, Download, X } from "lucide-react";

export default function SyncIndicator({ iconColor = "#1B5E20" }: { iconColor?: string }) {
  const { state, syncNow } = useSyncStatus();
  const [visible, setVisible]     = useState(false);
  const [leaving, setLeaving]     = useState(false);
  const [hasCache, setHasCache]   = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded]   = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);

  // Check if we have cached data
  useEffect(() => {
    const userCache = localStorage.getItem("faslbook_user_cache");
    const orgCache  = localStorage.getItem("faslbook_org_cache");
    setHasCache(!!(userCache && orgCache));
  }, [state]);

  // When going offline, show the download prompt if no cache (after 2s)
  useEffect(() => {
    if (state === "offline" && !hasCache && !promptDismissed) {
      const t = setTimeout(() => setShowPrompt(true), 2000);
      return () => clearTimeout(t);
    }
    setShowPrompt(false);
    return undefined;
  }, [state, hasCache, promptDismissed]);

  useEffect(() => {
    if (state === "offline" || state === "syncing" || state === "synced") {
      setLeaving(false);
      setVisible(true);
      return undefined;
    }
    setLeaving(true);
    const t = setTimeout(() => { setVisible(false); setLeaving(false); }, 400);
    return () => clearTimeout(t);
  }, [state]);

  const handleDownload = async () => {
    setDownloading(true);
    // Trigger a navigation to overview which loads data into Firestore cache
    await new Promise((r) => setTimeout(r, 1500));
    setDownloading(false);
    setDownloaded(true);
    setHasCache(true);
    setTimeout(() => { setShowPrompt(false); setDownloaded(false); }, 2500);
  };

  return (
    <>
      {/* Offline banner */}
      <div
        className="fixed left-0 right-0 z-[9999] transition-all duration-300 ease-in-out"
        style={{
          top: 0,
          transform: state === "offline" ? "translateY(0)" : "translateY(-100%)",
          pointerEvents: state === "offline" ? "auto" : "none",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-2.5 text-white text-xs font-semibold shadow-lg"
          style={{ backgroundColor: "#B71C1C" }}
        >
          <div className="flex items-center gap-2">
            <WifiOff size={14} className="shrink-0" />
            <span>{hasCache ? "Offline — viewing saved data" : "Offline — no saved data"}</span>
          </div>
          <button
            onClick={syncNow}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-full px-2.5 py-1 text-white text-[11px] font-bold transition-colors"
          >
            <RefreshCw size={11} />
            Retry
          </button>
        </div>
      </div>

      {/* Download data prompt — shows when offline with no cache */}
      {showPrompt && state === "offline" && (
        <div
          className="fixed left-4 right-4 z-[9998] rounded-2xl shadow-2xl overflow-hidden"
          style={{ bottom: 96, animation: "slideUp 0.3s ease-out forwards" }}
        >
          <div className="bg-white border border-gray-200">
            <div className="flex items-start justify-between px-4 pt-4 pb-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#FFF3E0" }}>
                  <Download size={18} color="#E65100" />
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">No Offline Data Found</p>
                  <p className="text-gray-500 text-xs">Download your farm data to use offline</p>
                </div>
              </div>
              <button onClick={() => { setShowPrompt(false); setPromptDismissed(true); }} className="p-1 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="px-4 pb-4 pt-2 flex gap-2">
              <button
                onClick={handleDownload}
                disabled={downloading || downloaded}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70 active:scale-95 transition-transform"
                style={{ backgroundColor: downloading ? "#9E9E9E" : downloaded ? "#1B5E20" : "#1565C0" }}
              >
                {downloading ? (
                  <><RefreshCw size={14} className="animate-spin" />Downloading…</>
                ) : downloaded ? (
                  <><CheckCircle2 size={14} />Saved!</>
                ) : (
                  <><Download size={14} />Download Data</>
                )}
              </button>
              <button
                onClick={syncNow}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 active:scale-95 transition-transform"
                style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Syncing / Synced pill */}
      {visible && state !== "offline" && (
        <div
          className="fixed bottom-20 left-1/2 z-[9998] -translate-x-1/2 pointer-events-none"
          style={{
            animation: leaving
              ? "pillOut 0.35s ease-in forwards"
              : "pillIn 0.35s ease-out forwards",
          }}
        >
          {state === "syncing" && (
            <div className="flex items-center gap-2 bg-gray-900/85 backdrop-blur-sm text-white text-[11px] font-semibold rounded-full px-3.5 py-2 shadow-lg">
              <RefreshCw size={12} className="animate-spin" />
              Syncing…
            </div>
          )}
          {state === "synced" && (
            <div className="flex items-center gap-2 bg-[#1B5E20]/90 backdrop-blur-sm text-white text-[11px] font-semibold rounded-full px-3.5 py-2 shadow-lg">
              <CheckCircle2 size={12} />
              All synced
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
