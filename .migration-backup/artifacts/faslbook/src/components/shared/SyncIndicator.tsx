import { useSyncStatus } from "@/lib/hooks/useSyncStatus";
import { useEffect, useState } from "react";
import { WifiOff, CloudOff, RefreshCw, CheckCircle2, Cloud } from "lucide-react";

export default function SyncIndicator({ iconColor = "#1B5E20" }: { iconColor?: string }) {
  const { state, syncNow } = useSyncStatus();
  const [visible, setVisible]   = useState(false);
  const [leaving, setLeaving]   = useState(false);

  useEffect(() => {
    if (state === "offline" || state === "syncing" || state === "synced") {
      setLeaving(false);
      setVisible(true);
    } else {
      setLeaving(true);
      const t = setTimeout(() => { setVisible(false); setLeaving(false); }, 400);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      {/* Offline banner — full width, slides down from top */}
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
            <span>Offline — viewing saved data</span>
          </div>
          <button
            onClick={syncNow}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-full px-2.5 py-1 text-white text-[11px] font-bold transition-colors"
          >
            <RefreshCw size={11} />
            Sync
          </button>
        </div>
      </div>

      {/* Syncing / Synced pill — bottom-center floating */}
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
    </>
  );
}
