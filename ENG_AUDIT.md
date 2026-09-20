# Engineering standards audit (2026-09-19)

Phased rollout — tooling scaffolded; full retrofit is follow-up. This lists current violations / gaps.

## Stock / FIFO audit (2026-09-19)

| Rule | Status |
|---|---|
| Opening qty per branch on product create (`openingStocks`) | ✅ |
| Lot receive split (`branchAllocations`) + session branch default | ✅ |
| POS sale: this-branch lot FIFO, then other branches (oldest lot, main first) | ✅ `stock_allocation.rs` |
| POS compact stock `here · total` (no lot numbers) | ✅ |
| POS / product list prices from **open** FIFO lot cost + unit M/W/R | ✅ cost from oldest remaining lot |
| Repair / production / replacement FIFO still **single branch** | 🟡 not using fallback |
| Unit tests for FIFO consume / split lots | 🔴 still missing |

## UI agent-mistakes audit (2026-09-19)

### Password eye toggle
| Location | Status |
|---|---|
| `LoginPage` | ✅ `PasswordInput` |
| `SetupPage` (password + confirm) | ✅ `PasswordInput` |
| `UserForm` | ✅ `PasswordInput` |
| Raw `type="password"` elsewhere | ✅ none left (and `TextInput type="password"` redirects to `PasswordInput`) |

### Duplicate components (shape reuse)
| Finding | Status |
|---|---|
| Shared shells (`Drawer`, `EntityDetailDrawer`, `Table`, `FormSection`, …) | ✅ already shared |
| `SuppliersPage` ≈ `CustomersPage` (~1.1k lines each, parallel edit/adjust/pay/detail) | 🔴 still twin pages — **follow-up**: extract shared party master page/forms (high blast radius; do as its own task) |
| Separate `SupplierEditForm` / `CustomerEditForm` in those pages | 🔴 same follow-up |

### Duplicate titles
| Finding | Status |
|---|---|
| Drawer title + inner form repeating the **same** string (e.g. “Add supplier” twice) | ✅ none found — inner sections use “Supplier details” / “User details” / field labels, not the action title |

### SKILL
`## Known agent mistakes — never repeat` added; extend the checklist when new mistakes are flagged.

## Type generation (ts-rs)

| Status | Notes |
|---|---|
| ✅ POC | Auth DTOs export to `src/types/generated/`; `auth.ts` imports generated types |
| 🔴 Rest of DTOs | Masters, products, sales, ledger, etc. still hand-typed in `src/services/*` |
| 🔴 CI | `npm run types:check` exists but not yet wired into GitHub Actions |

## Error handling

| Status | Notes |
|---|---|
| ✅ Shape | `AppError` → `{ code, message, details }` envelope |
| ✅ Codes | Stable `CODE_*` + `ConflictCoded`; phone duplicates map to specific codes |
| ✅ FE mapper | `ApiError` + `mapApiError` / `handleApiError`; `apiRequest` throws `ApiError` |
| 🔴 Call sites | Most pages still use ad-hoc `catch` + `shortError`; migrate to `handleApiError` opportunistically |
| 🔴 Empty catches | e.g. logout `catch {}` (intentional — commented); some `.catch(() => …)` swallowers on list loads |

## Testing

| Status | Notes |
|---|---|
| 🔴 Money/FIFO/ledger | No dedicated unit tests yet for FIFO consumption or balance math |
| 🔴 Concurrency | No concurrent lot/ledger tests |
| ✅ Migration smoke | In-memory SeaORM migration tests exist in `migration/mod.rs` |

## Lint / format / pre-commit

| Status | Notes |
|---|---|
| ✅ Scaffold | ESLint + Prettier + husky + lint-staged + `cargo fmt`/`clippy` scripts |
| ⚠️ First run | Expect many existing lint warnings until retrofit; `lint` is warn-friendly initially |
| 🔴 CI deny | `check:rust` uses `-D warnings` — may fail until clippy debt cleaned |

## Logging

| Status | Notes |
|---|---|
| ✅ Rust | `tracing` + `LOG_LEVEL` from Config in `api` bin |
| ✅ FE | `src/utils/logger.ts` gated by `VITE_LOG_LEVEL` |
| 🔴 Call sites | Many `console.log` / CLI `println!` in `db` bin (OK for CLI); UI pages may still use console |

## Performance / indexes

| Status | Notes |
|---|---|
| ✅ Added | `m20260920_000010` soft-delete filter indexes on suppliers/customers/products/users |
| 🔴 Audit | Ledger / stock movement list filters may need more composites as features land |
| ⚠️ N+1 | Review list endpoints that hydrate related rows in loops when touching those modules |

## Docs / git / deps

| Status | Notes |
|---|---|
| 🔴 Doc comments | Sparse `///` on public service methods |
| 🔴 Conventional commits | Not enforced yet (convention only in SKILL) |
| ✅ Deps | New crates (`ts-rs`) + npm lint tools added with justification in this task |

## Follow-ups (do not big-bang)

1. Expand ts-rs derives module-by-module (suppliers next).
2. Replace page-level error toasts with `handleApiError`.
3. Add FIFO + ledger math tests when next touching stock/credit.
4. Wire `npm run check` into CI.
5. Clippy clean-up pass so `-D warnings` stays green.
