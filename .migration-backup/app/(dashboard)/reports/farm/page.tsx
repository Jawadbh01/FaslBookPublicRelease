"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  ArrowLeft, TrendingUp, TrendingDown, Wallet,
  Package, FileText, MessageCircle, FileSpreadsheet,
  Printer, Wheat,
} from "lucide-react";

const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

const getStart = (range: string) => {
  const d = new Date();
  if (range === "week")  d.setDate(d.getDate() - 7);
  if (range === "month") d.setDate(1);
  if (range === "year")  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function FarmReportPage() {
  const router = useRouter();
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [range,    setRange]    = useState("month");
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const [income,   setIncome]   = useState(0);
  const [expense,  setExpense]  = useState(0);
  const [invValue, setInvValue] = useState(0);
  const [incByType,  setIncByType]  = useState<Record<string,number>>({});
  const [expByCat,   setExpByCat]   = useState<Record<string,number>>({});
  const [crops,      setCrops]      = useState<any[]>([]);
  const [allIncome,  setAllIncome]  = useState<any[]>([]);
  const [allExpense, setAllExpense] = useState<any[]>([]);

  useEffect(() => { if (orgId) load(); }, [orgId, range]);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const start = getStart(range);
    try {
      const [incSnap, expSnap, invSnap, cropSnap] = await Promise.all([
        getDocs(query(collection(db, "income"),         where("organizationId", "==", orgId))),
        getDocs(query(collection(db, "expenses"),       where("organizationId", "==", orgId))),
        getDocs(query(collection(db, "inventoryItems"), where("organizationId", "==", orgId))),
        getDocs(query(collection(db, "crops"),          where("organizationId", "==", orgId))),
      ]);

      let inc = 0;
      const byType: Record<string,number> = {};
      const incRows: any[] = [];
      incSnap.docs.forEach((d) => {
        const data = d.data();
        const date = data.date?.toDate ? data.date.toDate() : new Date(data.date || 0);
        if (date >= start) {
          inc += Number(data.amount) || 0;
          const t = data.type || data.incomeType || "Other";
          byType[t] = (byType[t] || 0) + (Number(data.amount) || 0);
          incRows.push({
            date: typeof data.date === "string" ? data.date : date.toLocaleDateString("en-PK"),
            type: t,
            amount: fmt(Number(data.amount) || 0),
            notes: data.notes || "",
          });
        }
      });
      setIncome(inc);
      setIncByType(byType);
      setAllIncome(incRows);

      let exp = 0;
      const byCat: Record<string,number> = {};
      const expRows: any[] = [];
      expSnap.docs.forEach((d) => {
        const data = d.data();
        const date = data.date?.toDate ? data.date.toDate() : new Date(data.date || 0);
        if (date >= start) {
          exp += Number(data.amount) || 0;
          const c = data.category || "Other";
          byCat[c] = (byCat[c] || 0) + (Number(data.amount) || 0);
          expRows.push({
            date: typeof data.date === "string" ? data.date : date.toLocaleDateString("en-PK"),
            category: c,
            amount: fmt(Number(data.amount) || 0),
            vendor: data.vendor || "",
            notes: data.notes || "",
          });
        }
      });
      setExpense(exp);
      setExpByCat(byCat);
      setAllExpense(expRows);

      let inv = 0;
      invSnap.docs.forEach((d) => {
        const data = d.data();
        inv += (Number(data.currentStock) || 0) * (Number(data.pricePerUnit) || 0);
      });
      setInvValue(inv);

      setCrops(cropSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const profit = income - expense;
  const statusColors: Record<string,string> = {
    planned: "#1565C0", sown: "#6A1B9A", growing: "#1B5E20",
    ready: "#E65100", harvested: "#00695C", closed: "#757575",
  };

  const handlePrint = async () => {
    const { printReport } = await import("@/lib/utils/printReport");
    printReport({
      title: "Farm Overview Report",
      farmName: organization?.name,
      subtitle: `${range === "week" ? "This Week" : range === "month" ? "This Month" : "This Year"}`,
      summaryCards: [
        { label: "Total Income",  value: fmt(income),  color: "#1B5E20" },
        { label: "Total Expense", value: fmt(expense), color: "#C62828" },
        { label: "Net Profit",    value: fmt(profit),  color: profit >= 0 ? "#1565C0" : "#C62828" },
        { label: "Inventory",     value: fmt(invValue), color: "#E65100" },
      ],
      sections: [
        {
          title: "Income Records",
          data: allIncome,
          columns: [
            { header: "Date",   key: "date",   width: "20%" },
            { header: "Type",   key: "type",   width: "25%" },
            { header: "Amount", key: "amount", width: "25%", align: "right" },
            { header: "Notes",  key: "notes",  width: "30%" },
          ],
        },
        {
          title: "Expense Records",
          data: allExpense,
          columns: [
            { header: "Date",     key: "date",     width: "18%" },
            { header: "Category", key: "category", width: "22%" },
            { header: "Amount",   key: "amount",   width: "20%", align: "right" },
            { header: "Vendor",   key: "vendor",   width: "20%" },
            { header: "Notes",    key: "notes",    width: "20%" },
          ],
        },
        {
          title: "Crops",
          data: crops.map((c: any) => ({
            crop:   c.cropName,
            parcel: c.parcelName || "—",
            season: c.season    || "—",
            status: c.status    || "—",
            harvested: c.harvestedQuantity ? `${c.harvestedQuantity} ${c.harvestUnit || ""}` : "—",
          })),
          columns: [
            { header: "Crop",    key: "crop",      width: "22%" },
            { header: "Parcel",  key: "parcel",    width: "22%" },
            { header: "Season",  key: "season",    width: "18%" },
            { header: "Status",  key: "status",    width: "18%" },
            { header: "Harvest", key: "harvested", width: "20%", align: "right" },
          ],
        },
      ],
    });
  };

  const handlePDF = async () => {
    setExporting("pdf");
    try {
      const { exportToPDF } = await import("@/lib/exports/pdfExport");
      const rows = [
        ["Total Income", fmt(income)], ["Total Expense", fmt(expense)],
        ["Net Profit", fmt(profit)],   ["Inventory Value", fmt(invValue)],
        ...Object.entries(incByType).map(([k,v]) => [`Income - ${k}`, fmt(v)]),
        ...Object.entries(expByCat).map(([k,v])  => [`Expense - ${k}`, fmt(v)]),
      ];
      await exportToPDF("Farm Overview Report", rows, ["Item", "Amount"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleExcel = async () => {
    setExporting("excel");
    try {
      const { exportToExcel } = await import("@/lib/exports/excelExport");
      await exportToExcel("Farm Overview", allIncome.map(r => [r.date, r.type, r.amount, r.notes]), ["Date","Type","Amount","Notes"]);
    } catch (e) { console.error(e); }
    setExporting(null);
  };

  const handleWhatsApp = async () => {
    const { shareViaWhatsApp } = await import("@/lib/exports/whatsappShare");
    shareViaWhatsApp("Farm Overview",
      `Income: ${fmt(income)}\nExpense: ${fmt(expense)}\nProfit: ${fmt(profit)}\nInventory: ${fmt(invValue)}`);
  };

  const ExportBar = () => (
    <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Export Report</p>
      <div className="grid grid-cols-4 gap-2">
        <button onClick={handlePrint}
          className="flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-semibold active:scale-95"
          style={{ backgroundColor: "#F5F5F5", color: "#616161" }}>
          <Printer size={18}/> Print
        </button>
        <button onClick={handlePDF} disabled={!!exporting}
          className="flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-semibold active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "#FFEBEE", color: "#C62828" }}>
          <FileText size={18}/> {exporting==="pdf"?"…":"PDF"}
        </button>
        <button onClick={handleExcel} disabled={!!exporting}
          className="flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-semibold active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>
          <FileSpreadsheet size={18}/> {exporting==="excel"?"…":"Excel"}
        </button>
        <button onClick={handleWhatsApp}
          className="flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-semibold active:scale-95"
          style={{ backgroundColor: "#DCF8C6", color: "#1B5E20" }}>
          <MessageCircle size={18}/> Share
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-white"><ArrowLeft size={24}/></button>
          <div className="flex-1">
            <h1 className="text-white text-xl font-bold">Farm Overview</h1>
            <p className="text-green-200 text-xs">{organization?.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[{val:"week",label:"This Week"},{val:"month",label:"This Month"},{val:"year",label:"This Year"}].map(({val,label}) => (
            <button key={val} onClick={() => setRange(val)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: range===val?"white":"rgba(255,255,255,0.2)", color: range===val?"#1B5E20":"white" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{borderTopColor:"#1B5E20"}}/>
          </div>
        ) : (
          <>
            {/* Export at TOP */}
            <ExportBar/>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                {label:"Income", value:income, icon:TrendingUp, color:"#1B5E20", bg:"#E8F5E9"},
                {label:"Expense", value:expense, icon:TrendingDown, color:"#C62828", bg:"#FFEBEE"},
                {label:"Net Profit", value:profit, icon:Wallet, color:profit>=0?"#1565C0":"#C62828", bg:profit>=0?"#E3F2FD":"#FFEBEE"},
                {label:"Inventory", value:invValue, icon:Package, color:"#E65100", bg:"#FFF3E0"},
              ].map(({label,value,icon:Icon,color,bg}) => (
                <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-500 text-xs">{label}</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{backgroundColor:bg}}>
                      <Icon size={16} color={color}/>
                    </div>
                  </div>
                  <p className="font-bold text-base" style={{color}}>{fmt(value)}</p>
                </div>
              ))}
            </div>

            {/* Income breakdown */}
            {Object.keys(incByType).length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Income by Type</p>
                {Object.entries(incByType).sort((a,b)=>b[1]-a[1]).map(([type,amount]) => (
                  <div key={type} className="flex items-center justify-between mb-2">
                    <span className="text-gray-600 text-sm">{type}</span>
                    <span className="font-semibold text-sm" style={{color:"#1B5E20"}}>{fmt(amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Expense breakdown */}
            {Object.keys(expByCat).length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Expense by Category</p>
                {Object.entries(expByCat).sort((a,b)=>b[1]-a[1]).map(([cat,amount]) => {
                  const pct = expense>0 ? (amount/expense)*100 : 0;
                  return (
                    <div key={cat} className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-600 text-sm">{cat}</span>
                        <span className="font-semibold text-sm text-red-600">{fmt(amount)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full">
                        <div className="h-full rounded-full" style={{width:`${pct}%`,backgroundColor:"#C62828"}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Crops */}
            {crops.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-bold text-gray-800 text-sm mb-3">Crops ({crops.length})</p>
                {crops.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wheat size={16} color="#1B5E20"/>
                      <div>
                        <p className="text-gray-800 text-sm font-medium">{c.cropName}</p>
                        <p className="text-gray-400 text-xs">{c.parcelName} • {c.season}</p>
                      </div>
                    </div>
                    <div className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{backgroundColor:(statusColors[c.status]||"#757575")+"20",color:statusColors[c.status]||"#757575"}}>
                      {c.status}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Export at BOTTOM too */}
            <ExportBar/>
          </>
        )}
      </div>
    </div>
  );
}
