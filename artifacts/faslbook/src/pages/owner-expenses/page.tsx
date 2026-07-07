import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { notifyOfflineSave } from "@/lib/offlineSync";
import {
  ArrowLeft, Plus, Search, Loader2, Camera, X,
  Trash2, Pencil, CheckCircle, SlidersHorizontal, Receipt,
} from "lucide-react";
import { auth } from "@/lib/firebase/auth";

// ── Types ────────────────────────────────────────────────────
interface OwnerExpense {
  id: string;
  category: string;
  categoryLabel: string;
  amount: number;
  date: string;
  paymentMethod: string;
  description: string;
  receiptUrl?: string;
  organizationId: string;
  createdBy: string;
  createdAt: any;
  syncStatus: string;
  edited?: boolean;
}

// ── Config ───────────────────────────────────────────────────
const CATEGORIES: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  transport:     { label: "Transport",      emoji: "🚗", color: "#1565C0", bg: "#E3F2FD" },
  food:          { label: "Food & Dining",  emoji: "🍽️", color: "#E65100", bg: "#FFF3E0" },
  utilities:     { label: "Utilities",      emoji: "💡", color: "#6A1B9A", bg: "#F3E5F5" },
  rent:          { label: "Rent/Property",  emoji: "🏠", color: "#2E7D32", bg: "#E8F5E9" },
  medical:       { label: "Medical",        emoji: "🏥", color: "#C62828", bg: "#FFEBEE" },
  office:        { label: "Office",         emoji: "📎", color: "#1565C0", bg: "#E3F2FD" },
  staff:         { label: "Staff/Salary",   emoji: "👥", color: "#4A148C", bg: "#EDE7F6" },
  shopping:      { label: "Shopping",       emoji: "🛍️", color: "#E65100", bg: "#FFF3E0" },
  entertainment: { label: "Entertainment",  emoji: "🎬", color: "#880E4F", bg: "#FCE4EC" },
  other:         { label: "Other",          emoji: "💰", color: "#37474F", bg: "#ECEFF1" },
};

const PAYMENT_METHODS: Record<string, string> = {
  cash:     "Cash",
  bank:     "Bank Transfer",
  card:     "Card",
  cheque:   "Cheque",
  jazzcash: "JazzCash/EasyPaisa",
};

const todayStr = () => new Date().toISOString().split("T")[0];
const fmt = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-PK");
const fmtDate = (s: string) => {
  if (!s) return "";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = s.split("-");
  return `${parseInt(p[2])} ${M[parseInt(p[1])-1]} ${p[0]}`;
};

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.4);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// ── Receipt viewer modal (portal) ────────────────────────────
function ReceiptModal({ url, onClose }: { url: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white"><X size={28} /></button>
        <img src={url} className="w-full rounded-2xl" alt="receipt" />
      </div>
    </div>,
    document.body
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function OwnerExpensesPage() {
  const { organization, role } = useAuthStore();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  // ── Data ──────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<OwnerExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI state ─────────────────────────────────────────────
  const [view, setView] = useState<"list" | "add" | "edit">("list");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // Add/Edit form
  const [form, setForm] = useState({
    category: "transport", amount: "", date: todayStr(),
    paymentMethod: "cash", description: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);

  // Detail / edit
  const [selectedExpense, setSelectedExpense] = useState<OwnerExpense | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ amount: "", date: "", description: "", paymentMethod: "cash" });
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Receipt viewer
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);

  // ── Firestore listener ────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      query(collection(db, "ownerExpenses"), where("organizationId", "==", orgId)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OwnerExpense))
          .sort((a, b) => (b.date > a.date ? 1 : -1));
        setExpenses(rows);
        setLoading(false);
      }
    );
    return unsub;
  }, [orgId]);

  // ── Derived list ─────────────────────────────────────────
  const filtered = expenses.filter((e) => {
    if (filterCategory !== "all" && e.category !== filterCategory) return false;
    if (filterPayment !== "all" && e.paymentMethod !== filterPayment) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.categoryLabel?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.paymentMethod?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);

  // ── Upload helper ────────────────────────────────────────
  async function uploadReceipt(file: File, expenseId: string): Promise<string> {
    const blob = await compressImage(file);
    const r = ref(storage, `owner-receipts/${orgId}/${expenseId}_receipt.jpg`);
    await uploadBytes(r, blob);
    return getDownloadURL(r);
  }

  // ── Add expense ──────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.amount || Number(form.amount) <= 0) { setFormError("Enter a valid amount"); return; }
    if (!form.date) { setFormError("Select a date"); return; }
    const isOnline = navigator.onLine;
    setSaving(true); setFormError("");
    try {
      const cfg = CATEGORIES[form.category];
      const payload = {
        organizationId: orgId,
        category: form.category,
        categoryLabel: cfg.label,
        amount: Number(form.amount),
        date: form.date,
        paymentMethod: form.paymentMethod,
        description: form.description.trim(),
        receiptUrl: "",
        createdBy: auth.currentUser?.uid || "",
        createdAt: serverTimestamp(),
        syncStatus: isOnline ? "synced" : "pending",
      };

      if (!isOnline) {
        addDoc(collection(db, "ownerExpenses"), payload).catch(console.error);
        notifyOfflineSave("Owner Expense");
        setSuccess(true);
        setSaving(false);
        return;
      }

      const docRef = await addDoc(collection(db, "ownerExpenses"), payload);

      // Upload receipt in background
      if (receiptFile) {
        uploadReceipt(receiptFile, docRef.id)
          .then((url) => updateDoc(doc(db, "ownerExpenses", docRef.id), { receiptUrl: url }))
          .catch(console.error);
      }

      setSuccess(true);
      setSaving(false);
    } catch (e) {
      console.error(e);
      setFormError("Failed to save. Try again.");
      setSaving(false);
    }
  };

  // ── Edit save ────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editForm.amount || Number(editForm.amount) <= 0) return;
    if (!selectedExpense) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, "ownerExpenses", selectedExpense.id), {
        amount: Number(editForm.amount),
        date: editForm.date,
        description: editForm.description,
        paymentMethod: editForm.paymentMethod,
        edited: true,
        editedAt: serverTimestamp(),
        editedBy: auth.currentUser?.uid || null,
      });
      setEditSaved(true);
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedExpense) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "ownerExpenses", selectedExpense.id));
      setSelectedExpense(null);
      setDeleteConfirm(false);
    } catch (e) { console.error(e); }
    finally { setDeleting(false); }
  };

  const resetForm = () => {
    setForm({ category: "transport", amount: "", date: todayStr(), paymentMethod: "cash", description: "" });
    setReceiptFile(null); setReceiptPreview(""); setFormError(""); setSuccess(false);
  };

  const goBack = () => { setView("list"); resetForm(); };

  // ═══ SUCCESS ═══
  if (success) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-lg" style={{ backgroundColor: "#E8F5E9" }}>
        <CheckCircle size={52} color="#1B5E20" />
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Expense Saved! ✅</h1>
      <p className="text-gray-500 text-sm mb-10">
        −{fmt(Number(form.amount))} • {CATEGORIES[form.category]?.label}
      </p>
      <button onClick={goBack}
        className="w-full py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
        style={{ backgroundColor: "#1B5E20" }}>
        Back to Owner Expenses
      </button>
    </div>
  );

  // ═══ ADD FORM ═══
  if (view === "add") return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center px-4 pt-12 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <button onClick={goBack} className="text-white mr-3"><ArrowLeft size={24} /></button>
        <h1 className="text-white text-xl font-bold">Add Owner Expense</h1>
      </div>

      <div className="flex-1 px-5 pt-6 pb-10 overflow-y-auto">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{formError}</div>
        )}

        {/* Category grid */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-3 block">Category</label>
        <div className="grid grid-cols-4 gap-2 mb-5">
          {Object.entries(CATEGORIES).map(([key, cfg]) => (
            <button key={key} onClick={() => setForm({ ...form, category: key })}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all active:scale-95"
              style={{
                borderColor: form.category === key ? cfg.color : "#E5E7EB",
                backgroundColor: form.category === key ? cfg.bg : "white",
              }}>
              <span className="text-xl">{cfg.emoji}</span>
              <span className="text-[10px] font-semibold text-center leading-tight"
                style={{ color: form.category === key ? cfg.color : "#6B7280" }}>
                {cfg.label.split("/")[0]}
              </span>
            </button>
          ))}
        </div>

        {/* Amount */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Amount (Rs.)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 focus-within:border-green-700 bg-white">
          <input type="number" placeholder="e.g. 5,000" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-full outline-none text-gray-800 text-xl font-semibold bg-transparent" />
        </div>

        {/* Date */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Date</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white flex items-center">
          <input type="date" value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="flex-1 outline-none text-gray-800 text-base bg-transparent [&::-webkit-calendar-picker-indicator]:hidden" />
          <span className="text-gray-400 text-sm">
            {form.date ? new Date(form.date + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : ""}
          </span>
        </div>

        {/* Payment Method */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Payment Method</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 bg-white">
          <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            className="w-full outline-none text-gray-800 text-base bg-transparent">
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Description / Notes (Optional)</label>
        <div className="border border-gray-200 rounded-2xl px-4 py-3 mb-4 bg-white">
          <textarea placeholder="What was this expense for?" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3} className="w-full outline-none text-gray-800 text-base bg-transparent resize-none" />
        </div>

        {/* Receipt */}
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2 block">Receipt Photo (Optional)</label>
        <input type="file" accept="image/*" id="ownerReceiptInput" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setReceiptFile(file); setReceiptPreview(URL.createObjectURL(file)); }
        }} />
        <label htmlFor="ownerReceiptInput"
          className="w-full h-32 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform overflow-hidden mb-8 block"
          style={{ backgroundColor: "#FAFAFA" }}>
          {receiptPreview
            ? <img src={receiptPreview} className="w-full h-full object-cover" alt="receipt" />
            : <><Camera size={28} color="#9E9E9E" /><p className="text-gray-500 text-sm mt-2">Tap to upload receipt</p><p className="text-gray-400 text-xs">Auto-compressed</p></>
          }
        </label>

        <button onClick={handleAdd} disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          {saving ? <Loader2 size={22} className="animate-spin" /> : "Save Expense"}
        </button>
      </div>
    </div>
  );

  // ═══ MAIN LIST ═══
  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: "#F5F5F5" }}>

      {/* Receipt viewer */}
      {receiptViewUrl && <ReceiptModal url={receiptViewUrl} onClose={() => setReceiptViewUrl(null)} />}

      {/* Detail / Edit modal */}
      {selectedExpense && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => { setSelectedExpense(null); setEditMode(false); setEditSaved(false); setDeleteConfirm(false); }}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-6 overflow-y-auto flex-1 min-h-0">

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">
                    {editMode ? "Edit Expense" : `${CATEGORIES[selectedExpense.category]?.emoji || "💰"} ${selectedExpense.categoryLabel}`}
                  </h2>
                  {selectedExpense.edited && !editMode && <p className="text-gray-400 text-xs italic">Edited</p>}
                </div>
                <button onClick={() => { setSelectedExpense(null); setEditMode(false); setEditSaved(false); setDeleteConfirm(false); }}>
                  <X size={22} color="#9CA3AF" />
                </button>
              </div>

              {deleteConfirm ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#FFEBEE" }}>
                    <Trash2 size={28} color="#C62828" />
                  </div>
                  <p className="text-gray-800 font-bold text-base mb-1">Delete this expense?</p>
                  <p className="text-gray-500 text-sm mb-6">This cannot be undone.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setDeleteConfirm(false)}
                      className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm">
                      Cancel
                    </button>
                    <button onClick={handleDelete} disabled={deleting}
                      className="flex-1 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ backgroundColor: "#C62828" }}>
                      {deleting ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
                    </button>
                  </div>
                </div>

              ) : editSaved ? (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
                    <CheckCircle size={36} color="#1B5E20" />
                  </div>
                  <p className="text-gray-800 font-bold text-base mb-1">Changes saved</p>
                </div>

              ) : !editMode ? (
                <>
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Amount</span>
                      <span className="font-bold text-base" style={{ color: "#C62828" }}>−{fmt(selectedExpense.amount)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Date</span>
                      <span className="text-gray-800 text-sm font-medium">{fmtDate(selectedExpense.date)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-gray-500 text-sm">Payment</span>
                      <span className="text-gray-800 text-sm font-medium">{PAYMENT_METHODS[selectedExpense.paymentMethod] || selectedExpense.paymentMethod}</span>
                    </div>
                    {selectedExpense.description && (
                      <div className="py-2">
                        <span className="text-gray-500 text-sm block mb-1">Description</span>
                        <span className="text-gray-800 text-sm">{selectedExpense.description}</span>
                      </div>
                    )}
                  </div>
                  {selectedExpense.receiptUrl && (
                    <button onClick={() => setReceiptViewUrl(selectedExpense.receiptUrl!)}
                      className="w-full mb-3 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-sm flex items-center justify-center gap-2">
                      <Receipt size={16} /> View Receipt
                    </button>
                  )}
                </>

              ) : (
                <>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Amount (Rs.)</label>
                    <input type="number" value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Date</label>
                    <input type="date" value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700" />
                  </div>
                  <div className="mb-4">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Payment Method</label>
                    <select value={editForm.paymentMethod}
                      onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700 bg-white">
                      {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="text-gray-600 text-sm font-medium mb-2 block">Description</label>
                    <textarea value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={2}
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base resize-none focus:border-green-700" />
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="pt-4 mt-2 border-t border-gray-100 flex gap-3">
                {editSaved || deleteConfirm ? (
                  <button onClick={() => { setSelectedExpense(null); setEditMode(false); setEditSaved(false); setDeleteConfirm(false); }}
                    className="flex-1 py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}>
                    Done
                  </button>
                ) : !editMode && canEdit ? (
                  <>
                    <button onClick={() => setDeleteConfirm(true)}
                      className="py-4 px-5 rounded-2xl border-2 border-red-200 text-red-600 font-bold text-base active:scale-95 transition-transform flex items-center justify-center">
                      <Trash2 size={18} />
                    </button>
                    <button onClick={() => {
                      setEditForm({
                        amount: String(selectedExpense.amount),
                        date: selectedExpense.date,
                        description: selectedExpense.description || "",
                        paymentMethod: selectedExpense.paymentMethod || "cash",
                      });
                      setEditMode(true);
                    }}
                      className="flex-1 py-4 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
                      style={{ backgroundColor: "#1B5E20" }}>
                      Edit
                    </button>
                  </>
                ) : editMode ? (
                  <button onClick={handleEditSave} disabled={editSaving}
                    className="flex-1 py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                    style={{ backgroundColor: "#1B5E20" }}>
                    {editSaving ? <Loader2 size={22} className="animate-spin" /> : "Save Changes"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Header ── */}
      <div className="px-4 pt-12 pb-5" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Owner Expenses</h1>
            <p className="text-green-200 text-xs mt-0.5">Personal / non-farm expenses</p>
          </div>
          <button onClick={() => window.location.href = "/reports/print?type=owner"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "white" }}>
            🖨 Print
          </button>
        </div>

        {/* Search */}
        <div className="mt-4 flex items-center gap-2 bg-white/15 rounded-2xl px-4 py-2.5">
          <Search size={16} color="rgba(255,255,255,0.7)" />
          <input
            type="text" placeholder="Search expenses…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-white placeholder-white/60 text-sm"
          />
        </div>
      </div>

      <div className="px-4 pt-4">

        {/* Summary + filter row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-gray-500 text-xs">
              {filtered.length} expense{filtered.length !== 1 ? "s" : ""}
              {filterCategory !== "all" || filterPayment !== "all" ? " (filtered)" : ""}
            </p>
            <p className="text-gray-800 font-bold text-base">{fmt(totalFiltered)}</p>
          </div>
          <button onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: (filterCategory !== "all" || filterPayment !== "all") ? "#E8F5E9" : "#F5F5F5", color: "#374151" }}>
            <SlidersHorizontal size={14} />
            Filter {(filterCategory !== "all" || filterPayment !== "all") ? "•" : ""}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-3">
            <div className="mb-3">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-2">Category</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFilterCategory("all")}
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: filterCategory === "all" ? "#1B5E20" : "#F5F5F5", color: filterCategory === "all" ? "white" : "#374151" }}>
                  All
                </button>
                {Object.entries(CATEGORIES).map(([k, cfg]) => (
                  <button key={k} onClick={() => setFilterCategory(k)}
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: filterCategory === k ? cfg.color : "#F5F5F5", color: filterCategory === k ? "white" : "#374151" }}>
                    {cfg.emoji} {cfg.label.split("/")[0]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-2">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFilterPayment("all")}
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: filterPayment === "all" ? "#1B5E20" : "#F5F5F5", color: filterPayment === "all" ? "white" : "#374151" }}>
                  All
                </button>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <button key={k} onClick={() => setFilterPayment(k)}
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: filterPayment === k ? "#1B5E20" : "#F5F5F5", color: filterPayment === k ? "white" : "#374151" }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {(filterCategory !== "all" || filterPayment !== "all") && (
              <button onClick={() => { setFilterCategory("all"); setFilterPayment("all"); }}
                className="mt-3 text-xs text-red-500 font-medium">
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="text-6xl mb-4">💼</div>
            <p className="text-gray-600 font-semibold mb-2">
              {expenses.length === 0 ? "No owner expenses yet" : "No expenses match your filter"}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {expenses.length === 0 ? "Tap the + button to add your first expense" : "Try adjusting your search or filters"}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {filtered.map((expense, idx) => {
              const cfg = CATEGORIES[expense.category];
              return (
                <button key={expense.id}
                  onClick={() => { setSelectedExpense(expense); setEditMode(false); setEditSaved(false); setDeleteConfirm(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 ${idx < filtered.length - 1 ? "border-b border-gray-50" : ""}`}>
                  {/* Date */}
                  <div className="w-10 shrink-0 text-center">
                    <p className="text-gray-400 text-xs leading-tight">{fmtDate(expense.date).split(" ")[0]}</p>
                    <p className="text-gray-400 text-xs leading-tight">{fmtDate(expense.date).split(" ")[1]}</p>
                  </div>
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                    style={{ backgroundColor: cfg?.bg || "#F5F5F5" }}>
                    {cfg?.emoji || "💰"}
                  </div>
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 font-semibold text-sm truncate">
                      {expense.categoryLabel}
                      {expense.edited && <span className="text-gray-400 font-normal italic text-xs"> (edited)</span>}
                    </p>
                    <p className="text-gray-400 text-xs truncate">
                      {PAYMENT_METHODS[expense.paymentMethod] || expense.paymentMethod}
                      {expense.description ? ` • ${expense.description}` : ""}
                    </p>
                  </div>
                  {/* Amount */}
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-base" style={{ color: "#C62828" }}>−{fmt(expense.amount)}</p>
                    {expense.receiptUrl && (
                      <span className="text-[10px] text-green-700 font-medium">📎 receipt</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      {canEdit && (
        <button onClick={() => { resetForm(); setView("add"); }}
          className="fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          style={{ backgroundColor: "#1B5E20" }}>
          <Plus size={28} color="white" />
        </button>
      )}
    </div>
  );
}
