
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { Wheat, Mail, Phone, Chrome, Loader2 } from "lucide-react";
import { ASSETS } from "@/lib/utils/assets";

async function handleUserAfterAuth(
  uid: string,
  displayName: string | null,
  email: string | null,
  photoURL: string | null
) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      id: uid,
      name: displayName || "",
      email: email || "",
      phone: "",
      photoUrl: photoURL || "",
      role: null,
      organizationId: null,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      syncStatus: "synced",
    });
    window.location.replace("/role-select");
    return;
  }

  const userData = userSnap.data();
  if (!userData.role) {
    window.location.replace("/role-select");
    return;
  }
  if (!userData.organizationId) {
    window.location.replace(
      userData.role === "landlord" ? "/create-farm" : "/join-farm"
    );
    return;
  }
  window.location.replace("/overview");
}

export default function LoginPage() {
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoogle = async () => {
    try {
      setLoading(true);
      setError("");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      await handleUserAfterAuth(
        result.user.uid,
        result.user.displayName,
        result.user.email,
        result.user.photoURL
      );
    } catch (err: any) {
      console.error("Google error:", err);
      if (err.code === "auth/popup-blocked") {
        setError("Popup was blocked. Please allow popups and try again.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("Login cancelled. Please try again.");
      } else {
        setError("Google login failed. Please try again.");
      }
      setLoading(false);
    }
  };

  const handleFacebook = async () => {
    try {
      setLoading(true);
      setError("");
      const provider = new FacebookAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await handleUserAfterAuth(
        result.user.uid,
        result.user.displayName,
        result.user.email,
        result.user.photoURL
      );
    } catch (err: any) {
      console.error("Facebook error:", err);
      setError("Facebook login failed. Please try again.");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4">
        <div
          className="animate-spin rounded-full h-12 w-12 border-4 border-gray-100"
          style={{ borderTopColor: "#1B5E20" }}
        />
        <p className="text-gray-400 text-sm">Signing in...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div
        className="flex flex-col items-center justify-center pt-16 pb-10 px-6"
        style={{ backgroundColor: "#1B5E20" }}
      >
        <div className="bg-white rounded-full p-2 mb-4 shadow-lg overflow-hidden w-20 h-20 flex items-center justify-center">
          <img
            src={ASSETS.logo}
            alt="FaslBook Logo"
            className="w-16 h-16 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const icon = document.createElement("div");
                icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1B5E20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>';
                parent.appendChild(icon.firstChild!);
              }
            }}
          />
        </div>
        <h1 className="text-white text-4xl font-bold tracking-wide">
          FaslBook
        </h1>
        <p className="text-green-200 text-sm mt-1">Farm Operating System</p>
        <p className="text-green-100 text-xl mt-3 font-semibold">
          خوش آمدید
        </p>
        <p className="text-green-200 text-xs mt-1 text-center px-8">
          Manage your farm, finances & team all in one place
        </p>
      </div>

      <div className="flex-1 bg-white rounded-t-3xl -mt-4 px-6 pt-8 pb-10">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="flex items-center gap-3 w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm active:scale-95 transition-transform disabled:opacity-60"
          >
            <div className="bg-red-50 rounded-full p-2">
              <Chrome size={22} color="#EA4335" />
            </div>
            <span className="text-gray-800 font-semibold text-base">
              Continue with Google
            </span>
          </button>

          <button
            onClick={handleFacebook}
            disabled={loading}
            className="flex items-center gap-3 w-full bg-blue-600 rounded-2xl px-5 py-4 active:scale-95 transition-transform disabled:opacity-60"
          >
            <div className="bg-blue-500 rounded-full p-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
              </svg>
            </div>
            <span className="text-white font-semibold text-base">
              Continue with Facebook
            </span>
          </button>

          <button
            disabled
            className="flex items-center gap-3 w-full border-2 border-gray-200 rounded-2xl px-5 py-4 opacity-50 cursor-not-allowed"
          >
            <div className="rounded-full p-2 bg-gray-100">
              <Phone size={22} color="#9CA3AF" />
            </div>
            <div className="flex flex-col items-start">
              <span className="font-semibold text-base text-gray-400">
                Continue with Phone (OTP)
              </span>
              <span className="text-xs text-gray-400">
                Not available right now
              </span>
            </div>
          </button>

          <button
            onClick={() => window.location.href = "/email"}
            disabled={loading}
            className="flex items-center gap-3 w-full border-2 rounded-2xl px-5 py-4 active:scale-95 transition-transform disabled:opacity-60"
            style={{ borderColor: "#1B5E20" }}
          >
            <div
              className="rounded-full p-2"
              style={{ backgroundColor: "#E8F5E9" }}
            >
              <Mail size={22} color="#1B5E20" />
            </div>
            <span
              className="font-semibold text-base"
              style={{ color: "#1B5E20" }}
            >
              Continue with Email
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 text-xs">OR</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="text-center">
          <p className="text-gray-500 text-sm">
            New to FaslBook?{" "}
            <button
              onClick={() => window.location.href = "/role-select"}
              className="font-bold"
              style={{ color: "#1B5E20" }}
            >
              Create Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
