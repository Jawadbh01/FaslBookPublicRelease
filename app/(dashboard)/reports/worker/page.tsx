"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, Clock, FileText, MessageCircle, Printer, ChevronDown, FileSpreadsheet } from "lucide-react";

const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["S","M","T","W","T","F","S"];

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function WorkerReportPage() {
  const router = useRouter();
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [workers, setWorkers]   = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [attendance, setAttendance] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    getDocs(query(collection(db, "workers"), where("organizationId", "==", orgId))).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setWorkers(list);
      if (list.length > 0) setSelectedId((list[0] as any).id);
    });
  }, [orgId]);

  useEffect(() => { if (selectedId) loadWorkerData(); }, [selectedId]);

  const loadWorkerData = async () => {
    if (!orgId || !selectedId) return;
    setLoading(true);
    try {
      const [attSnap, paySnap] = await Promise.all([
        getDocs(query(collection(db, "attendance"),     where("organizationId", "==", orgId), where("workerId", "==", selectedId))),
        getDocs(query(collection(db, "workerPayments"), where("organizationId", "==", orgId), where("workerId", "==", selectedId))),
      ]);
      setAttendance(attSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.date.localeCompare(a.date)));
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const selectedWorker: any = workers.find(w => (w as any).id === selectedId);
  const present  = attendance.filter((a: any) => a.status === "present").length;
  const halfDay  = attendance.filter((a: any) => a.status === "halfDay").length;
  const absent   = attendance.filter((a: any) => a.status === "absent").length;
  const earned   = selectedWorker?.workerType === "daily"
    ? (present * (selectedWorker?.dailyRate || 0)) + (halfDay * (selectedWorker?.dailyRate || 0) * 0.5)
    : (selectedWorker?.monthlySalary || 0);
  const totalPaid = payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const pending   = Math.max(0, earned - totalPaid);

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const attMap: Record<string, string> = {};
  attendance.forEach((a: any) => { attMap[a.date] = a.status; });

  const attColor = (status?: string) => {
    if (status === "present") return "#1B5E20";
    if (status === "halfDay") return "#E65100";
    if (status === "absent") return "#C62828";
    return "#E0E0E0";
  };
  const attLabel = (status?: string) => status === "present" ? "Present" : status === "halfDay" ? "Half Day" : status === "absent" ? "Absent" : "—";

  const handlePDF = async () => {
    setExporting("pdf"); setShowMenu(false);
    try {
      const { exportToPDF } = await import("@/lib/exports/pdfExport");
      const rows = [
        ["Worker", selectedWorker?.name || ""],
        ["Type", selectedWorker?.workerType || ""],
        ["Present Days", String(present)],
        ["Half Days", String(halfDay)],
        ["Absent Days", String(absent)],
        ["Earned Amount", fmt(earned)],
        ["Total Paid", fmt(totalPaid)],
        ["Pending", fmt(pending)],
      ];
      await exportToPDF(`Worker Report — ${selectedWorker?.name}`, rows, ["Item", "Details"]);
    } catch { window.print(); }
    setExporting(null);
  };

  const handleExcel = async () => {
    setExporting("excel"); setShowMenu(false);
    try {
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      const rows = attendance.map((a: any) => [a.date, attLabel(a.status)]);
      await exportToExcel(`Worker Attendance — ${selectedWorker?.name}`, rows, ["Date", "Status"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleWhatsApp = async () => {
    setShowMenu(false);
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    shareViaWhatsApp(`Worker Report — ${selectedWorker?.name}`,
      `Present: ${present} days\nHalf Day: ${halfDay} days\nAbsent: ${absent} days\nEarned: ${fmt(earned)}\nPaid: ${fmt(totalPaid)}\nPending: ${fmt(pending)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-5 screen-only" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-white"><ArrowLeft size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">Worker Report</h1>
              <p className="text-green-200 text-xs">Attendance & payments</p>
            </div>
          </div>
          <div className="relative">
            <button onClick={() => setShowMenu(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>
              <Printer size={13} />Print<ChevronDown size={11} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-2xl shadow-xl overflow-hidden w-44">
                  {[
                    { icon: <Printer size={14} />, label: "Print Now", action: () => { setShowMenu(false); window.print(); } },
                    { icon: <FileText size={14} />, label: exporting==="pdf" ? "Exporting…" : "Save as PDF", action: handlePDF },
                    { icon: <FileSpreadsheet size={14} />, label: exporting==="excel" ? "Exporting…" : "Export Excel", action: handleExcel },
                    { icon: <MessageCircle size={14} />, label: "WhatsApp", action: handleWhatsApp },
                  ].map(({ icon, label, action }) => (
                    <button key={label} onClick={action}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50">
                      <span style={{ color: "#1B5E20" }}>{icon}</span>{label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="bg-white/20 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Clock size={18} color="white" />
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            className="flex-1 bg-transparent text-white outline-none text-sm font-medium">
            {workers.map((w: any) => <option key={w.id} value={w.id} style={{ color: "#1B5E20" }}>{w.name}</option>)}
          </select>
        </div>
      </div>

      {/* ── Screen view ── */}
      <div className="px-4 pt-4 screen-only">
        {workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <Clock size={40} color="#E0E0E0" />
            <p className="text-gray-400 mt-3">No workers yet</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center pt-20"><div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} /></div>
        ) : (
          <>
            {selectedWorker && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: "#1B5E20" }}>
                  {selectedWorker.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-gray-800">{selectedWorker.name}</p>
                  <p className="text-gray-400 text-xs capitalize">
                    {selectedWorker.workerType} • {selectedWorker.workerType === "daily" ? `${fmt(selectedWorker.dailyRate || 0)}/day` : `${fmt(selectedWorker.monthlySalary || 0)}/month`}
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[{ label: "Present", value: present, color: "#1B5E20" }, { label: "Half Day", value: halfDay, color: "#E65100" }, { label: "Absent", value: absent, color: "#C62828" }, { label: "Total", value: attendance.length, color: "#1565C0" }].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-2xl p-3 shadow-sm text-center">
                  <p className="font-bold text-lg" style={{ color }}>{value}</p>
                  <p className="text-gray-400 text-xs">{label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="font-bold text-gray-800 text-sm mb-3">Earnings Summary</p>
              {[{ label: "Earned Amount", value: earned, color: "#1B5E20" }, { label: "Total Paid", value: totalPaid, color: "#1565C0" }, { label: "Pending", value: pending, color: "#C62828" }].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">{label}</span>
                  <span className="font-bold text-sm" style={{ color }}>{fmt(value)}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} className="p-1"><ArrowLeft size={16} color="#9E9E9E" /></button>
                <p className="font-bold text-gray-800 text-sm">{MONTHS[month]} {year}</p>
                <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} className="p-1 rotate-180"><ArrowLeft size={16} color="#9E9E9E" /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map((d, i) => <div key={i} className="text-center text-xs text-gray-400 font-medium">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`} />)}
                {Array(daysInMonth).fill(null).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const status = attMap[dateStr];
                  return (
                    <div key={day} className="flex items-center justify-center h-8 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: status ? attColor(status) + "30" : "transparent", color: status ? attColor(status) : "#9E9E9E" }}>
                      {day}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-3 justify-center">
                {[{ color: "#1B5E20", label: "Present" }, { color: "#E65100", label: "Half Day" }, { color: "#C62828", label: "Absent" }].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs text-gray-400">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            {payments.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Payment History</p>
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">{p.month ? `${MONTHS[p.month - 1]} ${p.year}` : "Payment"}</span>
                    <span className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmt(p.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Print-only view ── */}
      <div className="print-only" style={{ padding: "0 24px" }}>
        <div style={{ borderBottom: "3px solid #1B5E20", paddingBottom: 10, marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1B5E20", margin: 0 }}>{organization?.name || "Farm"} — Worker Report</h1>
          <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Worker: {selectedWorker?.name} &nbsp;|&nbsp; Generated: {today()}</p>
        </div>
        <table style={{ width: "auto", marginBottom: 20 }}>
          <tbody>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Worker</td><td style={{ fontWeight: 700 }}>{selectedWorker?.name}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Type</td><td style={{ textTransform: "capitalize" }}>{selectedWorker?.workerType}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Rate</td><td>{selectedWorker?.workerType === "daily" ? `${fmt(selectedWorker?.dailyRate || 0)}/day` : `${fmt(selectedWorker?.monthlySalary || 0)}/month`}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Present Days</td><td style={{ color: "#1B5E20", fontWeight: 700 }}>{present}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Half Days</td><td style={{ color: "#E65100", fontWeight: 700 }}>{halfDay}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Absent Days</td><td style={{ color: "#B71C1C", fontWeight: 700 }}>{absent}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Earned</td><td style={{ color: "#1B5E20", fontWeight: 700, fontSize: 13 }}>{fmt(earned)}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Total Paid</td><td style={{ fontWeight: 700 }}>{fmt(totalPaid)}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>Pending</td><td style={{ color: pending > 0 ? "#B71C1C" : "#1B5E20", fontWeight: 700, fontSize: 13 }}>{fmt(pending)}</td></tr>
          </tbody>
        </table>
        {attendance.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", color: "#333" }}>Attendance Record ({attendance.length} days)</h2>
          <table>
            <thead><tr>{["#","Date","Day","Status"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {attendance.map((a: any, i) => {
                const d = new Date(a.date + "T00:00:00");
                return (
                  <tr key={a.id}>
                    <td>{i+1}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{a.date}</td>
                    <td>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]}</td>
                    <td style={{ color: attColor(a.status), fontWeight: 600 }}>{attLabel(a.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>}
        {payments.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px", color: "#333" }}>Payment History ({payments.length})</h2>
          <table>
            <thead><tr>{["#","Period","Amount","Notes"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {payments.map((p: any, i) => (
                <tr key={p.id}>
                  <td>{i+1}</td>
                  <td>{p.month ? `${MONTHS[p.month - 1]} ${p.year}` : "—"}</td>
                  <td style={{ color: "#1B5E20", fontWeight: 700 }}>{fmt(p.amount || 0)}</td>
                  <td>{p.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
      </div>

      <style>{`
        @media screen { .print-only { display: none !important; } }
        @media print {
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background-color: #1B5E20 !important; color: white !important; padding: 7px 10px; text-align: left; }
          td { padding: 5px 10px; border-bottom: 1px solid #E8E8E8; }
          tr:nth-child(even) td { background: #F9F9F9; }
        }
      `}</style>
    </div>
  );
}
