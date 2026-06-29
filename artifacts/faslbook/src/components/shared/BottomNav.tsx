import { Link, useLocation } from "wouter";
import { House, BookOpen, Warehouse, Handshake, Users } from "lucide-react";
import { useLangStore } from "@/store/langStore";

const ACTIVE_COLOR = "#1B5E20";
const INACTIVE_COLOR = "#9CA3AF";

export default function BottomNav() {
  const [pathname] = useLocation();
  const { t } = useLangStore();

  const navItems = [
    { href: "/overview",   labelKey: "home",   icon: House },
    { href: "/ledger",     labelKey: "khata",  icon: BookOpen },
    { href: "/inventory",  labelKey: "godown", icon: Warehouse },
    { href: "/dealers",    labelKey: "dealer", icon: Handshake },
    { href: "/workers",    labelKey: "team",   icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, labelKey, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors"
            >
              <Icon
                size={24}
                color={isActive ? ACTIVE_COLOR : INACTIVE_COLOR}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span className="font-medium" style={{ color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR }}>
                {t(labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
