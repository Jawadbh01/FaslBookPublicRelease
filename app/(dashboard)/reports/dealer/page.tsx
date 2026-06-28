"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, Handshake, FileText, FileSpreadsheet, MessageCircle, Printer, ChevronDown } from "lucide-react";

const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DealerReportPage() {
  const router = useRouter();
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [dealers, setDealers]           = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showMenu, setShowMenu]         = useState(false);
  const [exporting, setExporting]       = useState<string | null>(null);

  useEffect(() => { if (orgId) loadData(); }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    try {
      const [dealerSnap, txSnap] = await Promise.all([
        getDocs(query(collection(db, "dealers"),             where("organizationId", "==", orgId))),
        getDocs(query(collection(db, "dealerTransactions"),  where("organizationId", "==", orgId))),
      ]);
      setDealers(dealerSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const totalOutstanding = dealers.reduce((s: number, d: any) => s + Math.max(0, (d.totalPurchased || 0) - (d.totalPaid || 0)), 0);
  const totalPurchased   = dealers.reduce((s: number, d: any) => s + (d.totalPurchased || 0), 0);
  const totalPaid        = dealers.reduce((s: number, d: any) => s + (d.totalPaid || 0), 0);

  const handlePDF = async () => {
    setExporting("pdf"); setShowMenu(false);
    try {
      const { exportToPDF } = await import("@/lib/exports/pdfExport");
      const rows = dealers.map((d: any) => [d.name, d.phone || "—", fmt(d.totalPurchased || 0), fmt(d.totalPaid || 0), fmt(Math.max(0, (d.totalPurchased || 0) - (d.totalPaid || 0)))]);
      await exportToPDF("Dealer Report", rows, ["Dealer", "Phone", "Purchased", "Paid", "Outstanding"]);
    } catch { window.print(); }
    setExporting(null);
  };

  const handleExcel = async () => {
    setExporting("excel"); setShowMenu(false);
    try {
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      const rows = dealers.map((d: any) => [d.name, d.phone || "", d.totalPurchased || 0, d.totalPaid || 0, Math.max(0, (d.totalPurchased || 0) - (d.totalPaid || 0))]);
      await exportToExcel("Dealer Report", rows, ["Dealer", "Phone", "Purchased", "Paid", "Outstanding"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleWhatsApp = async () => {
    setShowMenu(false);
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    const summary = dealers.map((d: any) => `${d.name}: Outstanding ${fmt(Math.max(0, (d.totalPurchased || 0) - (d.totalPaid || 0)))}`).join("\n");
    shareViaWhatsApp("Dealer Report", `Total Purchased: ${fmt(totalPurchased)}\nTotal Paid: ${fmt(totalPaid)}\nTotal Outstanding: ${fmt(totalOutstanding)}\n\n${summary}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-5 screen-only" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-white"><ArrowLeft size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">Dealer Report</h1>
              <p className="text-green-200 text-xs">Purchases & outstanding balances</p>
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
      </div>

      {/* ── Screen view ── */}
      <div className="px-4 pt-4 screen-only">
        {loading ? (
          <div className="flex justify-center pt-20"><div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} /></div>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-gray-400 text-xs">Purchased</p><p className="font-bold text-gray-800">{fmt(totalPurchased)}</p></div>
                <div><p className="text-gray-400 text-xs">Paid</p><p className="font-bold" style={{ color: "#1B5E20" }}>{fmt(totalPaid)}</p></div>
                <div><p className="text-gray-400 text-xs">Outstanding</p><p className="font-bold text-red-600">{fmt(totalOutstanding)}</p></div>
              </div>
            </div>
            {dealers.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-16 text-center">
                <Handshake size={40} color="#E0E0E0" />
                <p className="text-gray-400 mt-3">No dealers yet</p>
              </div>
            ) : dealers.map((dealer: any) => {
              const outstanding = Math.max(0, (dealer.totalPurchased || 0) - (dealer.totalPaid || 0));
              const pct = dealer.totalPurchased > 0 ? Math.min(100, ((dealer.totalPaid || 0) / dealer.totalPurchased) * 100) : 0;
              const dealerTx = transactions.filter((t: any) => t.dealerId === dealer.id).slice(0, 3);
              return (
                <div key={dealer.id} className="bg-white rounded-2xl p-4 shadow-sm mb-3">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#E8F5E9" }}>
                        <Handshake size={18} color="#1B5E20" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{dealer.name}</p>
                        {dealer.phone && <p className="text-gray-400 text-xs">{dealer.phone}</p>}
                      </div>
                    </div>
                    <div className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{ backgroundColor: outstanding > 0 ? "#FFEBEE" : "#E8F5E9", color: outstanding > 0 ? "#C62828" : "#1B5E20" }}>
                      {outstanding > 0 ? fmt(outstanding) : "✅ Cleared"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-xl p-2"><p className="text-gray-400 text-xs">Purchased</p><p className="font-bold text-sm text-gray-800">{fmt(dealer.totalPurchased || 0)}</p></div>
                    <div className="bg-gray-50 rounded-xl p-2"><p className="text-gray-400 text-xs">Paid</p><p className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmt(dealer.totalPaid || 0)}</p></div>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Payment Progress</span><span>{Math.round(pct)}%</span></div>
                    <div className="w-full h-2 bg-gray-100 rounded-full"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#1B5E20" }} /></div>
                  </div>
                  {dealerTx.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-xs mb-2">Recent Transactions</p>
                      {dealerTx.map((tx: any) => (
                        <div key={tx.id} className="flex items-center justify-between mb-1">
                          <span className="text-gray-500 text-xs capitalize">{tx.type} {tx.items ? `• ${tx.items}` : ""}</span>
                          <span className="text-xs font-semibold" style={{ color: tx.type === "purchase" ? "#C62828" : "#1B5E20" }}>
                            {tx.type === "purchase" ? "-" : "+"}{fmt(tx.amount || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Print-only view ── */}
      <div className="print-only" style={{ padding: "0 24px" }}>
        <div style={{ borderBottom: "3px solid #1B5E20", paddingBottom: 10, marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1B5E20", margin: 0 }}>{organization?.name || "Farm"} — Dealer Report</h1>
          <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Generated: {today()} &nbsp;|&nbsp; Total Outstanding: {fmt(totalOutstanding)}</p>
        </div>
        <table style={{ marginBottom: 20, width: "auto" }}>
          <tbody>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 16px 3px 0" }}>Total Purchased</td><td style={{ fontWeight: 700, fontSize: 13 }}>{fmt(totalPurchased)}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 16px 3px 0" }}>Total Paid</td><td style={{ fontWeight: 700, color: "#1B5E20", fontSize: 13 }}>{fmt(totalPaid)}</td></tr>
            <tr><td style={{ fontWeight: 600, fontSize: 12, padding: "3px 16px 3px 0" }}>Total Outstanding</td><td style={{ fontWeight: 700, color: "#B71C1C", fontSize: 13 }}>{fmt(totalOutstanding)}</td></tr>
          </tbody>
        </table>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", color: "#333" }}>Dealer Accounts ({dealers.length})</h2>
        <table>
          <thead><tr>{["#","Dealer","Phone","Purchased","Paid","Outstanding","Status"].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {dealers.map((d: any, i) => {
              const outstanding = Math.max(0, (d.totalPurchased || 0) - (d.totalPaid || 0));
              return (
                <tr key={d.id}>
                  <td>{i+1}</td>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td>{d.phone || "—"}</td>
                  <td>{fmt(d.totalPurchased || 0)}</td>
                  <td style={{ color: "#1B5E20", fontWeight: 600 }}>{fmt(d.totalPaid || 0)}</td>
                  <td style={{ color: outstanding > 0 ? "#B71C1C" : "#1B5E20", fontWeight: 700 }}>{outstanding > 0 ? fmt(outstanding) : "Cleared"}</td>
                  <td style={{ color: outstanding > 0 ? "#B71C1C" : "#1B5E20", fontWeight: 600 }}>{outstanding > 0 ? "Pending" : "✓ Cleared"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {transactions.length > 0 && <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px", color: "#333" }}>All Transactions ({transactions.length})</h2>
          <table>
            <thead><tr>{["#","Dealer","Type","Items","Amount"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {transactions.slice(0, 100).map((tx: any, i) => {
                const dealer = dealers.find(d => d.id === tx.dealerId);
                return (
                  <tr key={tx.id}>
                    <td>{i+1}</td>
                    <td style={{ fontWeight: 600 }}>{dealer?.name || tx.dealerName || "—"}</td>
                    <td style={{ color: tx.type === "purchase" ? "#B71C1C" : "#1B5E20", fontWeight: 600, textTransform: "capitalize" }}>{tx.type}</td>
                    <td>{tx.items || "—"}</td>
                    <td style={{ fontWeight: 700, color: tx.type === "purchase" ? "#B71C1C" : "#1B5E20", textAlign: "right" }}>{fmt(tx.amount || 0)}</td>
                  </tr>
                );
              })}
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
