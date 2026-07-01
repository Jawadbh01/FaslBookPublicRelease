import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";

const PUBLIC = ["/login", "/email", "/register", "/create-farm", "/role-select", "/join-farm", "/pending"];
const USER_KEY = "faslbook_user_cache";
const ORG_KEY  = "faslbook_org_cache";

function saveCache(user: any, org: any, role: string) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({
      uid: user.uid, email: user.email,
      displayName: user.displayName, photoURL: user.photoURL, role,
    }));
    if (org) localStorage.setItem(ORG_KEY, JSON.stringify(org));
  } catch {}
}

function loadCache() {
  try {
    const u = localStorage.getItem(USER_KEY);
    const o = localStorage.getItem(ORG_KEY);
    return { user: u ? JSON.parse(u) : null, org: o ? JSON.parse(o) : null };
  } catch { return { user: null, org: null }; }
}

export function clearAuthCache() {
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ORG_KEY);
    localStorage.removeItem("faslbook_last_sync");
    localStorage.removeItem("faslbook-auth");
  } catch {}
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setOrganization, setRole, setLoading } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const { user: cachedUser, org: cachedOrg } = loadCache();

    // ── Step 1: Restore from cache immediately (no Firebase wait) ──────────
    if (cachedUser) {
      setUser(cachedUser as any);
      setRole(cachedUser.role);
      if (cachedOrg) setOrganization(cachedOrg);
      setLoading(false);

      if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
        // On a login/auth page but already signed in → go to app
        setReady(true);
        window.location.replace("/overview");
        return; // Skip Firebase background check — redirect is enough
      }
      // On a protected page → show content immediately, check Firebase in background
      setReady(true);
    } else if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
      // No cache, on a public page → let it render normally
      setReady(true);
    } else {
      // No cache, on a protected page → redirect to login
      window.location.replace("/login");
      return;
    }

    // ── Step 2: Safety timeout — if Firebase doesn't respond in 5s (offline), unblock anyway ──
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setReady(true);
    }, 5000);

    // ── Step 3: Background Firebase verification (non-blocking) ───────────
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(safetyTimer);

      if (!firebaseUser) {
        // Firebase returned null — only act if we truly have no local cache
        const { user: stillCached } = loadCache();
        if (!stillCached) {
          clearAuthCache();
          setUser(null); setOrganization(null); setRole(null);
          setLoading(false); setReady(true);
          if (!PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
            window.location.replace("/login");
          }
        }
        // Has cache but Firebase said null → we're offline, trust cache
        setLoading(false);
        setReady(true);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (!userSnap.exists()) {
          clearAuthCache();
          setUser(null); setOrganization(null); setRole(null);
          setLoading(false); setReady(true);
          window.location.replace("/role-select");
          return;
        }

        const userData = userSnap.data();

        if (!userData.role) {
          window.location.replace("/role-select");
          setReady(true); return;
        }

        // Farmers cannot use the app
        if (userData.role === "farmer") {
          clearAuthCache();
          setUser(null); setOrganization(null); setRole(null);
          setLoading(false); setReady(true);
          window.location.replace("/login?farmer=1");
          return;
        }

        if (!userData.organizationId) {
          if (userData.role === "landlord") {
            window.location.replace("/create-farm");
          } else {
            window.location.replace("/join-farm");
          }
          setReady(true); return;
        }

        const orgSnap = await getDoc(doc(db, "organizations", userData.organizationId));
        const orgData = orgSnap.exists() ? orgSnap.data() : null;
        if (orgData) setOrganization(orgData as any);

        saveCache(firebaseUser, orgData, userData.role);
        setUser(firebaseUser);
        setRole(userData.role);
        setLoading(false);
        setReady(true);

        if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
          window.location.replace("/overview");
        }

      } catch {
        // Network error / Firestore offline — cache already applied, just continue
        setLoading(false);
        setReady(true);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
  }, []);

  if (!ready) {
    return (
      <div style={{
        position: "fixed", inset: 0, backgroundColor: "#1B5E20",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        <img
          src="/logo.png"
          alt="FaslBook"
          style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 16 }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: "4px solid rgba(255,255,255,0.25)",
          borderTopColor: "white",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
