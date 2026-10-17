# FORM-01 — Quotations feature finding (report only)

**Scope:** End-to-end review of quotations (create → convert to sale, pricing/units, stock, quoted vs current prices).  
**Method:** Repo search (`src/`, `src-tauri/`, migrations, routes, nav, services, pages) + SQLite schema scan.  
**Date:** 2026-10-17 · branch `pos-v2-redesign`

---

## Verdict

**There is no quotations feature in this codebase.** No UI route/page, no API handlers, no DTO/service/repository, no `quotations` / `quote_items` tables, and no nav entry. Closest relative is **POS Hold bill (F4)** — a cart snapshot for resume, not a customer-facing quote with convert-to-sale semantics.

Until quotations are built, FORM-01 cannot be validated against create / convert / price-freeze / stock behavior.

---

## Issues

| ID  | Severity     | Finding                                          | Evidence                                                                                                                                                                                                                      | Proposed fix                                                                                                                                                                                                      |
| --- | ------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1 | **Critical** | Quotations product surface is missing end-to-end | No matches for quotation/quote entities under `src/pages`, `src/services`, `src-tauri/src/backend/{handlers,services,repositories,dto,migration}`; `sqlite3 .tables` has no quote tables; `routes` / product tabs omit Quotes | Spec + implement a first-class Quotations domain (tables, API, POS/mgmt UI) before FORM-01 QA                                                                                                                     |
| Q-2 | **High**     | No convert-quote-to-sale path                    | No convert/complete endpoint that materializes a quote into an invoice                                                                                                                                                        | Add `POST /quotations/:id/convert` (or equivalent) that creates a sale from **quoted** lines, then marks quote `CONVERTED` idempotently                                                                           |
| Q-3 | **High**     | Pricing/unit handling for quotes is undefined    | N/A — no quote line model                                                                                                                                                                                                     | Persist per-line: `product_unit_id`, displayed qty, **quoted unit price**, price mode (retail/wholesale), discount; do **not** re-resolve list price at convert unless an explicit “refresh prices” action exists |
| Q-4 | **High**     | Stock reservation on quote is undefined          | Holds do not reserve stock; sales consume FIFO lots                                                                                                                                                                           | Decide product rule: (A) quotes never reserve, convert fails on insufficient stock; or (B) soft reserve with TTL. Document and enforce in convert                                                                 |
| Q-5 | **Medium**   | Hold bill must not be mistaken for a quotation   | `PosWorkspace` F4 / `sales/holds` — resume cart locally; no customer PDF, no validity, no convert API                                                                                                                         | Keep Holds for cashier workflow. Quotations should be a separate entity with number series, validity date, customer, printable document                                                                           |
| Q-6 | **Medium**   | No quoted-vs-current price policy                | N/A                                                                                                                                                                                                                           | Default: convert uses **frozen quoted prices**. Optional UI: “Update to current prices” before convert. Audit both                                                                                                |
| Q-7 | **Low**      | No FORM-01 fixture / seed path                   | `qa/pos/` has qa02/qa06 only                                                                                                                                                                                                  | After implementation, add seed quotes + convert fixtures under `qa/pos/form01/`                                                                                                                                   |

---

## Related (not quotations)

| Feature                   | Role                            | Why it is not a quote                                                      |
| ------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| POS Hold (`/sales/holds`) | Park/resume an in-progress cart | No quote number, validity, or convert-to-invoice contract; stock unchanged |
| Credit / invoices         | Completed sales & receivables   | Post-sale, not pre-sale offers                                             |
| Repair `estimated_amount` | Repair job estimate field       | Job workflow, not product-line quotations                                  |

---

## Proposed minimal data model (for a future build)

1. `quotations` — id, branch, number, customer_id (nullable walk-in), status (`DRAFT`/`SENT`/`CONVERTED`/`EXPIRED`/`CANCELLED`), valid_until, notes, totals, created_by, timestamps
2. `quotation_items` — product_id, product_unit_id, qty, unit_price (**quoted**), price_mode, discount, line_total
3. Convert: validate stock (per Q-4) → `SalesService::complete` with item prices from quote lines → link `invoice.quotation_id` → status `CONVERTED`

---

## Recommendation

Treat FORM-01 as **blocked on Q-1**. Do not stretch Hold bills into quotations. When built, lock convert pricing to quoted lines (Q-3/Q-6) and make stock policy explicit (Q-4).
