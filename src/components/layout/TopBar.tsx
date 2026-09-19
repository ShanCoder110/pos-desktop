import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut } from "lucide-react";
import { productsHref } from "@/shared/constants/products";
import { pageMeta } from "@/shared/constants/nav";
import { routes } from "@/shared/constants/routes";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { ensureSession } from "@/services/auth";
import { listAllBranches, type BranchResponse } from "@/services/org";
import { isAbortError } from "@/utils/async";
import { SearchableSelect, Skeleton, ThemeToggle } from "@/components/common";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "S") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useSession();
  const meta = pageMeta[pathname] ?? { title: "POS" };
  const ownerName = user?.name?.trim() || "Staff";
  const [notesOpen, setNotesOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState({ branches: true });
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

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        await ensureSession();
        const rows = await listAllBranches(controller.signal).catch((error) => {
          if (isAbortError(error)) throw error;
          return [] as BranchResponse[];
        });
        const active = rows.filter((b) => b.isActive);
        setBranches(active);
        setBranchId(
          (current) => current || active.find((b) => b.isMain)?.id || active[0]?.id || "",
        );
      } catch (error) {
        if (isAbortError(error)) return;
      }
    })().finally(() => setLoading((current) => ({ ...current, branches: false })));
    return () => controller.abort();
  }, []);

  return (
    <header className="mgmt-header [display:flex] [align-items:center] [justify-content:space-between] [gap:16px] [height:56px] [padding-top:0] [padding-bottom:0] [flex-shrink:0] [background:var(--paper)] [border-bottom:1px_solid_var(--line)] [padding-left:20px] [padding-right:20px]">
      <div>
        <h1 className="mgmt-header-title [font-size:16px] [font-weight:750] [letter-spacing:-0.02em] [color:var(--ink)] [line-height:1.2]">
          {meta.title}
        </h1>
        {meta.subtitle ? (
          <p className="mgmt-header-sub [margin-top:2px] [font-size:12px] [font-weight:500] [color:var(--muted)]">
            {meta.subtitle}
          </p>
        ) : null}
      </div>
      <div
        className="mgmt-header-right [display:flex] [align-items:center] [gap:8px] [flex-shrink:0]"
        ref={wrapRef}
      >
        <ThemeToggle compact />
        {loading.branches ? (
          <Skeleton className="h-8 w-[126px] rounded-lg" />
        ) : branches.length ? (
          <SearchableSelect
            className="mgmt-branch"
            value={branchId}
            onChange={setBranchId}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.isMain ? "Main Branch" : branch.name,
            }))}
            searchable={false}
            clearable={false}
            placeholder="Branch"
            name="current-branch"
          />
        ) : (
          <span className="mgmt-branch grid h-8 place-items-center rounded-lg border border-line bg-bg px-3 text-[12px] font-semibold text-muted">
            No branch
          </span>
        )}
        <span className="mgmt-chip [display:inline-flex] [align-items:center] [gap:6px] [height:32px] [padding:0_10px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [font-size:12px] [font-weight:600] [color:var(--sub)]">
          <span className="dot" />
          Synced
        </span>
        <div className="relative">
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
              <button type="button" onClick={() => navigate(productsHref("low"))}>
                Low stock products
                <span className="mgmt-menu-note [font-size:11px] [font-weight:500] [color:var(--muted)]">
                  Reorder
                </span>
              </button>
              <button type="button" onClick={() => navigate(routes.credit)}>
                Customer outstanding
                <span className="mgmt-menu-note [font-size:11px] [font-weight:500] [color:var(--muted)]">
                  Balance
                </span>
              </button>
              <button type="button" onClick={() => navigate(routes.salesReturns)}>
                Pending returns
                <span className="mgmt-menu-note [font-size:11px] [font-weight:500] [color:var(--muted)]">
                  Review
                </span>
              </button>
            </div>
          ) : null}
        </div>
        <div className="relative">
          <button
            type="button"
            className="mgmt-avatar [width:26px] [height:26px] [border-radius:6px] [background:color-mix(in_srgb,var(--accent)_22%,transparent)] [color:var(--accent-deep)] [display:grid] [place-items:center] [font-size:9px] [font-weight:800] [flex-shrink:0] [border:0] [cursor:pointer]"
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
                  void logout().then(() => navigate(routes.login));
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
