

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, MapPin, Wheat, FileText, MessageCircle, Printer, ChevronDown, FileSpreadsheet } from "lucide-react";

const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const statusColors: Record<string, string> = {
  planned: "#1565C0", sown: "#6A1B9A", growing: "#1B5E20",
  ready: "#E65100", harvested: "#00695C", closed: "#757575",
};

export default function ParcelReportPage() {
  
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [parcels, setParcels]   = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [crops, setCrops]       = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    getDocs(query(collection(db, "parcels"), where("organizationId", "==", orgId))).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setParcels(list);
      if (list.length > 0) setSelectedId((list[0] as any).id);
    });
  }, [orgId]);

  useEffect(() => { if (selectedId) loadParcelData(selectedId); }, [selectedId]);

  const loadParcelData = async (parcelId: string) => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [cropSnap, expSnap] = await Promise.all([
        getDocs(query(collection(db, "crops"),    where("organizationId", "==", orgId), where("parcelId", "==", parcelId))),
        getDocs(query(collection(db, "expenses"), where("organizationId", "==", orgId), where("parcelId", "==", parcelId))),
      ]);
      setCrops(cropSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setExpenses(expSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const selectedParcel: any = parcels.find(p => (p as any).id === selectedId);
  const totalExpense = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const expByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => { const cat = e.category || "Other"; expByCategory[cat] = (expByCategory[cat] || 0) + (Number(e.amount) || 0); });

  const handlePDF = async () => {
    setExporting("pdf"); setShowMenu(false);
    try {
      const { exportToPDF } = await import("@/lib/exports/pdfExport");
      const rows = [
        ["Parcel", selectedParcel?.name || ""],
        ["Acres", String(selectedParcel?.acres || "")],
        ["Location", selectedParcel?.location || "—"],
        ["Farmer", selectedParcel?.assignedFarmerName || "—"],
        ["Total Crops", String(crops.length)],
        ["Total Expenses", fmt(totalExpense)],
        ...Object.entries(expByCategory).map(([k, v]) => [`  ${k}`, fmt(v)]),
      ];
      await exportToPDF(`Parcel Report — ${selectedParcel?.name}`, rows, ["Item", "Details"]);
    } catch { window.print(); }
    setExporting(null);
  };

  const handleExcel = async () => {
    setExporting("excel"); setShowMenu(false);
    try {
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      const rows = crops.map((c: any) => [c.cropName, c.season || "—", c.status, c.harvestedQuantity ? `${c.harvestedQuantity} ${c.harvestUnit || ""}` : "—"]);
      await exportToExcel(`Parcel Crops — ${selectedParcel?.name}`, rows, ["Crop", "Season", "Status", "Harvested"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleWhatsApp = async () => {
    setShowMenu(false);
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    shareViaWhatsApp(`Parcel Report — ${selectedParcel?.name}`,
      `Acres: ${selectedParcel?.acres}\nFarmer: ${selectedParcel?.assignedFarmerName || "—"}\nCrops: ${crops.length}\nTotal Expenses: ${fmt(totalExpense)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-5 screen-only" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => window.history.back()} className="text-white"><ArrowLeft size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">Parcel Report</h1>
              <p className="text-green-200 text-xs">Crop history & expenses</p>
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
          <MapPin size={18} color="white" />
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            className="flex-1 bg-transparent text-white outline-none text-sm font-medium">
            {parcels.map((p: any) => <option key={p.id} value={p.id} style={{ color: "#1B5E20" }}>{p.name} ({p.acres} acres)</option>)}
          </select>
        </div>
      </div>

      {/* ── Screen view ── */}
      <div className="px-4 pt-4 screen-only">
        {parcels.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <MapPin size={40} color="#E0E0E0" />
            <p className="text-gray-400 mt-3">No parcels yet</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center pt-20"><div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} /></div>
        ) : (
          <>
            {selectedParcel && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-base mb-2">{selectedParcel.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-xl p-2"><p className="text-gray-400 text-xs">Acres</p><p className="font-bold text-gray-800">{selectedParcel.acres}</p></div>
                  <div className="bg-gray-50 rounded-xl p-2"><p className="text-gray-400 text-xs">Location</p><p className="font-bold text-gray-800 text-sm">{selectedParcel.location || "—"}</p></div>
                  <div className="bg-gray-50 rounded-xl p-2 col-span-2"><p className="text-gray-400 text-xs">Assigned Farmer</p><p className="font-bold text-gray-800">{selectedParcel.assignedFarmerName || "Not assigned"}</p></div>
                </div>
              </div>
            )}
            {crops.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Crop History ({crops.length})</p>
                {crops.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wheat size={16} color="#1B5E20" />
                      <div>
                        <p className="text-gray-700 text-sm font-medium">{c.cropName}</p>
                        <p className="text-gray-400 text-xs">{c.season}</p>
                      </div>
                    </div>
                    <div>
                      <div className="px-2 py-0.5 rounded-full text-xs font-bold text-right"
                        style={{ backgroundColor: (statusColors[c.status] || "#757575") + "20", color: statusColors[c.status] || "#757575" }}>
                        {c.status}
                      </div>
                      {c.status === "harvested" && c.harvestedQuantity && (
                        <p className="text-xs text-gray-400 text-right mt-0.5">{c.harvestedQuantity} {c.harvestUnit}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-gray-800 text-sm">Expense Breakdown</p>
                <p className="font-bold text-red-600 text-sm">{fmt(totalExpense)}</p>
              </div>
              {Object.keys(expByCategory).length === 0 ? (
                <p className="text-gray-400 text-sm">No expenses recorded for this parcel</p>
              ) : (
                Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
                  const pct = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
                  return (
                    <div key={cat} className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-600 text-sm">{cat}</span>
                        <span className="font-semibold text-sm text-red-600">{fmt(amount)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#C62828" }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Print-only view ── */}
      <div className="print-only" style={{ padding: "0 24px" }}>
        <div style={{ borderBottom: "3px solid #1B5E20", paddingBottom: 10, marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1B5E20", margin: 0 }}>{organization?.name || "Farm"} — Parcel Report</h1>
          <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Parcel: {selectedParcel?.name} &nbsp;|&nbsp; Generated: {today()}</p>
        </div>
        <table style={{ width: "auto", marginBottom: 20 }}>
          <tbody>
            {[
              ["Parcel Name", selectedParcel?.name],
              ["Acres", selectedParcel?.acres],
              ["Location", selectedParcel?.location || "—"],
              ["Assigned Farmer", selectedParcel?.assignedFarmerName || "—"],
              ["Total Crops", crops.length],
              ["Total Expenses", fmt(totalExpense)],
            ].map(([l, v]) => (
              <tr key={String(l)}><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>{l}</td><td style={{ fontWeight: 700 }}>{v}</td></tr>
            ))}
          </tbody>
        </table>
        {crops.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", color: "#333" }}>Crop History ({crops.length})</h2>
          <table>
            <thead><tr>{["#","Crop","Season","Status","Harvested Qty","Harvest Unit"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {crops.map((c: any, i) => (
                <tr key={c.id}>
                  <td>{i+1}</td>
                  <td style={{ fontWeight: 600 }}>{c.cropName}</td>
                  <td>{c.season || "—"}</td>
                  <td style={{ color: statusColors[c.status] || "#757575", fontWeight: 600, textTransform: "capitalize" }}>{c.status}</td>
                  <td>{c.harvestedQuantity || "—"}</td>
                  <td>{c.harvestUnit || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
        {expenses.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px", color: "#333" }}>Expenses ({expenses.length})</h2>
          <table>
            <thead><tr>{["#","Category","Amount","Notes"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {expenses.map((e: any, i) => (
                <tr key={e.id}>
                  <td>{i+1}</td>
                  <td style={{ fontWeight: 600 }}>{e.category || "Other"}</td>
                  <td style={{ color: "#B71C1C", fontWeight: 700 }}>{fmt(Number(e.amount) || 0)}</td>
                  <td>{e.notes || e.description || "—"}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={2} style={{ textAlign: "right", paddingRight: 16 }}>Total</td>
                <td style={{ color: "#B71C1C", fontWeight: 800 }}>{fmt(totalExpense)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </>}
        {Object.keys(expByCategory).length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px", color: "#333" }}>Expense Summary by Category</h2>
          <table>
            <thead><tr>{["#","Category","Amount"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {Object.entries(expByCategory).sort((a,b) => b[1]-a[1]).map(([cat, amount], i) => (
                <tr key={cat}><td>{i+1}</td><td style={{ fontWeight: 600 }}>{cat}</td><td style={{ color: "#B71C1C", fontWeight: 700 }}>{fmt(amount)}</td></tr>
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
