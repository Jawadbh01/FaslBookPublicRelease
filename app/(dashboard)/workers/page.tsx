"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  Plus, X, Loader2, Phone, ClipboardList,
  ChevronRight, User, Wheat, CheckCircle, XCircle, Clock,
  MapPin, Printer,
} from "lucide-react";

interface FarmerUser {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  role: string;
  status?: string;
  organizationId: string;
  source: "user";
}

interface ManualFarmer {
  id: string;
  name: string;
  phone: string;
  workerType: "farmer";
  assignedParcel?: string;
  notes?: string;
  status: string;
  organizationId: string;
  source: "worker";
}

type AnyFarmer = FarmerUser | ManualFarmer;

interface Worker {
  id: string;
  name: string;
  phone: string;
  workerType: "daily" | "monthly";
  dailyRate?: number;
  monthlySalary?: number;
  status: string;
  organizationId: string;
  createdAt: any;
}

interface Parcel {
  id: string;
  name: string;
  assignedFarmer?: string;
}

interface Crop {
  id: string;
  assignedFarmer?: string;
  status: string;
}

interface JoinRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  organizationId: string;
  status: string;
  createdAt: any;
}

interface AttendanceRecord {
  workerId: string;
  date: string;
  status: "present" | "halfDay" | "absent";
}

type Tab = "farmers" | "workers" | "requests";

export default function WorkersPage() {
  const router = useRouter();
  const { organization, role } = useAuthStore();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [tab, setTab] = useState<Tab>("farmers");
  const [farmerUsers, setFarmerUsers] = useState<FarmerUser[]>([]);
  const [manualFarmers, setManualFarmers] = useState<ManualFarmer[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddFarmer, setShowAddFarmer] = useState(false);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const [fForm, setFForm] = useState({
    name: "",
    phone: "",
    assignedParcel: "",
    notes: "",
  });

  const [wForm, setWForm] = useState({
    name: "",
    phone: "",
    workerType: "daily" as "daily" | "monthly",
    dailyRate: "",
    monthlySalary: "",
    notes: "",
  });

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "users"), where("organizationId", "==", orgId), where("role", "==", "farmer")),
      (snap) => {
        setFarmerUsers(snap.docs.map((d) => ({ id: d.id, ...d.data(), source: "user" } as FarmerUser)));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "workers"), where("organizationId", "==", orgId)),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        setManualFarmers(all.filter((w: any) => w.workerType === "farmer").map((w: any) => ({ ...w, source: "worker" })));
        setWorkers(all.filter((w: any) => w.workerType !== "farmer")
          .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "parcels"), where("organizationId", "==", orgId)),
      (snap) => setParcels(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Parcel)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "crops"), where("organizationId", "==", orgId)),
      (snap) => setCrops(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Crop)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "joinRequests"), where("organizationId", "==", orgId), where("status", "==", "pending")),
      (snap) => setJoinRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JoinRequest)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "attendance"), where("organizationId", "==", orgId), where("date", "==", todayStr)),
      (snap) => setTodayAttendance(snap.docs.map((d) => d.data() as AttendanceRecord))
    ));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  const allFarmers: AnyFarmer[] = [
    ...farmerUsers,
    ...manualFarmers,
  ];

  const handleSaveFarmer = async () => {
    if (!fForm.name.trim()) { setError("Name is required"); return; }
    if (!fForm.phone.trim()) { setError("Phone number is required"); return; }
    try {
      setSaving(true); setError("");
      await addDoc(collection(db, "workers"), {
        name: fForm.name.trim(),
        phone: fForm.phone.trim(),
        workerType: "farmer",
        assignedParcel: fForm.assignedParcel,
        notes: fForm.notes.trim(),
        status: "active",
        organizationId: orgId,
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });
      setShowAddFarmer(false);
      setFForm({ name: "", phone: "", assignedParcel: "", notes: "" });
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWorker = async () => {
    if (!wForm.name.trim()) { setError("Name is required"); return; }
    if (wForm.workerType === "daily" && !wForm.dailyRate) { setError("Enter daily rate"); return; }
    if (wForm.workerType === "monthly" && !wForm.monthlySalary) { setError("Enter monthly salary"); return; }
    try {
      setSaving(true); setError("");
      await addDoc(collection(db, "workers"), {
        name: wForm.name.trim(),
        phone: wForm.phone.trim(),
        workerType: wForm.workerType,
        dailyRate: wForm.workerType === "daily" ? Number(wForm.dailyRate) : 0,
        monthlySalary: wForm.workerType === "monthly" ? Number(wForm.monthlySalary) : 0,
        notes: wForm.notes.trim(),
        status: "active",
        organizationId: orgId,
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });
      setShowAddWorker(false);
      setWForm({ name: "", phone: "", workerType: "daily", dailyRate: "", monthlySalary: "", notes: "" });
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (req: JoinRequest) => {
    setApprovingId(req.id);
    try {
      await updateDoc(doc(db, "joinRequests", req.id), { status: "approved" });
      await updateDoc(doc(db, "users", req.userId), {
        organizationId: req.organizationId,
        role: req.role,
        status: "active",
      });
    } catch (e) {
      console.error(e);
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (req: JoinRequest) => {
    setRejectingId(req.id);
    try {
      await updateDoc(doc(db, "joinRequests", req.id), { status: "rejected" });
    } catch (e) {
      console.error(e);
    } finally {
      setRejectingId(null);
    }
  };

  const initials = (name: string) =>
    (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  const getAttendanceDot = (workerId: string) => {
    const rec = todayAttendance.find((a) => a.workerId === workerId);
    if (!rec) return "#9CA3AF";
    if (rec.status === "present") return "#1B5E20";
    if (rec.status === "halfDay") return "#E65100";
    return "#C62828";
  };

  const timeAgo = (ts: any) => {
    if (!ts?.toDate) return "";
    const diff = Date.now() - ts.toDate().getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const roleColors: Record<string, { bg: string; color: string }> = {
    manager: { bg: "#E3F2FD", color: "#1565C0" },
    farmer:  { bg: "#E8F5E9", color: "#1B5E20" },
    worker:  { bg: "#F3E5F5", color: "#6A1B9A" },
  };

  // ── Add Farmer Form ──────────────────────────────────────────
  if (showAddFarmer) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => { setShowAddFarmer(false); setError(""); }} className="text-white mr-3 active:scale-95">
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Add Farmer</h1>
            <p className="text-green-200 text-xs">Create farmer profile manually</p>
          </div>
        </div>
        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Full Name *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <User size={18} color="#9E9E9E" className="mr-3 shrink-0" />
              <input type="text" placeholder="Farmer's full name" value={fForm.name}
                onChange={(e) => setFForm({ ...fForm, name: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Phone Number *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Phone size={18} color="#9E9E9E" className="mr-3 shrink-0" />
              <input type="tel" placeholder="03XX-XXXXXXX" value={fForm.phone}
                onChange={(e) => setFForm({ ...fForm, phone: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
            </div>
            <p className="text-gray-400 text-xs mt-1 ml-1">Used to link account if farmer registers with app</p>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Assigned Parcel</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <MapPin size={18} color="#9E9E9E" className="mr-3 shrink-0" />
              <select value={fForm.assignedParcel}
                onChange={(e) => setFForm({ ...fForm, assignedParcel: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent">
                <option value="">No parcel assigned</option>
                {parcels.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-8">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
              <textarea placeholder="Any notes..." value={fForm.notes}
                onChange={(e) => setFForm({ ...fForm, notes: e.target.value })}
                rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
            </div>
          </div>

          <button onClick={handleSaveFarmer} disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}>
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Farmer"}
          </button>
        </div>
      </div>
    );
  }

  // ── Add Worker Form ──────────────────────────────────────────
  if (showAddWorker) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => { setShowAddWorker(false); setError(""); }} className="text-white mr-3 active:scale-95">
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Add Worker</h1>
            <p className="text-green-200 text-xs">Daily or monthly worker</p>
          </div>
        </div>
        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Full Name *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <User size={18} color="#9E9E9E" className="mr-3 shrink-0" />
              <input type="text" placeholder="Full name" value={wForm.name}
                onChange={(e) => setWForm({ ...wForm, name: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Phone Number</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <Phone size={18} color="#9E9E9E" className="mr-3 shrink-0" />
              <input type="tel" placeholder="03XX-XXXXXXX" value={wForm.phone}
                onChange={(e) => setWForm({ ...wForm, phone: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
            </div>
          </div>

          <div className="mb-5">
            <label className="text-gray-600 text-sm font-medium mb-3 block">Worker Type</label>
            <div className="flex gap-3">
              {[{ val: "daily", label: "Daily" }, { val: "monthly", label: "Monthly" }].map(({ val, label }) => (
                <button key={val}
                  onClick={() => setWForm({ ...wForm, workerType: val as any })}
                  className="flex-1 py-3 rounded-2xl border-2 font-semibold text-sm transition-all active:scale-95"
                  style={{
                    borderColor: wForm.workerType === val ? "#1B5E20" : "#E5E7EB",
                    backgroundColor: wForm.workerType === val ? "#E8F5E9" : "white",
                    color: wForm.workerType === val ? "#1B5E20" : "#6B7280",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {wForm.workerType === "daily" ? (
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Daily Rate (Rs.) *</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <span className="text-gray-400 mr-2 font-medium">Rs.</span>
                <input type="number" placeholder="0" value={wForm.dailyRate}
                  onChange={(e) => setWForm({ ...wForm, dailyRate: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Monthly Salary (Rs.) *</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <span className="text-gray-400 mr-2 font-medium">Rs.</span>
                <input type="number" placeholder="0" value={wForm.monthlySalary}
                  onChange={(e) => setWForm({ ...wForm, monthlySalary: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent" />
              </div>
            </div>
          )}

          <div className="mb-8">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
              <textarea placeholder="Any notes..." value={wForm.notes}
                onChange={(e) => setWForm({ ...wForm, notes: e.target.value })}
                rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
            </div>
          </div>

          <button onClick={handleSaveWorker} disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}>
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Worker"}
          </button>
        </div>
      </div>
    );
  }

  // ── Main Screen ──────────────────────────────────────────────
  const pendingCount = joinRequests.length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div style={{ backgroundColor: "#1B5E20" }} className="px-4 pt-12 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-white text-xl font-bold">Our Team</h1>
            <p className="text-green-200 text-xs">
              {allFarmers.length} farmer{allFarmers.length !== 1 ? "s" : ""} · {workers.length} worker{workers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/reports/worker")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
            >
              <Printer size={14} />
              Print
            </button>
            <button
              onClick={() => router.push("/workers/attendance")}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
              <ClipboardList size={15} />
              Attendance
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex">
          {([
            { key: "farmers", label: "Farmers" },
            { key: "workers", label: "Workers" },
            { key: "requests", label: "Requests" },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
              style={{
                color: tab === key ? "white" : "rgba(255,255,255,0.55)",
                borderBottom: tab === key ? "3px solid white" : "3px solid transparent",
              }}>
              {label}
              {key === "requests" && pendingCount > 0 && (
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: "#C62828", color: "white" }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : tab === "farmers" ? (
          <>
            {allFarmers.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-16 text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                  <Wheat size={36} color="#1B5E20" />
                </div>
                <p className="text-gray-600 font-semibold mb-1">No farmers yet</p>
                <p className="text-gray-400 text-sm mb-6">Farmers can join via Farm ID or be added manually</p>
                {canEdit && (
                  <button onClick={() => setShowAddFarmer(true)}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}>
                    <Plus size={18} /> Add Farmer
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {canEdit && (
                  <button onClick={() => setShowAddFarmer(true)}
                    className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-semibold text-sm active:scale-95 transition-transform"
                    style={{ borderColor: "#1B5E20", color: "#1B5E20", borderStyle: "dashed" }}>
                    <Plus size={18} /> Add Farmer
                  </button>
                )}
                {allFarmers.map((farmer) => {
                  const isUser = farmer.source === "user";
                  const name = isUser ? (farmer as FarmerUser).displayName : (farmer as ManualFarmer).name;
                  const phone = isUser ? (farmer as FarmerUser).phone : (farmer as ManualFarmer).phone;
                  const farmerParcels = isUser
                    ? parcels.filter((p) => p.assignedFarmer === farmer.id)
                    : parcels.filter((p) => p.id === (farmer as ManualFarmer).assignedParcel);
                  const activeCropsCount = isUser
                    ? crops.filter((c) => c.assignedFarmer === farmer.id && c.status !== "harvested" && c.status !== "closed").length
                    : 0;
                  const ini = initials(name || "");
                  return (
                    <button key={farmer.id}
                      onClick={() => router.push(isUser ? `/workers/farmer/${farmer.id}` : `/workers/worker/${farmer.id}`)}
                      className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 w-full text-left active:scale-95 transition-transform">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-base"
                        style={{ backgroundColor: "#1B5E20" }}>
                        {ini}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-base truncate">{name || "Unnamed"}</p>
                        {phone && <p className="text-gray-400 text-xs truncate">📞 {phone}</p>}
                        <p className="text-gray-500 text-xs truncate">
                          {farmerParcels.length > 0
                            ? farmerParcels.map((p) => p.name).join(", ")
                            : "No parcel assigned"}
                          {activeCropsCount > 0 && ` · ${activeCropsCount} active crop${activeCropsCount !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
                          Active
                        </span>
                        <ChevronRight size={16} color="#9CA3AF" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : tab === "workers" ? (
          <>
            {workers.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-16 text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                  <User size={36} color="#1B5E20" />
                </div>
                <p className="text-gray-600 font-semibold mb-1">No workers yet</p>
                <p className="text-gray-400 text-sm mb-6">Add daily or monthly workers</p>
                {canEdit && (
                  <button onClick={() => setShowAddWorker(true)}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}>
                    <Plus size={18} /> Add First Worker
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {canEdit && (
                  <button onClick={() => setShowAddWorker(true)}
                    className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-semibold text-sm active:scale-95 transition-transform"
                    style={{ borderColor: "#1B5E20", color: "#1B5E20", borderStyle: "dashed" }}>
                    <Plus size={18} /> Add Worker
                  </button>
                )}
                {workers.map((worker) => {
                  const dot = getAttendanceDot(worker.id);
                  const isDaily = worker.workerType === "daily";
                  const ini = initials(worker.name);
                  return (
                    <button key={worker.id}
                      onClick={() => router.push(`/workers/worker/${worker.id}`)}
                      className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 w-full text-left active:scale-95 transition-transform">
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base"
                          style={{ backgroundColor: isDaily ? "#1565C0" : "#6A1B9A" }}>
                          {ini}
                        </div>
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white"
                          style={{ backgroundColor: dot }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-base truncate">{worker.name}</p>
                        {worker.phone && <p className="text-gray-400 text-xs">📞 {worker.phone}</p>}
                        <p className="text-gray-500 text-xs">
                          {isDaily
                            ? `Rs. ${(worker.dailyRate || 0).toLocaleString("en-PK")}/day`
                            : `Rs. ${(worker.monthlySalary || 0).toLocaleString("en-PK")}/month`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{
                            backgroundColor: isDaily ? "#E3F2FD" : "#F3E5F5",
                            color: isDaily ? "#1565C0" : "#6A1B9A",
                          }}>
                          {isDaily ? "Daily" : "Monthly"}
                        </span>
                        <ChevronRight size={16} color="#9CA3AF" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Requests Tab */
          joinRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-16 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                <CheckCircle size={36} color="#1B5E20" />
              </div>
              <p className="text-gray-600 font-semibold mb-1">No pending requests</p>
              <p className="text-gray-400 text-sm">All join requests have been handled</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {joinRequests.map((req) => {
                const ini = initials(req.userName || req.userEmail || "?");
                const rc = roleColors[req.role] || roleColors.farmer;
                const isApproving = approvingId === req.id;
                const isRejecting = rejectingId === req.id;
                return (
                  <div key={req.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-base"
                        style={{ backgroundColor: "#1B5E20" }}>
                        {ini}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-base truncate">{req.userName || "Unknown"}</p>
                        <p className="text-gray-400 text-xs truncate">{req.userEmail}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold capitalize"
                            style={{ backgroundColor: rc.bg, color: rc.color }}>
                            {req.role}
                          </span>
                          {req.createdAt && (
                            <span className="text-gray-400 text-xs flex items-center gap-0.5">
                              <Clock size={10} /> {timeAgo(req.createdAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleApprove(req)} disabled={isApproving || isRejecting}
                        className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
                        style={{ backgroundColor: "#1B5E20" }}>
                        {isApproving ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle size={16} /> Approve</>}
                      </button>
                      <button onClick={() => handleReject(req)} disabled={isApproving || isRejecting}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border-2 active:scale-95 transition-transform disabled:opacity-60"
                        style={{ borderColor: "#C62828", color: "#C62828" }}>
                        {isRejecting ? <Loader2 size={16} className="animate-spin" /> : <><XCircle size={16} /> Reject</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
