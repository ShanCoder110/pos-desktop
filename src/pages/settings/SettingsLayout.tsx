import { NavLink, Outlet } from "react-router-dom";
import { SETTINGS_NAV } from "@/shared/constants/settings";
import { cn } from "@/utils/format";

export function SettingsLayout() {
  return (
    <div className="settings-hub">
      <aside className="settings-rail" aria-label="All settings">
        <p className="settings-rail-title">All settings</p>
        <nav className="settings-rail-nav">
          {SETTINGS_NAV.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn("settings-rail-item", isActive && "is-on")}
            >
              <item.icon size={16} strokeWidth={1.8} />
              <span>
                <strong>{item.label}</strong>
                <em>{item.hint}</em>
              </span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <Outlet />
    </div>
  );
}
