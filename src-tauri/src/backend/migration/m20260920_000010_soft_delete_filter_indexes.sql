-- Soft-delete / list filter indexes (common WHERE deleted_at IS NULL scans).
CREATE INDEX IF NOT EXISTS ix_suppliers_deleted_at ON suppliers(deleted_at);
CREATE INDEX IF NOT EXISTS ix_customers_deleted_at ON customers(deleted_at);
CREATE INDEX IF NOT EXISTS ix_products_deleted_at ON products(deleted_at);
CREATE INDEX IF NOT EXISTS ix_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS ix_suppliers_active_name ON suppliers(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_customers_active_name ON customers(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_products_active_name ON products(name) WHERE deleted_at IS NULL;
