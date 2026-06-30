import { useState } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { Mail, Phone, Chrome } from "lucide-react";
import { ASSETS } from "@/lib/utils/assets";

// ── Save minimal cache BEFORE redirect so AuthProvider doesn't bounce back ──
function saveLoginCache(user: { uid: string; email: string | null; displayName: string | null; photoURL: string | null; role: string | null }, org: any | null) {
  try {
    localStorage.setItem("faslbook_user_cache", JSON.stringify({
      uid:         user.uid,
      email:       user.email       || "",
      displayName: user.displayName || "",
      photoURL:    user.photoURL    || "",
      role:        user.role,
    }));
    if (org) localStorage.setItem("faslbook_org_cache", JSON.stringify(org));
  } catch {}
}

async function handleUserAfterAuth(
  uid: string,
  displayName: string | null,
  email: string | null,
  photoURL: string | null
) {
  const userRef  = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  // ── New user ─────────────────────────────────────────────────
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      id: uid, name: displayName || "", email: email || "",
      phone: "", photoUrl: photoURL || "", role: null,
      organizationId: null, status: "pending",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), syncStatus: "synced",
    });
    saveLoginCache({ uid, email, displayName, photoURL, role: null }, null);
    window.location.replace("/role-select");
    return;
  }

  const userData = userSnap.data();

  // ── No role yet ──────────────────────────────────────────────
  if (!userData.role) {
    saveLoginCache({ uid, email, displayName, photoURL, role: null }, null);
    window.location.replace("/role-select");
    return;
  }

  // ── Has role but no org ──────────────────────────────────────
  if (!userData.organizationId) {
    saveLoginCache({ uid, email, displayName, photoURL, role: userData.role }, null);
    window.location.replace(userData.role === "landlord" ? "/create-farm" : "/join-farm");
    return;
  }

  // ── Fully onboarded — fetch org then redirect ────────────────
  const orgSnap = await getDoc(doc(db, "organizations", userData.organizationId));
  const orgData = orgSnap.exists() ? orgSnap.data() : null;

  // Save cache BEFORE redirect — prevents AuthProvider from bouncing to /login
  saveLoginCache({ uid, email, displayName, photoURL, role: userData.role }, orgData);
  window.location.replace("/overview");
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleGoogle = async () => {
    try {
      setLoading(true); setError("");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      await handleUserAfterAuth(result.user.uid, result.user.displayName, result.user.email, result.user.photoURL);
    } catch (err: any) {
      if (err.code === "auth/popup-blocked")       setError("Popup blocked — allow popups and try again.");
      else if (err.code === "auth/popup-closed-by-user") setError("Login cancelled.");
      else setError("Google login failed. Please try again.");
      setLoading(false);
    }
  };

  const handleFacebook = async () => {
    try {
      setLoading(true); setError("");
      const provider = new FacebookAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await handleUserAfterAuth(result.user.uid, result.user.displayName, result.user.email, result.user.photoURL);
    } catch (err: any) {
      setError("Facebook login failed. Please try again.");
      setLoading(false);
    }
  };

  // ── Loading / redirecting — use splash as background ─────────
  if (loading) {
    return (
      <div
        style={{
          position: "fixed", inset: 0,
          backgroundImage: "url(/splash.png)",
          backgroundSize: "cover", backgroundPosition: "center",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16,
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <img src="/logo.png" alt="FaslBook" style={{ width: 64, height: 64, borderRadius: 14, objectFit: "contain" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <div style={{ width: 34, height: 34, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.25)", borderTopColor: "white", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600 }}>Signing in…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-y-auto">

      {/* ── Compact banner ───────────────────────────────────────── */}
      <div
        className="relative flex items-center px-5 overflow-hidden shrink-0"
        style={{
          backgroundImage: "url(/banner.png)",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          height: 160,
        }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(5,40,5,0.58)" }} />
        <div className="relative z-10 flex items-center gap-3">
          {/* Logo */}
          <div className="bg-white rounded-xl p-1.5 shadow-md shrink-0" style={{ width: 44, height: 44 }}>
            <img src={ASSETS.logo} alt="FaslBook" className="w-full h-full object-contain rounded-lg"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </div>
          {/* Text */}
          <div>
            <h1 className="text-white text-2xl font-bold leading-tight drop-shadow">FaslBook</h1>
            <p className="text-green-200 text-xs leading-tight">Farm Operating System</p>
            <p className="text-green-100 text-sm font-semibold leading-tight mt-0.5">خوش آمدید</p>
          </div>
        </div>
        {/* Tagline at bottom-right */}
        <p className="absolute bottom-3 right-4 text-green-200 text-[10px] font-medium z-10 opacity-80">
          Manage your farm, finances & team
        </p>
      </div>

      {/* ── Login card ───────────────────────────────────────────── */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-3 px-5 pt-6 pb-8">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* Google */}
          <button onClick={handleGoogle}
            className="flex items-center gap-3 w-full bg-white border border-gray-200 rounded-2xl px-4 py-3.5 shadow-sm active:scale-95 transition-transform"
            style={{ WebkitTapHighlightColor: "transparent" }}>
            <div className="bg-red-50 rounded-full p-2 shrink-0">
              <Chrome size={20} color="#EA4335" />
            </div>
            <span className="text-gray-800 font-semibold text-[15px]">Continue with Google</span>
          </button>

          {/* Facebook */}
          <button onClick={handleFacebook}
            className="flex items-center gap-3 w-full bg-blue-600 rounded-2xl px-4 py-3.5 active:scale-95 transition-transform"
            style={{ WebkitTapHighlightColor: "transparent" }}>
            <div className="bg-blue-500 rounded-full p-2 shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
              </svg>
            </div>
            <span className="text-white font-semibold text-[15px]">Continue with Facebook</span>
          </button>

          {/* Phone — disabled */}
          <button disabled
            className="flex items-center gap-3 w-full border-2 border-gray-100 rounded-2xl px-4 py-3.5 opacity-40 cursor-not-allowed bg-gray-50">
            <div className="rounded-full p-2 bg-gray-100 shrink-0">
              <Phone size={20} color="#9CA3AF" />
            </div>
            <div className="flex flex-col items-start">
              <span className="font-semibold text-[15px] text-gray-400">Continue with Phone (OTP)</span>
              <span className="text-xs text-gray-400">Not available right now</span>
            </div>
          </button>

          {/* Email */}
          <button onClick={() => { window.location.href = "/email"; }}
            className="flex items-center gap-3 w-full border-2 rounded-2xl px-4 py-3.5 active:scale-95 transition-transform"
            style={{ borderColor: "#1B5E20", WebkitTapHighlightColor: "transparent" }}>
            <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
              <Mail size={20} color="#1B5E20" />
            </div>
            <span className="font-semibold text-[15px]" style={{ color: "#1B5E20" }}>Continue with Email</span>
          </button>
        </div>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 text-xs">OR</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="text-center">
          <p className="text-gray-500 text-sm">
            New to FaslBook?{" "}
            <button onClick={() => { window.location.href = "/role-select"; }}
              className="font-bold" style={{ color: "#1B5E20" }}>
              Create Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
