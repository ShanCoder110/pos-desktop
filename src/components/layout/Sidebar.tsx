import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogOut, Monitor, Settings } from "lucide-react";
import posMark from "@/assets/auth/pos-mark.png";
import { useMgmtLayout } from "@/components/layout/MgmtLayoutContext";
import { useSession } from "@/shared/auth/session";
import { managementNav } from "@/shared/constants/nav";
import { routes } from "@/shared/constants/routes";
import { useSettings } from "@/shared/settings";

export function Sidebar() {
  const navigate = useNavigate();
  const { collapsed, toggle } = useMgmtLayout();
  const { logout } = useSession();
  const { settings } = useSettings();
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
    <aside className="mgmt-sidebar [display:flex] [flex-direction:column] [min-height:0] [min-width:0] [overflow:hidden] [background:var(--header)] [color:#94a3b8] [padding:8px_6px_8px]">
      <div className="mgmt-top [display:flex] [align-items:center] [gap:4px] [margin-bottom:8px] [min-width:0]">
        <div className="mgmt-brand [display:flex] [align-items:center] [gap:8px] [padding:0_4px] [min-width:0] [flex:1]">
          <img src={posMark} alt="" />
          <div className="mgmt-brand-copy [min-width:0] mgmt-label [overflow:hidden] [white-space:nowrap] [opacity:1] [max-width:150px] [transition:opacity_0.14s_ease,_max-width_0.2s_ease]">
            <p className="mgmt-brand-name [font-size:12px] [font-weight:800] [letter-spacing:-0.02em] [color:#fff] [white-space:nowrap] [overflow:hidden] [text-overflow:ellipsis]">
              {settings.shopName || "POS"}
            </p>
            <p className="mgmt-brand-tag [margin-top:1px] [font-size:9px] [font-weight:600] [color:#64748b] [letter-spacing:0.04em] [text-transform:uppercase]">
              Shop counter
            </p>
          </div>
        </div>
        <button
          type="button"
          className="mgmt-collapse [display:flex] [align-items:center] [justify-content:center] [width:24px] [height:24px] [flex-shrink:0] [border:0] [border-radius:6px] [background:transparent] [color:#64748b] [cursor:pointer]"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <button
        type="button"
        className="mgmt-open-pos [display:flex] [align-items:center] [justify-content:center] [gap:6px] [height:30px] [margin:0_2px_10px] [border:0] [border-radius:6px] [background:var(--accent)] [color:#fff] [font-size:11px] [font-weight:700] [cursor:pointer] [overflow:hidden]"
        onClick={() => navigate(routes.pos)}
        title="Open POS"
      >
        <Monitor size={14} strokeWidth={2} />
        <span className="mgmt-label [overflow:hidden] [white-space:nowrap] [opacity:1] [max-width:150px] [transition:opacity_0.14s_ease,_max-width_0.2s_ease]">
          Open POS
        </span>
      </button>

      <nav
        className="mgmt-nav [flex:1] [min-height:0] [overflow:hidden] [padding:0_2px_6px]"
        aria-label="Management"
      >
        {managementNav.map((group) => (
          <div key={group.label} className="mgmt-group [margin-bottom:8px]">
            <p className="mgmt-group-label [padding:0_6px_4px] [font-size:9px] [font-weight:700] [letter-spacing:0.12em] [color:#64748b] [overflow:hidden] [white-space:nowrap] [max-height:16px] [opacity:1] [transition:max-height_0.18s_ease,_opacity_0.16s_ease,_padding_0.18s_ease]">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === routes.dashboard}
                  title={item.label}
                  className={({ isActive }) =>
                    isActive
                      ? "mgmt-nav-item [display:flex] [align-items:center] [gap:8px] [height:28px] [padding:0_6px] [margin-bottom:1px] [border-radius:6px] [color:#94a3b8] [font-size:12px] [font-weight:550] [text-decoration:none] [white-space:nowrap] [overflow:hidden] is-active"
                      : "mgmt-nav-item [display:flex] [align-items:center] [gap:8px] [height:28px] [padding:0_6px] [margin-bottom:1px] [border-radius:6px] [color:#94a3b8] [font-size:12px] [font-weight:550] [text-decoration:none] [white-space:nowrap] [overflow:hidden]"
                  }
                >
                  <Icon size={14} strokeWidth={1.75} />
                  <span className="mgmt-label [overflow:hidden] [white-space:nowrap] [opacity:1] [max-width:150px] [transition:opacity_0.14s_ease,_max-width_0.2s_ease]">
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        className="mgmt-side-foot [position:relative] [display:flex] [flex-direction:column] [gap:4px] [padding:6px_2px_0] [border-top:1px_solid_rgba(255,_255,_255,_0.06)]"
        ref={footRef}
      >
        {menuOpen ? (
          <div className="mgmt-user-menu [position:absolute] [left:2px] [right:2px] [bottom:calc(100%_+_6px)] [z-index:20] [padding:4px] [border:1px_solid_rgba(255,_255,_255,_0.08)] [border-radius:8px] [background:#1e293b] [box-shadow:0_8px_20px_rgba(0,_0,_0,_0.28)]">
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
                void logout().then(() => navigate(routes.login));
              }}
            >
              <LogOut size={13} strokeWidth={1.8} />
              Logout
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className={
            menuOpen
              ? "mgmt-user [display:flex] [align-items:center] [gap:8px] [width:100%] [padding:6px] [border:0] [border-radius:6px] [background:transparent] [color:inherit] [text-align:left] [cursor:pointer] [overflow:hidden] is-open"
              : "mgmt-user [display:flex] [align-items:center] [gap:8px] [width:100%] [padding:6px] [border:0] [border-radius:6px] [background:transparent] [color:inherit] [text-align:left] [cursor:pointer] [overflow:hidden]"
          }
          onClick={() => setMenuOpen((v) => !v)}
          title="Shan Abbas"
        >
          <span className="mgmt-avatar [width:26px] [height:26px] [border-radius:6px] [background:color-mix(in_srgb,_var(--accent)_22%,_transparent)] [color:#99f6e4] [display:grid] [place-items:center] [font-size:9px] [font-weight:800] [flex-shrink:0]">
            SA
          </span>
          <span className="mgmt-user-copy mgmt-label [overflow:hidden] [white-space:nowrap] [opacity:1] [max-width:150px] [transition:opacity_0.14s_ease,_max-width_0.2s_ease]">
            <span className="mgmt-user-name [display:block] [font-size:12px] [font-weight:650] [color:#e2e8f0] [white-space:nowrap] [overflow:hidden] [text-overflow:ellipsis]">
              Shan Abbas
            </span>
            <span className="mgmt-user-role [display:block] [font-size:9px] [color:#64748b]">
              Owner
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
