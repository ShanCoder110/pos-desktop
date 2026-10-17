# QA-06 Step 23 — UUID blob decode + silent list failures

## 1. UUID TEXT / 36-byte BLOB → HTTP 500

### Symptom
Cashier `/pos` and `/products`, and owner lot drawer, hit network 500 with toast
`An unexpected error occurred`. Backend:

`decoding column "id": invalid length: expected 16 bytes, found 36`

SeaORM `Uuid` decode requires a 16-byte BLOB. Hyphenated TEXT (36) or ASCII
BLOB(36) in any row of the result set fails the whole query.

### How Step 16 missed this
Step 16 E saw cashier `GET /stock/movements?movementType=ADJUSTMENT` → **403**
(permission). That is a different status and root cause. Fixing the 403 did not
inspect UUID storage. This 500 only appears when a bad-typed UUID row is
returned in a decode path (e.g. products/lots/stock list).

### Scan (BEFORE — see `/opt/cursor/artifacts/step23-uuid-scan.txt`)
Live QA DB (`data/dukan-pos.sqlite3`) after agent repro inserts:

| Table.column | text36 | blob36 | blob16 |
|---|---:|---:|---:|
| `stock_movements.id` | 1 | 1 | 53 |
| All other scanned `id` / `*_id` | 0 | 0 | (all) |

`client_request_id` skipped (not a UUID blob). `system_state.id` is INTEGER.

### Suspect writers (code review)
| Path | Finding |
|---|---|
| `repositories/stock_count.rs` ADJUSTMENT inserts | Uses `Uuid.into()` / now `uuid_blob()` → 16-byte BLOB (correct) |
| `services/stock.rs` | Orchestrates count; no raw string UUID binds |
| `m20261017_000019` rebuild | Copies existing id bytes; does not invent TEXT uuids |
| `m20261017_000020` reconcile | Updates quantities only; no UUID inserts |
| Historical | `lot_consumptions.reference_id` once used `to_string().into()` (fixed earlier) |
| Migration test fixtures | Quoted TEXT uuid literals in `migration/mod.rs` tests (not production writers) |

Schema declares TEXT affinity; runtime convention is BLOB 16. Bad rows can come
from older code, manual SQL, or fixtures that inserted string UUIDs.

### Fix
1. `util::uuid_blob` / `optional_uuid_blob` — bind `Value::Bytes` (16 bytes).
2. Stock-count INSERT paths use `uuid_blob` for all UUID columns.
3. Migration `m20261017_000023_uuid_text_to_blob` — FK off, transaction,
   convert text32/36 + blob36 → `unhex(...)` 16-byte blob on `id`/`*_id`,
   `foreign_key_check`, idempotent.

### Acceptance
- Fresh DB + upgraded QA DB with stock counts: POS, Products, lot drawer no 500.
- Cargo: stock-count path asserts `typeof(id)='blob'` length 16.
- Cargo: migration converts a text UUID fixture row.

## 2. Silent list failures (Lots / Stock count)

### Symptom
Network / 5xx failures cleared the list to “Nothing here yet” with no toast.

### Fix
- `classifyListFetch` (`src/utils/listLoad.ts`): abort silent; error → message;
  successful `[]` → empty; data → rows.
- `LotsPage` + `StockCountPage` history: toast + error `EmptyRow` + Retry.
- Empty state only on successful empty response.

### Vitest
Abort silent; network error; 500; `200 []` empty — `listLoad.test.ts`.
