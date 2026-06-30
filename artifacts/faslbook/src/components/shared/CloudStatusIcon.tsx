import { useSyncStatus } from "@/lib/hooks/useSyncStatus";
import { Cloud, CloudOff, RefreshCw, CloudCheck } from "lucide-react";

interface Props {
  color?: string;
  size?: number;
}

export default function CloudStatusIcon({ color = "white", size = 18 }: Props) {
  const { state, syncNow } = useSyncStatus();

  if (state === "offline") {
    return (
      <button
        onClick={syncNow}
        className="flex items-center justify-center w-9 h-9 rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        title="Offline — tap to retry"
      >
        <CloudOff size={size} color="#FF8A80" />
      </button>
    );
  }

  if (state === "syncing") {
    return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
        <RefreshCw size={size} color={color} className="animate-spin" style={{ opacity: 0.9 }} />
      </div>
    );
  }

  if (state === "synced") {
    return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
        <CloudCheck size={size} color="#A5D6A7" />
      </div>
    );
  }

  // online / idle — show faint cloud
  return (
    <div className="flex items-center justify-center w-9 h-9 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
      <Cloud size={size} color={color} style={{ opacity: 0.7 }} />
    </div>
  );
}
