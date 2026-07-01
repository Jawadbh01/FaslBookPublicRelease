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
    localStorage.setItem(USER_KEY, JSON.stringify({ uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL, role }));
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

    // Immediately show content from cache — no spinner needed
    if (cachedUser) {
      setUser(cachedUser as any);
      setRole(cachedUser.role);
      if (cachedOrg) setOrganization(cachedOrg);
      setLoading(false);
      setReady(true);
      if (PUBLIC.includes(path)) {
        window.location.replace("/overview");
        return;
      }
    } else {
      if (!PUBLIC.includes(path)) {
        window.location.replace("/login");
        return;
      }
      setReady(true);
    }

    // Background Firebase check — updates cache silently
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (!userSnap.exists()) {
            if (!PUBLIC.includes(path)) window.location.replace("/role-select");
            return;
          }
          const userData = userSnap.data();
          setRole(userData.role);

          if (!userData.role) {
            if (!PUBLIC.includes(path)) window.location.replace("/role-select");
            return;
          }
          if (!userData.organizationId) {
            if (userData.role === "landlord" && path !== "/create-farm") {
              window.location.replace("/create-farm");
            } else if (userData.role !== "landlord" && path !== "/join-farm" && path !== "/pending") {
              window.location.replace("/join-farm");
            }
            return;
          }

          const orgSnap = await getDoc(doc(db, "organizations", userData.organizationId));
          const orgData = orgSnap.exists() ? orgSnap.data() : null;
          if (orgData) setOrganization(orgData as any);

          saveCache(firebaseUser, orgData, userData.role);
          setUser(firebaseUser);
          setLoading(false);
          setReady(true);

          if (PUBLIC.includes(path)) window.location.replace("/overview");

        } catch {
          // Offline — already loaded from cache, continue normally
          setLoading(false);
          setReady(true);
        }

      } else {
        // Firebase says no user — trust cache if present (offline scenario)
        const { user: cached } = loadCache();
        if (cached) {
          setLoading(false);
          setReady(true);
          return;
        }
        // Truly logged out
        clearAuthCache();
        setUser(null);
        setOrganization(null);
        setRole(null);
        setLoading(false);
        setReady(true);
        if (!PUBLIC.includes(path)) window.location.replace("/login");
      }
    });

    return () => unsub();
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: "url(/splash.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        {/* Dark scrim so spinner is visible against any splash image */}
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.35)" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <img
            src="/logo.png"
            alt="FaslBook"
            style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 14 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <div style={{ width: 36, height: 36, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600 }}>Loading FaslBook…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
