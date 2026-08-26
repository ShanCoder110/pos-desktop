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
    <header className="mgmt-header [display:flex] [align-items:center] [justify-content:space-between] [gap:16px] [height:56px] [padding-top:0] [padding-bottom:0] [flex-shrink:0] [background:var(--paper)] [border-bottom:1px_solid_var(--line)] [padding-left:20px] [padding-right:20px]">
      <div>
        <h1 className="mgmt-header-title [font-size:16px] [font-weight:750] [letter-spacing:-0.02em] [color:var(--ink)] [line-height:1.2]">{meta.title}</h1>
        {meta.subtitle ? <p className="mgmt-header-sub [margin-top:2px] [font-size:12px] [font-weight:500] [color:var(--muted)]">{meta.subtitle}</p> : null}
      </div>
      <div className="mgmt-header-right [display:flex] [align-items:center] [gap:8px] [flex-shrink:0]" ref={wrapRef}>
        <select defaultValue="sh1" className="mgmt-branch [height:32px] [padding:0_10px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--bg)] [color:var(--ink)] [font-size:12px] [font-weight:600]" aria-label="Current branch">
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.isMain ? "Main Branch" : shop.name}
            </option>
          ))}
        </select>
        <span className="mgmt-chip [display:inline-flex] [align-items:center] [gap:6px] [height:32px] [padding:0_10px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [font-size:12px] [font-weight:600] [color:var(--sub)]">
          <span className="dot" />
          Synced
        </span>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="mgmt-icon-btn [position:relative] [width:32px] [height:32px] [display:grid] [place-items:center] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--sub)] [cursor:pointer]"
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
            <div className="mgmt-menu [position:absolute] [top:calc(100%_+_6px)] [right:0] [z-index:30] [width:260px] [padding:6px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] [box-shadow:var(--shadow)]">
              <button type="button" onClick={() => navigate(routes.productsLow)}>
                12 Low stock products
                <span className="mgmt-menu-note [font-size:11px] [font-weight:500] [color:var(--muted)]">Reorder</span>
              </button>
              <button type="button" onClick={() => navigate(routes.credit)}>
                Customer outstanding
                <span className="mgmt-menu-note [font-size:11px] [font-weight:500] [color:var(--muted)]">Rs 83,900</span>
              </button>
              <button type="button" onClick={() => navigate(routes.salesReturns)}>
                3 Pending returns
                <span className="mgmt-menu-note [font-size:11px] [font-weight:500] [color:var(--muted)]">Review</span>
              </button>
            </div>
          ) : null}
        </div>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="mgmt-avatar [width:26px] [height:26px] [border-radius:6px] [background:color-mix(in_srgb,_var(--accent)_22%,_transparent)] [color:#99f6e4] [display:grid] [place-items:center] [font-size:9px] [font-weight:800] [flex-shrink:0]"
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
            <div className="mgmt-menu [position:absolute] [top:calc(100%_+_6px)] [right:0] [z-index:30] [width:260px] [padding:6px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] [box-shadow:var(--shadow)]">
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
