# Step 25 notes (QA-02 part 1 batch 2)

## (a) text36/blob36 stock_movements.id writer

Git archaeology (`git log -S/-G` on stock movement inserts since `d5d97d5`, migrations 000017–000020, seed):

| Finding | Detail |
|---|---|
| Production writers since `d5d97d5` | `40f1dfb` `StockCountRepository::insert_movement` binds `Uuid.into()` (16-byte blob). No `to_string().into()` on movement PKs. |
| Migrations 000017–000020 / seed | Use `X'…'` hex blobs only; no hyphenated TEXT UUID inserts into `stock_movements`. |
| Historical string UUID bind | `d5c9b8d` fixed `lot_consumptions` **lookup** `reference_id = invoice_id.to_string().into()` → `invoice_id.into()` (read path, not a `stock_movements.id` writer). |
| QA rows in Step 23 scan | Notes `text-uuid-repro` / `blob36-uuid-repro` were **agent-inserted Python fixtures** during Step 23 diagnosis, not app writers. |
| Hardening | `aff9ff6` switched stock-count inserts to `uuid_blob()`; `000023` converted any leftover text/blob36. |

**Conclusion:** No production commit since `d5d97d5` wrote text36/blob36 into `stock_movements.id`. The live bad rows were repro inserts; closest related fix for string UUID binds is `d5c9b8d` (lot_consumptions lookup).

## (b) L-0010 qty above 1,000,000 cap

`L-0010` has original qty **1,199,762**, above the stock-count / field `MAX_STOCK_COUNT_BASE_UNITS` (1,000,000). Add lot / receive has **no qty cap**. Left for the field-limits steps.

## M9 / M10 (this step)

- **M9:** `UpdateLotRequest.expiryDate` set/change/clear; reject before received; past-after-received allowed (FE warning toast); audit `UPDATE_EXPIRY`; drawer + table use `formatTableDate`.
- **M10:** F11 toggles cart W/R (empty cart still toggles mode); wholesale 0/unset → retail + hint toast/title; Walk-in forces retail (P2-8). No POS layout change.
