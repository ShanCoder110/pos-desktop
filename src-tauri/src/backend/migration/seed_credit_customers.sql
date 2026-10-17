-- Named credit-book customers (no spending caps — removed in Step 22 / migration 000022).
-- Applied by `db seed` only. Idempotent: INSERT OR IGNORE + UPDATE refreshes flags on re-run.

INSERT OR IGNORE INTO customers
  (id, name, phone, email, address, is_walk_in, in_credit_book, notes, is_active, version, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000040', 'Seed Credit Ali', '03001110001', NULL, 'Seed Street 1', 0, 1, 'Seeded credit customer', 1, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000041', 'Seed Credit Sara', '03001110002', NULL, 'Seed Street 2', 0, 1, 'Seeded credit customer', 1, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

UPDATE customers
SET in_credit_book = 1,
    is_active = 1,
    deleted_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = X'20000000000040008000000000000040';

UPDATE customers
SET in_credit_book = 1,
    is_active = 1,
    deleted_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = X'20000000000040008000000000000041';
