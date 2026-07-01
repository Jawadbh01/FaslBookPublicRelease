import { useState, useEffect } from "react";
import { WifiOff, Download, RefreshCw, CheckCircle2 } from "lucide-react";

interface OfflinePageProps {
  onRetry?: () => void;
  onDownload?: () => void;
  hasCache?: boolean;
}

export default function OfflinePage({ onRetry, onDownload, hasCache = false }: OfflinePageProps) {
  const [retrying, setRetrying] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await new Promise((r) => setTimeout(r, 1200));
    if (navigator.onLine) {
      window.location.reload();
    } else {
      setRetrying(false);
    }
  };

  const handleDownload = async () => {
    setDownloaded(false);
    if (onDownload) {
      onDownload();
    }
    await new Promise((r) => setTimeout(r, 1000));
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "#F5F5F5" }}
    >
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
        style={{ backgroundColor: "#FFEBEE" }}
      >
        <WifiOff size={44} color="#C62828" />
      </div>

      <h1 className="text-2xl font-bold text-gray-800 mb-2">You're Offline</h1>
      <p className="text-gray-500 text-sm mb-1">No internet connection detected.</p>

      {hasCache ? (
        <p className="text-green-700 text-sm font-medium mb-8">
          ✓ Saved data is available — you can continue working.
        </p>
      ) : (
        <p className="text-red-600 text-sm font-medium mb-8">
          No saved data found. Download data first to use offline.
        </p>
      )}

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform disabled:opacity-70"
          style={{ backgroundColor: "#1B5E20" }}
        >
          {retrying ? (
            <>
              <RefreshCw size={20} className="animate-spin" />
              Checking connection…
            </>
          ) : (
            <>
              <RefreshCw size={20} />
              Try Again
            </>
          )}
        </button>

        {!hasCache && (
          <button
            onClick={handleDownload}
            disabled={downloaded}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-base active:scale-95 transition-transform border-2"
            style={{ borderColor: "#1565C0", color: "#1565C0", backgroundColor: "#E3F2FD" }}
          >
            {downloaded ? (
              <>
                <CheckCircle2 size={20} color="#1B5E20" />
                <span style={{ color: "#1B5E20" }}>Data Downloaded!</span>
              </>
            ) : (
              <>
                <Download size={20} />
                Download Data for Offline
              </>
            )}
          </button>
        )}
      </div>

      <div className="mt-10 px-4 py-4 rounded-2xl max-w-xs w-full" style={{ backgroundColor: "#FFF8E1" }}>
        <p className="text-amber-700 text-xs text-center">
          💡 <strong>Tip:</strong> Open the app while connected to automatically cache your farm data for offline use. Data syncs automatically when you reconnect.
        </p>
      </div>
    </div>
  );
}
