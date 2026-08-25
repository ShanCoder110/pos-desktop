import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogOut, Monitor, Settings } from "lucide-react";
import posMark from "@/assets/auth/pos-mark.png";
import { useMgmtLayout } from "@/components/layout/MgmtLayoutContext";
import { useSession } from "@/shared/auth/session";
import { managementNav } from "@/shared/constants/nav";
import { routes } from "@/shared/constants/routes";

export function Sidebar() {
  const navigate = useNavigate();
  const { collapsed, toggle } = useMgmtLayout();
  const { logout } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const footRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!footRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <aside className="mgmt-sidebar">
      <div className="mgmt-top">
        <div className="mgmt-brand">
          <img src={posMark} alt="" />
          <div className="mgmt-brand-copy mgmt-label">
            <p className="mgmt-brand-name">POS</p>
            <p className="mgmt-brand-tag">Shop counter</p>
          </div>
        </div>
        <button
          type="button"
          className="mgmt-collapse"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <button type="button" className="mgmt-open-pos" onClick={() => navigate(routes.pos)} title="Open POS">
        <Monitor size={14} strokeWidth={2} />
        <span className="mgmt-label">Open POS</span>
      </button>

      <nav className="mgmt-nav" aria-label="Management">
        {managementNav.map((group) => (
          <div key={group.label} className="mgmt-group">
            <p className="mgmt-group-label">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === routes.dashboard}
                  title={item.label}
                  className={({ isActive }) => (isActive ? "mgmt-nav-item is-active" : "mgmt-nav-item")}
                >
                  <Icon size={14} strokeWidth={1.75} />
                  <span className="mgmt-label">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mgmt-side-foot" ref={footRef}>
        {menuOpen ? (
          <div className="mgmt-user-menu">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                navigate(routes.settings);
              }}
            >
              <Settings size={13} strokeWidth={1.8} />
              Settings
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                logout();
                navigate(routes.login);
              }}
            >
              <LogOut size={13} strokeWidth={1.8} />
              Logout
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className={menuOpen ? "mgmt-user is-open" : "mgmt-user"}
          onClick={() => setMenuOpen((v) => !v)}
          title="Shan Abbas"
        >
          <span className="mgmt-avatar">SA</span>
          <span className="mgmt-user-copy mgmt-label">
            <span className="mgmt-user-name">Shan Abbas</span>
            <span className="mgmt-user-role">Owner</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
