-- Restore customer credit_limit (dropped in 000005). Seeded credit customers need a cap.
ALTER TABLE customers ADD COLUMN credit_limit REAL;
