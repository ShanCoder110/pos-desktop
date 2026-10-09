DROP INDEX IF EXISTS ix_customers_credit_book;
-- SQLite cannot DROP COLUMN reliably on older DBs; leave column in place on down.
