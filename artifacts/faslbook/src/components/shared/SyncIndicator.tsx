

import { useEffect, useState } from "react";
import { WifiOff, CloudOff } from "lucide-react";

type SyncIndicatorProps = {
  iconColor?: string;
};

export default function SyncIndicator({
  iconColor = "#1B5E20",
}: SyncIndicatorProps) {
  const [online, setOnline]         = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Set initial state
    setOnline(navigator.onLine);
    setShowBanner(!navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      setShowBanner(false);
    };
    const handleOffline = () => {
      setOnline(false);
      setShowBanner(true);
    };

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[999] flex items-center justify-center gap-2 py-2 px-4 text-white text-xs font-semibold"
      style={{ backgroundColor: "#E65100" }}
    >
      <WifiOff size={14} />
      <span>Offline — data saved locally, will sync when connected</span>
    </div>
  );
}
