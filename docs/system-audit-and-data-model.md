# POS system audit and canonical data model

This document audits the current frontend and defines the canonical persistence model required by the implemented screens and the supplied business requirements. It is database-neutral; `uuid`, `decimal`, `date`, and `datetime` should be mapped to the selected backend database.

## Executive audit

### Critical architecture findings

1. The frontend currently has two competing model layers: `src/shared/types/index.ts` and `src/shared/domain/types.ts`. They disagree on names, enum casing, nesting, and where balances/stock are stored. New backend work should use one generated canonical contract.
2. Most pages mutate local React state seeded from mock files. Refreshing the app discards changes. There is no complete repository/API layer.
3. `Product.stock`, `Product.cost`, `Product.min`, `Product.wholesale`, and `Product.retail` duplicate lot/unit data. Stock and purchase cost must be derived from lots; selling prices belong to product selling units or explicitly versioned lot prices.
4. FIFO cannot be audited from invoices alone because there is no invoice-item-to-lot allocation model. A sale-lot allocation table is required.
5. Branch inventory is partially represented by `BranchLotRow`, but POS availability still primarily reads a product-level stock number.
6. Purchase Orders, partial receipts, supplier ledger, supplier payments, repair-domain records, claims, and investments are missing from the canonical domain model.
7. The current Production page is also used for the Repair route. Production and Repairs require separate models and screens.
8. Analytics currently derives values from small mock arrays. Correct analytics should be computed from invoices, invoice items, lot allocations, stock movements, payments, and timestamps.

### Screen/workflow coverage

| Area | Current state | Required action |
|---|---|---|
| Setup/auth | Partial local session | Add persisted business, user, role, device, and session models |
| Products | Rich UI, duplicated stock/prices | Make stock lot-derived and selling prices unit-based |
| Initial stock | Creates an opening lot in frontend | Make product creation + opening lot one database transaction |
| Lots | UI implemented | Add receipts, branch allocation, FIFO allocations, immutable history |
| Units | UI implemented | Enforce base conversion rules and unique barcodes |
| Branch inventory | Partial | Derive local/overall availability from branch lots |
| Transfers | Partial mock workflow | Add transfer items, lot allocations, send/receive timestamps |
| Reorder | Redirects to Lots | Replace with Purchase Orders and receiving workflow |
| POS/invoices | Partial local flow | Persist invoice, items, payments, FIFO allocations, movements atomically |
| Credit/Udhaar | Read-oriented ledger mock | Post ledger entries and independent customer payments transactionally |
| Returns/replacements | Partial | Normalize return items, replacement items, refunds, and lot movements |
| Claims/warranty | Product counters only | Add claim, claim item, status history, resolution, supplier/customer links |
| Suppliers | CRUD only | Add payable balance, supplier ledger, payments, purchase linkage |
| Production | Read-only mock | Add expected vs actual materials, waste, FIFO cost, output lot, commission |
| Repairs | Uses Production page | Build dedicated repair jobs, parts, waste, payments, worker contribution |
| Investors | Missing | Add investment, lot allocation, principal/profit ledger, settlements |
| Expenses/transactions | Partial | Post all financial events into the common money transaction ledger |
| Reporting | Mock aggregates | Query canonical transaction and inventory history |
| Sync/devices | Mock only | Add mutation versioning, conflict policy, and sync cursor/logs |

## Tenancy: local vs cloud

Do **not** put `business_id` on Product, Lot, Invoice, Customer, or other operational tables.

That column was a shared-database multi-tenant pattern: one cloud DB, every query `WHERE business_id = ?`, unique keys like `(business_id, sku)`. It is the wrong default for this product.

| Environment | How one shop is isolated |
|---|---|
| Local (Tauri / this machine) | One database = one business. Tenant is implied. No tenant column on rows. |
| Cloud | Multi-tenant at the **account** layer, not copied onto every table. A logged-in User belongs to a Business. That session selects the shop’s data store (database or schema per business). Child rows live only in that store. |

**Business** is a cloud account / shop identity (name, billing, sync target). Create it when the shop is registered on cloud. Local install has at most one implied shop; do not stamp `business_id` through the catalog, inventory, or sales tables.

**User** is the only operational model that stores `business_id` (cloud membership: which shop this login belongs to). Devices, sync, and API auth resolve tenant from the user/session, then talk to that shop’s database. Unique SKU, lot number, invoice number, etc. are unique **inside that database**, not via a tenant column.

If cloud later used one shared table for all shops, you would need `business_id` on every root row again. That is not this design. Do not denormalize tenant onto InvoiceItem, ProductLot, etc. “just in case.”

## Modeling conventions

- Money: `decimal(18,2)`; never floating point.
- Quantities and conversions: `decimal(18,6)` to support meters, gaz, weight, packs, and partial units.
- Percentages: `decimal(7,4)` stored as `0..100` consistently.
- Every mutable row: `id`, `created_at`, `updated_at`. No `business_id` except on `User` (cloud shop membership).
- Archivable master data uses `is_active` or `archived_at`; financial/inventory history is never hard-deleted.
- All timestamps are stored in UTC.
- Snapshot names/prices are stored on transactional lines so historical documents do not change when master data changes.
- Derived values such as total product stock, customer balance, supplier balance, and investor balance are not freely editable.

## Core enums

```text
UserRole: OWNER | MANAGER | CASHIER | TECHNICIAN | ACCOUNTANT
BranchType: STORE | WAREHOUSE | REPAIR | PRODUCTION
PaymentStatus: UNPAID | PARTIAL | PAID | CREDIT | REFUNDED
DocumentStatus: DRAFT | CONFIRMED | COMPLETED | CANCELLED
PurchaseOrderStatus: DRAFT | ORDERED | PARTIAL | COMPLETED | CANCELLED
TransferStatus: DRAFT | SENT | PARTIAL | RECEIVED | CANCELLED
ReturnType: REFUND | REPLACEMENT | CLAIM
ItemCondition: GOOD | DAMAGED | WARRANTY | SCRAP
ClaimStatus: OPEN | INSPECTING | APPROVED | REJECTED | RESOLVED | CANCELLED
ProductionStatus: DRAFT | IN_PROGRESS | COMPLETED | CANCELLED
RepairStatus: RECEIVED | IN_PROGRESS | READY | DELIVERED | CANCELLED
CommissionStatus: PENDING | APPROVED | PAID | CANCELLED
InvestmentStatus: ACTIVE | CLOSED | CANCELLED
InvestorType: INDIVIDUAL | ORGANIZATION
MoneyDirection: IN | OUT
PaymentMethod: CASH | CARD | BANK | MOBILE | OTHER
StockMovementType: PURCHASE | SALE | RETURN | REPLACEMENT | TRANSFER_IN |
  TRANSFER_OUT | PRODUCTION_USE | PRODUCTION_WASTE | PRODUCTION_OUTPUT |
  REPAIR_USE | REPAIR_WASTE | DAMAGE | ADJUSTMENT
CustomerLedgerType: CREDIT_SALE | PAYMENT | REFUND | ADVANCE | ADJUSTMENT
SupplierLedgerType: PURCHASE | PAYMENT | RETURN | DISCOUNT | ADJUSTMENT
InvestorLedgerType: INVESTMENT | PRINCIPAL_ALLOCATED | PRINCIPAL_RECOVERED |
  PROFIT_EARNED | LOSS | SETTLEMENT | ADJUSTMENT
```

## 1. Business, users, branches, and devices

### Business

Cloud shop account only. Local install does not copy this id onto products, lots, or invoices. One local database is one shop.

| Column | Type | Rules |
|---|---|---|
| id | uuid | PK |
| name | text | required |
| legal_name | text nullable | |
| phone | text nullable | |
| email | text nullable | |
| address | text nullable | |
| currency_code | char(3) | default `PKR` |
| fiscal_year_start_month | smallint | 1–12 |
| is_active | boolean | default true |
| created_at, updated_at | datetime | required |

### Branch

| Column | Type | Rules |
|---|---|---|
| id | uuid | PK |
| name | text | required |
| code | text | unique in this database |
| type | BranchType | required |
| phone, address | text nullable | |
| is_main | boolean | only one main branch |
| is_active | boolean | default true |
| created_at, updated_at | datetime | |

### BranchSetting

| Column | Type | Rules |
|---|---|---|
| id, branch_id | uuid | branch unique |
| allow_negative_stock | boolean | default false |
| require_confirmed_cross_branch_transfer | boolean | default true |
| fifo_enabled | boolean | default true |
| default_walk_in_customer_id | uuid nullable | FK Customer |
| invoice_prefix, repair_prefix, production_prefix | text | |
| created_at, updated_at | datetime | |

### User

| Column | Type | Rules |
|---|---|---|
| id, business_id, default_branch_id | uuid | `business_id` is cloud shop membership only; unused on a local-only user |
| name, username | text | username unique in this database |
| password_hash | text | never store a plain password |
| phone, email | text nullable | |
| role | UserRole | required |
| is_active | boolean | default true |
| last_login_at | datetime nullable | |
| created_at, updated_at | datetime | |

### UserPermission

`id uuid PK`, `user_id uuid FK`, `permission_key text`, `is_allowed boolean`, `created_at datetime`, `updated_at datetime`. Unique `(user_id, permission_key)`.

### Device

`id`, `branch_id`, `name`, `device_key_hash`, `is_active`, `last_seen_at`, `last_synced_at`, `created_at`, `updated_at`.

### SyncLog

`id`, `device_id`, `status`, `cursor_from`, `cursor_to`, `records_pushed`, `records_pulled`, `error_message`, `started_at`, `completed_at`.

### AuditLog

`id`, `branch_id nullable`, `user_id nullable`, `device_id nullable`, `entity_type`, `entity_id`, `action`, `before_json nullable`, `after_json nullable`, `created_at`.

## 2. Catalog and units

### ProductCategory

`id`, `name`, `description nullable`, `is_active`, `created_at`, `updated_at`. Unique category name in this database.

### Unit

`id`, `name`, `symbol`, `precision smallint`, `is_active`, `created_at`, `updated_at`. Unique symbol in this database.

### Product

| Column | Type | Rules |
|---|---|---|
| id | uuid | PK |
| category_id, base_unit_id | uuid | required FKs |
| name | text | required |
| sku | text | unique in this database |
| barcode | text nullable | unique when present |
| product_type | enum | STANDARD or MANUFACTURED |
| track_lots | boolean | required true for stocked products |
| track_expiry | boolean | default false |
| minimum_stock | decimal(18,6) | base-unit threshold |
| warranty_duration | integer nullable | |
| warranty_unit | enum nullable | DAYS or MONTHS |
| warranty_note | text nullable | |
| is_active | boolean | |
| created_by | uuid | FK User |
| created_at, updated_at | datetime | |

Do not persist freely editable `stock` or a single mutable purchase price on Product. Overall stock is derived from BranchLot. Current/weighted cost is derived from remaining lots.

### ProductUnit

| Column | Type | Rules |
|---|---|---|
| id, product_id, unit_id | uuid | FKs |
| display_name | text | e.g. `40m Pack` |
| conversion_to_base | decimal(18,6) | positive; base unit = 1 |
| cost_reference | decimal(18,2) nullable | display/default only, not inventory truth |
| minimum_price | decimal(18,2) | |
| wholesale_price | decimal(18,2) | |
| retail_price | decimal(18,2) | |
| barcode | text nullable | globally unique when present |
| is_base | boolean | exactly one per product |
| is_default_sale_unit | boolean | at most one per product |
| sort_order | integer | largest conversion normally first |
| is_active | boolean | |
| created_at, updated_at | datetime | |

### ProductComponent (BOM/recipe)

`id`, `finished_product_id`, `component_product_id`, `component_unit_id`, `expected_quantity`, `expected_base_quantity`, `waste_allowance_quantity`, `sort_order`, `is_active`, `created_at`, `updated_at`. Unique active component/unit per finished product. A product cannot directly contain itself.

## 3. Suppliers and purchasing

### Supplier

`id`, `name`, `phone`, `email`, `address`, `tax_number nullable`, `payment_terms_days nullable`, `credit_limit nullable`, `notes`, `is_active`, `created_at`, `updated_at`.

### PurchaseOrder

| Column | Type | Rules |
|---|---|---|
| id, branch_id, supplier_id | uuid | FKs |
| order_number | text | unique in this database |
| status | PurchaseOrderStatus | required |
| order_date, expected_date | date | expected nullable |
| subtotal, discount, tax, total | decimal(18,2) | snapshots |
| notes | text nullable | |
| created_by, approved_by nullable | uuid | User FKs |
| ordered_at, completed_at, cancelled_at | datetime nullable | |
| created_at, updated_at | datetime | |

### PurchaseOrderItem

`id`, `purchase_order_id`, `product_id`, `unit_id`, `unit_name_snapshot`, `ordered_quantity`, `ordered_base_quantity`, `expected_unit_cost`, `received_base_quantity`, `discount`, `tax`, `line_total`, `notes`, `created_at`, `updated_at`.

### GoodsReceipt

`id`, `purchase_order_id nullable`, `supplier_id`, `branch_id`, `receipt_number`, `supplier_invoice_number nullable`, `received_date`, `status`, `subtotal`, `discount`, `tax`, `total`, `notes`, `received_by`, `created_at`, `updated_at`.

### GoodsReceiptItem

`id`, `goods_receipt_id`, `purchase_order_item_id nullable`, `product_id`, `unit_id`, `quantity`, `base_quantity`, `purchase_price_per_base`, `minimum_price`, `wholesale_price`, `retail_price`, `expiry_date nullable`, `lot_id`, `line_total`, `created_at`.

Receiving a GoodsReceiptItem creates exactly one ProductLot and initial BranchLot allocation in the same transaction.

### SupplierLedgerEntry

`id`, `supplier_id`, `branch_id`, `type SupplierLedgerType`, `purchase_order_id nullable`, `goods_receipt_id nullable`, `money_transaction_id nullable`, `debit`, `credit`, `balance_after`, `notes`, `occurred_at`, `created_by`, `created_at`.

Positive supplier balance means the business owes the supplier. Balance is derived from ledger entries.

## 4. Lots, branch inventory, and FIFO

### ProductLot

| Column | Type | Rules |
|---|---|---|
| id, product_id | uuid | FKs |
| supplier_id nullable | uuid | nullable for production/opening adjustments |
| goods_receipt_item_id nullable | uuid | source receipt |
| production_job_id nullable | uuid | source production output |
| lot_number | text | unique in this database |
| source_type | enum | OPENING, PURCHASE, PRODUCTION, RETURN, ADJUSTMENT |
| original_base_quantity | decimal(18,6) | immutable |
| remaining_base_quantity | decimal(18,6) | cached/guarded aggregate |
| damaged_base_quantity | decimal(18,6) | non-negative |
| purchase_price_per_base | decimal(18,2) | immutable cost snapshot |
| received_date | date | required |
| expiry_date | date nullable | |
| created_by | uuid | User FK |
| created_at, updated_at | datetime | |

### BranchLot

`id`, `branch_id`, `product_lot_id`, `allocated_base_quantity`, `remaining_base_quantity`, `reserved_base_quantity`, `damaged_base_quantity`, `updated_at`. Unique `(branch_id, product_lot_id)`.

### StockMovement

| Column | Type | Rules |
|---|---|---|
| id, branch_id, product_id | uuid | FKs |
| product_lot_id nullable, product_unit_id nullable | uuid | FKs |
| type | StockMovementType | required |
| displayed_quantity | decimal(18,6) | quantity user entered |
| displayed_unit_name | text | snapshot |
| base_quantity_delta | decimal(18,6) | signed stock change |
| unit_cost | decimal(18,2) nullable | actual lot/FIFO cost |
| total_cost | decimal(18,2) nullable | |
| reference_type, reference_id | text, uuid | source document |
| notes | text nullable | |
| occurred_at | datetime | analytics timestamp |
| created_by, created_at | uuid, datetime | |

### LotConsumption

`id`, `branch_id`, `product_id`, `product_lot_id`, `stock_movement_id`, `reference_type`, `reference_id`, `base_quantity`, `unit_cost`, `total_cost`, `created_at`.

This is the FIFO audit trail. It answers exactly which lots funded a sale, repair, production job, replacement, or damage event.

### StockTransfer

`id`, `transfer_number`, `from_branch_id`, `to_branch_id`, `status`, `notes`, `created_by`, `sent_by nullable`, `received_by nullable`, `created_at`, `sent_at nullable`, `received_at nullable`, `cancelled_at nullable`.

### StockTransferItem

`id`, `stock_transfer_id`, `product_id`, `product_lot_id`, `requested_base_quantity`, `sent_base_quantity`, `received_base_quantity`, `damaged_in_transit_quantity`, `created_at`, `updated_at`.

### StockAdjustment

`id`, `branch_id`, `adjustment_number`, `reason`, `notes`, `status`, `created_by`, `approved_by nullable`, `occurred_at`, `created_at`.

### StockAdjustmentItem

`id`, `stock_adjustment_id`, `product_id`, `product_lot_id nullable`, `system_base_quantity`, `counted_base_quantity`, `difference_base_quantity`, `unit_cost`, `created_at`.

## 5. Customers, invoices, payments, and credit

### Customer

`id`, `name`, `phone`, `email nullable`, `address`, `credit_limit nullable`, `is_walk_in`, `notes`, `is_active`, `created_at`, `updated_at`.

### Invoice

`id`, `branch_id`, `customer_id nullable`, `invoice_number`, `status`, `payment_status`, `subtotal`, `discount`, `tax`, `total`, `paid_amount`, `credit_amount`, `change_amount`, `notes`, `created_by`, `completed_at nullable`, `cancelled_at nullable`, `created_at`, `updated_at`.

### InvoiceItem

| Column | Type | Rules |
|---|---|---|
| id, invoice_id, product_id | uuid | FKs |
| product_unit_id nullable | uuid | selected selling unit |
| product_name, sku, unit_name | text | immutable snapshots |
| displayed_quantity | decimal(18,6) | e.g. 1 pack |
| conversion_to_base | decimal(18,6) | snapshot |
| base_quantity | decimal(18,6) | actual deduction |
| unit_price | decimal(18,2) | per displayed unit |
| minimum_price_snapshot | decimal(18,2) | |
| discount, tax, line_total | decimal(18,2) | |
| fifo_cost | decimal(18,2) | sum LotConsumption total cost |
| gross_profit | decimal(18,2) | line_total minus fifo_cost |
| created_at | datetime | |

### InvoiceItemLot

`id`, `invoice_item_id`, `product_lot_id`, `branch_id`, `base_quantity`, `unit_cost`, `total_cost`, `stock_movement_id`, `created_at`. This may reference LotConsumption one-to-one or replace it for invoice-specific allocation.

### Payment

`id`, `branch_id`, `customer_id nullable`, `invoice_id nullable`, `amount`, `payment_method`, `reference_number nullable`, `direction`, `status`, `received_by`, `paid_at`, `notes`, `created_at`.

### CustomerLedgerEntry

`id`, `customer_id`, `branch_id`, `type CustomerLedgerType`, `invoice_id nullable`, `payment_id nullable`, `return_id nullable`, `debit`, `credit`, `balance_after`, `notes`, `occurred_at`, `created_by`, `created_at`.

Positive balance means customer owes; negative balance means customer advance. Walk-in customers do not receive ledger entries.

### HeldSale

`id`, `branch_id`, `customer_id nullable`, `label`, `cart_json`, `held_by`, `held_at`, `expires_at nullable`, `updated_at`. Held carts do not move stock unless reservations are explicitly enabled.

## 6. Returns, replacements, warranty, and claims

### SaleReturn

`id`, `return_number`, `invoice_id`, `branch_id`, `customer_id nullable`, `type ReturnType`, `status`, `reason`, `notes`, `refund_amount`, `created_by`, `approved_by nullable`, `created_at`, `completed_at nullable`.

### SaleReturnItem

`id`, `sale_return_id`, `invoice_item_id`, `product_id`, `original_product_lot_id nullable`, `displayed_quantity`, `base_quantity`, `condition`, `refund_amount`, `restock_action` (RESTOCK_SAME_LOT, NEW_RETURN_LOT, DAMAGE, CLAIM), `stock_movement_id nullable`, `created_at`.

### ReplacementItem

`id`, `sale_return_id`, `product_id`, `product_unit_id`, `displayed_quantity`, `base_quantity`, `unit_price`, `invoice_item_lot_id nullable`, `stock_movement_id`, `created_at`.

### WarrantyClaim

`id`, `claim_number`, `invoice_id nullable`, `customer_id nullable`, `branch_id`, `supplier_id nullable`, `status ClaimStatus`, `problem`, `diagnosis nullable`, `resolution nullable`, `received_at`, `resolved_at nullable`, `created_by`, `assigned_to nullable`, `created_at`, `updated_at`.

### WarrantyClaimItem

`id`, `warranty_claim_id`, `invoice_item_id nullable`, `product_id`, `product_lot_id nullable`, `serial_number nullable`, `quantity`, `condition`, `action` (REPAIR, REPLACE, REFUND, REJECT), `replacement_product_id nullable`, `cost`, `created_at`.

### ClaimStatusHistory

`id`, `warranty_claim_id`, `from_status nullable`, `to_status`, `notes`, `changed_by`, `changed_at`.

## 7. Production and commissions

### ProductionJob

`id`, `production_number`, `branch_id`, `finished_product_id`, `employee_id`, `status`, `planned_output_quantity`, `actual_output_quantity`, `material_cost`, `waste_cost`, `labor_cost`, `commission_cost`, `total_cost`, `cost_per_output_base`, `notes`, `created_by`, `started_at nullable`, `completed_at nullable`, `created_at`, `updated_at`.

### ProductionMaterial

`id`, `production_job_id`, `component_product_id`, `component_unit_id`, `expected_quantity`, `expected_base_quantity`, `actual_quantity`, `actual_base_quantity`, `waste_base_quantity`, `actual_fifo_cost`, `waste_cost`, `created_at`, `updated_at`.

LotConsumption rows link each ProductionMaterial to actual consumed lots. Completion creates a ProductLot for the output with `source_type=PRODUCTION` and cost derived from the job.

### EmployeeCommission

`id`, `employee_id`, `branch_id`, `source_type` (PRODUCTION or REPAIR), `source_id`, `amount`, `status`, `approved_by nullable`, `approved_at nullable`, `paid_at nullable`, `money_transaction_id nullable`, `created_at`, `updated_at`.

## 8. Repairs and service work

### RepairJob

| Column | Type | Rules |
|---|---|---|
| id, branch_id | uuid | repair branch FK |
| repair_number | text | unique in this database |
| customer_id nullable | uuid | walk-in allowed |
| assigned_employee_id nullable | uuid | worker |
| item_name, complaint | text | required |
| serial_number nullable | text | |
| diagnosis, work_notes | text nullable | |
| status | RepairStatus | |
| payment_status | PaymentStatus | |
| estimated_amount | decimal(18,2) | |
| service_amount | decimal(18,2) | labor/service revenue |
| parts_amount | decimal(18,2) | charged parts |
| discount, total_amount, paid_amount, credit_amount | decimal(18,2) | |
| material_cost, waste_cost, commission_cost | decimal(18,2) | |
| contribution | decimal(18,2) | total revenue minus costs |
| received_at, promised_at nullable, ready_at nullable, delivered_at nullable | datetime | |
| created_by, created_at, updated_at | uuid/datetime | |

### RepairPart

`id`, `repair_job_id`, `product_id`, `product_unit_id`, `displayed_quantity`, `base_quantity`, `waste_base_quantity`, `selling_price`, `line_total`, `fifo_cost`, `waste_cost`, `created_at`, `updated_at`.

Repair use and waste create `REPAIR_USE` and `REPAIR_WASTE` StockMovement/LotConsumption records. Repair payments use Payment and MoneyTransaction; repair credit uses CustomerLedgerEntry.

## 9. Investors and funded inventory

### Investor

`id`, `type InvestorType`, `display_name`, `phone`, `email nullable`, `address nullable`, `identity_number nullable`, `organization_name nullable`, `contact_person nullable`, `notes`, `is_active`, `created_at`, `updated_at`.

An investor may be an individual or an organization. This is not a tenant record; it is a person or organization that funds inventory for this shop.

### Investment

`id`, `investor_id`, `investment_number`, `status`, `invested_amount`, `investor_profit_share_percent`, `business_profit_share_percent`, `investment_date`, `end_date nullable`, `notes`, `created_by`, `created_at`, `updated_at`. Shares must total 100.

### InvestmentAllocation

`id`, `investment_id`, `product_lot_id`, `goods_receipt_item_id nullable`, `allocated_principal`, `allocated_base_quantity`, `principal_recovered`, `remaining_principal`, `created_at`, `updated_at`.

Multiple allocations may fund a lot if the finalized accounting rules permit it; total allocated principal cannot exceed the lot purchase cost.

### InvestmentSaleAllocation

`id`, `investment_allocation_id`, `invoice_item_lot_id`, `sold_base_quantity`, `principal_recovered`, `gross_profit`, `investor_profit`, `business_profit`, `loss_amount`, `created_at`.

### InvestorLedgerEntry

`id`, `investor_id`, `investment_id nullable`, `type InvestorLedgerType`, `investment_allocation_id nullable`, `investment_sale_allocation_id nullable`, `money_transaction_id nullable`, `debit`, `credit`, `principal_balance_after`, `profit_balance_after`, `notes`, `occurred_at`, `created_by`, `created_at`.

## 10. Finance and expenses

### MoneyTransaction

`id`, `branch_id`, `direction`, `type`, `amount`, `payment_method`, `reference_type`, `reference_id`, `party_type nullable`, `party_id nullable`, `notes`, `occurred_at`, `created_by`, `created_at`.

### ExpenseCategory

`id`, `name`, `is_active`, `created_at`, `updated_at`.

### Expense

`id`, `branch_id`, `category_id`, `amount`, `payment_method`, `description`, `expense_date`, `money_transaction_id`, `created_by`, `created_at`, `updated_at`.

## Required transactional boundaries

The following operations must be atomic database transactions:

1. Create product with initial stock: Product + ProductUnit(s) + opening ProductLot + BranchLot + PURCHASE/ADJUSTMENT StockMovement.
2. Receive purchase: GoodsReceipt + ProductLot(s) + BranchLot(s) + StockMovement(s) + SupplierLedgerEntry.
3. Complete invoice: Invoice + InvoiceItem(s) + FIFO InvoiceItemLot/LotConsumption + StockMovement(s) + Payment + CustomerLedgerEntry when applicable.
4. Complete return/replacement: return records + refund/payment + customer ledger + stock movements + replacement FIFO allocations.
5. Complete transfer: decrement source BranchLot, increment destination BranchLot, and create paired movement records.
6. Complete production: consume components by FIFO, record waste, create output lot, post commission.
7. Use repair parts: consume by FIFO, record waste, update repair costs, post payment/credit/commission.
8. Investor-funded sale: FIFO allocation + principal recovery + profit split + investor ledger entries.

## Derived values and invariants

- Product overall available = sum active BranchLot remaining quantity across branches.
- Product local available = sum BranchLot remaining quantity for current branch.
- ProductLot remaining = original + returns/adjustments in − all consumption/transfers/damage out.
- BranchLot and ProductLot remaining must never be negative unless an explicit branch setting permits it.
- InvoiceItem base quantity = displayed quantity × conversion snapshot.
- FIFO allocations must total the transactional base quantity.
- Invoice total = sum line totals + tax − discount; paid + credit = total unless advance/change rules apply.
- Customer balance = ledger debit − credit; no direct balance edits.
- Supplier balance = supplier ledger debit − credit; no direct payable edits.
- Production output lot cost = material cost + waste cost + labor/commission cost, divided by actual output.
- Investor principal and investor profit are separate balances and must never be merged.

## Recommended implementation order

1. Replace duplicate frontend models with generated canonical DTOs.
2. Implement Product, ProductUnit, ProductLot, BranchLot, StockMovement, and LotConsumption repositories.
3. Make product creation/opening stock and invoice FIFO atomic.
4. Implement PurchaseOrder, GoodsReceipt, SupplierLedgerEntry, and supplier payments.
5. Normalize customer ledger, payments, returns/replacements, and warranty claims.
6. Split Production and Repairs into separate modules with actual material allocations.
7. Add investor accounting only after return, damage, loss, and partial-settlement rules are approved.
8. Replace mock analytics with backend queries over canonical history.
