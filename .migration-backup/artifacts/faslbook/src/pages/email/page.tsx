
import { useState } from "react";
import { useLocation } from "wouter";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { Mail, Lock, ArrowLeft, Loader2, Eye, EyeOff, Wheat } from "lucide-react";

export default function EmailLoginPage() {
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const userSnap = await getDoc(doc(db, "users", credential.user.uid));
      if (!userSnap.exists()) {
        window.location.replace("/role-select");
        return;
      }
      const userData = userSnap.data();
      if (!userData.role) {
        window.location.replace("/role-select");
        return;
      }
      if (!userData.organizationId) {
        if (userData.role === "landlord") {
          window.location.replace("/create-farm");
        } else {
          window.location.replace("/join-farm");
        }
        return;
      }
      window.location.replace("/overview");
    } catch (err: any) {
      const code = err.code ?? "";
      if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
        setError("Incorrect email or password. Please try again.");
      } else if (code === "auth/invalid-email") {
        setError("Invalid email address.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait and try again.");
      } else if (code === "auth/network-request-failed") {
        setError("Network error. Check your internet connection.");
      } else {
        setError("Login failed. Please try again.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div
        className="flex items-center px-4 pt-12 pb-6"
        style={{ backgroundColor: "#1B5E20" }}
      >
        <button onClick={() => window.history.back()} className="text-white mr-3">
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <Wheat size={20} color="white" />
          <div>
            <h1 className="text-white text-xl font-bold">Login with Email</h1>
            <p className="text-green-200 text-xs">Welcome back!</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pt-8 pb-10">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}

        <div className="mb-5">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Email Address</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Mail size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-gray-600 text-sm font-medium mb-2 block">Password</label>
          <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
            <Lock size={20} color="#9E9E9E" className="mr-3 shrink-0" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 outline-none text-gray-800 text-base bg-transparent"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={20} color="#9E9E9E" /> : <Eye size={20} color="#9E9E9E" />}
            </button>
          </div>
        </div>

        <div className="text-right mb-8">
          <button style={{ color: "#1B5E20" }} className="text-sm font-medium">
            Forgot Password?
          </button>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          style={{ backgroundColor: "#1B5E20" }}
        >
          {loading ? <Loader2 size={22} className="animate-spin" /> : "Login"}
        </button>

        <div className="text-center mt-6">
          <p className="text-gray-500 text-sm">
            No account?{" "}
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
