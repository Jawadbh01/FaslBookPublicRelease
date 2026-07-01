import { useEffect, useRef, useState } from "react";
import { enableNetwork, disableNetwork, waitForPendingWrites, onSnapshotsInSync } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export type SyncState = "online" | "syncing" | "synced" | "offline";

const LAST_SYNCED_KEY = "faslbook_last_synced";

function saveLastSynced() {
  try { localStorage.setItem(LAST_SYNCED_KEY, Date.now().toString()); } catch {}
}

function loadLastSynced(): number | null {
  try {
    const v = localStorage.getItem(LAST_SYNCED_KEY);
    return v ? parseInt(v) : null;
  } catch { return null; }
}

export function formatLastSynced(ts: number | null): string {
  if (!ts) return "Never synced";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10)  return "Just now";
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function useSyncStatus() {
  const [state, setState]         = useState<SyncState>(navigator.onLine ? "online" : "offline");
  const [lastSynced, setLastSynced] = useState<number | null>(loadLastSynced);
  const syncingRef = useRef(false);

  useEffect(() => {
    let unsubSync: () => void;

    const markSynced = () => {
      const now = Date.now();
      saveLastSynced();
      setLastSynced(now);
      syncingRef.current = false;
      setState("synced");
      setTimeout(() => setState("online"), 2500);
    };

    const checkPending = async () => {
      if (!navigator.onLine) return;
      try {
        syncingRef.current = true;
        setState("syncing");
        await waitForPendingWrites(db);
        markSynced();
      } catch { /* offline */ }
    };

    const handleOnline = async () => {
      try { await enableNetwork(db); } catch {}
      await checkPending();
    };

    const handleOffline = () => {
      setState("offline");
      syncingRef.current = false;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    try {
      unsubSync = onSnapshotsInSync(db, () => {
        if (navigator.onLine && syncingRef.current) {
          markSynced();
        }
      });
    } catch {}

    // Track initial sync automatically
    if (navigator.onLine) {
      checkPending();
    } else {
      setState("offline");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubSync?.();
    };
  }, []);

  const syncNow = async () => {
    if (!navigator.onLine) return;
    setState("syncing");
    try {
      await disableNetwork(db);
      await enableNetwork(db);
      await waitForPendingWrites(db);
      const now = Date.now();
      saveLastSynced();
      setLastSynced(now);
      setState("synced");
      setTimeout(() => setState("online"), 2500);
    } catch {
      setState(navigator.onLine ? "online" : "offline");
    }
  };

  return { state, lastSynced, syncNow };
}
