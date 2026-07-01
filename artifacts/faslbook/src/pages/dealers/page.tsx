

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import {
  Plus, X, Loader2, Phone, MapPin,
  Handshake, CreditCard,
  ArrowDownLeft, ArrowUpRight, Check, Printer,
} from "lucide-react";
import { useLocation } from "wouter";

interface Dealer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  totalPurchased: number;
  totalPaid: number;
  organizationId: string;
  createdAt: any;
}

export default function DealersPage() {
  const { organization, role } = useAuthStore();
  
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [dForm, setDForm] = useState({
    name: "", phone: "", address: "", notes: "",
  });

  const [txForm, setTxForm] = useState({
    type: "purchase" as "purchase" | "payment",
    items: "",
    amount: "",
    paymentType: "credit" as "cash" | "credit",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      query(collection(db, "dealers"), where("organizationId", "==", orgId)),
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Dealer))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setDealers(data);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [orgId]);

  const totalOutstanding = dealers.reduce(
    (sum, d) => sum + ((d.totalPurchased || 0) - (d.totalPaid || 0)), 0
  );

  const handleSaveDealer = async () => {
    if (!dForm.name) { setError("Dealer name is required"); return; }
    try {
      setSaving(true);
      setError("");
      await addDoc(collection(db, "dealers"), {
        name: dForm.name.trim(),
        phone: dForm.phone.trim(),
        address: dForm.address.trim(),
        notes: dForm.notes.trim(),
        totalPurchased: 0,
        totalPaid: 0,
        organizationId: orgId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        syncStatus: "synced",
      });
      setShowAdd(false);
      setDForm({ name: "", phone: "", address: "", notes: "" });
    } catch {
      setError("Failed to save dealer.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTx = async () => {
    if (!txForm.amount || isNaN(Number(txForm.amount))) {
      setError("Please enter a valid amount");
      return;
    }
    if (txForm.type === "purchase" && !txForm.items) {
      setError("Please enter items purchased");
      return;
    }
    if (!selectedDealer) return;

    try {
      setSaving(true);
      setError("");
      const amount = Number(txForm.amount);

      await addDoc(collection(db, "dealerTransactions"), {
        dealerId: selectedDealer.id,
        dealerName: selectedDealer.name,
        type: txForm.type,
        items: txForm.items,
        amount,
        paymentType: txForm.paymentType,
        date: new Date(txForm.date),
        notes: txForm.notes,
        organizationId: orgId,
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });

      const update: any = { updatedAt: serverTimestamp() };
      if (txForm.type === "purchase") {
        update.totalPurchased = (selectedDealer.totalPurchased || 0) + amount;
      } else {
        update.totalPaid = (selectedDealer.totalPaid || 0) + amount;
      }
      await updateDoc(doc(db, "dealers", selectedDealer.id), update);

      await addDoc(collection(db, "ledgerEntries"), {
        organizationId: orgId,
        type: txForm.type === "purchase" ? "dealerCredit" : "dealerPayment",
        direction: txForm.type === "purchase" ? "debit" : "credit",
        amount,
        description: txForm.type === "purchase"
          ? `Purchase from ${selectedDealer.name}: ${txForm.items}`
          : `Payment to ${selectedDealer.name}`,
        sourceId: selectedDealer.id,
        sourceType: "dealer",
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });

      await addDoc(collection(db, "activityLogs"), {
        organizationId: orgId,
        userId: auth.currentUser?.uid || "",
        userName: auth.currentUser?.displayName || "",
        action: txForm.type === "purchase" ? "DEALER_PURCHASE" : "DEALER_PAYMENT",
        description: txForm.type === "purchase"
          ? `Purchased Rs. ${amount} from ${selectedDealer.name}`
          : `Paid Rs. ${amount} to ${selectedDealer.name}`,
        recordId: selectedDealer.id,
        recordType: "dealers",
        createdAt: serverTimestamp(),
        syncStatus: "synced",
      });

      setShowTx(false);
      setSelectedDealer(null);
      setTxForm({
        type: "purchase",
        items: "",
        amount: "",
        paymentType: "credit",
        date: new Date().toISOString().split("T")[0],
        notes: "",
      });
    } catch (err) {
      console.error(err);
      setError("Failed to save transaction.");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

  // ── Add Dealer Form ────────────────────────────────────────
  if (showAdd) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => { setShowAdd(false); setError(""); }} className="text-white mr-3">
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">Add Dealer</h1>
            <p className="text-green-200 text-xs">Add supplier or vendor</p>
          </div>
        </div>
        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}
          {[
            { label: "Dealer Name *", key: "name", placeholder: "e.g. Al-Rahman Traders", icon: Handshake },
            { label: "Phone Number", key: "phone", placeholder: "03XX-XXXXXXX", icon: Phone },
            { label: "Address", key: "address", placeholder: "Shop/area address", icon: MapPin },
          ].map(({ label, key, placeholder, icon: Icon }) => (
            <div key={key} className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">{label}</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <Icon size={20} color="#9E9E9E" className="mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder={placeholder}
                  value={(dForm as any)[key]}
                  onChange={(e) => setDForm({ ...dForm, [key]: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent"
                />
              </div>
            </div>
          ))}
          <div className="mb-8">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
              <textarea
                placeholder="Any notes about this dealer..."
                value={dForm.notes}
                onChange={(e) => setDForm({ ...dForm, notes: e.target.value })}
                rows={3}
                className="w-full outline-none text-gray-800 text-base bg-transparent resize-none"
              />
            </div>
          </div>
          <button
            onClick={handleSaveDealer}
            disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: "#1B5E20" }}
          >
            {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Dealer"}
          </button>
        </div>
      </div>
    );
  }

  // ── Transaction Form ───────────────────────────────────────
  if (showTx && selectedDealer) {
    const outstanding = (selectedDealer.totalPurchased || 0) - (selectedDealer.totalPaid || 0);
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
          <button onClick={() => { setShowTx(false); setError(""); }} className="text-white mr-3">
            <X size={24} />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold">
              {txForm.type === "purchase" ? "New Purchase" : "Add Payment"}
            </h1>
            <p className="text-green-200 text-xs">{selectedDealer.name}</p>
          </div>
        </div>
        <div className="flex-1 px-6 pt-6 pb-10 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}

          {outstanding > 0 && (
            <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: "#FFF3E0" }}>
              <p className="text-orange-800 text-xs font-medium">Outstanding Balance</p>
              <p className="text-orange-700 font-bold text-lg">{fmt(outstanding)}</p>
            </div>
          )}

          <div className="mb-5">
            <label className="text-gray-600 text-sm font-medium mb-3 block">Transaction Type</label>
            <div className="flex gap-3">
              {[
                { val: "purchase", label: "Purchase", icon: ArrowDownLeft, color: "#C62828", bg: "#FFEBEE" },
                { val: "payment", label: "Payment", icon: ArrowUpRight, color: "#1B5E20", bg: "#E8F5E9" },
              ].map(({ val, label, icon: Icon, color, bg }) => (
                <button
                  key={val}
                  onClick={() => setTxForm({ ...txForm, type: val as any })}
                  className="flex-1 py-3 rounded-2xl border-2 flex items-center justify-center gap-2 transition-all"
                  style={{
                    borderColor: txForm.type === val ? color : "#E5E7EB",
                    backgroundColor: txForm.type === val ? bg : "white",
                  }}
                >
                  <Icon size={18} color={txForm.type === val ? color : "#9CA3AF"} />
                  <span className="font-semibold text-sm" style={{ color: txForm.type === val ? color : "#6B7280" }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {txForm.type === "purchase" && (
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Items Purchased *</label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
                <input
                  type="text"
                  placeholder="e.g. DAP Fertilizer 10 Bags"
                  value={txForm.items}
                  onChange={(e) => setTxForm({ ...txForm, items: e.target.value })}
                  className="flex-1 outline-none text-gray-800 text-base bg-transparent"
                />
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Amount (Rs.) *</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <span className="text-gray-400 mr-2 font-medium">Rs.</span>
              <input
                type="number"
                placeholder="0"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>

          {txForm.type === "purchase" && (
            <div className="mb-4">
              <label className="text-gray-600 text-sm font-medium mb-3 block">Payment Type</label>
              <div className="flex gap-3">
                {[
                  { val: "cash", label: "Cash" },
                  { val: "credit", label: "Credit" },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    onClick={() => setTxForm({ ...txForm, paymentType: val as any })}
                    className="flex-1 py-3 rounded-2xl border-2 flex items-center justify-center gap-2 transition-all"
                    style={{
                      borderColor: txForm.paymentType === val ? "#1B5E20" : "#E5E7EB",
                      backgroundColor: txForm.paymentType === val ? "#E8F5E9" : "white",
                    }}
                  >
                    {txForm.paymentType === val && <Check size={14} color="#1B5E20" />}
                    <span className="font-semibold text-sm" style={{
                      color: txForm.paymentType === val ? "#1B5E20" : "#6B7280"
                    }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl px-4 py-3 focus-within:border-green-700">
              <input
                type="date"
                value={txForm.date}
                onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                className="flex-1 outline-none text-gray-800 text-base bg-transparent"
              />
            </div>
          </div>

          <div className="mb-8">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Notes</label>
            <div className="border-2 border-gray-200 rounded-2xl px-4 py-3">
              <textarea
                placeholder="Optional notes..."
                value={txForm.notes}
                onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                rows={2}
                className="w-full outline-none text-gray-800 text-base bg-transparent resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleSaveTx}
            disabled={saving}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
            style={{ backgroundColor: txForm.type === "purchase" ? "#C62828" : "#1B5E20" }}
          >
            {saving
              ? <Loader2 size={22} className="animate-spin" />
              : txForm.type === "purchase" ? "Save Purchase" : "Save Payment"
            }
          </button>
        </div>
      </div>
    );
  }

  // ── Main List ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-white text-xl font-bold">Dealers</h1>
            <p className="text-green-200 text-xs">
              {dealers.length} dealer{dealers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.href = "/reports/print?type=sales"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}
            >
              <Printer size={14} />
              Print
            </button>
            {canEdit && (
              <button
                onClick={() => setShowAdd(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              >
                <Plus size={22} color="white" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {totalOutstanding > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-xs mb-1">Total Outstanding Balance</p>
              <p className="font-bold text-xl" style={{ color: "#C62828" }}>
                {fmt(totalOutstanding)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FFEBEE" }}>
              <CreditCard size={24} color="#C62828" />
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : dealers.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
              <Handshake size={36} color="#1B5E20" />
            </div>
            <p className="text-gray-600 font-semibold mb-2">No dealers yet</p>
            <p className="text-gray-400 text-sm mb-6">Add your suppliers and vendors</p>
            {canEdit && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}
              >
                <Plus size={18} />
                Add First Dealer
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {dealers.map((dealer) => {
              const outstanding = (dealer.totalPurchased || 0) - (dealer.totalPaid || 0);
              const hasBalance = outstanding > 0;
              return (
                <div key={dealer.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8F5E9" }}>
                        <Handshake size={22} color="#1B5E20" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-base">{dealer.name}</p>
                        {dealer.phone && (
                          <p className="text-gray-500 text-xs">{dealer.phone}</p>
                        )}
                      </div>
                    </div>
                    {hasBalance && (
                      <div className="px-3 py-1 rounded-full" style={{ backgroundColor: "#FFEBEE" }}>
                        <span className="text-xs font-bold" style={{ color: "#C62828" }}>
                          {fmt(outstanding)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-xl p-2" style={{ backgroundColor: "#F5F5F5" }}>
                      <p className="text-gray-400 text-xs mb-0.5">Total Purchased</p>
                      <p className="text-gray-800 font-bold text-sm">{fmt(dealer.totalPurchased || 0)}</p>
                    </div>
                    <div className="rounded-xl p-2" style={{ backgroundColor: "#F5F5F5" }}>
                      <p className="text-gray-400 text-xs mb-0.5">Total Paid</p>
                      <p className="font-bold text-sm" style={{ color: "#1B5E20" }}>{fmt(dealer.totalPaid || 0)}</p>
                    </div>
                  </div>

                  {(dealer.totalPurchased || 0) > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Paid</span>
                        <span>{Math.round(((dealer.totalPaid || 0) / (dealer.totalPurchased || 1)) * 100)}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, ((dealer.totalPaid || 0) / (dealer.totalPurchased || 1)) * 100)}%`,
                            backgroundColor: "#1B5E20",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {canEdit && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedDealer(dealer);
                          setTxForm({ ...txForm, type: "purchase" });
                          setShowTx(true);
                        }}
                        className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        style={{ backgroundColor: "#1B5E20" }}
                      >
                        <ArrowDownLeft size={14} />
                        Add Purchase
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDealer(dealer);
                          setTxForm({ ...txForm, type: "payment" });
                          setShowTx(true);
                        }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        style={{ borderColor: "#1B5E20", color: "#1B5E20" }}
                      >
                        <ArrowUpRight size={14} />
                        Add Payment
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canEdit && dealers.length > 0 && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}
        >
          <Plus size={26} color="white" />
        </button>
      )}
    </div>
  );
}
