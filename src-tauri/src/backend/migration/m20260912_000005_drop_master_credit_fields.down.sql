ALTER TABLE suppliers ADD COLUMN tax_number TEXT;
ALTER TABLE suppliers ADD COLUMN payment_terms_days INTEGER;
ALTER TABLE suppliers ADD COLUMN credit_limit REAL;
ALTER TABLE customers ADD COLUMN credit_limit REAL;
