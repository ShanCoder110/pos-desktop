-- Users soft delete
ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE users ADD COLUMN deleted_by TEXT REFERENCES users(id);

-- Who deleted party records
ALTER TABLE suppliers ADD COLUMN deleted_by TEXT REFERENCES users(id);
ALTER TABLE customers ADD COLUMN deleted_by TEXT REFERENCES users(id);
ALTER TABLE product_categories ADD COLUMN deleted_by TEXT REFERENCES users(id);
ALTER TABLE units ADD COLUMN deleted_by TEXT REFERENCES users(id);

-- Supplier phone unique (global within shop, empty phones allowed)
CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_phone ON suppliers(phone) WHERE phone <> '' AND deleted_at IS NULL;

-- Shop policy knobs
ALTER TABLE localization_settings ADD COLUMN trash_auto_purge_days INTEGER;
ALTER TABLE localization_settings ADD COLUMN payout_deduct_from TEXT NOT NULL DEFAULT 'PROFIT';

-- Staff payout ledger (immutable lines)
CREATE TABLE IF NOT EXISTS staff_ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  type TEXT NOT NULL,
  money_transaction_id TEXT REFERENCES money_transactions(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  balance_after REAL NOT NULL,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_staff_ledger_user ON staff_ledger_entries(user_id, occurred_at DESC);

-- Align ledger entry type names
UPDATE customer_ledger_entries SET type = 'OPENING_BALANCE' WHERE type = 'OPENING';
UPDATE supplier_ledger_entries SET type = 'OPENING_BALANCE' WHERE type = 'OPENING';
UPDATE customer_ledger_entries SET type = 'PAYMENT_RECEIVED' WHERE type = 'PAYMENT';
UPDATE supplier_ledger_entries SET type = 'PAYMENT_MADE' WHERE type = 'PAYMENT';
UPDATE customer_ledger_entries SET type = 'SALE' WHERE type = 'CREDIT_SALE';
