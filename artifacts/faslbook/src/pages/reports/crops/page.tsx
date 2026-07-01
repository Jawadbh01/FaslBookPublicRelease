

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  ArrowLeft, Wheat, MapPin, User, Calendar,
  FileText, Printer, ChevronDown, FileSpreadsheet, MessageCircle,
} from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(val: any) {
  if (!val) return "—";
  if (typeof val === "string") { const [y, m, d] = val.split("-"); return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`; }
  const d = val?.toDate ? val.toDate() : new Date(val);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  planned:    { label: "Planned",    color: "#1565C0", bg: "#E3F2FD" },
  sowing:     { label: "Sowing",     color: "#E65100", bg: "#FFF3E0" },
  growing:    { label: "Growing",    color: "#1B5E20", bg: "#E8F5E9" },
  harvesting: { label: "Harvesting", color: "#6A1B9A", bg: "#F3E5F5" },
  completed:  { label: "Completed",  color: "#424242", bg: "#F5F5F5" },
  harvested:  { label: "Harvested",  color: "#00695C", bg: "#E0F2F1" },
  failed:     { label: "Failed",     color: "#B71C1C", bg: "#FFEBEE" },
};

const SEASONS = ["All", "Kharif", "Rabi", "Zaid"];

interface Crop {
  id: string; cropName: string; season: string; parcelId: string;
  parcelName: string; assignedFarmerName: string;
  sowingDate: any; expectedHarvest: any; status: string; notes: string;
}

export default function CropsReportPage() {
  
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [crops, setCrops]       = useState<Crop[]>([]);
  const [parcels, setParcels]   = useState<any[]>([]);
  const [season, setSeason]     = useState("All");
  const [loading, setLoading]   = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => { if (orgId) loadData(); }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [cropSnap, parcelSnap] = await Promise.all([
        getDocs(query(collection(db, "crops"),   where("organizationId", "==", orgId))),
        getDocs(query(collection(db, "parcels"), where("organizationId", "==", orgId))),
      ]);
      const parcelMap: Record<string, any> = {};
      parcelSnap.docs.forEach(d => { parcelMap[d.id] = { id: d.id, ...d.data() }; });
      setParcels(parcelSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const list: Crop[] = cropSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          cropName: data.cropName || "Unknown",
          season: data.season || "",
          parcelId: data.parcelId || "",
          parcelName: parcelMap[data.parcelId]?.name || data.parcelName || "—",
          assignedFarmerName: data.assignedFarmerName || "—",
          sowingDate: data.sowingDate,
          expectedHarvest: data.expectedHarvest,
          status: data.status || "planned",
          notes: data.notes || "",
        };
      }).sort((a, b) => {
        const keys = Object.keys(STATUS_CFG);
        return keys.indexOf(a.status) - keys.indexOf(b.status);
      });
      setCrops(list);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const filtered = season === "All" ? crops : crops.filter(c => c.season === season);
  const statusCounts = Object.fromEntries(Object.keys(STATUS_CFG).map(s => [s, crops.filter(c => c.status === s).length]));

  const handlePDF = async () => {
    setExporting("pdf"); setShowMenu(false);
    try {
      const { exportToPDF } = await import("@/lib/exports/pdfExport");
      const rows = filtered.map(c => [c.cropName, c.season || "—", c.parcelName, c.assignedFarmerName, fmtDate(c.sowingDate), fmtDate(c.expectedHarvest), STATUS_CFG[c.status]?.label || c.status]);
      await exportToPDF("Crops Report", rows, ["Crop", "Season", "Parcel", "Farmer", "Sowing", "Harvest", "Status"]);
    } catch { window.print(); }
    setExporting(null);
  };

  const handleExcel = async () => {
    setExporting("excel"); setShowMenu(false);
    try {
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      const rows = filtered.map(c => [c.cropName, c.season || "—", c.parcelName, c.assignedFarmerName, fmtDate(c.sowingDate), fmtDate(c.expectedHarvest), STATUS_CFG[c.status]?.label || c.status]);
      await exportToExcel("Crops Report", rows, ["Crop", "Season", "Parcel", "Farmer", "Sowing Date", "Harvest Date", "Status"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleWhatsApp = async () => {
    setShowMenu(false);
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    const summary = Object.entries(statusCounts).filter(([,v]) => v > 0).map(([k,v]) => `${STATUS_CFG[k]?.label || k}: ${v}`).join(", ");
    shareViaWhatsApp("Crops Report", `Total: ${crops.length} crops\n${summary}`);
  };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#F5F5F5" }}>
      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-4 screen-only" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => window.history.back()} className="text-white"><ArrowLeft size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">Crops Report</h1>
              <p className="text-green-200 text-xs">{crops.length} crop{crops.length !== 1 ? "s" : ""} across {parcels.length} parcel{parcels.length !== 1 ? "s" : ""}</p>
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
        <div className="flex gap-2">
          {SEASONS.map(s => (
            <button key={s} onClick={() => setSeason(s)}
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: season === s ? "white" : "rgba(255,255,255,0.2)", color: season === s ? "#1B5E20" : "white" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Screen view ── */}
      <div className="px-4 pt-4 screen-only">
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3">Status Overview</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(STATUS_CFG).map(([key, cfg]) => statusCounts[key] > 0 && (
              <div key={key} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: cfg.bg }}>
                <p className="font-bold text-base" style={{ color: cfg.color }}>{statusCounts[key]}</p>
                <p className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</p>
              </div>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center pt-16"><div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="text-5xl mb-3">🌾</div>
            <p className="text-gray-600 font-semibold">No crops{season !== "All" ? ` for ${season}` : ""}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(crop => {
              const cfg = STATUS_CFG[crop.status] ?? STATUS_CFG.planned;
              return (
                <div key={crop.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#E8F5E9" }}>
                        <Wheat size={20} color="#1B5E20" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{crop.cropName}</p>
                        <p className="text-gray-400 text-xs">{crop.season || "—"} Season</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-gray-500"><MapPin size={12} color="#9E9E9E" /><span>Parcel: <span className="font-semibold text-gray-700">{crop.parcelName}</span></span></div>
                    <div className="flex items-center gap-2 text-xs text-gray-500"><User size={12} color="#9E9E9E" /><span>Farmer: <span className="font-semibold text-gray-700">{crop.assignedFarmerName}</span></span></div>
                    <div className="flex items-center gap-2 text-xs text-gray-500"><Calendar size={12} color="#9E9E9E" /><span>Sowing: <span className="font-semibold text-gray-700">{fmtDate(crop.sowingDate)}</span></span></div>
                    <div className="flex items-center gap-2 text-xs text-gray-500"><Calendar size={12} color="#9E9E9E" /><span>Expected Harvest: <span className="font-semibold text-gray-700">{fmtDate(crop.expectedHarvest)}</span></span></div>
                    {crop.notes && <div className="mt-1 px-3 py-2 rounded-xl" style={{ backgroundColor: "#F9F9F9" }}><p className="text-xs text-gray-500">{crop.notes}</p></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Print-only view ── */}
      <div className="print-only" style={{ padding: "0 24px" }}>
        <div style={{ borderBottom: "3px solid #1B5E20", paddingBottom: 10, marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1B5E20", margin: 0 }}>{organization?.name || "Farm"} — Crops Report</h1>
          <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>
            Season: {season} &nbsp;|&nbsp; Total: {filtered.length} crop{filtered.length !== 1 ? "s" : ""} &nbsp;|&nbsp; Generated: {today()}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {Object.entries(STATUS_CFG).map(([key, cfg]) => statusCounts[key] > 0 && (
            <div key={key} style={{ padding: "4px 12px", borderRadius: 20, backgroundColor: cfg.bg, color: cfg.color, fontWeight: 600, fontSize: 11 }}>
              {cfg.label}: {statusCounts[key]}
            </div>
          ))}
        </div>
        <table>
          <thead>
            <tr>{["#","Crop","Season","Parcel","Farmer","Sowing Date","Expected Harvest","Status","Notes"].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((crop, i) => {
              const cfg = STATUS_CFG[crop.status] ?? STATUS_CFG.planned;
              return (
                <tr key={crop.id}>
                  <td>{i+1}</td>
                  <td style={{ fontWeight: 700 }}>{crop.cropName}</td>
                  <td>{crop.season || "—"}</td>
                  <td>{crop.parcelName}</td>
                  <td>{crop.assignedFarmerName}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(crop.sowingDate)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(crop.expectedHarvest)}</td>
                  <td style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</td>
                  <td>{crop.notes || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        @media screen { .print-only { display: none !important; } }
        @media print {
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th { background-color: #1B5E20 !important; color: white !important; padding: 7px 8px; text-align: left; }
          td { padding: 5px 8px; border-bottom: 1px solid #E8E8E8; }
          tr:nth-child(even) td { background: #F9F9F9; }
        }
      `}</style>
    </div>
  );
}
