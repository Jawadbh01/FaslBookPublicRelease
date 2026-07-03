

import { useEffect, useState } from "react";
import {
  collection, query, where,
  onSnapshot, limit,
  doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuthStore } from "@/store/authStore";
import { useLocation } from "wouter";
import { useLangStore } from "@/store/langStore";
import {
  TrendingUp, TrendingDown, Wallet,
  Package, Plus, ArrowUpRight,
  ArrowDownRight, Wheat, Clock,
  Users, LayoutGrid, Bell, MapPin,
  ChevronRight, Copy, Check, HandCoins, Printer,
  BarChart2, User, Handshake, Warehouse, Map,
} from "lucide-react";
import { Link } from "wouter";
import CloudStatusIcon from "@/components/shared/CloudStatusIcon";
import NotificationBell from "@/components/shared/NotificationBell";

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) => "Rs. " + n.toLocaleString("en-PK");

const timeAgo = (ts: any) => {
  if (!ts?.toDate) return "";
  const diff = Date.now() - ts.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const getSeason = () => {
  const month = new Date().getMonth() + 1;
  return month >= 4 && month <= 9 ? "kharif" : "rabi";
};

const getGreeting = (): "good_morning" | "good_afternoon" | "good_evening" => {
  const h = new Date().getHours();
  if (h < 12) return "good_morning";
  if (h < 17) return "good_afternoon";
  return "good_evening";
};


export default function OverviewPage() {
  const { organization, role, user } = useAuthStore();
  const { t } = useLangStore();
  
  const orgId = organization?.id;

  // Prefetch likely next pages so navigation feels instant
  useEffect(() => {
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
    // prefetch removed;
  }, []);

  // Request push notification permission (after 3 s delay, first visit only)
  
  // ── State ────────────────────────────────────────────────────
  const [userName, setUserName]           = useState<string>("");
  const [income, setIncome]               = useState(0);
  const [expense, setExpense]             = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [pendingLoans, setPendingLoans]   = useState(0);
  const [dealerDues, setDealerDues]       = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [recentLedger, setRecentLedger]   = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loading, setLoading]             = useState(true);
  const [copied, setCopied]               = useState(false);

  // ── Fetch user name from Firestore ───────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const name = snap.data().name || user.displayName || "";
        setUserName(name);
      } else {
        setUserName(user.displayName || "");
      }
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!orgId) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, "ledgerEntries"), where("organizationId", "==", orgId)),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        setIncome(all.filter((e: any) => e.type === "credit").reduce((s: number, e: any) => s + (e.amount || 0), 0));
        setExpense(all.filter((e: any) => e.type === "debit").reduce((s: number, e: any) => s + (e.amount || 0), 0));
        const sorted = [...all].sort((a: any, b: any) => (b.date > a.date ? 1 : -1)).slice(0, 5);
        setRecentLedger(sorted);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "loans"), where("organizationId", "==", orgId)),
      (snap) => setPendingLoans(snap.docs.reduce((s, d) => s + ((d.data().amount || 0) - (d.data().paidAmount || 0)), 0))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "dealerTransactions"), where("organizationId", "==", orgId)),
      (snap) => setDealerDues(snap.docs.reduce((s, d) => s + (d.data().payable || 0), 0))
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "inventoryItems"), where("organizationId", "==", orgId)),
      (snap) => {
        setInventoryValue(snap.docs.reduce((s, d) => s + ((d.data().currentStock || 0) * (d.data().pricePerUnit || 0)), 0));
        setLoading(false);
      }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, "activityLogs"), where("organizationId", "==", orgId), limit(8)),
      (snap) => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((a: any) => (a.createdAt?.toMillis?.() ?? 0) >= todayStart.getTime())
          .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setRecentActivity(sorted);
      }
    ));

    if (role === "landlord") {
      unsubs.push(onSnapshot(
        query(collection(db, "joinRequests"), where("organizationId", "==", orgId), where("status", "==", "pending")),
        (snap) => setPendingRequests(snap.size)
      ));
    }

    return () => unsubs.forEach((u) => u());
  }, [orgId, role]);

  const profit = income - expense;

  // ── Summary cards ─────────────────────────────────────────────
  const cards = [
    { key: "income",    value: income,          icon: TrendingUp,   color: "#1B5E20", bg: "#E8F5E9" },
    { key: "expense",   value: expense,         icon: TrendingDown, color: "#C62828", bg: "#FFEBEE" },
    { key: "profit",    value: profit,          icon: Wallet,       color: profit >= 0 ? "#1565C0" : "#C62828", bg: profit >= 0 ? "#E3F2FD" : "#FFEBEE" },
    { key: "inventory", value: inventoryValue,  icon: Package,      color: "#E65100", bg: "#FFF3E0" },
  ];

  // ── Quick actions ─────────────────────────────────────────────
  const actions = [
    {
      label: "Add Expense",
      urdu: "خرچ",
      icon: ArrowDownRight,
      color: "#C62828",
      bg: "#FFEBEE",
      href: "/ledger?form=expense",
    },
    {
      label: "Add Income",
      urdu: "آمدن",
      icon: ArrowUpRight,
      color: "#1B5E20",
      bg: "#E8F5E9",
      href: "/ledger?form=income",
    },
    {
      label: "My Land",
      urdu: "زمین",
      icon: MapPin,
      color: "#1B5E20",
      bg: "#E8F5E9",
      href: "/parcels",
    },
    {
      label: "Godown",
      urdu: "گودام",
      icon: Package,
      color: "#E65100",
      bg: "#FFF3E0",
      href: "/inventory",
    },
    {
      label: "Report",
      urdu: "رپورٹ",
      icon: Printer,
      color: "#1565C0",
      bg: "#E3F2FD",
      href: "/reports/print",
    },
    {
      label: "Team",
      urdu: "ٹیم",
      icon: Users,
      color: "#6A1B9A",
      bg: "#F3E5F5",
      href: "/workers",
    },
    {
      label: "Loans",
      urdu: "قرضہ",
      icon: HandCoins,
      color: "#E65100",
      bg: "#FFF3E0",
      href: "/loans",
    },
  ];

  // ── Activity helpers ──────────────────────────────────────────
  const activityMeta = (action: string) => {
    if (action?.includes("EXPENSE")) return { icon: ArrowDownRight, color: "#C62828", bg: "#FFEBEE", amtColor: "#C62828" };
    if (action?.includes("INCOME"))  return { icon: ArrowUpRight,   color: "#1B5E20", bg: "#E8F5E9", amtColor: "#1B5E20" };
    if (action?.includes("INVENTORY")) return { icon: Package,      color: "#E65100", bg: "#FFF3E0", amtColor: "#E65100" };
    if (action?.includes("ATTENDANCE")) return { icon: Clock,       color: "#1565C0", bg: "#E3F2FD", amtColor: "#1565C0" };
    return { icon: Wheat, color: "#1B5E20", bg: "#E8F5E9", amtColor: "#1B5E20" };
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(organization?.farmId || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── User avatar ───────────────────────────────────────────────
  const displayName = userName || user?.displayName || "User";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "U";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100" style={{ borderTopColor: "#1B5E20" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="px-4 pt-10 pb-4" style={{ backgroundColor: "#1B5E20" }}>
        <div className="flex items-center justify-between mb-3">
          {/* Profile — clickable → /profile */}
          <button
            onClick={() => window.location.href = "/profile"}
            className="flex items-center gap-3 active:scale-95 transition-transform"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="profile"
                className="w-12 h-12 rounded-full border-2 border-white/40 object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full border-2 border-white/40 flex items-center justify-center bg-white/20 shrink-0">
                <span className="text-white font-bold text-sm">{initials}</span>
              </div>
            )}
            <div className="text-left">
              <p className="text-green-200 text-xs">{t(getGreeting())}</p>
              <p className="text-white font-bold text-lg leading-tight">
                {displayName}
              </p>
              <p className="text-green-300 text-xs leading-tight">
                {organization?.name ?? ""}
                {role ? ` • ${role.charAt(0).toUpperCase() + role.slice(1)}` : ""}
              </p>
            </div>
          </button>

          {/* Right icons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { window.location.href = "/reports/print"; }}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            >
              <Printer size={18} color="white" />
            </button>
            {pendingRequests > 0 && (
              <Link href="/approvals">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                    <Users size={18} color="white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: "#C62828", fontSize: 10 }}>
                    {pendingRequests}
                  </div>
                </div>
              </Link>
            )}
            <CloudStatusIcon color="white" size={18} />
            <NotificationBell organizationId={organization?.id ?? null} />
          </div>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────── */}
      <div className="px-4 -mt-2">
        <div className="bg-white rounded-2xl p-4 shadow-md">
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.key} className="rounded-xl p-3" style={{ backgroundColor: card.bg }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-gray-500 text-xs font-medium">{t(card.key)}</p>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: card.color + "22" }}>
                      <Icon size={14} color={card.color} />
                    </div>
                  </div>
                  <p className="font-bold text-base leading-tight" style={{ color: card.color }}>
                    {fmt(card.value)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Loans + Dealer */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl p-3 bg-gray-50">
              <p className="text-gray-400 text-xs mb-1">{t("pending_loans")}</p>
              <p className="font-bold text-sm text-gray-800">{fmt(pendingLoans)}</p>
            </div>
            <div className="rounded-xl p-3 bg-gray-50">
              <p className="text-gray-400 text-xs mb-1">{t("dealer_dues")}</p>
              <p className="font-bold text-sm text-gray-800">{fmt(dealerDues)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────── */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-gray-800 text-sm">{t("quick_actions")}</p>
          <button className="text-xs font-medium flex items-center gap-1" style={{ color: "#1B5E20" }}>
            {t("view_all")} <ChevronRight size={12} color="#1B5E20" />
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} href={action.href}>
                <div className="flex flex-col items-center gap-2 min-w-[72px]">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                    style={{ backgroundColor: action.bg }}
                  >
                    <Icon size={24} color={action.color} />
                  </div>
                  <p className="text-gray-700 text-xs font-medium text-center whitespace-nowrap">
                    {action.label}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Recent Transactions ───────────────────────────────── */}
      {recentLedger.length > 0 && (
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-gray-800 text-sm">Recent Transactions</p>
            <Link href="/ledger" className="text-xs font-medium flex items-center gap-1" style={{ color: "#1B5E20" }}>
              View all <ChevronRight size={12} color="#1B5E20" />
            </Link>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {recentLedger.map((entry, i) => {
              const isCredit = entry.type === "credit";
              const label = entry.categoryLabel || entry.category ||
                (entry.sourceType
                  ? entry.sourceType.charAt(0).toUpperCase() + entry.sourceType.slice(1)
                  : "Transaction");
              const fmtEntryDate = (dateStr: string) => {
                if (!dateStr) return "";
                const [, m, d] = dateStr.split("-");
                const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                return `${parseInt(d)} ${MONTHS_SHORT[parseInt(m) - 1]}`;
              };
              return (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < recentLedger.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: isCredit ? "#E8F5E9" : "#FFEBEE" }}>
                    {isCredit
                      ? <ArrowUpRight size={16} color="#1B5E20" />
                      : <ArrowDownRight size={16} color="#C62828" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 text-sm font-medium truncate">{label}</p>
                    <p className="text-gray-400 text-xs">{fmtEntryDate(entry.date)}</p>
                  </div>
                  <p className="font-bold text-sm shrink-0" style={{ color: isCredit ? "#1B5E20" : "#C62828" }}>
                    {isCredit ? "+" : "−"}{fmt(entry.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* ── Recent Activity ───────────────────────────────────── */}
      <div className="px-4 mt-4">
        <p className="font-bold text-gray-800 text-sm mb-3">{t("recent_activity")}</p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: "#E8F5E9" }}>
                <Wheat size={24} color="#1B5E20" />
              </div>
              <p className="text-gray-500 text-sm font-medium">{t("no_activity")}</p>
              <p className="text-gray-400 text-xs mt-1">{t("no_activity_sub")}</p>
            </div>
          ) : (
            recentActivity.map((item, i) => {
              const { icon: AIcon, color, bg, amtColor } = activityMeta(item.action);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < recentActivity.length - 1 ? "1px solid #F5F5F5" : "none" }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
                    <AIcon size={16} color={color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 text-sm font-medium truncate">
                      {(() => {
                        const a = item.action || "";
                        if (a.includes("EXPENSE")) return "Expense Added";
                        if (a.includes("INCOME")) return "Income Added";
                        if (a.includes("DEALER_PURCHASE")) return "Dealer Purchase";
                        if (a.includes("DEALER_PAYMENT")) return "Dealer Payment";
                        if (a.includes("INVENTORY")) return "Inventory Update";
                        if (a.includes("ATTENDANCE")) return "Attendance Marked";
                        return item.categoryLabel || item.category || a.replace(/_/g, " ") || "Activity";
                      })()}
                    </p>
                    <p className="text-gray-400 text-xs">{item.userName || "System"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {item.amount && (
                      <p className="text-sm font-bold" style={{ color: amtColor }}>
                        {fmt(item.amount)}
                      </p>
                    )}
                    <p className="text-gray-400 text-xs">{timeAgo(item.createdAt)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
