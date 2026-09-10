---
name: tauri-app-standards
description: >-
  Use this skill whenever building, editing, or reviewing features in this Tauri
  desktop app (React frontend + Rust backend). Trigger it for ANY frontend work
  (new pages, modals, tables, forms, loading states, components) and ANY backend
  work (Rust commands, database queries, migrations, pagination/filtering).
  Always consult this before writing code for a new feature, removing/renaming a
  field, adding a modal or page, or touching the database schema — it defines the
  required folder structure, naming, short toast copy, error handling, and the
  frontend<->backend sync checklist that must be followed every time.
---

# Tauri App Standards

Project-specific conventions for this Tauri desktop app (React/TS frontend + Rust backend). The goal: consistent structure, no duplicated logic, no over-fetching, and frontend/backend that never drift out of sync.

**Read this skill before writing code.** Slot work into the folders below. Do not invent parallel trees (`src/lib/api`, `src/components/modal`, `src-tauri/src/commands`, etc.).

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

Local run: `npm run dev` starts Vite **and** `cargo run --bin api` (Cargo is resolved from `~/.cargo/bin`). `npm run tauri dev` starts the API inside the desktop app (app-data SQLite). Vite alone cannot talk to the API. Seed login: `owner` / `owner123`.

Do **not** restyle cashier POS (`src/pages/pos/PosPage.tsx`) or the catalog look of `LotForm` / `ProductForm`. Drawers use `src/components/common/Drawer.tsx` with constrained sizes (`sm`/`md`/`lg`/`xl`), not full-width panels.

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

Domain notes for this shop POS: local SQLite = one shop; walk-in customers do not get khata; FIFO via lots; actor stamped from session, never from JSON `createdBy`. Spec: `docs/system-audit-and-data-model.md`. Backend map: `src-tauri/BACKEND.md`.

## 4. Post-implementation checklist

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
