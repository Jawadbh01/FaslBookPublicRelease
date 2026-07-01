import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, Printer, Loader2, ChevronDown } from "lucide-react";

import FarmerLedgerTemplate  from "./FarmerLedgerTemplate";
import ParcelReportTemplate   from "./ParcelReportTemplate";
import GodownReportTemplate   from "./GodownReportTemplate";
import ExpenseReportTemplate  from "./ExpenseReportTemplate";
import SalesReportTemplate    from "./SalesReportTemplate";
import FarmSummaryTemplate    from "./FarmSummaryTemplate";

// ── Label maps ────────────────────────────────────────────────
const INCOME_LABELS: Record<string,string> = {
  cropSale:"Crop Sale",govtSubsidy:"Govt Subsidy",loanReceived:"Loan Received",
  rental:"Rental Income",livestock:"Livestock Sale",other:"Other Income",
};
const EXPENSE_LABELS: Record<string,string> = {
  seed:"Seeds",fertilizer:"Fertilizer",pesticide:"Pesticide",
  labor:"Labour",machinery:"Machinery",irrigation:"Irrigation",
  fuel:"Fuel",transport:"Transport",rent:"Land Rent",
  loan:"Loan Payment",maintenance:"Maintenance",other:"Other Expense",
};

function fmtDateDisplay(str: string) {
  if (!str) return "—";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = str.split("-");
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]} ${p[0]}`;
}

// ── Filter sub-components ─────────────────────────────────────
function Select({ value, onChange, children, disabled }: {
  value: string; onChange: (v: string) => void;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 font-medium pr-8 focus:outline-none focus:ring-2 focus:ring-green-600/30 disabled:opacity-50">
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-400 uppercase">{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600/30" />
    </div>
  );
}

// ── Report definitions ────────────────────────────────────────
const REPORTS = [
  { key:"ledger",  label:"Farmer Ledger",       icon:"📋", desc:"Full account statement for one farmer" },
  { key:"parcel",  label:"Parcel Report",        icon:"🌾", desc:"Crops, expenses and profit per parcel" },
  { key:"godown",  label:"Godown Register",      icon:"🏭", desc:"Warehouse inventory and stock movements" },
  { key:"expense", label:"Expense Report",       icon:"💸", desc:"Expenses grouped by month" },
  { key:"sales",   label:"Sales Report",         icon:"📈", desc:"Sales with payment status" },
  { key:"summary", label:"Farm Summary",         icon:"🏡", desc:"One-page executive overview" },
];

// ── Page ──────────────────────────────────────────────────────
export default function PrintHubPage() {
  const [location, navigate] = useLocation();
  const { organization, user } = useAuthStore();
  const orgId    = organization?.id ?? null;
  const orgName  = (organization as any)?.name ?? "My Farm";
  const printedBy = (user as any)?.displayName ?? (user as any)?.email ?? "Manager";

  // Read ?type= from URL and pre-select that report
  const urlType = new URLSearchParams(window.location.search).get("type") ?? "";
  const validKeys = REPORTS.map(r => r.key);
  const initialReport = validKeys.includes(urlType) ? urlType : "ledger";

  const [activeReport, setActiveReport] = useState(initialReport);
  const [loading,      setLoading]      = useState(false);
  const [generating,   setGenerating]   = useState(false);

  // Selects
  const [farmers, setFarmers] = useState<any[]>([]);
  const [parcels, setParcels] = useState<any[]>([]);
  const [selectedFarmer, setSelectedFarmer] = useState("");
  const [selectedParcel, setSelectedParcel] = useState("");

  // Date range — default: last 3 months
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  // Report data
  const [ledgerEntries,  setLedgerEntries]  = useState<any[]>([]);
  const [parcelCrops,    setParcelCrops]    = useState<any[]>([]);
  const [parcelExpenses, setParcelExpenses] = useState<any[]>([]);
  const [parcelIncome,   setParcelIncome]   = useState<any[]>([]);
  const [godownItems,    setGodownItems]    = useState<any[]>([]);
  const [godownTxns,     setGodownTxns]     = useState<any[]>([]);
  const [allExpenses,    setAllExpenses]    = useState<any[]>([]);
  const [allSales,       setAllSales]       = useState<any[]>([]);
  const [summaryData,    setSummaryData]    = useState<any>(null);

  // Load farmers & parcels once
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const [wSnap, pSnap] = await Promise.all([
        getDocs(query(collection(db,"workers"), where("organizationId","==",orgId), where("workerType","==","farmer"))),
        getDocs(query(collection(db,"parcels"), where("organizationId","==",orgId))),
      ]);
      const fl = wSnap.docs.map(d => ({ id:d.id, name:d.data().name||"Unnamed", ...d.data() }));
      const pl = pSnap.docs.map(d => ({ id:d.id, name:d.data().name||"Unnamed", ...d.data() }));
      setFarmers(fl);
      setParcels(pl);
      if (fl.length) setSelectedFarmer(fl[0].id);
      if (pl.length) setSelectedParcel(pl[0].id);
      setLoading(false);
    })();
  }, [orgId]);

  // Load data when report/filters change
  useEffect(() => { if (orgId) loadData(); }, [activeReport, orgId, selectedFarmer, selectedParcel, dateFrom, dateTo]);

  async function loadData() {
    if (!orgId) return;
    setGenerating(true);
    try {
      switch (activeReport) {

        case "ledger": {
          const snap = await getDocs(query(collection(db,"ledgerEntries"), where("organizationId","==",orgId)));
          const rows = snap.docs.map(d => {
            const r = d.data();
            const type = r.type === "credit" ? "credit" : "debit" as "credit"|"debit";
            const cat  = r.category || "other";
            return {
              id: d.id, type, date: r.date||"",
              categoryLabel: r.categoryLabel || (type==="credit" ? INCOME_LABELS[cat]??cat : EXPENSE_LABELS[cat]??cat),
              description: r.notes || r.dealerName || r.parcelName || "",
              amount: Number(r.amount)||0,
              farmerId: r.farmerId || r.workerFarmerId || "",
            };
          })
          .filter(e => {
            if (selectedFarmer && e.farmerId && e.farmerId !== selectedFarmer) return false;
            if (dateFrom && e.date < dateFrom) return false;
            if (dateTo   && e.date > dateTo)   return false;
            return true;
          })
          .sort((a,b) => a.date.localeCompare(b.date));
          setLedgerEntries(rows);
          break;
        }

        case "parcel": {
          if (selectedParcel) {
            const [cSnap, eSnap, iSnap] = await Promise.all([
              getDocs(query(collection(db,"crops"),    where("organizationId","==",orgId), where("parcelId","==",selectedParcel))),
              getDocs(query(collection(db,"expenses"), where("organizationId","==",orgId), where("parcelId","==",selectedParcel))),
              getDocs(query(collection(db,"income"),   where("organizationId","==",orgId), where("parcelId","==",selectedParcel))),
            ]);
            setParcelCrops(cSnap.docs.map(d => ({id:d.id,...d.data()})));
            setParcelExpenses(eSnap.docs.map(d => ({id:d.id,...d.data()})));
            setParcelIncome(iSnap.docs.map(d => ({id:d.id,...d.data()})));
          }
          break;
        }

        case "godown": {
          const [iSnap, tSnap] = await Promise.all([
            getDocs(query(collection(db,"inventoryItems"),        where("organizationId","==",orgId))),
            getDocs(query(collection(db,"inventoryTransactions"), where("organizationId","==",orgId))),
          ]);
          setGodownItems(iSnap.docs.map(d=>({id:d.id,...d.data()})));
          setGodownTxns(tSnap.docs.map(d=>({id:d.id,...d.data()})));
          break;
        }

        case "expense": {
          const snap = await getDocs(query(collection(db,"expenses"), where("organizationId","==",orgId)));
          const rows = snap.docs.map(d => {
            const r = d.data();
            const date = r.date ? (typeof r.date==="string" ? r.date : r.date.toDate?.()?.toISOString().split("T")[0]||"") : "";
            const cat  = r.category||"other";
            return { id:d.id, date, category:cat,
              categoryLabel: r.categoryLabel || EXPENSE_LABELS[cat]||cat,
              description: r.notes||r.description||"", amount:Number(r.amount)||0 };
          }).filter(e => (!dateFrom||e.date>=dateFrom) && (!dateTo||e.date<=dateTo));
          setAllExpenses(rows);
          break;
        }

        case "sales": {
          const snap = await getDocs(query(collection(db,"income"), where("organizationId","==",orgId)));
          const rows = snap.docs.map(d => {
            const r = d.data();
            const date = r.date ? (typeof r.date==="string" ? r.date : r.date.toDate?.()?.toISOString().split("T")[0]||"") : "";
            return { id:d.id, date, buyer:r.buyer||r.dealerName||"",
              cropName:r.cropName||"", parcelName:r.parcelName||"",
              weightKg:Number(r.weightKg)||0, ratePerKg:Number(r.ratePerKg)||0,
              amount:Number(r.amount)||0, paymentStatus:r.paymentStatus||r.status||"paid",
              notes:r.notes||"" };
          }).filter(e => (!dateFrom||e.date>=dateFrom) && (!dateTo||e.date<=dateTo));
          setAllSales(rows);
          break;
        }

        case "summary": {
          const [wSnap,pSnap,cSnap,eSnap,iSnap,invSnap,lSnap] = await Promise.all([
            getDocs(query(collection(db,"workers"),       where("organizationId","==",orgId), where("workerType","==","farmer"))),
            getDocs(query(collection(db,"parcels"),       where("organizationId","==",orgId))),
            getDocs(query(collection(db,"crops"),         where("organizationId","==",orgId))),
            getDocs(query(collection(db,"expenses"),      where("organizationId","==",orgId))),
            getDocs(query(collection(db,"income"),        where("organizationId","==",orgId))),
            getDocs(query(collection(db,"inventoryItems"),where("organizationId","==",orgId))),
            getDocs(query(collection(db,"ledgerEntries"), where("organizationId","==",orgId))),
          ]);
          const parcelsD = pSnap.docs.map(d=>d.data());
          const cropsD   = cSnap.docs.map(d=>d.data());
          const expD     = eSnap.docs.map(d=>d.data());
          const incD     = iSnap.docs.map(d=>d.data());
          const invD     = invSnap.docs.map(d=>d.data());

          const totalInc = incD.reduce((s:number,d:any)=>s+(Number(d.amount)||0),0);
          const totalExp = expD.reduce((s:number,d:any)=>s+(Number(d.amount)||0),0);
          const invVal   = invD.reduce((s:number,d:any)=>s+((d.currentStock||0)*(d.pricePerUnit||0)),0);
          const totalAcres = parcelsD.reduce((s:number,p:any)=>s+(Number(p.acres)||0),0);

          const expByCat: Record<string,number>  = {};
          expD.forEach((e:any) => { const c=e.category||"other"; expByCat[c]=(expByCat[c]||0)+(Number(e.amount)||0); });

          const incByType: Record<string,number> = {};
          incD.forEach((e:any) => { const t=e.type||e.incomeType||"other"; incByType[t]=(incByType[t]||0)+(Number(e.amount)||0); });

          let outstanding=0;
          lSnap.docs.forEach(d=>{ const {type,amount}=d.data(); outstanding += type==="credit"?Number(amount)||0:-(Number(amount)||0); });

          const activities = [
            ...expD.map((e:any) => ({ date:e.date||"", description:`Expense: ${e.categoryLabel||e.category||"Other"} — Rs.${(Number(e.amount)||0).toLocaleString("en-PK")}` })),
            ...incD.map((e:any) => { const dt=e.date?(typeof e.date==="string"?e.date:e.date.toDate?.()?.toISOString().split("T")[0]||""):""; return {date:dt,description:`Income: ${e.type||"Other"} — Rs.${(Number(e.amount)||0).toLocaleString("en-PK")}`}; }),
          ].filter(a=>a.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(a=>({...a, date:fmtDateDisplay(a.date)}));

          setSummaryData({
            farmerCount:wSnap.docs.length, parcelCount:pSnap.docs.length,
            totalAcres, activeCrops:cropsD.filter((c:any)=>c.status!=="harvested"&&c.status!=="closed").length,
            harvestedCrops:cropsD.filter((c:any)=>c.status==="harvested").length,
            totalIncome:totalInc, totalExpense:totalExp, invValue:invVal, outstanding,
            expByCat, incByType, activities,
          });
          break;
        }
      }
    } catch(e){ console.error(e); }
    setGenerating(false);
  }

  const selectedParcelObj = parcels.find(p => p.id === selectedParcel);
  const selectedFarmerObj = farmers.find(f => f.id === selectedFarmer);

  function renderTemplate(forPrint = false) {
    const style = forPrint ? undefined : { transform:"scale(0.82)", transformOrigin:"top left", width:"122%", pointerEvents:"none" as const };
    const wrap = forPrint ? undefined : { overflow:"hidden", borderRadius:8 };

    const content = (() => {
      if (generating) return (
        <div style={{ padding:"48px 0", textAlign:"center", color:"#888", background:"white", borderRadius:8, minHeight:200 }}>
          <Loader2 size={22} className="animate-spin mx-auto mb-3" style={{ color:"#1B5E20" }} />
          <p style={{ fontSize:12 }}>Preparing report…</p>
        </div>
      );

      if (activeReport==="ledger") return (
        <FarmerLedgerTemplate farmerName={selectedFarmerObj?.name||"All Farmers"} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} openingBalance={0} entries={ledgerEntries} />
      );
      if (activeReport==="parcel") return (
        <ParcelReportTemplate parcel={selectedParcelObj} crops={parcelCrops} expenses={parcelExpenses}
          incomeEntries={parcelIncome} farmName={orgName} printedBy={printedBy} />
      );
      if (activeReport==="godown") return (
        <GodownReportTemplate items={godownItems} transactions={godownTxns} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="expense") return (
        <ExpenseReportTemplate expenses={allExpenses} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="sales") return (
        <SalesReportTemplate sales={allSales} farmName={orgName}
          printedBy={printedBy} dateFrom={dateFrom} dateTo={dateTo} />
      );
      if (activeReport==="summary" && summaryData) return (
        <FarmSummaryTemplate farmName={orgName} printedBy={printedBy}
          farmerCount={summaryData.farmerCount} parcelCount={summaryData.parcelCount}
          totalAcres={summaryData.totalAcres} activeCrops={summaryData.activeCrops}
          harvestedCrops={summaryData.harvestedCrops} totalIncome={summaryData.totalIncome}
          totalExpense={summaryData.totalExpense} totalExpenseByCategory={summaryData.expByCat}
          totalIncomeByType={summaryData.incByType} outstandingBalance={summaryData.outstanding}
          inventoryValue={summaryData.invValue} recentActivities={summaryData.activities} />
      );
      return null;
    })();

    return <div style={wrap}><div style={style}>{content}</div></div>;
  }

  return (
    <>
      {/* ── Global CSS ─── */}
      <style>{`
        /* ── Print: hide UI, show report ── */
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { margin:0; padding:0; background:white; }
          .no-print, nav, header, footer, .bottom-nav { display:none !important; }
          .for-print { display:block !important; }
          .print-table { width:100%; border-collapse:collapse; }
          .print-table thead { display:table-header-group; }
          .print-table tfoot { display:table-footer-group; }
          .print-table tr { page-break-inside:avoid; }
          .print-page { display:block !important; }
          @page { size:A4 portrait; margin:18mm 15mm 22mm 15mm; }
        }
        /* ── Screen: hide the for-print div ── */
        @media screen { .for-print { display:none !important; } }
        .print-table { width:100%; border-collapse:collapse; font-family:'Times New Roman',Times,serif; }
        .print-table th { background:#1B5E20; color:white; padding:5px 7px; text-align:left; font-size:9.5pt; font-weight:700; border:1px solid #155016; }
        .print-table td { padding:4px 7px; border:1px solid #ddd; font-size:9.5pt; vertical-align:top; }
        .print-table tr:nth-child(even) td { background:#f9f9f9; }
        .print-table tfoot td { font-weight:700; border-top:2px solid #1B5E20; background:#f0f7f0; color:#1B5E20; }
        .print-table .num { text-align:right; }
        .print-table .ctr { text-align:center; }
        .section-title { font-size:10.5pt; font-weight:700; color:#1B5E20; border-bottom:1px solid #ccc; padding-bottom:3px; margin:12px 0 6px 0; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:3px 20px; margin-bottom:10px; font-size:9.5pt; }
        .info-grid .label { color:#555; }
        .info-grid .value { font-weight:600; }
        .summary-row { display:flex; justify-content:space-between; padding:5px 10px; border:1px solid #ddd; font-size:10pt; }
        .summary-row:nth-child(even) { background:#f9f9f9; }
        .summary-row.total { font-weight:700; border-top:2px solid #1B5E20; background:#f0f7f0; color:#1B5E20; }
        .print-section { page-break-inside:avoid; margin-bottom:12pt; }
        @media print {
          .print-table th { background:#1B5E20 !important; color:white !important; }
          .print-table tfoot td { background:#f0f7f0 !important; }
          .print-table tr:nth-child(even) td { background:#f9f9f9 !important; }
          .summary-row.total { background:#f0f7f0 !important; }
        }
      `}</style>

      {/* ═══ SCREEN UI (hidden on print) ═══ */}
      <div className="no-print min-h-screen bg-gray-50 pb-24">

        {/* Header */}
        <div className="px-4 pt-10 pb-5" style={{ backgroundColor:"#1B5E20" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/reports")}
              className="p-1.5 rounded-full hover:bg-white/15 active:scale-95 transition-transform">
              <ArrowLeft size={20} color="white" />
            </button>
            <div>
              <h1 className="text-white font-bold text-xl">Print Reports</h1>
              <p className="text-green-300 text-xs">Professional A4 accounting reports</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">

          {/* Report type grid */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Select Report Type</p>
            <div className="grid grid-cols-2 gap-2">
              {REPORTS.map(r => (
                <button key={r.key} onClick={() => setActiveReport(r.key)}
                  className="flex items-start gap-2.5 p-3 rounded-xl text-left active:scale-95 transition-all"
                  style={{
                    backgroundColor: activeReport===r.key ? "#E8F5E9" : "#F9FAFB",
                    border: activeReport===r.key ? "1.5px solid #1B5E20" : "1.5px solid transparent",
                  }}>
                  <span style={{ fontSize:18, lineHeight:1 }}>{r.icon}</span>
                  <div>
                    <p className="font-bold text-xs leading-tight" style={{ color:activeReport===r.key?"#1B5E20":"#374151" }}>{r.label}</p>
                    <p className="text-gray-400 text-[10px] mt-0.5 leading-snug">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Filters</p>

            {activeReport==="ledger" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase">Farmer</label>
                <Select value={selectedFarmer} onChange={setSelectedFarmer} disabled={loading||!farmers.length}>
                  {!farmers.length && <option value="">No farmers found</option>}
                  {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </div>
            )}

            {activeReport==="parcel" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase">Parcel</label>
                <Select value={selectedParcel} onChange={setSelectedParcel} disabled={loading||!parcels.length}>
                  {!parcels.length && <option value="">No parcels found</option>}
                  {parcels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            )}

            {["ledger","expense","sales","godown"].includes(activeReport) && (
              <div className="grid grid-cols-2 gap-3">
                <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
                <DateInput label="To"   value={dateTo}   onChange={setDateTo} />
              </div>
            )}

            {activeReport==="summary" && (
              <p className="text-xs text-gray-400 italic">Uses all data available for your farm.</p>
            )}

            <button onClick={() => window.print()} disabled={generating}
              className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
              style={{ backgroundColor:"#1B5E20" }}>
              {generating
                ? <><Loader2 size={15} className="animate-spin" /> Preparing…</>
                : <><Printer size={15} /> Print {REPORTS.find(r=>r.key===activeReport)?.label}</>
              }
            </button>
          </div>

          {/* Screen preview */}
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1">Preview</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ minHeight:300 }}>
            {renderTemplate(false)}
          </div>
        </div>
      </div>

      {/* ═══ PRINT-ONLY OUTPUT (hidden on screen via @media screen, shown on print) ═══ */}
      <div className="for-print">
        {renderTemplate(true)}
      </div>
    </>
  );
}
