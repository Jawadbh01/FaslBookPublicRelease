

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, getDocs, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ChevronLeft, ChevronRight, Loader2, History } from "lucide-react";

interface WorkerDoc {
  id: string;
  name: string;
  phone?: string;
  workerType: "daily" | "monthly" | "farmer" | string;
  dailyRate?: number;
  monthlySalary?: number;
  status: string;
  organizationId: string;
}

interface UserWorker {
  id: string;
  displayName: string;
  phone?: string;
  role: string;
  organizationId: string;
}

interface MergedWorker {
  id: string;
  name: string;
  phone: string;
  workerType: "daily" | "monthly" | string;
  dailyRate: number;
  monthlySalary: number;
  source: "worker" | "user";
}

type AttStatus = "present" | "halfDay" | "absent" | null;

interface AttRow {
  workerId: string;
  workerName: string;
  workerType: "daily" | "monthly" | string;
  dailyRate: number;
  monthlySalary: number;
  status: AttStatus;
  existingDocId?: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function fmtDate(d: Date) {
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

export default function AttendancePage() {
  
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [date, setDate] = useState(new Date());
  const [workerDocs, setWorkerDocs] = useState<WorkerDoc[]>([]);
  const [userWorkers, setUserWorkers] = useState<UserWorker[]>([]);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const isFuture = date > today;

  // Merge workers deduped by phone
  const mergedWorkers: MergedWorker[] = (() => {
    const seen = new Set<string>();
    const result: MergedWorker[] = [];

    for (const w of workerDocs) {
      if (w.workerType === "farmer") continue;
      const key = w.phone?.replace(/\s/g, "") || w.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          id: w.id,
          name: w.name,
          phone: w.phone || "",
          workerType: w.workerType,
          dailyRate: w.dailyRate || 0,
          monthlySalary: w.monthlySalary || 0,
          source: "worker",
        });
      }
    }
    for (const u of userWorkers) {
      const key = u.phone?.replace(/\s/g, "") || u.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          id: u.id,
          name: u.displayName || "Unknown",
          phone: u.phone || "",
          workerType: "daily",
          dailyRate: 0,
          monthlySalary: 0,
          source: "user",
        });
      }
    }
    return result;
  })();

  // Load workers
  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "workers"), where("organizationId", "==", orgId), where("status", "==", "active")),
      (snap) => {
        setWorkerDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkerDoc)));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "users"), where("organizationId", "==", orgId), where("role", "==", "worker")),
      (snap) => setUserWorkers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserWorker)))
    ));

    return () => unsubs.forEach((u) => u());
  }, [orgId]);

  // Load existing attendance for selected date
  const loadAttendance = useCallback(async (d: Date, workers: MergedWorker[]) => {
    if (!orgId || workers.length === 0) return;
    const ds = toDateStr(d);
    const snap = await getDocs(
      query(collection(db, "attendance"),
        where("organizationId", "==", orgId),
        where("date", "==", ds)
      )
    );
    const existing: Record<string, { status: AttStatus; docId: string }> = {};
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      existing[data.workerId] = { status: data.status as AttStatus, docId: docSnap.id };
    });
    setRows(workers.map((w) => ({
      workerId: w.id,
      workerName: w.name,
      workerType: w.workerType,
      dailyRate: w.dailyRate,
      monthlySalary: w.monthlySalary,
      status: existing[w.id]?.status ?? null,
      existingDocId: existing[w.id]?.docId,
    })));
  }, [orgId]);

  useEffect(() => {
    if (mergedWorkers.length > 0) loadAttendance(date, mergedWorkers);
  }, [date, workerDocs, userWorkers]);

  const setStatus = (workerId: string, status: AttStatus) => {
    setRows((prev) => prev.map((r) => r.workerId === workerId
      ? { ...r, status: r.status === status ? null : status }
      : r
    ));
  };

  const handleSave = async () => {
    if (isFuture) return;
    const ds = toDateStr(date);
    const toSave = rows.filter((r) => r.status !== null);
    if (toSave.length === 0) return;
    try {
      setSaving(true);
      for (const row of toSave) {
        const payload = {
          workerId: row.workerId,
          workerName: row.workerName,
          date: ds,
          status: row.status,
          organizationId: orgId,
          markedBy: auth.currentUser?.uid || "",
          updatedAt: serverTimestamp(),
          syncStatus: "synced",
        };
        if (row.existingDocId) {
          await updateDoc(doc(db, "attendance", row.existingDocId), payload);
        } else {
          const ref = await addDoc(collection(db, "attendance"), { ...payload, createdAt: serverTimestamp() });
          setRows((prev) => prev.map((r) => r.workerId === row.workerId ? { ...r, existingDocId: ref.id } : r));
        }
      }
      await addDoc(collection(db, "activityLogs"), {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: "ATTENDANCE_MARKED",
        description: `Attendance marked for ${ds}`,
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });
      setToast(`Attendance saved for ${toSave.length} worker${toSave.length !== 1 ? "s" : ""}`);
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const prevDay = () => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d); };
  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    d.setHours(0,0,0,0);
    if (d <= today) setDate(d);
  };

  // Summary
  const present = rows.filter((r) => r.status === "present").length;
  const halfDay = rows.filter((r) => r.status === "halfDay").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const unmarked = rows.filter((r) => r.status === null).length;

  // Labour cost (daily workers only)
  const labourCost = rows.reduce((sum, r) => {
    if (r.workerType !== "daily") return sum;
    if (r.status === "present") return sum + r.dailyRate;
    if (r.status === "halfDay") return sum + r.dailyRate * 0.5;
    return sum;
  }, 0);

  const btnSel = (status: AttStatus, target: "present" | "halfDay" | "absent") => {
    const selected = status === target;
    const colors = {
      present: { solid: "#1B5E20", soft: "#E8F5E9", text: "#1B5E20" },
      halfDay: { solid: "#E65100", soft: "#FFF3E0", text: "#E65100" },
      absent:  { solid: "#C62828", soft: "#FFEBEE", text: "#C62828" },
    };
    const c = colors[target];
    return {
      width: 44,
      height: 44,
      borderRadius: 12,
      border: `2px solid ${selected ? c.solid : "#E5E7EB"}`,
      backgroundColor: selected ? c.solid : "white",
      color: selected ? "white" : "#9CA3AF",
      fontWeight: 700 as const,
      fontSize: 14,
      display: "flex" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      cursor: "pointer" as const,
      transition: "all 0.12s",
      flexShrink: 0 as const,
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {/* Header */}
      <div style={{ backgroundColor: "#1B5E20" }} className="px-4 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => window.history.back()} className="text-white active:scale-95 transition-transform">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-white text-xl font-bold">Mark Attendance</h1>
              <p className="text-green-200 text-xs">{mergedWorkers.length} active workers</p>
            </div>
          </div>
          <button onClick={() => window.location.href = "/workers/attendance/history"}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <History size={14} />
            History
          </button>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
          <button onClick={prevDay} className="text-white active:scale-95 transition-transform p-1">
            <ChevronLeft size={20} />
          </button>
          <p className="text-white font-semibold text-sm">{fmtDate(date)}</p>
          <button onClick={nextDay} disabled={isFuture}
            className="p-1 transition-transform"
            style={{ color: isFuture ? "rgba(255,255,255,0.3)" : "white" }}>
            <ChevronRight size={20} />
          </button>
        </div>

        {isFuture && (
          <p className="text-center text-yellow-200 text-xs mt-2">Cannot mark attendance for future dates</p>
        )}
      </div>

      {/* Worker rows */}
      <div className="px-4 pt-3 flex flex-col gap-2">
        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : mergedWorkers.length === 0 ? (
          <div className="text-center pt-16">
            <p className="text-gray-500 font-medium">No active workers found</p>
            <p className="text-gray-400 text-sm mt-1">Add workers in the Team tab first</p>
          </div>
        ) : (
          rows.map((row) => {
            const isDaily = row.workerType === "daily";
            const ini = row.workerName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
            return (
              <div key={row.workerId} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: isDaily ? "#1565C0" : "#6A1B9A" }}>
                  {ini}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{row.workerName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: isDaily ? "#E3F2FD" : "#F3E5F5",
                        color: isDaily ? "#1565C0" : "#6A1B9A",
                      }}>
                      {isDaily ? "Daily" : "Monthly"}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {isDaily
                        ? `Rs. ${row.dailyRate.toLocaleString("en-PK")}/day`
                        : `Rs. ${row.monthlySalary.toLocaleString("en-PK")}/mo`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button style={btnSel(row.status, "present")} disabled={isFuture}
                    onClick={() => setStatus(row.workerId, "present")}>P</button>
                  <button style={btnSel(row.status, "halfDay")} disabled={isFuture}
                    onClick={() => setStatus(row.workerId, "halfDay")}>H</button>
                  <button style={btnSel(row.status, "absent")} disabled={isFuture}
                    onClick={() => setStatus(row.workerId, "absent")}>A</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary + earnings */}
      {mergedWorkers.length > 0 && !loading && (
        <div className="px-4 mt-4 flex flex-col gap-3">
          {/* Summary bar */}
          <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#1B5E20" }} />
                <span className="text-xs text-gray-500">Present</span>
                <span className="font-bold text-sm" style={{ color: "#1B5E20" }}>{present}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#E65100" }} />
                <span className="text-xs text-gray-500">Half</span>
                <span className="font-bold text-sm" style={{ color: "#E65100" }}>{halfDay}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#C62828" }} />
                <span className="text-xs text-gray-500">Absent</span>
                <span className="font-bold text-sm" style={{ color: "#C62828" }}>{absent}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-xs text-gray-500">Unmarked</span>
                <span className="font-bold text-sm text-gray-500">{unmarked}</span>
              </div>
            </div>
          </div>

          {/* Labour cost */}
          {labourCost > 0 && (
            <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: "#E8F5E9" }}>
              <p className="text-green-700 text-xs font-medium">Today's Labour Cost</p>
              <p className="font-bold text-xl" style={{ color: "#1B5E20" }}>
                Rs. {Math.round(labourCost).toLocaleString("en-PK")}
              </p>
              <p className="text-green-600 text-xs mt-0.5">Based on daily workers' present & half-day</p>
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      {mergedWorkers.length > 0 && !loading && (
        <div className="fixed bottom-20 left-0 right-0 px-4">
          <button onClick={handleSave} disabled={saving || isFuture}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}>
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Attendance"}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-4 right-4 z-50 px-5 py-4 rounded-2xl shadow-xl text-white text-sm font-semibold text-center"
          style={{ backgroundColor: "#1B5E20" }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
