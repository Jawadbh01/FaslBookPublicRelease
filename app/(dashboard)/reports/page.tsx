"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart2, User, Clock, Handshake,
  Warehouse, Map, FileText, FileSpreadsheet,
  Printer, MessageCircle, Calendar,
  TrendingUp, TrendingDown, ChevronRight,
} from "lucide-react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";

interface ReportCard {
  key: string;
  title: string;
  description: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  href: string;
}

const CARDS: ReportCard[] = [
  {
    key: "farm",
    title: "Farm Overview",
    description: "Income, expenses & net profit summary",
    Icon: BarChart2,
    color: "#1B5E20",
    bg: "#E8F5E9",
    href: "/reports/farm",
  },
  {
    key: "farmer",
    title: "Farmer Report",
    description: "Parcels, crops & harvest per farmer",
    Icon: User,
    color: "#1565C0",
    bg: "#E3F2FD",
    href: "/reports/farmer",
  },
  {
    key: "worker",
    title: "Worker Report",
    description: "Attendance, earnings & payments",
    Icon: Clock,
    color: "#E65100",
    bg: "#FFF3E0",
    href: "/reports/worker",
  },
  {
    key: "dealer",
    title: "Dealer Report",
    description: "Purchases, payments & outstanding balance",
    Icon: Handshake,
    color: "#6A1B9A",
    bg: "#F3E5F5",
    href: "/reports/dealer",
  },
  {
    key: "godown",
    title: "Godown Report",
    description: "Stock levels, value & transactions",
    Icon: Warehouse,
    color: "#00695C",
    bg: "#E0F2F1",
    href: "/reports/godown",
  },
  {
    key: "parcel",
    title: "Parcel Report",
    description: "Crop history, expenses & profitability",
    Icon: Map,
    color: "#4E342E",
    bg: "#EFEBE9",
    href: "/reports/parcel",
  },
];

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");

export default function ReportsPage() {
  const router       = useRouter();
  const organization = useAuthStore((s) => s.organization);
  const orgId        = organization?.id ?? null;

  const [totalIncome,  setTotalIncome]  = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [exporting,    setExporting]    = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "ledgerEntries"), where("organizationId", "==", orgId))
        );
        let inc = 0, exp = 0;
        snap.forEach((d) => {
          const { type, amount } = d.data();
          if (type === "credit") inc += Number(amount) || 0;
          else                   exp += Number(amount) || 0;
        });
        setTotalIncome(inc);
        setTotalExpense(exp);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [orgId]);

  async function getExportData() {
    if (!orgId) return { columns: [] as string[], rows: [] as (string | number)[][] };
    const snap = await getDocs(
      query(collection(db, "ledgerEntries"), where("organizationId", "==", orgId), orderBy("date", "desc"))
    );
    const columns = ["Date", "Type", "Category", "Amount (Rs)", "Notes"];
    const rows: (string | number)[][] = snap.docs.map((d) => {
      const data = d.data();
      return [
        data.date ?? "",
        data.type === "credit" ? "Income" : "Expense",
        data.categoryLabel ?? data.category ?? "",
        Number(data.amount) || 0,
        data.notes ?? "",
      ];
    });
    return { columns, rows };
  }

  async function handlePDF() {
    setExporting("pdf");
    try {
      const { columns, rows } = await getExportData();
      const { exportToPDF }   = await import("@/lib/exports/pdfExport");
      await exportToPDF("Farm Overview", rows, columns);
    } catch (e) { console.error(e); }
    setExporting(null);
  }

  async function handleExcel() {
    setExporting("excel");
    try {
      const { columns, rows }  = await getExportData();
      const { exportToExcel }  = await import("@/lib/exports/excelExport");
      await exportToExcel("Farm Overview", rows, columns);
    } catch (e) { console.error(e); }
    setExporting(null);
  }

  function handlePrint() {
    window.print();
  }

  async function handleWhatsApp() {
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    const net = totalIncome - totalExpense;
    shareViaWhatsApp(
      "Farm Overview",
      `Total Income:  ${fmtPKR(totalIncome)}\nTotal Expense: ${fmtPKR(totalExpense)}\nNet Balance:   ${fmtPKR(net)}`
    );
  }

  const net = totalIncome - totalExpense;

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          #app-shell, nav, header, .no-print { display: none !important; }
          #print-report { display: block !important; padding: 24px; }
        }
        #print-report { display: none; }
      `}</style>

      {/* Print-only content */}
      <div id="print-report">
        <h1 style={{ color: "#1B5E20", marginBottom: 4 }}>FaslBook – Farm Overview Report</h1>
        <p style={{ color: "#666", marginBottom: 16 }}>
          Generated: {new Date().toLocaleDateString("en-PK")} &nbsp;|&nbsp; {organization?.name ?? ""}
        </p>
        <hr />
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <tbody>
            {[
              ["Total Income",  fmtPKR(totalIncome)],
              ["Total Expense", fmtPKR(totalExpense)],
              ["Net Balance",   fmtPKR(net)],
            ].map(([label, value]) => (
              <tr key={label}>
                <td style={{ padding: "8px 0", fontWeight: "bold", width: "50%" }}>{label}</td>
                <td style={{ padding: "8px 0" }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Screen content */}
      <div className="min-h-screen bg-gray-50 pb-28 no-print">
        {/* ── Green Header ───────────────────────────────────── */}
        <div className="px-4 pt-10 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-white font-bold text-2xl">Reports</h1>
            <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <Calendar size={22} color="white" />
            </button>
          </div>
          <p className="text-green-300 text-sm">Farm performance &amp; analytics</p>

          {/* Quick stats strip */}
          {!loading && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: "Income",  value: totalIncome,  Icon: TrendingUp,   clr: "#A5D6A7" },
                { label: "Expense", value: totalExpense, Icon: TrendingDown,  clr: "#EF9A9A" },
                { label: "Net",     value: net,          Icon: BarChart2,     clr: net >= 0 ? "#A5D6A7" : "#EF9A9A" },
              ].map(({ label, value, Icon, clr }) => (
                <div key={label} className="bg-white/10 rounded-2xl p-3">
                  <Icon size={14} color={clr} />
                  <p className="text-xs text-green-300 mt-1">{label}</p>
                  <p className="text-white font-bold text-xs leading-tight">{fmtPKR(value)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 2-column Report Cards ──────────────────────────── */}
        <div className="px-4 py-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Select Report
          </p>
          <div className="grid grid-cols-2 gap-3">
            {CARDS.map((card) => (
              <button
                key={card.key}
                onClick={() => router.push(card.href)}
                className="bg-white rounded-2xl p-4 text-left shadow-sm active:scale-95 transition-transform flex flex-col gap-2"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: card.bg }}
                >
                  <card.Icon size={22} color={card.color} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm text-gray-800 leading-tight">{card.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{card.description}</p>
                </div>
                <div className="flex justify-end">
                  <ChevronRight size={14} color="#BDBDBD" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Export Row ─────────────────────────────────────── */}
        <div className="px-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Export Farm Overview
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handlePDF}
                disabled={!!exporting}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm active:scale-95 transition-all disabled:opacity-50"
                style={{ backgroundColor: "#FFEBEE", color: "#C62828" }}
              >
                <FileText size={17} />
                {exporting === "pdf" ? "Exporting…" : "PDF"}
              </button>

              <button
                onClick={handleExcel}
                disabled={!!exporting}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm active:scale-95 transition-all disabled:opacity-50"
                style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}
              >
                <FileSpreadsheet size={17} />
                {exporting === "excel" ? "Exporting…" : "Excel"}
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm active:scale-95 transition-all"
                style={{ backgroundColor: "#F5F5F5", color: "#616161" }}
              >
                <Printer size={17} />
                Print
              </button>

              <button
                onClick={handleWhatsApp}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm active:scale-95 transition-all"
                style={{ backgroundColor: "#DCF8C6", color: "#1B5E20" }}
              >
                <MessageCircle size={17} />
                WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
