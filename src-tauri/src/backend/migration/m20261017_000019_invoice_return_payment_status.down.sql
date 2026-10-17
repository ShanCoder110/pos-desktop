PRAGMA foreign_keys = OFF;

CREATE TABLE invoices_new (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  customer_id TEXT REFERENCES customers(id),
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','COMPLETED','CANCELLED')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID','PARTIAL','PAID','CREDIT','REFUNDED')),
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  credit_amount REAL NOT NULL DEFAULT 0,
  change_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  cashier_name_snapshot TEXT NOT NULL,
  device_id TEXT REFERENCES devices(id),
  client_request_id TEXT NOT NULL UNIQUE,
  completed_at TEXT,
  cancelled_at TEXT,
  void_reason TEXT,
  voided_by TEXT REFERENCES users(id),
  voided_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO invoices_new (
  id, branch_id, customer_id, invoice_number, status, payment_status,
  subtotal, discount, tax, total, paid_amount, credit_amount, change_amount,
  notes, created_by, cashier_name_snapshot, device_id, client_request_id,
  completed_at, cancelled_at, void_reason, voided_by, voided_at, version,
  deleted_at, origin_device_id, created_at, updated_at
)
SELECT
  id, branch_id, customer_id, invoice_number, status,
  CASE payment_status
    WHEN 'RETURNED' THEN 'REFUNDED'
    WHEN 'PARTIALLY_RETURNED' THEN 'PARTIAL'
    ELSE payment_status
  END,
  subtotal, discount, tax, total, paid_amount, credit_amount, change_amount,
  notes, created_by, cashier_name_snapshot, device_id, client_request_id,
  completed_at, cancelled_at, void_reason, voided_by, voided_at, version,
  deleted_at, origin_device_id, created_at, updated_at
FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

CREATE INDEX IF NOT EXISTS ix_invoices_created ON invoices(created_at);
CREATE INDEX IF NOT EXISTS ix_invoices_customer ON invoices(customer_id, created_at);

PRAGMA foreign_keys = ON;
