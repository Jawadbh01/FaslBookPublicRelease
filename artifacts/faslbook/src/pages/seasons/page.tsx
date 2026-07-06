import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "@/store/authStore";
import {
  Season, subscribeSeasons, createSeason, updateSeason,
} from "@/lib/firebase/seasons";
import {
  ChevronLeft, Plus, X, Loader2, Calendar, Pencil, CheckCircle2,
} from "lucide-react";
import { useLocation } from "wouter";

const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
};

export default function SeasonsPage() {
  const { organization, role } = useAuthStore();
  const [, navigate] = useLocation();
  const orgId = organization?.id;
  const canEdit = role === "landlord" || role === "manager";

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Season | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const now = new Date();
  const emptyForm = {
    name: `Season ${now.getFullYear()}`,
    year: now.getFullYear(),
    startDate: `${now.getFullYear()}-01-01`,
    endDate: `${now.getFullYear()}-12-31`,
    status: "Active" as "Active" | "Completed",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!orgId) return;
    const unsub = subscribeSeasons(orgId, (data) => { setSeasons(data); setLoading(false); });
    return () => unsub();
  }, [orgId]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(""); setShowForm(true); };
  const openEdit = (s: Season) => {
    setEditing(s);
    setForm({ name: s.name, year: s.year, startDate: s.startDate, endDate: s.endDate, status: s.status });
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Season name is required"); return; }
    if (!form.startDate || !form.endDate) { setError("Start and end dates are required"); return; }
    if (form.startDate > form.endDate) { setError("Start date must be before end date"); return; }
    try {
      setSaving(true); setError("");
      if (editing) {
        await updateSeason(editing.id, form);
      } else {
        if (!orgId) return;
        await createSeason({ organizationId: orgId, ...form });
      }
      setShowForm(false);
    } catch (e) {
      console.error(e);
      setError("Failed to save season.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="px-4 pt-10 pb-6" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10">
            <ChevronLeft size={24} color="white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">Seasons</h1>
            <p className="text-green-200 text-xs">{seasons.length} season{seasons.length !== 1 ? "s" : ""}</p>
          </div>
          {canEdit && (
            <button
              onClick={openCreate}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            >
              <Plus size={22} color="white" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
          </div>
        ) : seasons.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#E8F5E9" }}>
              <Calendar size={36} color="#1B5E20" />
            </div>
            <p className="text-gray-600 font-semibold mb-2">No seasons yet</p>
            <p className="text-gray-400 text-sm mb-6">Every transaction belongs to a season</p>
            {canEdit && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}
              >
                <Plus size={18} /> Add First Season
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {seasons.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-gray-800 text-base">{s.name}</p>
                    <p className="text-gray-500 text-xs">{fmtDate(s.startDate)} – {fmtDate(s.endDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-3 py-1 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: s.status === "Active" ? "#E8F5E9" : "#F5F5F5",
                        color: s.status === "Active" ? "#1B5E20" : "#757575",
                      }}
                    >
                      {s.status === "Active" && <CheckCircle2 size={12} className="inline mr-1 -mt-0.5" />}
                      {s.status}
                    </span>
                    {canEdit && (
                      <button onClick={() => openEdit(s)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
                        <Pencil size={14} color="#6B7280" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-6 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-800">{editing ? "Edit Season" : "New Season"}</h2>
                <button onClick={() => setShowForm(false)}><X size={22} color="#9CA3AF" /></button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>
              )}

              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Season Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Kharif 2026"
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
                />
              </div>

              <div className="mb-4">
                <label className="text-gray-600 text-sm font-medium mb-2 block">Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 outline-none text-gray-800 text-base focus:border-green-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 outline-none text-gray-800 text-sm focus:border-green-700"
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-sm font-medium mb-2 block">End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 outline-none text-gray-800 text-sm focus:border-green-700"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-gray-600 text-sm font-medium mb-3 block">Status</label>
                <div className="flex gap-3">
                  {(["Active", "Completed"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setForm({ ...form, status: st })}
                      className="flex-1 py-3 rounded-2xl border-2 font-semibold text-sm transition-all"
                      style={{
                        borderColor: form.status === st ? "#1B5E20" : "#E5E7EB",
                        backgroundColor: form.status === st ? "#E8F5E9" : "white",
                        color: form.status === st ? "#1B5E20" : "#6B7280",
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                style={{ backgroundColor: "#1B5E20" }}
              >
                {saving ? <Loader2 size={22} className="animate-spin" /> : editing ? "Save Changes" : "Create Season"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
