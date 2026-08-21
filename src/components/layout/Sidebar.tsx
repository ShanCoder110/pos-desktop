import { NavLink, useNavigate } from "react-router-dom";
import { railNav } from "@/shared/constants/nav";

export function Sidebar() {
  const navigate = useNavigate();

  return (
    <nav className="sidenav" id="sideNav" aria-label="App menu">
      <div className="nav-brand" title="Back to register" onClick={() => navigate("/pos")}>
        POS
      </div>
      <div className="nav-main">
        {railNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              title={item.label}
              className={({ isActive }) => (isActive ? "is-active" : undefined)}
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
