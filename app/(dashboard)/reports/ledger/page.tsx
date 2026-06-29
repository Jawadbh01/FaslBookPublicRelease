"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  ArrowLeft, TrendingUp, TrendingDown, Printer,
  FileText, FileSpreadsheet, MessageCircle, ChevronDown,
} from "lucide-react";

const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(str: string) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const INCOME_LABELS: Record<string, string> = {
  cropSale: "Crop Sale", govtSubsidy: "Govt Subsidy", loanReceived: "Loan Received",
  rental: "Rental Income", livestock: "Livestock Sale", other: "Other Income",
};
const EXPENSE_LABELS: Record<string, string> = {
  seed: "Seeds", fertilizer: "Fertilizer", pesticide: "Pesticide",
  labor: "Labour", machinery: "Machinery", irrigation: "Irrigation",
  fuel: "Fuel", transport: "Transport", rent: "Land Rent",
  loan: "Loan Payment", maintenance: "Maintenance", other: "Other Expense",
};

interface Entry {
  id: string; type: "credit" | "debit"; date: string;
  category: string; categoryLabel?: string;
  amount: number; parcelName?: string; dealerName?: string; notes?: string;
}

const RANGES = [
  { val: "month", label: "This Month" },
  { val: "year",  label: "This Year"  },
  { val: "all",   label: "All Time"   },
];

function getStartStr(range: string): string | null {
  const now = new Date();
  if (range === "month") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  if (range === "year")  return `${now.getFullYear()}-01-01`;
  return null;
}

export default function LedgerReportPage() {
  const router = useRouter();
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [range, setRange]       = useState("month");
  const [entries, setEntries]   = useState<Entry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => { if (orgId) loadData(); }, [orgId, range]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "ledgerEntries"), where("organizationId", "==", orgId)));
      const start = getStartStr(range);
      const list: Entry[] = snap.docs.map(d => {
        const data = d.data() as {
  type: "credit" | "debit";
  date?: string;
  category?: string;
  categoryLabel?: string;
  amount?: number;
  parcelName?: string;
  dealerName?: string;
  notes?: string;
};
        return {
          id: d.id,
          type: data.type,
          date: data.date || "",
          category: data.category || "other",
          categoryLabel: data.categoryLabel || (data.type === "credit" ? INCOME_LABELS[data.category] : EXPENSE_LABELS[data.category]) || data.category,
          amount: Number(data.amount) || 0,
          parcelName: data.parcelName || "",
          dealerName: data.dealerName || "",
          notes: data.notes || "",
        };
      }).filter(e => !start || e.date >= start)
        .sort((a, b) => b.date.localeCompare(a.date));
      setEntries(list);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const credits = entries.filter(e => e.type === "credit");
  const debits  = entries.filter(e => e.type === "debit");
  const totalCredit = credits.reduce((s, e) => s + e.amount, 0);
  const totalDebit  = debits.reduce((s, e) => s + e.amount, 0);
  const netBalance  = totalCredit - totalDebit;
  const rangeLabel  = RANGES.find(r => r.val === range)?.label ?? "";

  const handlePDF = async () => {
    setExporting("pdf"); setShowMenu(false);
    try {
      const { exportToPDF } = await import("@/lib/exports/pdfExport");
      const rows = entries.map(e => [fmtDate(e.date), e.type === "credit" ? "Credit" : "Debit", e.categoryLabel || e.category, e.parcelName || "—", e.notes || "—", fmt(e.amount)]);
      await exportToPDF("Khata Report — " + rangeLabel, rows, ["Date", "Type", "Category", "Parcel", "Notes", "Amount"]);
    } catch { window.print(); }
    setExporting(null);
  };

  const handleExcel = async () => {
    setExporting("excel"); setShowMenu(false);
    try {
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      const rows = entries.map(e => [fmtDate(e.date), e.type === "credit" ? "Credit" : "Debit", e.categoryLabel || e.category, e.parcelName || "", e.notes || "", e.amount]);
      await exportToExcel("Khata Report", rows, ["Date", "Type", "Category", "Parcel", "Notes", "Amount"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleWhatsApp = async () => {
    setShowMenu(false);
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    shareViaWhatsApp("Khata Report — " + rangeLabel, `Credit: ${fmt(totalCredit)}\nDebit: ${fmt(totalDebit)}\nNet: ${fmt(netBalance)}\n\nEntries: ${entries.length}`);
  };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#F5F5F5" }}>
      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-4 screen-only" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="text-white"><ArrowLeft size={24} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">Khata Report</h1>
              <p className="text-green-200 text-xs">Farm Ledger — {rangeLabel}</p>
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
                    { icon: <Printer size={14} />, label: "Print Now",    action: () => { setShowMenu(false); window.print(); } },
                    { icon: <FileText size={14} />, label: exporting==="pdf" ? "Exporting…" : "Save as PDF",   action: handlePDF },
                    { icon: <FileSpreadsheet size={14} />, label: exporting==="excel" ? "Exporting…" : "Export Excel", action: handleExcel },
                    { icon: <MessageCircle size={14} />, label: "WhatsApp",    action: handleWhatsApp },
                  ].map(({ icon, label, action }) => (
                    <button key={label} onClick={action}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100">
                      <span style={{ color: "#1B5E20" }}>{icon}</span>{label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {RANGES.map(({ val, label }) => (
            <button key={val} onClick={() => setRange(val)}
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: range === val ? "white" : "rgba(255,255,255,0.2)", color: range === val ? "#1B5E20" : "white" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Screen view ── */}
      <div className="px-4 pt-4 screen-only">
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3">Summary — {rangeLabel}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl p-3" style={{ backgroundColor: "#E8F5E9" }}>
              <div className="flex items-center gap-1 mb-1"><TrendingUp size={14} color="#1B5E20" /><p className="text-xs font-semibold" style={{ color: "#1B5E20" }}>Total Credit</p></div>
              <p className="text-lg font-bold" style={{ color: "#1B5E20" }}>{fmt(totalCredit)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#FFEBEE" }}>
              <div className="flex items-center gap-1 mb-1"><TrendingDown size={14} color="#B71C1C" /><p className="text-xs font-semibold" style={{ color: "#B71C1C" }}>Total Debit</p></div>
              <p className="text-lg font-bold" style={{ color: "#B71C1C" }}>{fmt(totalDebit)}</p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3 text-center">
            <p className="text-gray-500 text-xs font-medium mb-0.5">Net Balance</p>
            <p className="text-2xl font-bold" style={{ color: netBalance >= 0 ? "#1B1B1B" : "#B71C1C" }}>
              {netBalance < 0 && "−"}{fmt(Math.abs(netBalance))}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="text-5xl mb-3">📒</div>
            <p className="text-gray-600 font-semibold">No entries for {rangeLabel}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-gray-700 text-sm font-bold">{entries.length} transactions</p>
            </div>
            {entries.map((entry, idx) => {
              const isCredit = entry.type === "credit";
              return (
                <div key={entry.id}
                  className={`flex items-center gap-3 px-4 py-3 ${idx < entries.length - 1 ? "border-b border-gray-50" : ""}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: isCredit ? "#E8F5E9" : "#FFEBEE" }}>
                    {isCredit ? <TrendingUp size={16} color="#1B5E20" /> : <TrendingDown size={16} color="#B71C1C" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 text-sm font-semibold truncate">{entry.categoryLabel || entry.category}</p>
                    <p className="text-gray-400 text-xs">{fmtDate(entry.date)}{entry.parcelName ? ` • ${entry.parcelName}` : ""}{entry.dealerName ? ` • ${entry.dealerName}` : ""}</p>
                    {entry.notes && <p className="text-gray-400 text-xs truncate">{entry.notes}</p>}
                  </div>
                  <p className="font-bold text-sm shrink-0" style={{ color: isCredit ? "#1B5E20" : "#B71C1C" }}>
                    {isCredit ? "+" : "−"}{fmt(entry.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Print-only view ── */}
      <div className="print-only" style={{ padding: "0 24px" }}>
        <div style={{ borderBottom: "3px solid #1B5E20", paddingBottom: 10, marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1B5E20", margin: 0 }}>{organization?.name || "Farm"} — Khata Report</h1>
          <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Period: {rangeLabel} &nbsp;|&nbsp; Generated: {today()}</p>
        </div>
        <table style={{ width: "100%", marginBottom: 20 }}>
          <tbody>
            <tr><td style={{ fontWeight: 600, width: 160, padding: "3px 0", fontSize: 12 }}>Total Credit</td><td style={{ color: "#1B5E20", fontWeight: 700, fontSize: 13 }}>{fmt(totalCredit)}</td></tr>
            <tr><td style={{ fontWeight: 600, width: 160, padding: "3px 0", fontSize: 12 }}>Total Debit</td><td style={{ color: "#B71C1C", fontWeight: 700, fontSize: 13 }}>{fmt(totalDebit)}</td></tr>
            <tr><td style={{ fontWeight: 600, width: 160, padding: "3px 0", fontSize: 12 }}>Net Balance</td><td style={{ color: netBalance >= 0 ? "#1B5E20" : "#B71C1C", fontWeight: 700, fontSize: 14 }}>{fmt(netBalance)}</td></tr>
          </tbody>
        </table>
        <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#333" }}>All Transactions ({entries.length})</h2>
        <table>
          <thead>
            <tr>
              {["#","Date","Type","Category","Parcel","Description","Amount"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id}>
                <td>{i + 1}</td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                <td style={{ color: e.type === "credit" ? "#1B5E20" : "#B71C1C", fontWeight: 600 }}>{e.type === "credit" ? "Credit" : "Debit"}</td>
                <td>{e.categoryLabel || e.category}</td>
                <td>{e.parcelName || (e.dealerName ? e.dealerName : "—")}</td>
                <td>{e.notes || "—"}</td>
                <td style={{ fontWeight: 700, color: e.type === "credit" ? "#1B5E20" : "#B71C1C", textAlign: "right", whiteSpace: "nowrap" }}>
                  {e.type === "credit" ? "+" : "−"}{fmt(e.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @media screen { .print-only { display: none !important; } }
        @media print {
          .screen-only { display: none !important; }
          .print-only { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background-color: #1B5E20 !important; color: white !important; padding: 7px 10px; text-align: left; font-size: 11px; }
          td { padding: 5px 10px; border-bottom: 1px solid #E8E8E8; font-size: 11px; }
          tr:nth-child(even) td { background: #F9F9F9; }
        }
      `}</style>
    </div>
  );
}
