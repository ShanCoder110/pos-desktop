---
name: tauri-app-standards
description: >-
  Use this skill whenever building, editing, or reviewing features in this Tauri
  desktop app (React frontend + Rust/Axum backend). Trigger it for ANY frontend
  work (new pages, drawers, tables, forms, loading states, components) and ANY
  backend work (handlers, repositories, migrations, pagination/filtering). Always
  consult this before writing code — it defines the operating protocol (impact
  search before edits), folder structure, toasts, field-sync, and living docs
  (docs/STATUS.md, BACKEND.md, FRONTEND.md, FLOWS.md, CHANGELOG.md).
---

# Tauri App Standards

Project-specific conventions for this Tauri desktop app (React/TS frontend + Rust backend). The goal: consistent structure, no duplicated logic, no over-fetching, and frontend/backend that never drift out of sync.

**Read this skill before writing code.** Follow **Agent operating protocol** on every task. Slot work into the folders below. Do not invent parallel trees (`src/lib/api`, `src/components/modal`, `src-tauri/src/commands`, etc.). Prefer finishing correctly and consistently over finishing fast; if that tradeoff appears, state it.

## 0. This repo (map generic names here)

This app is Tauri 2 + Vite React 19 + Axum REST (not `#[tauri::command]` IPC for business data). Local SQLite is one shop. FIFO stock via lots.

| Generic name in older drafts | **Use this instead** |
|---|---|
| `src/components/modal/` | `src/components/common/modals/` (`Modal`, `ConfirmDialog`) |
| `src/components/table/` | `src/components/common/Table.tsx` (`Table`, `THead`, `Th`, `Td`, `Pagination`) |
| `src/components/skeleton/` | `src/components/common/Skeleton.tsx` + `*Skeleton` next to the page/modal |
| `src/components/pages/` | `src/pages/` |
| `src/lib/api/` | `src/services/` (`api.ts` + one file per domain) |
| `src/lib/utils/` | `src/utils/` |
| `src/constants/` | `src/shared/constants/` |
| `src/styles/` | `src/index.css` + `src/shared/constants/theme.ts` |
| `#[tauri::command]` | Axum `handlers/` at `http://127.0.0.1:38472/api/v1` |
| `src-tauri/src/db/models` | `src-tauri/src/backend/entities/` |
| `src-tauri/src/db/queries` | `src-tauri/src/backend/repositories/` |
| `src-tauri/src/db/migrations` | `src-tauri/src/backend/migration/` |

Local run: `npm run dev` is Vite only (`http://localhost:1420`). Start the API in another terminal with `npm run backend` (Cargo from `~/.cargo/bin`). `npm run tauri dev` starts the API inside the desktop app (app-data SQLite). **No seed owner** — first launch goes through onboarding (`/setup`); login uses the owner email + password from that flow.

Do **not** restyle cashier POS (`src/pages/pos/PosPage.tsx`) or the catalog look of `LotForm` / `ProductForm`. Drawers use `src/components/common/Drawer.tsx` with constrained sizes (`sm`/`md`/`lg`/`xl`), not full-width panels.

## 0.1 Party balance wording (mandatory)

Use the **same English balance vocabulary** everywhere in UI copy, toasts, table headers, filters, nav subtitles, receipts, and constants. Do **not** mix regional terms (`khata`, `udhaar`, etc.) with `balance` on different screens.

| UI concept | Wording |
|---|---|
| Column / field for running amount | **Balance** |
| Amount at create | **Opening balance** |
| Manual correction drawer | **Adjust balance** |
| Success toast after adjust | **Balance adjusted** |
| Zero amount | **Settled** or **Zero balance** |
| Customer positive balance | **Owes** (customer owes the shop) |
| Customer negative balance | **Advance** |
| Supplier positive balance | **Payable** (shop owes supplier) |
| Supplier negative balance | **Advance** |
| Ledger list footer column | **Balance after** |
| Receipt prior / new amount | **Previous balance** / **Balance after** |

**Examples (good):** `"Balance"`, `"Opening balance"`, `"Adjust balance"`, `"Current balance"`, `"Largest balances"`, `"Customer credit"` (page title for the credit hub).

**Examples (avoid in UI):** `"Khata"`, `"Opening khata"`, `"Adjust khata"`, `"On udhaar"`, `"Open khata"`.

Put strings in `src/shared/constants/*` (`CUSTOMER_COPY`, `SUPPLIER_COPY`, `CREDIT_COPY`, `nav.ts`, …) — not inline on pages. Suppliers and customers must mirror each other (same verbs/nouns; only the **direction labels** differ: Payable vs Owes).

Backend code comments may say “ledger”; API/DB field names stay `balance`, `balance_after`, `previous_balance`.

## Agent operating protocol

How to work on this repo. Applies on top of every feature request. This app is **Axum REST + SeaORM SQL + SQLite**, not sqlx `query!` and not Tauri `invoke` — search those real layers.

### 1. Before touching code: find every place a change touches

Biggest failure mode: a field/behavior is updated in one file and missed in the other three that use the same data.

1. **Search the whole repo first** for the entity/field/table — not only the file named in the request.

   | Layer | Search here |
   |---|---|
   | Schema | `src-tauri/src/backend/migration/*.sql`, then new migration if the column changes |
   | SQL / rows | `repositories/` (`Statement` SQL, column lists), `entities/` if used |
   | API shape | `dto/` (`camelCase`), `handlers/`, `services/`, `constants.rs` (routes + `ERROR_*`) |
   | HTTP client | `src/services/*`, `src/shared/constants/api.ts` |
   | UI | pages, `ProductForm` / drawers, table column lists, filters, exports, POS if the entity is sold/stocked |
   | Types / copy | `src/shared/types`, `src/shared/domain`, `src/shared/constants/*` |
   | Validation | `src/validations/` + barrel `index.ts` |
   | Docs | `docs/FLOWS.md` plus the module in BACKEND/FRONTEND |

2. Write a short **impact list** before coding: *"Adding field X to Product affects: ProductForm, ProductsPage columns, productPayload.ts, ProductRequest DTO, products repository INSERT/SELECT, POS card, CSV export."*
3. If the change spans more than ~2 files and is non-trivial, **show the impact list before editing**. Small obvious changes: skip the pause, still hit every location.
4. After finishing, **re-run the same search** for the old name/shape. A leftover reference is a bug.

If a field/model appears in more than one file, update **all** of them unless the user says otherwise.

Treat the request as the **concept**, not the one file named. “Add discount on product” means create, edit, display, price, export, and POS if price is shown there.

If a similar field already exists (e.g. money on invoices → `MoneyInput` + scale-2 in the service), **match that convention**. Do not invent a parallel pattern.

If the work implies a related surface the user did not name (e.g. branch stock also shows on POS), **flag it in one sentence** — updated vs left alone — do not silently expand or silently skip.

### 2. Ambiguity — ask or assume, don't stall

- Architecture / data shape / who owns a module / permissions → **one focused question** before building.
- Cheap to reverse (label, spacing) → pick a reasonable default, note the assumption, continue.
- About to invent unspecified behavior (default value, sort, role rule) → say so in the summary; do not hide the decision.

### 3. UI: existing system first; visual tools only when asked

- Reuse `src/components/common/` (Drawer, Table, Menu 3-dots, fields, toasts, theme tokens). Do not invent new chrome unprompted.
- Do **not** restyle `PosPage`, `LotForm`, or `ProductForm` catalog look unless asked.
- Browser / screenshot / inspiration tools **only** when the user asks for a visual pass (“make this look better”, “design a dashboard”). Ordinary CRUD: no visual-tool detour.
- When they do ask for UI: (1) extend an existing component first, (2) say what you looked at if you used a visual tool, (3) tokens only — no hardcoded hex.

### 4. Self-verification before “done”

Do not report complete until these were actually checked:

- [ ] Compiles: `npm run build` (tsc) and/or `~/.cargo/bin/cargo check` in `src-tauri` when Rust changed — run it, don't guess
- [ ] **Backend boots:** `npm run backend` starts without migration/runtime errors and logs `backend API listening` (or `curl` `/api/v1/health` / `/api/v1/auth/status`). If a migration failed earlier, fix idempotency and re-run — never leave the API in a crash loop.
- [ ] **User flow in the running app:** navigate to the changed screen the way a user would (sidebar click, not only a hard refresh). Confirm data appears on **first** visit. React Strict Mode remounts in `npm run dev` — aborted fetches must not empty the page or log the user out.
- [ ] Re-grepped old field/name; no stale references
- [ ] TS payload/response matches Rust DTO `camelCase` (§3 field-sync) — services, not ad-hoc `fetch` in pages
- [ ] Every form, table, detail, filter, export, POS/receipt surface that showed the old data now handles the new data
- [ ] Soft-delete + Trash, immutable ledger, FIFO lots, session-stamped actor — followed, not shortcut
- [ ] Visual change: dark-mode hover/focus still readable (`var(--ink)` on `var(--paper)`)
- [ ] Living docs updated (protocol below)

If a box is unchecked, the task is not done — say so.

### 5. Task report (short, factual)

1. **What changed** — file list, one line each
2. **Impact list actually touched** (proves the search happened)
3. **Assumptions** and any related-but-unrequested surface (updated vs left)
4. **Verification checklist** — explicit yes/no per box
5. **Docs** — which of BACKEND / FRONTEND / FLOWS / STATUS / CHANGELOG were updated

If uncertain (stock/ledger transaction, migration on existing DB), say so and say how to verify. Never claim tests ran if they didn't. Prefer smaller diffs; pause between unrelated modules.

### 6. Hard rules (flag before violating)

- Soft delete via `deleted_at` + Trash — no hard delete of party/catalog rows that have a trash path
- Ledger is immutable; never a bare editable running balance column
- Frontend validation in `src/validations/`, not duplicated inline
- Add/Edit = Drawer; row actions = `Menu` 3-dots
- Dark-mode contrast on anything visual
- Field-sync: DTO ↔ `src/services` payload exact
- Docs protocol every task

## 1. Frontend structure

All new frontend code must slot into this existing structure — do not invent parallel folders.

```
src/
├── components/
│   ├── common/           # Button, Table, Badge, Skeleton, Drawer, fields, …
│   │   └── modals/       # Modal, ConfirmDialog
│   ├── layout/           # AppLayout, Sidebar, TopBar — shell, not page UI
│   ├── print/            # PrintPreview
│   └── ui/               # legacy chrome; prefer common/ for new work
├── pages/                # route screens (one folder per area)
├── services/             # all HTTP — api.ts + auth, products, masters, …
├── hooks/                # custom hooks (useX)
├── utils/                # pure helpers (format, lots, export)
└── shared/
    ├── constants/        # routes, copy, enums, page size, theme token names
    └── domain/           # shared TS types
```

Rules:
- **Reuse before creating.** Before writing a new component, check `src/components/common/` (including `modals/` and `Table`) for something that already does the job or can be extended with props. Don't fork a near-duplicate. Export new shared pieces from `src/components/common/index.ts`.
- **No hardcoded colors.** Every color must come from the global theme (`src/shared/constants/theme.ts` and `src/index.css`): Tailwind `text-ink`, `bg-paper`, `border-line`, `text-muted`, `text-danger`, `bg-accent`, or `var(--ink)` / `var(--line)` — never a raw hex/rgb value inline.
- **No magic strings/numbers.** Anything reused (status values, roles, route paths, page sizes) belongs in `src/shared/constants/`, imported from there — not retyped inline. Page size: `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` from `src/shared/constants/config.ts`.
- **API calls only in `src/services/`.** Components/hooks call functions from `src/services/*`, never `fetch`/`invoke` directly inline in a component. Shared client: `apiRequest` in `src/services/api.ts`. Route paths: `src/shared/constants/api.ts`.
- **Business/formatting logic in `src/utils/`**, not duplicated inside components.
- **Reusable stateful logic goes in `src/hooks/`** (e.g. list + pagination), not copy-pasted across pages.
- **Placeholders** on inputs (e.g. "Enter name"). Copy lives in `src/shared/constants/*`.
- **Toasts and errors** follow **Toast and error handling** below. Never invent a second toast system.

### Toast and error handling (mandatory)

Use `toaster` from `@/components/common` (`success` / `error` / `warn` / `info`). Keep every toast **short** — about one line, ~6–12 words, no stack traces, no JSON, no `error.code`, no validation dump.

**Copy**
- Success: what happened. `"Customer saved"`, `"Payment recorded"`.
- Error: what the user can do or what blocked them. `"Enter a name"`, `"Phone already used"`, `"Backend unavailable"`.
- Put strings in `src/shared/constants/*` (`CUSTOMER_COPY.saved`), not inline except a one-off.
- Prefer the API’s `error.message` when it is already short and user-facing. If it is long, technical, or empty, fall back to the short constant.

```ts
try {
  await createMasterRecord("customers", payload);
  toaster.success(CUSTOMER_COPY.saved);
} catch (error) {
  toaster.error(shortError(error, CUSTOMER_COPY.saveFailed));
}
```

`shortError`: `error instanceof Error && error.message.trim() ? error.message.trim() : fallback`. Do not toast `String(error)` or Axum’s raw body.

**Handling (frontend)**
- Catch at the action (save/delete/pay), not an empty `catch {}`.
- Disable the button via the loading object while in flight; always `finally` clear loading.
- Validate required fields first (`if (!name.trim()) { toaster.error(COPY.nameRequired); return; }`) — do not hit the API.
- List/load failures: skeleton or empty state, optional one error toast — do not crash the page.
- `apiRequest` already maps network failure → `API_ERRORS.backendUnavailable` and HTTP → `error.message`. Do not `fetch` in pages.
- No `console.error` as the only handling. No `alert()`.

**Handling (backend)**
- Return `AppError` (`Validation` / `NotFound` / `Conflict` / …) with a **short** string in `backend/constants.rs` (`ERROR_DUPLICATE_CUSTOMER_PHONE`).
- Map unique constraints and validation to those messages — never leak SQL, SeaORM, or panic text to the client.
- Log technical detail with `tracing`; the JSON envelope `error.message` stays shop-floor readable.
- Empty optional strings → `None` before validate. Unknown JSON → 422 with a short parse message, not a 500.

### Skeleton rule (mandatory)
Every time a **modal** or **page** component is created, a matching skeleton must also be created, named to match (e.g. `CustomersPage.tsx` → skeleton usage with `Skeleton` / `TableRowsSkeleton`, or `CustomersPageSkeleton.tsx` next to the page). Prefer extending `src/components/common/Skeleton.tsx` rather than a new skeleton folder. The skeleton should mirror the real layout's shape (same rough dimensions/structure) so there's no layout shift when real content loads in.

### Loading state rule (mandatory)
If a page/component has **more than one** async operation that can be loading independently (e.g. fetching list + saving + deleting + exporting), do NOT use separate `useState(false)` booleans for each. Use a single loading object:

```ts
const [loading, setLoading] = useState({
  fetching: false,
  saving: false,
  deleting: false,
  exporting: false,
});

setLoading(prev => ({ ...prev, saving: true }));
```

Only use a single plain boolean when there is truly one async action on that screen.

### No page-level scroll
This is a desktop app — the outer app shell must never scroll. Layouts should be built with fixed-height flex/grid containers (`h-screen`, `flex-col`, `overflow-hidden` on the shell) and only the *inner* content region (e.g. a table body) gets its own `overflow-y-auto`. When adding a new page or modal, check that it fits this pattern instead of letting `<body>`/root scroll. New pages typically use `flex min-h-0 flex-1 flex-col overflow-auto` **inside** the shell content pane, not on `document`.

## 2. Backend structure (Rust / Tauri)

Organize by responsibility, not by dumping everything in one file. Target shape:

```
src-tauri/src/
├── lib.rs                 # starts Axum in Tauri setup
├── bin/
│   ├── api.rs             # browser/Vite loopback server
│   └── db.rs              # migrate / seed / status / new
└── backend/
    ├── handlers/          # Axum extract + status codes — thin
    ├── services/          # validation + business rules
    ├── repositories/      # SQL / SeaORM only
    ├── dto/               # camelCase request/response
    ├── entities/          # SeaORM models
    ├── migration/         # sequential SeaORM migrations + SQL
    ├── errors.rs          # AppError → JSON envelope
    ├── constants.rs       # routes, limits, error strings
    ├── db.rs              # connect, pragmas, Migrator::up
    └── server.rs          # route table + CORS
```

Rules:
- **Handlers stay thin.** An Axum handler should extract input, call a service function, and return a DTO — no raw SQL or heavy logic inline in the handler.
- **Pagination and filtering happen in the query layer, in Rust/SQL — never in the frontend.** A list endpoint takes `page`, `page_size` (see `PageQuery` in `dto/common.rs`), and filter params, and returns only that page's rows plus meta (`totalItems`, `totalPages`, …). Never return the full table and filter/paginate client-side. Hard max page size is `MAX_PAGE_SIZE` (100).
- **Return only the fields the frontend actually needs.** Don't `SELECT *` and don't add fields to a DTO "just in case." If a screen needs 4 fields, the query/DTO should have those 4 fields, not the whole row.
- **Minimize number of endpoints.** If a screen needs several related pieces of data that are always fetched together, prefer one combined route over several small ones the frontend has to call and coordinate.
- **SQLite TEXT timestamps** as RFC 3339; UUIDs match SeaORM blob storage used in seed SQL. Unique indexes (e.g. customer phone) must map to a clear conflict message.
- **Empty optional strings** deserialize as `None` (do not fail `#[validate(email)]` on `""`).

### Migrations rule (mandatory)
Never edit an existing/already-applied migration. Any schema change (add/remove/rename a column or table) = a **new** migration file, sequentially numbered, with a clear name (e.g. `m20260910_000005_remove_customer_notes.rs` + `.sql`). Migrations should be additive/forward-only.

Scaffold with `npm run db:new -- snake_case_name`, then register in `src-tauri/src/backend/migration/mod.rs`. Apply with `npm run db:migrate`. Do not rewrite `m20260907_000001_initial` or other applied files.

## 3. Frontend ↔ backend sync rule (mandatory)

When a field is added, renamed, or removed on the frontend (a form field, a table column, a filter), the following must all be updated together — this is not optional and not "later":

1. Rust DB model/entity struct (`backend/entities/`)
2. The relevant query (SELECT/INSERT/UPDATE list of columns in `repositories/`)
3. The DTO struct sent over the HTTP API (`backend/dto/`, camelCase)
4. A new migration if the DB column itself is added/removed/renamed
5. The handler, if its input/output shape changed
6. Any `src/services/*` TS function whose payload/response shape changed
7. Any `src/shared/constants/` and `src/shared/domain/types.ts` entries tied to that field

Never leave a field alive in the DB/backend after it's been removed from the UI, and never add a frontend field that has nowhere to persist on the backend.

Domain notes for this shop POS: local SQLite = one shop; walk-in customers do not get a balance/ledger; FIFO via lots; actor stamped from session, never from JSON `createdBy`. Living index: `docs/STATUS.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`. `src-tauri/BACKEND.md` is a pointer only. Ledger lines are immutable; soft delete is `deleted_at` + Trash (`suppliers` / `customers` / `users` today). Add/edit in Drawers; row actions in 3-dots `Menu`; dark-mode hover must stay readable (`var(--ink)` on `var(--paper)`).

## 4. Frontend validation (`src/validations/`)

- One file per entity: `supplier.validation.ts`, `customer.validation.ts`, `user.validation.ts`, …
- Shared helpers in `primitives.ts` (phone, money, required, notes).
- Barrel export from `src/validations/index.ts`.
- Wire schemas into `react-hook-form` `validate` / `rules` — do not duplicate inline in pages.
- Backend validates independently (`AppError::Validation` / `Conflict` with short copy in `constants.rs`).

## 5. Post-implementation checklist

After implementing any feature, explicitly verify (state this out loud / walk through it, don't just assume):

- [ ] Frontend: reused existing `common/` (modals, Table, fields, Drawer) where possible (no needless duplicates)
- [ ] Frontend: matching skeleton created for any new modal/page
- [ ] Frontend: loading state uses an object if more than one async action exists on the screen
- [ ] Frontend: no hardcoded colors (theme tokens only) and no magic strings (constants only)
- [ ] Frontend: toasts are short; errors caught with a user-facing fallback (no empty catch, no raw dumps)
- [ ] Backend: AppError messages are short and mapped (no SQL/internal text in the API envelope)
- [ ] Frontend: no new page-level scroll introduced
- [ ] Backend: pagination/filtering (if any) is implemented server-side, not client-side
- [ ] Backend: query/DTO returns only needed fields, no over-fetching
- [ ] Backend: if schema changed, a new migration was added (old ones untouched)
- [ ] Backend/Frontend: any field removed/renamed on one side is removed/renamed on the other side (entity, query, DTO, TS types, constants)
- [ ] Endpoint count wasn't needlessly increased — combined calls where reasonable
- [ ] UI changes verified in the browser (or Vite at `:1420` with API on `:38472`) — not screenshot-only
- [ ] Did not restyle `PosPage` / `LotForm` / `ProductForm` catalog chrome unless the user asked
- [ ] Re-grepped the old field/name across the repo; no leftovers
- [ ] `docs/BACKEND.md` / `docs/FRONTEND.md` / `docs/FLOWS.md` / `docs/STATUS.md` / `docs/CHANGELOG.md` updated for this task
- [ ] If a new env var was introduced: `.env.example` updated in the **same** task (and this skill’s Environment section if the convention changed)

## Environment & Secrets (standing)

Secrets, TTLs, and machine-specific values are **never hardcoded**. Living key list: **`.env.example`** (committed). Real values live in **`.env`** (gitignored).

- Load once at process start into `src-tauri/src/backend/config.rs` (`Config::load` / `Config::get`). No scattered `std::env::var` at call sites. Missing/invalid required vars → **fail fast** at boot with the variable name.
- Durations are human strings (`15m`, `7d`) parsed in `Config` — not magic numbers in services.
- Auth today uses **opaque hashed tokens** (not JWT). TTLs: `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY`. If JWT is added later, use **separate** access/refresh signing secrets — never reuse one secret; never ship a fallback default secret.
- Refresh tokens are **rotated on use** (already implemented).
- `VITE_*` values are **public** (client bundle). Never put signing keys or `SUPABASE_SERVICE_ROLE_KEY` in Vite env. Cloud vars (`SUPABASE_*`) are required only when `CLOUD_SYNC_ENABLED=true`.
- New env var = update `.env.example` in the same PR/task. Never commit `.env`. If a secret was ever committed to git history, treat it as **compromised** and rotate — deleting the file later is not enough.

## Frontend structure conventions (standing)

- **Strings:** all user-facing copy (labels, empty states, toasts, errors, validation) lives under `src/shared/constants/` (domain files like `staff.ts`, `auth.ts`, …). Do **not** invent a parallel `src/constants/strings/` tree. Never pass raw string literals to `toaster.*` / JSX labels in new code — add a constant first.
- **Pages orchestrate:** page files compose hooks + child components. Extract drawers/tables/filters into `pages/<module>/components/` and data hooks into `pages/<module>/hooks/` when the page is hard to scan in one screen.
- **Utils:** generic helpers go in `src/utils/` (check before inventing a one-off).
- **UI state:** prefer one discriminated object (`src/shared/types/ui-state.ts` — `LoadingState`, `DrawerState`) over N booleans (`isOpen` + `selectedId` + `isLoading` + `error`). If TanStack Query (or similar) already owns async status, use that — don’t wrap it in a second loading object.
- **Theme:** one theme/token source (`src/shared/constants/theme.ts` + CSS vars). No local `isDark` props threaded through components.
- **Rollout:** all **new** code follows this. Existing pages: retrofit when you already touch that module — no big-bang rewrite required.

## Engineering standards (standing)

How the codebase stays trustworthy as it grows. Living audit of current gaps: `ENG_AUDIT.md`.

- **Type generation:** `ts-rs` on Axum DTOs → `src/types/generated/` (never hand-edit). POC: auth module. Regenerate with `npm run types:generate`; CI/local zero-diff via `npm run types:check`. Frontend services import generated types — do not duplicate shapes. (Not specta/`invoke` — this app’s business API is Axum REST.)
- **Errors:** Rust `thiserror` + `AppError` serialized as `{ code, message, details }`. Prefer stable `CODE_*` / `ConflictCoded` for FE matching. Frontend: throw/catch `ApiError`, map via `mapApiError` / `handleApiError` + `src/shared/constants/errors.ts`. Never swallow errors silently without a reason comment.
- **Testing:** always cover money/ledger math, FIFO stock, auth/token logic, tenant scoping (when multi-tenant lands), and concurrency-sensitive writes. Skip exhaustive tests for pure CRUD passthrough and presentational UI. Prefer SeaORM in-memory / transaction tests over polluting the dev DB.
- **Lint/format:** `rustfmt` + `clippy` (`npm run check:rust`); ESLint + Prettier (`npm run lint` / `npm run format`). Pre-commit: husky + lint-staged (+ `cargo check`). Full gate: `npm run check`.
- **Logging:** Rust `tracing` leveled by `LOG_LEVEL`; frontend `logger` from `src/utils/logger.ts` gated by `VITE_LOG_LEVEL`. No secrets/PII at `info`. Prefer identifiers over full payloads.
- **Perf/DB:** index every filtered column (esp. `deleted_at`, FKs); no N+1; paginate all growable lists; batch SQLite writes in transactions for FIFO/ledger batches.
- **Docs:** `///` on public/non-obvious Rust commands/business rules; JSDoc on shared hooks/utils. Prefer clear names over comments that restate the obvious.
- **Git:** conventional commits (`feat:`, `fix:`, …); one logical change per commit; **never edit an applied migration** — always add a new one.
- **Dependencies:** check existing crates/packages first; new deps need explicit user confirmation (bundle size + supply-chain risk).

### Commands (run the same ones every time)

```bash
npm run types:generate   # regenerate src/types/generated from Rust DTOs
npm run types:check      # fail if generated types drift
npm run lint             # ESLint
npm run format           # Prettier write
npm run check:rust       # cargo fmt --check + clippy -D warnings
npm run check            # types + format + lint + rust
```

## Known agent mistakes — never repeat

Hard rules from mistakes already made in this project. Before marking any UI task done, re-check this list line by line. An unchecked item means the task is incomplete.

### 1. Password fields must always have a show/hide (eye) icon

- Every password field (login, setup, create user, change password, reset) must use the shared **`PasswordInput`** from `@/components/common` / `@/components/common/fields`.
- Never hand-roll `<input type="password">` or `TextInput type="password"` as a one-off — `TextInput` already redirects `type="password"` to `PasswordInput`, but call sites should prefer `PasswordInput` explicitly.
- Before done: visually confirm the eye toggle is present and switches visibility.

### 2. Never create a new component when an existing one can be made conditional

Biggest recurring failure: `SupplierX` / `CustomerX` / `UserX` near-duplicates instead of one configurable component.

- Before creating any drawer/table/form/detail panel/filter bar/totals row/empty state/confirm modal/3-dots menu: **search** for an existing component with the same *shape*, even if named for another entity.
- If found: generalize with props/config/children. Do not copy-paste into a new file.
- Prefer shared shells already in the repo: `Drawer`, `EntityDetailDrawer`, `Table` + column config, `FormSection`, `EmptyState`, `ConfirmDialog`, `Menu`.
- Default to generalizing when unsure. Slightly-too-flexible shared code beats three diverging copies.
- In the task report, state what you **reused** vs **created new**.

### 3. Never duplicate a title/heading

- Drawer/modal/dialog owns **exactly one** title (the shell’s `title` prop).
- Content inside must not repeat that same string as a card/section/page heading.
- If a form is used both nested and standalone, make its heading optional (`showTitle` / omit `FormSection` title when the drawer already titles the action).
- Before adding any heading: check the visual container (drawer header, page head, card header) so you are not restating the same text.

### 4. Root cause (apply every time)

1. Search for something that already does this job (or is structurally close).
2. If found → extend/configure. If not → build it once, generically.
3. Before done, visually check the rendered UI for: duplicated text, missing standard affordances (eye icon, loading, empty state), inconsistency with the same *kind* of UI elsewhere.

### 5. Verify the implemented flow — never declare done after compile only

If you implemented or fixed UI/API behavior, **prove it in the running app** before saying it works:

1. Backend is up (`backend API listening`). Frontend is `npm run dev` or Tauri.
2. Navigate to the changed page **from the sidebar** (client navigation). Data must show **without** a hard reload.
3. React Strict Mode remounts effects in dev. Do **not** pass a page `AbortSignal` into shared `ensureSession()` / cached auth. Aborting `/auth/me` poisons the in-flight promise and the second mount renders empty until refresh.
4. Ignore `AbortError` in page loaders. Never toast “failed to load” or `clearTokens()` on abort.
5. If browser tools exist, click through the flow. If not, `curl` the same endpoints the page uses with a real token. Compiling is not verification.

### 6. Running checklist (extend when new mistakes are caught)

- [x] Password fields missing show/hide eye icon → use `PasswordInput`
- [x] Duplicate drawer/form/table per entity instead of one generic/configurable component
- [x] Duplicate title text (outer shell + inner content repeating it)
- [x] Page lists empty until hard refresh / abort logs / surprise logout → don’t abort cached session; verify first navigation
- [ ] *(add the next flagged mistake here in the same task that fixes it)*

When a future prompt flags a new class of mistake: (a) fix the instance, (b) **append it here in the same task**.

## Project documentation protocol

Follow **Agent operating protocol** (impact search, verification, task report) on every change. Living index: `docs/STATUS.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/FLOWS.md`, `docs/CHANGELOG.md`. This skill stays the convention source; those files stay the **inventory**. This app uses **Axum REST** (`handlers/` + `src/services`), **not** `#[tauri::command]` / `invoke`, and **SeaORM SQL** against **SQLite**, not sqlx.

### Before starting ANY task
1. Read `docs/STATUS.md`, then the relevant module in `docs/BACKEND.md` / `docs/FRONTEND.md`, then the relevant flow(s) in `docs/FLOWS.md`.
2. Don't reimplement anything ✅ Done; don't assume anything 🔴 Missing exists.
3. If docs contradict the code, the code wins — fix the docs in the same task.

### After completing ANY task
1. Update affected sections in BACKEND.md / FRONTEND.md: new HTTP routes (and handlers) added to both the module table and the master inventory, status flags, TODOs. Same for frontend `API_ROUTES` + `src/services` wrappers.
2. Update or add the relevant entry in `docs/FLOWS.md` — a task isn't done until the flow it touches is re-verified end to end.
3. Update STATUS.md.
4. Append to `docs/CHANGELOG.md`: date, what changed, files touched.
A task isn't complete until docs reflect it — this applies to Axum routes, SeaORM migrations, and frontend service wrappers equally.

### Cross-check (REST equivalent of invoke mismatch)
- Handler registered in `server.rs` but nothing in `src/services` calls it → flag 🔴 unused (not always a bug).
- `API_ROUTES` / `apiRequest` path that is not registered in `server.rs` → **🐛 bug**.
- DTO field (`camelCase`) vs TS payload shape mismatch → **🐛 bug** (field-sync protocol in §3).
