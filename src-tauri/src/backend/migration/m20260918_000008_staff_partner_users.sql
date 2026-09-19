DROP TABLE IF EXISTS users_partner_migration;

CREATE TABLE users_partner_migration (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT,
  default_branch_id TEXT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER','MANAGER','CASHIER','TECHNICIAN','PARTNER')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO users_partner_migration (
  id, business_id, default_branch_id, name, username, password_hash, phone, email, role,
  is_active, last_login_at, deleted_at, deleted_by, created_at, updated_at
)
SELECT
  id,
  business_id,
  default_branch_id,
  name,
  username,
  password_hash,
  phone,
  email,
  CASE WHEN role = 'ACCOUNTANT' THEN 'PARTNER' ELSE role END,
  is_active,
  last_login_at,
  deleted_at,
  deleted_by,
  created_at,
  updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_partner_migration RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone ON users(phone) WHERE phone IS NOT NULL AND phone <> '' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(email) WHERE email IS NOT NULL AND email <> '' AND deleted_at IS NULL;
