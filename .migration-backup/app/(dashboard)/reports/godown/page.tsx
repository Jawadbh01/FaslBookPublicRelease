"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, Warehouse, FileText, FileSpreadsheet, MessageCircle, Printer, ChevronDown } from "lucide-react";

const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const CATEGORIES = ["All", "Seed", "Fertilizer", "Pesticide", "Fuel", "cropStock", "Other"];

export default function GodownReportPage() {
  const router = useRouter();
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [items, setItems]             = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [filter, setFilter]           = useState("All");
  const [loading, setLoading]         = useState(true);
  const [showMenu, setShowMenu]       = useState(false);
  const [exporting, setExporting]     = useState<string | null>(null);

  useEffect(() => { if (orgId) loadData(); }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    try {
      const [itemSnap, txSnap] = await Promise.all([
        getDocs(query(collection(db, "inventoryItems"),       where("organizationId", "==", orgId))),
        getDocs(query(collection(db, "inventoryTransactions"), where("organizationId", "==", orgId))),
      ]);
      setItems(itemSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const stockIn  = transactions.filter((t: any) => t.type === "in"  && (t.createdAt?.toDate?.() ?? new Date()) >= monthStart).reduce((s: number, t: any) => s + (Number(t.quantity) || 0), 0);
  const stockOut = transactions.filter((t: any) => t.type === "out" && (t.createdAt?.toDate?.() ?? new Date()) >= monthStart).reduce((s: number, t: any) => s + (Number(t.quantity) || 0), 0);
  const totalValue = items.reduce((s: number, i: any) => s + ((i.currentStock || 0) * (i.pricePerUnit || 0)), 0);
  const filtered = filter === "All" ? items : items.filter((i: any) => (i.category || "").toLowerCase() === filter.toLowerCase());

  const handlePDF = async () => {
    setExporting("pdf"); setShowMenu(false);
    try {
      const { exportToPDF } = await import("@/lib/exports/pdfExport");
      const rows = items.map((i: any) => [i.name, i.category || "Other", `${i.currentStock || 0} ${i.unit || ""}`, fmt((i.currentStock || 0) * (i.pricePerUnit || 0))]);
      await exportToPDF("Godown Report", rows, ["Item", "Category", "Stock", "Value"]);
    } catch { window.print(); }
    setExporting(null);
  };

  const handleExcel = async () => {
    setExporting("excel"); setShowMenu(false);
    try {
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      const rows = items.map((i: any) => [i.name, i.category || "Other", i.currentStock || 0, i.unit || "", (i.currentStock || 0) * (i.pricePerUnit || 0)]);
      await exportToExcel("Godown Report", rows, ["Item", "Category", "Stock", "Unit", "Value"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleWhatsApp = async () => {
    setShowMenu(false);
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    const summary = items.map((i: any) => `${i.name}: ${i.currentStock || 0} ${i.unit || ""}`).join("\n");
    shareViaWhatsApp("Godown Report", `Total Value: ${fmt(totalValue)}\nStock In: ${stockIn} units\nStock Out: ${stockOut} units\n\n${summary}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-5 screen-only" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-white"><ArrowLeft size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">Godown Report</h1>
              <p className="text-green-200 text-xs">Stock levels & inventory value</p>
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
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
              style={{ backgroundColor: filter === cat ? "white" : "rgba(255,255,255,0.2)", color: filter === cat ? "#1B5E20" : "white" }}>
              {cat === "cropStock" ? "Crop Stock" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Screen view ── */}
      <div className="px-4 pt-4 screen-only">
        {loading ? (
          <div className="flex justify-center pt-20"><div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} /></div>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="text-gray-400 text-xs mb-1">Total Inventory Value</p>
              <p className="font-bold text-2xl mb-3" style={{ color: "#1B5E20" }}>{fmt(totalValue)}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ backgroundColor: "#E8F5E9" }}>
                  <p className="text-green-600 text-xs">Stock In This Month</p>
                  <p className="font-bold text-green-800">{stockIn} units</p>
                </div>
                <div className="rounded-xl p-3" style={{ backgroundColor: "#FFEBEE" }}>
                  <p className="text-red-500 text-xs">Stock Out This Month</p>
                  <p className="font-bold text-red-700">{stockOut} units</p>
                </div>
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-10 text-center">
                <Warehouse size={40} color="#E0E0E0" />
                <p className="text-gray-400 mt-3">No items in this category</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mb-4">
                {filtered.map((item: any) => {
                  const value = (item.currentStock || 0) * (item.pricePerUnit || 0);
                  const isLow = (item.currentStock || 0) < 10;
                  return (
                    <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-bold text-gray-800">{item.name}</p>
                          <p className="text-gray-400 text-xs capitalize">{item.category || "Other"}</p>
                        </div>
                        <div className="px-2 py-1 rounded-full text-xs font-bold"
                          style={{ backgroundColor: isLow ? "#FFEBEE" : "#E8F5E9", color: isLow ? "#C62828" : "#1B5E20" }}>
                          {isLow ? "⚠️ Low" : "✅ OK"}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-gray-50 rounded-xl p-2">
                          <p className="text-gray-400 text-xs">Stock</p>
                          <p className="font-bold text-gray-800">{item.currentStock || 0} <span className="text-gray-400 font-normal text-xs">{item.unit}</span></p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-2">
                          <p className="text-gray-400 text-xs">Price/Unit</p>
                          <p className="font-bold text-gray-800 text-sm">{item.pricePerUnit ? fmt(item.pricePerUnit) : "—"}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-2">
                          <p className="text-gray-400 text-xs">Total Value</p>
                          <p className="font-bold text-gray-800 text-sm">{value > 0 ? fmt(value) : "—"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {transactions.slice(0, 8).length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Recent Transactions</p>
                {transactions.slice(0, 8).map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-gray-700 text-sm">{tx.itemName}</p>
                      <p className="text-gray-400 text-xs capitalize">{tx.source || tx.type}</p>
                    </div>
                    <span className="font-semibold text-sm" style={{ color: tx.type === "in" ? "#1B5E20" : "#C62828" }}>
                      {tx.type === "in" ? "+" : "-"}{tx.quantity} {tx.unit}
                    </span>
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
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1B5E20", margin: 0 }}>{organization?.name || "Farm"} — Godown Report</h1>
          <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Generated: {today()} &nbsp;|&nbsp; Total Value: {fmt(totalValue)}</p>
        </div>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", color: "#333" }}>Inventory Items ({items.length})</h2>
        <table>
          <thead><tr>{["#","Item","Category","Stock","Unit","Price / Unit","Total Value","Status"].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((item: any, i) => {
              const value = (item.currentStock || 0) * (item.pricePerUnit || 0);
              const isLow = (item.currentStock || 0) < 10;
              return (
                <tr key={item.id}>
                  <td>{i+1}</td>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td>{item.category || "Other"}</td>
                  <td style={{ fontWeight: 700, color: isLow ? "#B71C1C" : "#1B5E20" }}>{item.currentStock || 0}</td>
                  <td>{item.unit || "—"}</td>
                  <td>{item.pricePerUnit ? fmt(item.pricePerUnit) : "—"}</td>
                  <td style={{ fontWeight: 700 }}>{value > 0 ? fmt(value) : "—"}</td>
                  <td style={{ color: isLow ? "#B71C1C" : "#1B5E20", fontWeight: 600 }}>{isLow ? "Low Stock" : "OK"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {transactions.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px", color: "#333" }}>Recent Transactions ({transactions.length})</h2>
          <table>
            <thead><tr>{["#","Item","Type","Quantity","Unit","Source"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {transactions.slice(0, 50).map((tx: any, i) => (
                <tr key={tx.id}>
                  <td>{i+1}</td>
                  <td style={{ fontWeight: 600 }}>{tx.itemName}</td>
                  <td style={{ color: tx.type === "in" ? "#1B5E20" : "#B71C1C", fontWeight: 600 }}>{tx.type === "in" ? "Stock In" : "Stock Out"}</td>
                  <td style={{ fontWeight: 700 }}>{tx.quantity}</td>
                  <td>{tx.unit || "—"}</td>
                  <td>{tx.source || "—"}</td>
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
