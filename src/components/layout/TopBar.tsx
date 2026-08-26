import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut } from "lucide-react";
import { pageMeta } from "@/shared/constants/nav";
import { routes } from "@/shared/constants/routes";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { shops } from "@/shared/mock";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "S") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session, logout } = useSession();
  const meta = pageMeta[pathname] ?? { title: "POS" };
  const ownerName = session.owner
    ? `${session.owner.firstName} ${session.owner.lastName}`.trim()
    : "Staff";
  const [notesOpen, setNotesOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setNotesOpen(false);
        setUserOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="mgmt-header">
      <div>
        <h1 className="mgmt-header-title">{meta.title}</h1>
        {meta.subtitle ? <p className="mgmt-header-sub">{meta.subtitle}</p> : null}
      </div>
      <div className="mgmt-header-right" ref={wrapRef}>
        <select defaultValue="sh1" className="mgmt-branch" aria-label="Current branch">
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.isMain ? "Main Branch" : shop.name}
            </option>
          ))}
        </select>
        <span className="mgmt-chip">
          <span className="dot" />
          Synced
        </span>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="mgmt-icon-btn"
            aria-label="Notifications"
            onClick={() => {
              setNotesOpen((v) => !v);
              setUserOpen(false);
            }}
          >
            <Bell size={15} strokeWidth={1.8} />
            <span className="ping" />
          </button>
          {notesOpen ? (
            <div className="mgmt-menu">
              <button type="button" onClick={() => navigate(routes.productsLow)}>
                12 Low stock products
                <span className="mgmt-menu-note">Reorder</span>
              </button>
              <button type="button" onClick={() => navigate(routes.credit)}>
                Customer outstanding
                <span className="mgmt-menu-note">Rs 83,900</span>
              </button>
              <button type="button" onClick={() => navigate(routes.salesReturns)}>
                3 Pending returns
                <span className="mgmt-menu-note">Review</span>
              </button>
            </div>
          ) : null}
        </div>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="mgmt-avatar"
            style={{ cursor: "pointer", border: 0 }}
            aria-label="Profile"
            onClick={() => {
              setUserOpen((v) => !v);
              setNotesOpen(false);
            }}
          >
            {initials(ownerName)}
          </button>
          {AUTH_ENABLED && userOpen ? (
            <div className="mgmt-menu">
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate(routes.login);
                }}
              >
                Sign out
                <LogOut size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
