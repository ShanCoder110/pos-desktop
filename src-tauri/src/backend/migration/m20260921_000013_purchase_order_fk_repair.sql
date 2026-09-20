-- Repair stale FK metadata left when migration 000012 renamed purchase_orders but child
-- tables still referenced purchase_orders_legacy after the legacy table was dropped.
PRAGMA foreign_keys = OFF;

ALTER TABLE purchase_order_items RENAME TO purchase_order_items_legacy;

CREATE TABLE purchase_order_items (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  unit_id TEXT NOT NULL REFERENCES product_units(id),
  unit_name_snapshot TEXT NOT NULL,
  ordered_quantity REAL NOT NULL CHECK (ordered_quantity > 0),
  ordered_base_quantity REAL NOT NULL CHECK (ordered_base_quantity > 0),
  expected_unit_cost REAL NOT NULL CHECK (expected_unit_cost >= 0),
  received_base_quantity REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO purchase_order_items SELECT * FROM purchase_order_items_legacy;
DROP TABLE purchase_order_items_legacy;

CREATE INDEX IF NOT EXISTS ix_purchase_order_items_product ON purchase_order_items(product_id);

ALTER TABLE goods_receipts RENAME TO goods_receipts_legacy;

CREATE TABLE goods_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  receipt_number TEXT NOT NULL UNIQUE,
  supplier_invoice_number TEXT,
  received_date TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  received_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO goods_receipts SELECT * FROM goods_receipts_legacy;
DROP TABLE goods_receipts_legacy;

ALTER TABLE supplier_ledger_entries RENAME TO supplier_ledger_entries_legacy;

CREATE TABLE supplier_ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  type TEXT NOT NULL,
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  goods_receipt_id TEXT REFERENCES goods_receipts(id),
  money_transaction_id TEXT REFERENCES money_transactions(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  balance_after REAL NOT NULL,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

INSERT INTO supplier_ledger_entries SELECT * FROM supplier_ledger_entries_legacy;
DROP TABLE supplier_ledger_entries_legacy;

PRAGMA foreign_keys = ON;
