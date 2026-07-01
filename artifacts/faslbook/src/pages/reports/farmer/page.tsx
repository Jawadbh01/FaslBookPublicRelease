

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, User, MapPin, Wheat, Package, MessageCircle, FileText, Printer, ChevronDown, FileSpreadsheet } from "lucide-react";

const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function FarmerReportPage() {
  
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [farmers, setFarmers]         = useState<any[]>([]);
  const [selectedId, setSelectedId]   = useState("");
  const [parcels, setParcels]         = useState<any[]>([]);
  const [crops, setCrops]             = useState<any[]>([]);
  const [stockReceived, setStockReceived] = useState<any[]>([]);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading, setLoading]         = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [exporting, setExporting]     = useState<string | null>(null);

  useEffect(() => { if (orgId) loadFarmers(); }, [orgId]);
  useEffect(() => { if (selectedId) loadFarmerData(selectedId); }, [selectedId]);

  const loadFarmers = async () => {
    if (!orgId) return;
    const [userSnap, workerSnap] = await Promise.all([
      getDocs(query(collection(db, "users"),   where("organizationId", "==", orgId), where("role", "==", "farmer"))),
      getDocs(query(collection(db, "workers"), where("organizationId", "==", orgId), where("workerType", "==", "farmer"))),
    ]);
    const list = [
      ...userSnap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().displayName, source: "user", ...d.data() })),
      ...workerSnap.docs.map(d => ({ id: d.id, name: d.data().name, source: "worker", ...d.data() })),
    ];
    setFarmers(list);
    if (list.length > 0) setSelectedId(list[0].id);
  };

  const loadFarmerData = async (farmerId: string) => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [parcelSnap, cropSnap, stockSnap, expSnap] = await Promise.all([
        getDocs(query(collection(db, "parcels"),              where("organizationId", "==", orgId), where("assignedFarmer", "==", farmerId))),
        getDocs(query(collection(db, "crops"),                where("organizationId", "==", orgId), where("assignedFarmer", "==", farmerId))),
        getDocs(query(collection(db, "inventoryTransactions"),where("organizationId", "==", orgId), where("toFarmerId", "==", farmerId))),
        getDocs(query(collection(db, "expenses"),             where("organizationId", "==", orgId))),
      ]);
      const farmerParcels = parcelSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const parcelIds = farmerParcels.map((p: any) => p.id);
      setParcels(farmerParcels);
      setCrops(cropSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setStockReceived(stockSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      let exp = 0;
      expSnap.docs.forEach(d => { if (parcelIds.includes(d.data().parcelId)) exp += Number(d.data().amount) || 0; });
      setTotalExpense(exp);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const selectedFarmer = farmers.find(f => f.id === selectedId);

  const handlePDF = async () => {
    setExporting("pdf"); setShowMenu(false);
    try {
      const { exportToPDF } = await import("@/lib/exports/pdfExport");
      const rows = [
        ["Farmer", selectedFarmer?.name || ""],
        ["Parcels Assigned", String(parcels.length)],
        ["Total Crops", String(crops.length)],
        ["Active Crops", String(crops.filter((c: any) => c.status !== "harvested" && c.status !== "closed").length)],
        ["Harvested Crops", String(crops.filter((c: any) => c.status === "harvested").length)],
        ["Total Expenses", fmt(totalExpense)],
        ...parcels.map((p: any) => [`  Parcel: ${p.name}`, `${p.acres} acres`]),
        ...stockReceived.map((s: any) => [`  Stock: ${s.itemName}`, `${s.quantity} ${s.unit}`]),
      ];
      await exportToPDF(`Farmer Report — ${selectedFarmer?.name}`, rows, ["Item", "Details"]);
    } catch { window.print(); }
    setExporting(null);
  };

  const handleExcel = async () => {
    setExporting("excel"); setShowMenu(false);
    try {
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      const rows = crops.map((c: any) => [c.cropName, c.parcelName || "—", c.season || "—", c.status]);
      await exportToExcel(`Farmer Crops — ${selectedFarmer?.name}`, rows, ["Crop", "Parcel", "Season", "Status"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleWhatsApp = async () => {
    setShowMenu(false);
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    shareViaWhatsApp(`Farmer Report — ${selectedFarmer?.name}`,
      `Parcels: ${parcels.length}\nCrops: ${crops.length}\nHarvested: ${crops.filter((c: any) => c.status === "harvested").length}\nTotal Expenses: ${fmt(totalExpense)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-5 screen-only" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => window.history.back()} className="text-white"><ArrowLeft size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">Farmer Report</h1>
              <p className="text-green-200 text-xs">Performance per farmer</p>
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
          <User size={18} color="white" />
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            className="flex-1 bg-transparent text-white outline-none text-sm font-medium">
            {farmers.map(f => <option key={f.id} value={f.id} style={{ color: "#1B5E20" }}>{f.name}</option>)}
          </select>
        </div>
      </div>

      {/* ── Screen view ── */}
      <div className="px-4 pt-4 screen-only">
        {farmers.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <User size={40} color="#E0E0E0" />
            <p className="text-gray-400 mt-3">No farmers yet</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center pt-20"><div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Parcels", value: parcels.length, color: "#1B5E20" },
                { label: "Crops", value: crops.length, color: "#1565C0" },
                { label: "Harvested", value: crops.filter((c: any) => c.status === "harvested").length, color: "#00695C" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-2xl p-3 shadow-sm text-center">
                  <p className="font-bold text-xl" style={{ color }}>{value}</p>
                  <p className="text-gray-400 text-xs">{label}</p>
                </div>
              ))}
            </div>
            {parcels.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Assigned Parcels</p>
                {parcels.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><MapPin size={14} color="#1B5E20" /><span className="text-gray-700 text-sm">{p.name}</span></div>
                    <span className="text-gray-500 text-xs">{p.acres} acres</span>
                  </div>
                ))}
              </div>
            )}
            {crops.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Crops ({crops.length})</p>
                {crops.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Wheat size={14} color="#1B5E20" />
                      <div>
                        <p className="text-gray-700 text-sm">{c.cropName}</p>
                        <p className="text-gray-400 text-xs">{c.parcelName}</p>
                      </div>
                    </div>
                    <div className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>{c.status}</div>
                  </div>
                ))}
              </div>
            )}
            {stockReceived.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Stock Received from Godown</p>
                {stockReceived.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><Package size={14} color="#E65100" /><span className="text-gray-700 text-sm">{s.itemName}</span></div>
                    <span className="font-semibold text-sm text-gray-800">{s.quantity} {s.unit}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="flex items-center justify-between">
                <p className="text-gray-600 text-sm">Total Expenses on Parcels</p>
                <p className="font-bold text-red-600">{fmt(totalExpense)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Print-only view ── */}
      <div className="print-only" style={{ padding: "0 24px" }}>
        <div style={{ borderBottom: "3px solid #1B5E20", paddingBottom: 10, marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1B5E20", margin: 0 }}>{organization?.name || "Farm"} — Farmer Report</h1>
          <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Farmer: {selectedFarmer?.name} &nbsp;|&nbsp; Generated: {today()}</p>
        </div>
        <table style={{ width: "auto", marginBottom: 20 }}>
          <tbody>
            {[
              ["Farmer", selectedFarmer?.name],
              ["Phone", selectedFarmer?.phone || "—"],
              ["Parcels Assigned", parcels.length],
              ["Total Crops", crops.length],
              ["Active Crops", crops.filter((c: any) => c.status !== "harvested" && c.status !== "closed").length],
              ["Harvested Crops", crops.filter((c: any) => c.status === "harvested").length],
              ["Total Expenses", fmt(totalExpense)],
            ].map(([l, v]) => (
              <tr key={String(l)}><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 24px 3px 0" }}>{l}</td><td style={{ fontWeight: 700 }}>{v}</td></tr>
            ))}
          </tbody>
        </table>
        {parcels.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", color: "#333" }}>Assigned Parcels ({parcels.length})</h2>
          <table>
            <thead><tr>{["#","Parcel","Acres","Location"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {parcels.map((p: any, i) => (
                <tr key={p.id}><td>{i+1}</td><td style={{ fontWeight: 600 }}>{p.name}</td><td>{p.acres}</td><td>{p.location || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </>}
        {crops.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px", color: "#333" }}>Crops ({crops.length})</h2>
          <table>
            <thead><tr>{["#","Crop","Parcel","Season","Status","Harvested Qty"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {crops.map((c: any, i) => (
                <tr key={c.id}>
                  <td>{i+1}</td>
                  <td style={{ fontWeight: 600 }}>{c.cropName}</td>
                  <td>{c.parcelName || "—"}</td>
                  <td>{c.season || "—"}</td>
                  <td style={{ fontWeight: 600, textTransform: "capitalize" }}>{c.status}</td>
                  <td>{c.harvestedQuantity ? `${c.harvestedQuantity} ${c.harvestUnit || ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
        {stockReceived.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px", color: "#333" }}>Stock Received ({stockReceived.length})</h2>
          <table>
            <thead><tr>{["#","Item","Quantity","Unit","Source"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {stockReceived.map((s: any, i) => (
                <tr key={s.id}><td>{i+1}</td><td style={{ fontWeight: 600 }}>{s.itemName}</td><td style={{ fontWeight: 700 }}>{s.quantity}</td><td>{s.unit || "—"}</td><td>{s.source || "—"}</td></tr>
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
