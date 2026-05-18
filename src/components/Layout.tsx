import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import clsx from "clsx";
import Logo from "./Logo";
import { localTimezoneLong } from "../lib/locking";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/picks", label: "My Picks" },
  { to: "/groups", label: "Groups" },
  { to: "/rules", label: "Rules" },
];

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/80 border-b border-ink-100">
        <div className="max-w-7xl mx-auto flex items-center gap-4 px-6 py-3">
          <button
            onClick={() => nav("/dashboard")}
            className="flex items-center gap-3 font-display tracking-tight overflow-visible"
          >
            {/* Full antenna mark: yellow chevron above, wordmark below.
                The chevron extends above the row baseline (decorative);
                the wordmark sits on the same baseline as "World Cup 2026"
                and the nav items thanks to the small upward translate. */}
            <Logo height={24} className="-translate-y-[3px] overflow-visible" />
            <span className="hidden sm:inline pl-3 ml-1 border-l border-ink-200 text-ink-700 font-semibold text-sm">
              World Cup 2026
            </span>
          </button>

          <nav className="ml-6 flex items-center gap-1">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  clsx("nav-link", isActive && "nav-link-active")
                }
              >
                {n.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  clsx("nav-link", isActive && "nav-link-active")
                }
              >
                Admin
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user?.photoURL && (
              <img
                src={user.photoURL}
                alt=""
                className="w-8 h-8 rounded-full border border-ink-200"
              />
            )}
            <div className="text-sm leading-tight">
              <div className="font-semibold">{user?.displayName}</div>
              <div className="text-ink-500 text-xs">{user?.email}</div>
            </div>
            <button onClick={logout} className="btn-ghost">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-8 text-xs text-ink-500 flex flex-wrap gap-3 justify-between">
        <span>antenna · World Cup 2026 Bracket · For internal use</span>
        <span>All times shown in your local timezone: {localTimezoneLong()}</span>
      </footer>
    </div>
  );
}
