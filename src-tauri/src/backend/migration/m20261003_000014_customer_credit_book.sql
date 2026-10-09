ALTER TABLE customers ADD COLUMN in_credit_book INTEGER NOT NULL DEFAULT 0;

UPDATE customers
SET in_credit_book = 1
WHERE deleted_at IS NULL
  AND is_walk_in = 0
  AND (
    EXISTS (
      SELECT 1 FROM customer_ledger_entries cle WHERE cle.customer_id = customers.id
    )
    OR EXISTS (
      SELECT 1
      FROM invoices i
      WHERE i.customer_id = customers.id
        AND i.deleted_at IS NULL
        AND (i.credit_amount > 0 OR i.payment_status IN ('CREDIT', 'PARTIAL'))
    )
  );

CREATE INDEX IF NOT EXISTS ix_customers_credit_book
  ON customers(in_credit_book)
  WHERE deleted_at IS NULL AND in_credit_book = 1;
