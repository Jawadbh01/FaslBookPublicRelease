

import { useEffect, useState } from "react";
import { useParams } from "wouter";
import {
  collection, query, where, onSnapshot,
  doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { ChevronLeft, MapPin, Package, BarChart2, Receipt, TrendingUp, TrendingDown } from "lucide-react";

interface FarmerUser {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  photoURL?: string;
  role: string;
  status?: string;
  organizationId: string;
}

interface WorkerFarmerDoc {
  id: string;
  name?: string;
  phone?: string;
  notes?: string;
  assignedParcel?: string;
  organizationId?: string;
}

interface Parcel {
  id: string;
  name: string;
  acres?: number;
  assignedFarmer?: string;
}

interface Crop {
  id: string;
  cropName: string;
  status: string;
  parcelId: string;
  parcelName?: string;
  assignedFarmer?: string;
  harvestDate?: string;
  totalYield?: number;
  yieldUnit?: string;
}

interface InvTx {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  toFarmerId?: string;
  date: any;
}

interface LedgerEntry {
  id: string;
  type: "credit" | "debit";
  category: string;
  categoryLabel?: string;
  amount: number;
  date: string;
  parcelId?: string;
  parcelName?: string;
  notes?: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const statusBg: Record<string, { bg: string; color: string; label: string }> = {
  growing:   { bg: "#E8F5E9", color: "#1B5E20", label: "Growing" },
  harvested: { bg: "#E3F2FD", color: "#1565C0", label: "Harvested" },
  planned:   { bg: "#F3E5F5", color: "#6A1B9A", label: "Planned" },
  closed:    { bg: "#F5F5F5", color: "#757575", label: "Closed" },
};

export default function FarmerDetailPage() {
  const { id } = useParams<{ id: string }>();
  
  const { organization } = useAuthStore();
  const orgId = organization?.id;

  const [farmer, setFarmer] = useState<FarmerUser | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [invTxs, setInvTxs] = useState<InvTx[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    // Farmers are manual records in the `workers` collection (workerType: "farmer"),
    // not authenticated `users` — farmers cannot log in. Looking them up in `users`
    // always returned "not found".
    getDoc(doc(db, "workers", id)).then((snap) => {
      if (snap.exists()) {
        const w = snap.data() as WorkerFarmerDoc;
        setFarmer({
          id: snap.id,
          displayName: w.name || "Unnamed",
          email: "",
          phone: w.phone || "",
          role: "farmer",
          organizationId: w.organizationId || "",
        });
      }
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id || !orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "parcels"), where("organizationId", "==", orgId), where("assignedFarmer", "==", id)),
      (snap) => setParcels(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Parcel)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "crops"), where("organizationId", "==", orgId), where("assignedFarmer", "==", id)),
      (snap) => setCrops(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Crop)))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "inventoryTransactions"), where("organizationId", "==", orgId), where("toFarmerId", "==", id)),
      (snap) => setInvTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvTx)))
    ));

    return () => unsubs.forEach((u) => u());
  }, [id, orgId]);

  // Ledger entries have no direct farmer link — they're tied to parcels via
  // parcelId, so once we know which parcels are assigned to this farmer we
  // pull the ledger entries recorded against those parcels.
  useEffect(() => {
    if (!orgId || parcels.length === 0) {
      setLedgerEntries([]);
      return;
    }
    const parcelIds = parcels.map((p) => p.id).slice(0, 30);
    const unsub = onSnapshot(
      query(
        collection(db, "ledgerEntries"),
        where("organizationId", "==", orgId),
        where("parcelId", "in", parcelIds)
      ),
      (snap) => setLedgerEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)))
    );
    return () => unsub();
  }, [orgId, parcels]);

  const activeCrops = crops.filter((c) => c.status !== "harvested" && c.status !== "closed");
  const harvestedCrops = crops.filter((c) => c.status === "harvested");

  const sortedLedger = [...ledgerEntries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalCredit = ledgerEntries.filter((e) => e.type === "credit").reduce((s, e) => s + (e.amount || 0), 0);
  const totalDebit = ledgerEntries.filter((e) => e.type === "debit").reduce((s, e) => s + (e.amount || 0), 0);
  const fmtRs = (n: number) => "Rs. " + n.toLocaleString("en-PK");

  const ini = farmer?.displayName?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  const fmtDate = (ts: any) => {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
    </div>
  );

  if (!farmer) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Farmer not found</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div style={{ backgroundColor: "#1B5E20" }} className="px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => window.history.back()} className="text-white active:scale-95">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-white text-xl font-bold">{farmer.displayName || "Unnamed"}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white bg-opacity-20 text-white">Farmer</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#E8F5E9", color: "#1B5E20" }}>Active</span>
            </div>
          </div>
        </div>

        {/* Profile */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            {ini}
          </div>
          <div>
            {farmer.email && <p className="text-green-100 text-sm">✉️ {farmer.email}</p>}
            {farmer.phone && <p className="text-green-100 text-sm">📞 {farmer.phone}</p>}
            <p className="text-green-200 text-xs mt-0.5">
              {parcels.length} parcel{parcels.length !== 1 ? "s" : ""} · {ledgerEntries.length} ledger entr{ledgerEntries.length !== 1 ? "ies" : "y"}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* Assigned Parcels */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} color="#1B5E20" />
            <p className="font-bold text-gray-800">Assigned Parcels</p>
          </div>
          {parcels.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-3">No parcels assigned</p>
          ) : (
            <div className="flex flex-col gap-2">
              {parcels.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <p className="text-gray-800 font-medium text-sm">{p.name}</p>
                  {p.acres && <p className="text-gray-400 text-xs">{p.acres} acres</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ledger */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Receipt size={16} color="#1B5E20" />
            <p className="font-bold text-gray-800">Ledger</p>
          </div>

          {ledgerEntries.length > 0 && (
            <div className="flex gap-3 mb-3">
              <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: "#E8F5E9" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp size={14} color="#1B5E20" />
                  <p className="text-xs font-medium" style={{ color: "#1B5E20" }}>Income</p>
                </div>
                <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmtRs(totalCredit)}</p>
              </div>
              <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: "#FFEBEE" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown size={14} color="#C62828" />
                  <p className="text-xs font-medium" style={{ color: "#C62828" }}>Expense</p>
                </div>
                <p className="font-bold text-sm" style={{ color: "#C62828" }}>{fmtRs(totalDebit)}</p>
              </div>
            </div>
          )}

          {sortedLedger.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-3">No ledger entries for this farmer's parcels yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedLedger.slice(0, 10).map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-800 font-medium text-sm">{e.categoryLabel || e.category}</p>
                    <p className="text-gray-400 text-xs">{e.parcelName || "—"} · {e.date}</p>
                  </div>
                  <p className="font-semibold text-sm" style={{ color: e.type === "credit" ? "#1B5E20" : "#C62828" }}>
                    {e.type === "credit" ? "+" : "-"}{fmtRs(e.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock Received */}
        {invTxs.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Package size={16} color="#E65100" />
              <p className="font-bold text-gray-800">Stock Received</p>
            </div>
            <div className="flex flex-col gap-2">
              {invTxs.slice(0, 10).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-800 font-medium text-sm">{tx.itemName}</p>
                    <p className="text-gray-400 text-xs">{fmtDate(tx.date)}</p>
                  </div>
                  <p className="text-gray-600 font-semibold text-sm">{tx.quantity} {tx.unit}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Harvest History */}
        {harvestedCrops.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={16} color="#1565C0" />
              <p className="font-bold text-gray-800">Harvest History</p>
            </div>
            <div className="flex flex-col gap-2">
              {harvestedCrops.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-gray-800 font-medium text-sm">{c.cropName}</p>
                    {c.harvestDate && <p className="text-gray-400 text-xs">{c.harvestDate}</p>}
                  </div>
                  {c.totalYield && (
                    <p className="text-gray-600 font-semibold text-sm">{c.totalYield} {c.yieldUnit || "kg"}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
