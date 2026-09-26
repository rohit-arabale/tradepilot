import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ShieldCheck,
  Navigation,
  ShieldAlert,
  Truck,
  Menu,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Shared pill navigation rendered above every protected route.
// One nav, one truth. Active link is derived from the URL.
// ─────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Inspect", path: "/inspect", icon: <ShieldCheck size={15} /> },
  { label: "Routes", path: "/routes", icon: <Navigation size={15} /> },
  { label: "Risk", path: "/risk", icon: <ShieldAlert size={15} /> },
  { label: "Fleet", path: "/fleet", icon: <Truck size={15} /> },
  { label: "Compliance", path: "/compliance", icon: <ShieldCheck size={15} /> },
];

function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const active = (path: string) =>
    path === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname.startsWith(path);

  return (
    <>
      <header className="relative z-20 px-4 pt-6">
        <nav className="relative mx-auto max-w-6xl bg-white border border-slate-200 rounded-full shadow-sm flex items-center pl-5 pr-3 py-2.5">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            aria-label="TradePilot home"
          >
            <span className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center text-white font-bold text-[10px] tracking-tight">
              TP
            </span>
            <span className="font-bold text-slate-900 tracking-tight text-base hidden sm:inline">
              TradePilot
            </span>
          </button>

          <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                onClick={() => navigate(item.path)}
                icon={item.icon}
                active={active(item.path)}
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <a
              href="https://github.com/rohit-arabale/tradepilot"
              target="_blank"
              rel="noreferrer"
              aria-label="View source on GitHub"
              className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            >
              <GitHubGlyph />
            </a>
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center"
            >
              <Menu size={18} className="text-slate-700" />
            </button>
          </div>
        </nav>
      </header>

      {mobileOpen && (
        <MobileNav
          onClose={() => setMobileOpen(false)}
          navigate={(p) => {
            setMobileOpen(false);
            navigate(p);
          }}
          activePath={location.pathname}
        />
      )}
    </>
  );
}

function NavLink({
  onClick,
  children,
  icon,
  active,
}: {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-sm font-medium px-3 py-2 rounded-full inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function MobileNav({
  onClose,
  navigate,
  activePath,
}: {
  onClose: () => void;
  navigate: (path: string) => void;
  activePath: string;
}) {
  const items = [
    ...NAV_ITEMS,
    { label: "Profile", path: "/profile", icon: <ShieldCheck size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute top-6 left-4 right-4 bg-white border border-slate-200 rounded-3xl shadow-sm p-4"
      >
        <div className="flex items-center justify-between mb-3 px-2">
          <span className="font-bold text-slate-900">Menu</span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center"
          >
            <X size={18} className="text-slate-700" />
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const isActive =
              item.path === "/dashboard"
                ? activePath === "/dashboard"
                : activePath.startsWith(item.path);
            return (
              <li key={item.path}>
                <button
                  onClick={() => navigate(item.path)}
                  className={`w-full text-left px-4 py-3 rounded-2xl inline-flex items-center gap-3 text-sm font-medium ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function GitHubGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.02c-3.2.69-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.73-1.53-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.05 11.05 0 015.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.83 1.18 3.09 0 4.44-2.7 5.41-5.27 5.69.41.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.55 4.57-1.52 7.86-5.83 7.86-10.91C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export default NavBar;
