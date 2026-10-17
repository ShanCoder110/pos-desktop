CREATE TABLE invoices_new (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  customer_id TEXT REFERENCES customers(id),
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','COMPLETED','CANCELLED')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID','PARTIAL','PAID','CREDIT','REFUNDED','RETURNED','PARTIALLY_RETURNED')),
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
  id, branch_id, customer_id, invoice_number, status, payment_status,
  subtotal, discount, tax, total, paid_amount, credit_amount, change_amount,
  notes, created_by, cashier_name_snapshot, device_id, client_request_id,
  completed_at, cancelled_at, void_reason, voided_by, voided_at, version,
  deleted_at, origin_device_id, created_at, updated_at
FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

CREATE INDEX IF NOT EXISTS ix_invoices_created ON invoices(created_at);
CREATE INDEX IF NOT EXISTS ix_invoices_customer ON invoices(customer_id, created_at);

-- Existing full credit returns that were left as PAID with Paid Rs 0.
UPDATE invoices
SET payment_status = 'RETURNED'
WHERE deleted_at IS NULL
  AND credit_amount = 0
  AND paid_amount = 0
  AND payment_status IN ('PAID', 'CREDIT', 'PARTIAL')
  AND EXISTS (SELECT 1 FROM sale_returns sr WHERE sr.invoice_id = invoices.id);

-- Existing partial credit returns that still showed CREDIT/PARTIAL only.
UPDATE invoices
SET payment_status = 'PARTIALLY_RETURNED'
WHERE deleted_at IS NULL
  AND credit_amount > 0
  AND payment_status IN ('CREDIT', 'PARTIAL', 'PAID')
  AND EXISTS (SELECT 1 FROM sale_returns sr WHERE sr.invoice_id = invoices.id);
