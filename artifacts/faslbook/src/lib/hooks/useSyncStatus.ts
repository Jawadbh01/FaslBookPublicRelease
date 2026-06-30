import { useEffect, useRef, useState } from "react";
import { enableNetwork, disableNetwork, waitForPendingWrites, onSnapshotsInSync } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export type SyncState = "online" | "syncing" | "synced" | "offline";

export function useSyncStatus() {
  const [state, setState]             = useState<SyncState>(navigator.onLine ? "online" : "offline");
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);
  const pendingRef = useRef(0);

  useEffect(() => {
    let unsubSync: () => void;

    const checkPending = async () => {
      if (!navigator.onLine) return;
      try {
        syncingRef.current = true;
        setState("syncing");
        await waitForPendingWrites(db);
        syncingRef.current = false;
        setState("synced");
        setPendingCount(0);
        pendingRef.current = 0;
        setTimeout(() => setState("online"), 2000);
      } catch {
        // ignore — offline
      }
    };

    const handleOnline = async () => {
      try { await enableNetwork(db); } catch { /* ignore */ }
      setState("syncing");
      await checkPending();
    };

    const handleOffline = () => {
      setState("offline");
      syncingRef.current = false;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Track pending writes by listening to sync events
    try {
      unsubSync = onSnapshotsInSync(db, () => {
        if (navigator.onLine && syncingRef.current) {
          syncingRef.current = false;
          setState("synced");
          setTimeout(() => setState("online"), 2000);
        }
      });
    } catch { /* ignore */ }

    // Set initial state
    if (!navigator.onLine) {
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
      setState("synced");
      setTimeout(() => setState("online"), 2000);
    } catch {
      setState(navigator.onLine ? "online" : "offline");
    }
  };

  return { state, pendingCount, syncNow };
}
