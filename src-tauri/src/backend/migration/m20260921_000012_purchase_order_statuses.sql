PRAGMA foreign_keys = OFF;

ALTER TABLE purchase_orders RENAME TO purchase_orders_legacy;

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('PENDING','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  order_date TEXT NOT NULL,
  expected_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  ordered_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO purchase_orders (
  id, branch_id, supplier_id, order_number, status, order_date, expected_date,
  subtotal, discount, tax, total, notes, created_by, approved_by, ordered_at,
  completed_at, cancelled_at, version, deleted_at, origin_device_id, created_at, updated_at
)
SELECT
  id, branch_id, supplier_id, order_number,
  CASE status
    WHEN 'DRAFT' THEN 'PENDING'
    WHEN 'ORDERED' THEN 'PENDING'
    WHEN 'PARTIAL' THEN 'PARTIALLY_RECEIVED'
    WHEN 'COMPLETED' THEN 'RECEIVED'
    ELSE status
  END,
  order_date, expected_date, subtotal, discount, tax, total, notes, created_by, approved_by,
  COALESCE(ordered_at, created_at), completed_at, cancelled_at, version, deleted_at,
  origin_device_id, created_at, updated_at
FROM purchase_orders_legacy;

DROP TABLE purchase_orders_legacy;

CREATE INDEX IF NOT EXISTS ix_purchase_orders_supplier ON purchase_orders(supplier_id, order_date);
CREATE INDEX IF NOT EXISTS ix_purchase_orders_status_date ON purchase_orders(status, order_date);
CREATE INDEX IF NOT EXISTS ix_purchase_order_items_product ON purchase_order_items(product_id);

PRAGMA foreign_keys = ON;
