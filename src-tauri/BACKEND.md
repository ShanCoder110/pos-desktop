# Dukan POS backend

## Stack

- Tauri 2 hosts the desktop application.
- Axum exposes a loopback-only REST API at `http://127.0.0.1:38472/api/v1`.
- `npm run tauri dev` starts the API inside the desktop app (app-data SQLite).
- `npm run dev` starts Vite **and** `cargo run --bin api` against `./data/dukan-pos.sqlite3` (or `$DUKAN_DB_PATH`). Browser-only Vite cannot reach the API otherwise.
- `npm run api` starts the API alone; `npm run dev:ui` starts Vite alone.
- SeaORM 2 provides asynchronous, typed SQLite access.
- SeaORM Migration applies versioned migrations when Tauri starts.
- Validator performs DTO validation; errors use one JSON envelope.
- Auth uses Bearer session tokens (hashed in `sessions`) and Argon2 password hashes.

## Layout

```text
src/backend/
  constants.rs        routes, limits, defaults, messages
  context.rs          RequestContext from session
  extract.rs          Axum FromRequestParts for auth
  security.rs         password + token helpers
  util.rs             UUID/date/money helpers
  db.rs               SQLite connection, pragmas, migrations
  dto/                request, response, filter and pagination types
  entities/           typed SeaORM entities
  errors.rs           HTTP-safe application errors
  handlers/           HTTP extraction and response mapping
  repositories/       database queries only
  services/           validation and transactional business rules
  migration/          versioned schema, units seed, sessions, shop seed
  server.rs           Axum routes and loopback server
```

## Auth

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/login` | username + password + deviceId → token |
| POST | `/auth/logout` | revoke session |
| GET | `/auth/me` | current user, branch, device, cash session |
| POST | `/cash-sessions/open` | open till |
| GET | `/cash-sessions/current` | open session for device |
| POST | `/cash-sessions/{id}/close` | counted cash + variance |

Seed login: username `owner`, password `owner123`. Seed device id `20000000-0000-4000-8000-000000000003`.

Send `Authorization: Bearer <token>` on protected routes.

## Org

| Method | Route |
|---|---|
| GET/POST | `/users` |
| GET/PUT | `/users/{id}` |
| GET/POST | `/branches` |
| GET/PUT | `/branches/{id}` |
| GET | `/devices` |
| GET/PUT | `/devices/{id}/printer` |

## Catalog

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/products` | Paginated catalog; create allocates SKU always |
| GET/PUT/DELETE | `/products/{id}` | Detail, update (incl. sellUnits), soft delete |
| GET | `/products/search?q=` | Search catalog |
| GET/POST/PUT/DELETE | `/categories`, `/units`, `/suppliers`, `/customers` | Masters |
| GET | `/lots`, `/lots/{id}` | Lot list/detail |
| POST | `/lots/receive` | Receive goods → lot + branch lot + movement |
| GET | `/stock`, `/stock/movements` | Branch on-hand and movements |

## Purchasing

| Method | Route |
|---|---|
| GET/POST | `/purchase-orders` |
| GET | `/purchase-orders/{id}` |
| POST | `/purchase-orders/{id}/order` |
| POST | `/purchase-orders/{id}/receive` |
| GET | `/suppliers/{id}/ledger` |
| POST | `/suppliers/{id}/payments` |

## Sales

| Method | Route |
|---|---|
| POST | `/sales/complete` | Atomic invoice + FIFO (`lot_consumptions`) + payments |
| GET/POST | `/sales/holds` |
| GET/PUT/DELETE | `/sales/holds/{id}` |
| GET | `/invoices`, `/invoices/{id}` |
| POST | `/invoices/{id}/void` |

Requires an open cash session for complete sale.

## Credit / returns / claims

| Method | Route |
|---|---|
| GET | `/customers/{id}/ledger` |
| POST | `/customers/{id}/payments` |
| GET/POST | `/returns` |
| GET | `/returns/{id}` |
| GET/POST | `/claims` |
| GET | `/claims/{id}` |

## Transfers / jobs

| Method | Route |
|---|---|
| GET/POST | `/transfers` |
| POST | `/transfers/{id}/send`, `/transfers/{id}/receive` |
| GET/POST | `/production` |
| POST | `/production/{id}/start`, `/production/{id}/complete` |
| GET/POST | `/repairs` |
| POST | `/repairs/{id}/start`, `/complete`, `/deliver` |

## Finance / reports / settings

| Method | Route |
|---|---|
| GET/POST | `/expense-categories`, `/expenses` |
| GET | `/transactions` |
| GET | `/reports/dashboard`, `/reports/analytics` |
| GET/PUT | `/settings/localization`, `/settings/receipt`, `/settings/profile` |
| GET | `/sync/status` | `{ enabled: false }` until cloud sync |

## Rules

- Local SQLite = one shop. No `business_id` on operational rows.
- Stock = branch_lots remaining for the till branch.
- Document numbers from `document_sequences`.
- FIFO audit via `lot_consumptions` only (not `invoice_item_lots`).
- Actor stamped from session, never from JSON `createdBy`.
- Money/qty rounded in services (`scale 2` / `scale 6`).
- Pagination default 20, hard max 100.
