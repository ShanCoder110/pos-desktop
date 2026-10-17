-- Named credit-book customers with realistic credit_limit values.
-- Applied by `db seed` only (after migrations restore credit_limit + in_credit_book).
-- Idempotent: INSERT OR IGNORE + UPDATE refreshes limits on re-run.

INSERT OR IGNORE INTO customers
  (id, name, phone, email, address, credit_limit, is_walk_in, in_credit_book, notes, is_active, version, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000040', 'Seed Credit Ali', '03001110001', NULL, 'Seed Street 1', 50000, 0, 1, 'Seeded credit customer', 1, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000041', 'Seed Credit Sara', '03001110002', NULL, 'Seed Street 2', 100000, 0, 1, 'Seeded credit customer', 1, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

UPDATE customers
SET credit_limit = 50000,
    in_credit_book = 1,
    is_active = 1,
    deleted_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = X'20000000000040008000000000000040';

UPDATE customers
SET credit_limit = 100000,
    in_credit_book = 1,
    is_active = 1,
    deleted_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = X'20000000000040008000000000000041';
