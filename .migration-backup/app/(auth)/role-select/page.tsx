"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { Wheat, Users, Tractor, ArrowLeft, Loader2 } from "lucide-react";

const roles = [
  {
    id: "landlord",
    title: "Landlord",
    urdu: "زمیندار",
    description: "I own the farm and manage everything",
    icon: Wheat,
    color: "#1B5E20",
    bg: "#E8F5E9",
  },
  {
    id: "manager",
    title: "Manager",
    urdu: "منیجر",
    description: "I manage farm operations and workers",
    icon: Users,
    color: "#1565C0",
    bg: "#E3F2FD",
  },
  {
    id: "farmer",
    title: "Farmer",
    urdu: "کسان",
    description: "I work the land and grow crops",
    icon: Tractor,
    color: "#E65100",
    bg: "#FFF3E0",
  },
];

export default function RoleSelectPage() {
  const router = useRouter();
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      setIsGoogleUser(true);
    }
  }, []);

  const handleSelect = async (roleId: string) => {
    const user = auth.currentUser;

    if (user && isGoogleUser) {
      try {
        setSelecting(roleId);
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          await updateDoc(userRef, {
            role: roleId,
            updatedAt: serverTimestamp(),
          });
        }

        if (roleId === "landlord") {
          window.location.replace("/create-farm");
        } else {
          window.location.replace("/join-farm");
        }
      } catch (err) {
        console.error("Role update error:", err);
        setSelecting(null);
      }
    } else {
      router.push(`/register?role=${roleId}`);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div
        className="px-4 pt-12 pb-8"
        style={{ backgroundColor: "#1B5E20" }}
      >
        <button
          onClick={() => router.back()}
          className="text-white mb-4 block"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-full p-2 shadow">
            <Wheat size={28} color="#1B5E20" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">
              {isGoogleUser ? "Almost Done!" : "Who are you?"}
            </h1>
            <p className="text-green-200 text-xs">
              {isGoogleUser
                ? "Just select your role to continue"
                : "آپ کون ہیں؟ — Select your role"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Role Cards */}
      <div className="flex-1 px-6 pt-8 pb-10">
        <p className="text-gray-500 text-sm text-center mb-8">
          {isGoogleUser
            ? "Your account is ready. Choose your role on this farm."
            : "Choose your role to get started with FaslBook"
          }
        </p>

        <div className="flex flex-col gap-4">
          {roles.map((role) => {
            const Icon = role.icon;
            const isLoading = selecting === role.id;
            return (
              <button
                key={role.id}
                onClick={() => handleSelect(role.id)}
                disabled={selecting !== null}
                className="flex items-center gap-4 w-full rounded-2xl p-5 border-2 border-gray-100 active:scale-95 transition-transform text-left disabled:opacity-60"
                style={{ backgroundColor: "#FAFAFA" }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: role.bg }}
                >
                  {isLoading
                    ? <Loader2 size={28} color={role.color} className="animate-spin" />
                    : <Icon size={28} color={role.color} />
                  }
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-800 text-lg">
                      {role.title}
                    </span>
                    <span
                      className="text-sm font-medium"
                      style={{ color: role.color }}
                    >
                      {role.urdu}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm">
                    {role.description}
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: role.bg }}
                >
                  <span style={{ color: role.color }} className="font-bold">→</span>
                </div>
              </button>
            );
          })}
        </div>

        {!isGoogleUser && (
          <div
            className="mt-8 px-4 py-4 rounded-2xl"
            style={{ backgroundColor: "#F5F5F5" }}
          >
            <p className="text-gray-500 text-xs text-center">
              👷 <strong>Workers</strong> are invited by landlord or manager.
              Workers cannot self-register.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
