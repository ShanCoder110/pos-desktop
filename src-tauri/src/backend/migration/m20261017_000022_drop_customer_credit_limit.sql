-- Drop customers.credit_limit (restored in 000021). Rebuild keeps all other columns/FKs.
-- Caller must run with foreign_keys OFF and legacy_alter_table ON (see .rs).

CREATE TABLE customers_new (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  address TEXT NOT NULL DEFAULT '',
  is_walk_in INTEGER NOT NULL DEFAULT 0,
  in_credit_book INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_by TEXT REFERENCES users(id),
  city_id TEXT REFERENCES cities(id)
);

INSERT INTO customers_new (
  id, name, phone, email, address, is_walk_in, in_credit_book, notes, is_active,
  version, deleted_at, origin_device_id, created_at, updated_at, deleted_by, city_id
)
SELECT
  id, name, phone, email, address, is_walk_in, in_credit_book, notes, is_active,
  version, deleted_at, origin_device_id, created_at, updated_at, deleted_by, city_id
FROM customers;

DROP TABLE customers;
ALTER TABLE customers_new RENAME TO customers;

CREATE INDEX IF NOT EXISTS ix_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS ix_customers_phone ON customers(phone);
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_phone
  ON customers(phone) WHERE phone <> '' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_customers_deleted_at ON customers(deleted_at);
CREATE INDEX IF NOT EXISTS ix_customers_active_name
  ON customers(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_customers_credit_book
  ON customers(in_credit_book)
  WHERE deleted_at IS NULL AND in_credit_book = 1;
