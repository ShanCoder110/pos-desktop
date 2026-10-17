# FORM-01 — Step 27 Accounting Audit (part 1)

**Branch:** `pos-v2-redesign`  
**Date:** 2026-10-17  
**Scope:** Profit formulas, surface map, dukan-app comparison. No general ledger (step 28+). No POS layout changes.

Shared formula module: `src-tauri/src/backend/accounting.rs`  
Frontend hold/realized: `src/pages/credit/creditProfitUtils.ts`

---

## 1. Formula results (cargo tests)

| Formula | Expected (hand) | Actual | Pass/Fail | Fix SHA |
| --- | --- | --- | --- | --- |
| F1 Line GP after line + bill discount (A 10@20 fifo80, B 5@30 fifo50, bill 35 / 350) | A 100, B 85, sum 185 | `accounting::tests::f1_*` | **PASS** | unit (no DB) |
| F1b Line discount before bill share | 100 | `f1_line_discount_before_bill_share` | **PASS** | — |
| F2 Hold = gross × credit / total | 100 → 75 → 0 | `f2_profit_hold_*` | **PASS** | — |
| F3 Realized = gross × paid / total (cash, capped) | 25 / 100 / 100 / 0 | `f3_realized_*` | **PASS** | — |
| F4 Return reverses remaining gross proportionally | 50 / 0 | `f4_return_*` | **PASS** | — |
| F5 Void → hold & realized 0 | 0 / 0 | `f5_void_*` | **PASS** | — |
| F6 Expenses reduce net only | net 70; gross unchanged | `f6_expenses_*` | **PASS** | — |
| F7 Shrinkage is loss ≠ COGS | 40 | `f7_shrinkage_*` | **PASS** | — |
| Hold + realized = remaining gross | 100 | `hold_plus_realized_*` | **PASS** | — |
| Fixture scenario totals | see §3 | `fixture_scenario_expected_totals` | **PASS** | — |
| **Bill discount → stored line GP** (integration) | A 100, B 95 (cost 8), sum **195** (not 230) | `bill_discount_allocates_into_line_gross_profit` | **PASS** (was FAIL before fix) | this commit |

**Bug proven & fixed:** `sales.rs` / `sales_revise.rs` computed `gross_profit = line_total − fifo_cost` and ignored invoice `discount`. Invoice total correctly subtracts bill discount, so Σ line GP overstated. Fix: `accounting::line_gross_profit` with proportional bill share. Lot `sold_profit` now allocates from `invoice_items.gross_profit` (same shared GP) instead of revenue−cogs.

---

## 2. Profit / totals surfaces

| Surface | Code path | Math source | Aligned? |
| --- | --- | --- | --- |
| Invoice line `grossProfit` | `repositories/sales.rs` (+ revise) → DTO | **`accounting::line_gross_profit`** (after fix) | Yes |
| Invoice detail (credit customer) | `CreditCustomerPage` shows `item.grossProfit` | Stored backend GP | Yes |
| Customer `profitOnHold` (list/SQL) | `masters.rs` Customer SELECT | SQL: `Σ ii.gross_profit × credit/total` | Yes ≡ `creditProfitUtils` hold |
| Credit KPIs / customer page | `creditProfitUtils.ts` | gross × credit\|paid / total from stored GP | Yes |
| Credit sales hub “profit on hold” | `CreditSalesPage` sums `customer.profitOnHold` | masters SQL | Yes |
| Lot drawer `soldProfit` | `lots.rs` lot money metrics | **Now** `Σ consumption × (Σ GP / Σ base)` | Yes (was revenue−cogs) |
| Lot `shrinkCost` | stock-count ADJUSTMENT × cost | Shrinkage loss, not sale COGS | Yes (F7) |
| Dashboard cards | `DashboardPage` + `finance::dashboard` | Sales / collected / credit / expenses — **no GP KPI** | N/A (cash cards) |
| Reports / Analytics | `AnalyticsPage` `totalsOf` + expenses | Billed / paid / credit; **Net cash = paid − expenses** (not gross−exp) | Cash-flow only; expenses correctly exclude from gross |
| `margin.ts` | Product pricing helpers | sell − cost (list price), not invoice GP | Separate (pricing UI) |

**Divergent math before this step:** sales insert GP (no bill share); lot sold_profit (revenue−cogs). Both fixed to shared backend GP.

---

## 3. Fixture scenario (expected numbers)

Two customers, one product Widget cost **10**/base, retail **20**.

| Step | Event | Revenue | FIFO | Gross | Hold | Realized |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cust A credit 10 pcs | 200 | 100 | 100 | **100** | 0 |
| 2 | Cust B cash 5 pcs | 100 | 50 | 50 | 0 | **50** |
| 3 | Walk-in/split 10 pcs, pay 80 | 200 | 100 | 100 | **60** | **40** |
| 4 | Partial pay A +50 | — | — | 100 | **75** | **25** |
| 5 | Return half of B (qty 2.5 → model share 0.5) | — | — | rem **25** | 0 | scales with remaining |
| 6 | Void split invoice | — | — | **0** | **0** | **0** |
| 7 | Expense 30 (branch, today) | — | — | gross unchanged | — | net cash uses paid−exp |
| 8 | Shrinkage 5 @ cost 8 (QA-06 lot) | — | — | — | — | loss **40** (not COGS) |

**Dashboard / report expectations after steps 1–4 + 6–7 (void kills split; B still full cash):**

| Card / metric | Expected |
| --- | --- |
| Sales billed (A+B completed) | 200 + 100 = **300** |
| Collected (A 50 + B 100) | **150** |
| Credit open (A 150) | **150** |
| Profit on hold (A) | **75** |
| Realized gross (A 25 + B 50) | **75** |
| Expenses | **30** |
| Net cash (Analytics: collected − expenses) | 150 − 30 = **120** |
| Net profit (realized − expenses) | 75 − 30 = **45** |
| Shrinkage loss (separate) | **40** |

Screenshots: `qa/pos/form01/step27-dashboard.png`, `qa/pos/form01/step27-profit-report.png`.

---

## 4. dukan-app comparison (read-only)

Repo: `ShanCoder110/dukan-app` (`dashboard.service.ts`, `invoice.service.ts`, credit sale services).

| Topic | Dukan | pos-desktop | Adopt? |
| --- | --- | --- | --- |
| Invoice profit | `max(0, grossTotal − Σ cost)`; bill discount reduces `grossTotal` | Line GP via FIFO; bill discount now allocated into lines | **Yes** — fold bill discount into profit (done) |
| Hold / realized | `profit × settled/gross` and remainder held | Same ratios (`credit/total`, `paid/total`) | Keep (already aligned) |
| Store credit as “settled” | Store credit counts toward realized | Cash `paid_amount` only for realized | Keep cash-only (explicit Step 27 rule) |
| Expenses | Reported beside profit; **not** subtracted from `monthlyProfit` | Analytics **Net cash = paid − expenses**; gross separate | Keep; document both |
| Profit floor | `max(0, …)` hides losses | Allows negative GP if sold below cost | Keep (honest loss) |
| Storage | Persists `profit` / `profit_hold` on invoice | Derives hold from line GP × ratio in SQL/FE | Keep derive-from-lines |

---

## 5. npm audit note (carry-forward)

Critical remaining are **dev-only** (vitest / tinypool). Keep listed; do not force vitest 5 in this step.

---

## 6. Tests run

- `cargo test accounting::` + `bill_discount_allocates_into_line_gross_profit`
- `npm run lint` / `tsc` / Vitest / full `cargo test` (see commit notes)
