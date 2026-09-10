PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('STORE','WAREHOUSE','REPAIR','PRODUCTION')),
  phone TEXT,
  address TEXT,
  is_main INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_branches_main ON branches(is_main) WHERE is_main = 1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS branch_settings (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL UNIQUE REFERENCES branches(id),
  allow_negative_stock INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative_stock IN (0, 1)),
  require_confirmed_cross_branch_transfer INTEGER NOT NULL DEFAULT 1 CHECK (require_confirmed_cross_branch_transfer IN (0, 1)),
  fifo_enabled INTEGER NOT NULL DEFAULT 1 CHECK (fifo_enabled IN (0, 1)),
  default_walk_in_customer_id TEXT REFERENCES customers(id),
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  repair_prefix TEXT NOT NULL DEFAULT 'RPR',
  production_prefix TEXT NOT NULL DEFAULT 'PRD',
  lot_prefix TEXT NOT NULL DEFAULT 'L',
  sku_prefix TEXT NOT NULL DEFAULT 'P',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS localization_settings (
  id TEXT PRIMARY KEY NOT NULL,
  currency_symbol TEXT NOT NULL DEFAULT 'Rs',
  currency_code TEXT NOT NULL DEFAULT 'PKR',
  language TEXT NOT NULL DEFAULT 'EN' CHECK (language IN ('EN','UR')),
  expiry_reminder_days INTEGER NOT NULL DEFAULT 30 CHECK (expiry_reminder_days >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_sequences (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  branch_id TEXT REFERENCES branches(id),
  device_id TEXT REFERENCES devices(id),
  prefix TEXT NOT NULL,
  pad INTEGER NOT NULL DEFAULT 4 CHECK (pad BETWEEN 1 AND 12),
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(kind, branch_id, device_id)
);

CREATE TABLE IF NOT EXISTS receipt_settings (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL UNIQUE REFERENCES branches(id),
  paper_width TEXT NOT NULL DEFAULT 'MM_80' CHECK (paper_width IN ('MM_58','MM_80','A4')),
  shop_name TEXT NOT NULL,
  shop_name_size_pt INTEGER NOT NULL DEFAULT 16,
  shop_name_bold INTEGER NOT NULL DEFAULT 1,
  header_display TEXT NOT NULL DEFAULT 'LOGO' CHECK (header_display IN ('LOGO','SHOP_NAME','BOTH')),
  show_logo INTEGER NOT NULL DEFAULT 1,
  logo_path TEXT,
  logo_height_pt INTEGER NOT NULL DEFAULT 40,
  font_family TEXT NOT NULL DEFAULT 'Arial',
  body_size_pt INTEGER NOT NULL DEFAULT 10,
  items_table_bordered INTEGER NOT NULL DEFAULT 1,
  tagline TEXT,
  tagline_align TEXT NOT NULL DEFAULT 'CENTER',
  tagline_size_pt INTEGER NOT NULL DEFAULT 10,
  contact_line TEXT,
  contact_align TEXT NOT NULL DEFAULT 'CENTER',
  contact_size_pt INTEGER NOT NULL DEFAULT 10,
  promo_urdu TEXT,
  promo_align TEXT NOT NULL DEFAULT 'CENTER',
  promo_size_pt INTEGER NOT NULL DEFAULT 14,
  promo_bold INTEGER NOT NULL DEFAULT 1,
  footer_note TEXT,
  footer_note_size_pt INTEGER NOT NULL DEFAULT 9,
  footer_note_bold INTEGER NOT NULL DEFAULT 1,
  software_credit TEXT,
  software_credit_size_pt INTEGER NOT NULL DEFAULT 8,
  show_customer_balance INTEGER NOT NULL DEFAULT 1,
  show_item_discount INTEGER NOT NULL DEFAULT 0,
  show_cashier_name INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT REFERENCES businesses(id),
  default_branch_id TEXT REFERENCES branches(id),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER','MANAGER','CASHIER','TECHNICIAN','ACCOUNTANT')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  permission_key TEXT NOT NULL,
  is_allowed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  device_key_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  last_synced_at TEXT,
  sync_cursor TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_printers (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL UNIQUE REFERENCES devices(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  printer_name TEXT NOT NULL,
  paper_width TEXT NOT NULL DEFAULT 'MM_80',
  font_size_pt INTEGER,
  auto_print_after_sale INTEGER NOT NULL DEFAULT 0,
  split_long_bill INTEGER NOT NULL DEFAULT 0,
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  cashier_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  opening_float REAL NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  expected_cash REAL,
  counted_cash REAL,
  variance REAL,
  notes TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cash_session_open_device ON cash_sessions(device_id) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(id),
  direction TEXT NOT NULL CHECK (direction IN ('PUSH','PULL')),
  status TEXT NOT NULL,
  cursor_from TEXT,
  cursor_to TEXT,
  records_pushed INTEGER NOT NULL DEFAULT 0,
  records_pulled INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_mutations (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  payload_json TEXT NOT NULL,
  client_request_id TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','ACKED','REJECTED','CONFLICT')),
  error_message TEXT,
  created_at TEXT NOT NULL,
  acked_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_sync_mutations_status_created ON sync_mutations(status, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT REFERENCES branches(id),
  user_id TEXT REFERENCES users(id),
  device_id TEXT REFERENCES devices(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs(entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_categories_name ON product_categories(lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  precision INTEGER NOT NULL DEFAULT 0 CHECK (precision BETWEEN 0 AND 6),
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_units_symbol ON units(lower(symbol)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_number TEXT,
  payment_terms_days INTEGER,
  credit_limit REAL,
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS ix_suppliers_phone ON suppliers(phone);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  address TEXT NOT NULL DEFAULT '',
  credit_limit REAL,
  is_walk_in INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS ix_customers_phone ON customers(phone);
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_phone ON customers(phone) WHERE phone <> '' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES product_categories(id),
  base_unit_id TEXT NOT NULL REFERENCES units(id),
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'STANDARD' CHECK (product_type IN ('STANDARD','MANUFACTURED')),
  track_lots INTEGER NOT NULL DEFAULT 1,
  track_expiry INTEGER NOT NULL DEFAULT 0,
  minimum_stock REAL NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  warranty_duration INTEGER,
  warranty_unit TEXT CHECK (warranty_unit IN ('DAYS','MONTHS') OR warranty_unit IS NULL),
  warranty_note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_sku ON products(sku) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_barcode ON products(barcode) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_products_name ON products(name);
CREATE INDEX IF NOT EXISTS ix_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS product_units (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  display_name TEXT NOT NULL,
  conversion_to_base REAL NOT NULL CHECK (conversion_to_base > 0),
  cost_reference REAL,
  minimum_price REAL NOT NULL CHECK (minimum_price >= 0),
  wholesale_price REAL NOT NULL CHECK (wholesale_price >= 0),
  retail_price REAL NOT NULL CHECK (retail_price >= 0),
  barcode TEXT,
  is_base INTEGER NOT NULL DEFAULT 0,
  is_default_sale_unit INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(product_id, unit_id, conversion_to_base)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_units_barcode ON product_units(barcode) WHERE barcode IS NOT NULL AND barcode <> '' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_units_base ON product_units(product_id) WHERE is_base = 1 AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_units_default ON product_units(product_id) WHERE is_default_sale_unit = 1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS product_components (
  id TEXT PRIMARY KEY NOT NULL,
  finished_product_id TEXT NOT NULL REFERENCES products(id),
  component_product_id TEXT NOT NULL REFERENCES products(id),
  component_unit_id TEXT NOT NULL REFERENCES product_units(id),
  expected_quantity REAL NOT NULL CHECK (expected_quantity > 0),
  expected_base_quantity REAL NOT NULL CHECK (expected_base_quantity > 0),
  waste_allowance_quantity REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (finished_product_id <> component_product_id),
  UNIQUE(finished_product_id, component_product_id, component_unit_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','ORDERED','PARTIAL','COMPLETED','CANCELLED')),
  order_date TEXT NOT NULL,
  expected_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  ordered_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  unit_id TEXT NOT NULL REFERENCES product_units(id),
  unit_name_snapshot TEXT NOT NULL,
  ordered_quantity REAL NOT NULL CHECK (ordered_quantity > 0),
  ordered_base_quantity REAL NOT NULL CHECK (ordered_base_quantity > 0),
  expected_unit_cost REAL NOT NULL CHECK (expected_unit_cost >= 0),
  received_base_quantity REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  receipt_number TEXT NOT NULL UNIQUE,
  supplier_invoice_number TEXT,
  received_date TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  received_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_lots (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  supplier_id TEXT REFERENCES suppliers(id),
  goods_receipt_item_id TEXT REFERENCES goods_receipt_items(id),
  production_job_id TEXT REFERENCES production_jobs(id),
  lot_number TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('OPENING','PURCHASE','PRODUCTION','RETURN','ADJUSTMENT')),
  original_base_quantity REAL NOT NULL CHECK (original_base_quantity >= 0),
  remaining_base_quantity REAL NOT NULL CHECK (remaining_base_quantity >= 0),
  damaged_base_quantity REAL NOT NULL DEFAULT 0 CHECK (damaged_base_quantity >= 0),
  purchase_price_per_base REAL NOT NULL CHECK (purchase_price_per_base >= 0),
  received_date TEXT NOT NULL,
  expiry_date TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_product_lots_fifo ON product_lots(product_id, received_date, created_at);
CREATE INDEX IF NOT EXISTS ix_product_lots_expiry ON product_lots(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id TEXT PRIMARY KEY NOT NULL,
  goods_receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id TEXT REFERENCES purchase_order_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  unit_id TEXT NOT NULL REFERENCES product_units(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  base_quantity REAL NOT NULL CHECK (base_quantity > 0),
  purchase_price_per_base REAL NOT NULL,
  minimum_price REAL NOT NULL,
  wholesale_price REAL NOT NULL,
  retail_price REAL NOT NULL,
  expiry_date TEXT,
  lot_id TEXT NOT NULL UNIQUE REFERENCES product_lots(id),
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branch_lots (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  product_lot_id TEXT NOT NULL REFERENCES product_lots(id),
  allocated_base_quantity REAL NOT NULL CHECK (allocated_base_quantity >= 0),
  remaining_base_quantity REAL NOT NULL CHECK (remaining_base_quantity >= 0),
  reserved_base_quantity REAL NOT NULL DEFAULT 0 CHECK (reserved_base_quantity >= 0),
  damaged_base_quantity REAL NOT NULL DEFAULT 0 CHECK (damaged_base_quantity >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE(branch_id, product_lot_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_lot_id TEXT REFERENCES product_lots(id),
  product_unit_id TEXT REFERENCES product_units(id),
  type TEXT NOT NULL,
  displayed_quantity REAL NOT NULL,
  displayed_unit_name TEXT NOT NULL,
  base_quantity_delta REAL NOT NULL,
  unit_cost REAL,
  total_cost REAL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_stock_movements_product_time ON stock_movements(product_id, occurred_at);
CREATE INDEX IF NOT EXISTS ix_stock_movements_reference ON stock_movements(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS lot_consumptions (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_lot_id TEXT NOT NULL REFERENCES product_lots(id),
  stock_movement_id TEXT NOT NULL REFERENCES stock_movements(id),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  base_quantity REAL NOT NULL CHECK (base_quantity > 0),
  unit_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY NOT NULL,
  transfer_number TEXT NOT NULL UNIQUE,
  from_branch_id TEXT NOT NULL REFERENCES branches(id),
  to_branch_id TEXT NOT NULL REFERENCES branches(id),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SENT','PARTIAL','RECEIVED','CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  sent_by TEXT REFERENCES users(id),
  received_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  sent_at TEXT,
  received_at TEXT,
  cancelled_at TEXT,
  CHECK (from_branch_id <> to_branch_id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id TEXT PRIMARY KEY NOT NULL,
  stock_transfer_id TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_lot_id TEXT NOT NULL REFERENCES product_lots(id),
  requested_base_quantity REAL NOT NULL,
  sent_base_quantity REAL NOT NULL DEFAULT 0,
  received_base_quantity REAL NOT NULL DEFAULT 0,
  damaged_in_transit_quantity REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  adjustment_number TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id TEXT PRIMARY KEY NOT NULL,
  stock_adjustment_id TEXT NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_lot_id TEXT REFERENCES product_lots(id),
  system_base_quantity REAL NOT NULL,
  counted_base_quantity REAL NOT NULL,
  difference_base_quantity REAL NOT NULL,
  unit_cost REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  customer_id TEXT REFERENCES customers(id),
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','COMPLETED','CANCELLED')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID','PARTIAL','PAID','CREDIT','REFUNDED')),
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  credit_amount REAL NOT NULL DEFAULT 0,
  change_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  cashier_name_snapshot TEXT NOT NULL,
  device_id TEXT REFERENCES devices(id),
  client_request_id TEXT NOT NULL UNIQUE,
  completed_at TEXT,
  cancelled_at TEXT,
  void_reason TEXT,
  voided_by TEXT REFERENCES users(id),
  voided_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_invoices_created ON invoices(created_at);
CREATE INDEX IF NOT EXISTS ix_invoices_customer ON invoices(customer_id, created_at);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_unit_id TEXT REFERENCES product_units(id),
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  displayed_quantity REAL NOT NULL CHECK (displayed_quantity > 0),
  conversion_to_base REAL NOT NULL CHECK (conversion_to_base > 0),
  base_quantity REAL NOT NULL CHECK (base_quantity > 0),
  unit_price REAL NOT NULL,
  minimum_price_snapshot REAL NOT NULL,
  price_mode TEXT NOT NULL DEFAULT 'RETAIL' CHECK (price_mode IN ('RETAIL','WHOLESALE')),
  sold_below_minimum INTEGER NOT NULL DEFAULT 0 CHECK (sold_below_minimum IN (0, 1)),
  authorized_by TEXT REFERENCES users(id),
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  fifo_cost REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_item_lots (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_item_id TEXT NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  product_lot_id TEXT NOT NULL REFERENCES product_lots(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  base_quantity REAL NOT NULL CHECK (base_quantity > 0),
  unit_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  stock_movement_id TEXT NOT NULL REFERENCES stock_movements(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  customer_id TEXT REFERENCES customers(id),
  invoice_id TEXT REFERENCES invoices(id),
  cash_session_id TEXT REFERENCES cash_sessions(id),
  amount REAL NOT NULL CHECK (amount > 0),
  amount_tendered REAL,
  change_amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','CARD','BANK','MOBILE','OTHER')),
  reference_number TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  status TEXT NOT NULL,
  received_by TEXT NOT NULL REFERENCES users(id),
  paid_at TEXT NOT NULL,
  notes TEXT,
  client_request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  type TEXT NOT NULL,
  invoice_id TEXT REFERENCES invoices(id),
  payment_id TEXT REFERENCES payments(id),
  return_id TEXT REFERENCES sale_returns(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  balance_after REAL NOT NULL,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  type TEXT NOT NULL,
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  goods_receipt_id TEXT REFERENCES goods_receipts(id),
  money_transaction_id TEXT REFERENCES money_transactions(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  balance_after REAL NOT NULL,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS held_sales (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  customer_id TEXT REFERENCES customers(id),
  label TEXT NOT NULL,
  cart_json TEXT NOT NULL,
  held_by TEXT NOT NULL REFERENCES users(id),
  held_at TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id TEXT PRIMARY KEY NOT NULL,
  return_number TEXT NOT NULL UNIQUE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  customer_id TEXT REFERENCES customers(id),
  type TEXT NOT NULL CHECK (type IN ('REFUND','REPLACEMENT','CLAIM')),
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  refund_amount REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id TEXT PRIMARY KEY NOT NULL,
  sale_return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  invoice_item_id TEXT NOT NULL REFERENCES invoice_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  original_product_lot_id TEXT REFERENCES product_lots(id),
  displayed_quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('GOOD','DAMAGED','WARRANTY','SCRAP')),
  refund_amount REAL NOT NULL DEFAULT 0,
  restock_action TEXT NOT NULL,
  stock_movement_id TEXT REFERENCES stock_movements(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS replacement_items (
  id TEXT PRIMARY KEY NOT NULL,
  sale_return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_unit_id TEXT NOT NULL REFERENCES product_units(id),
  displayed_quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  invoice_item_lot_id TEXT REFERENCES invoice_item_lots(id),
  stock_movement_id TEXT NOT NULL REFERENCES stock_movements(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warranty_claims (
  id TEXT PRIMARY KEY NOT NULL,
  claim_number TEXT NOT NULL UNIQUE,
  invoice_id TEXT REFERENCES invoices(id),
  customer_id TEXT REFERENCES customers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  supplier_id TEXT REFERENCES suppliers(id),
  status TEXT NOT NULL CHECK (status IN ('OPEN','INSPECTING','APPROVED','REJECTED','RESOLVED','CANCELLED')),
  problem TEXT NOT NULL,
  diagnosis TEXT,
  resolution TEXT,
  received_at TEXT NOT NULL,
  resolved_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warranty_claim_items (
  id TEXT PRIMARY KEY NOT NULL,
  warranty_claim_id TEXT NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
  invoice_item_id TEXT REFERENCES invoice_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_lot_id TEXT REFERENCES product_lots(id),
  serial_number TEXT,
  quantity REAL NOT NULL,
  condition TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('REPAIR','REPLACE','REFUND','REJECT')),
  replacement_product_id TEXT REFERENCES products(id),
  cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_status_history (
  id TEXT PRIMARY KEY NOT NULL,
  warranty_claim_id TEXT NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  notes TEXT,
  changed_by TEXT NOT NULL REFERENCES users(id),
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  production_number TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  finished_product_id TEXT NOT NULL REFERENCES products(id),
  employee_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','IN_PROGRESS','COMPLETED','CANCELLED')),
  planned_output_quantity REAL NOT NULL,
  actual_output_quantity REAL NOT NULL DEFAULT 0,
  material_cost REAL NOT NULL DEFAULT 0,
  waste_cost REAL NOT NULL DEFAULT 0,
  labor_cost REAL NOT NULL DEFAULT 0,
  commission_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  cost_per_output_base REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_materials (
  id TEXT PRIMARY KEY NOT NULL,
  production_job_id TEXT NOT NULL REFERENCES production_jobs(id) ON DELETE CASCADE,
  component_product_id TEXT NOT NULL REFERENCES products(id),
  component_unit_id TEXT NOT NULL REFERENCES product_units(id),
  expected_quantity REAL NOT NULL,
  expected_base_quantity REAL NOT NULL,
  actual_quantity REAL NOT NULL DEFAULT 0,
  actual_base_quantity REAL NOT NULL DEFAULT 0,
  waste_base_quantity REAL NOT NULL DEFAULT 0,
  actual_fifo_cost REAL NOT NULL DEFAULT 0,
  waste_cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_commissions (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL REFERENCES users(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('PRODUCTION','REPAIR')),
  source_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','PAID','CANCELLED')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  paid_at TEXT,
  money_transaction_id TEXT REFERENCES money_transactions(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repair_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  repair_number TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customers(id),
  assigned_employee_id TEXT REFERENCES users(id),
  item_name TEXT NOT NULL,
  complaint TEXT NOT NULL,
  serial_number TEXT,
  diagnosis TEXT,
  work_notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED','IN_PROGRESS','READY','DELIVERED','CANCELLED')),
  payment_status TEXT NOT NULL,
  estimated_amount REAL NOT NULL DEFAULT 0,
  service_amount REAL NOT NULL DEFAULT 0,
  parts_amount REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  credit_amount REAL NOT NULL DEFAULT 0,
  material_cost REAL NOT NULL DEFAULT 0,
  waste_cost REAL NOT NULL DEFAULT 0,
  commission_cost REAL NOT NULL DEFAULT 0,
  contribution REAL NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  promised_at TEXT,
  ready_at TEXT,
  delivered_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repair_parts (
  id TEXT PRIMARY KEY NOT NULL,
  repair_job_id TEXT NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_unit_id TEXT NOT NULL REFERENCES product_units(id),
  displayed_quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  waste_base_quantity REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL,
  line_total REAL NOT NULL,
  fifo_cost REAL NOT NULL DEFAULT 0,
  waste_cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investors (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INDIVIDUAL','ORGANIZATION')),
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  address TEXT,
  identity_number TEXT,
  organization_name TEXT,
  contact_person TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY NOT NULL,
  investor_id TEXT NOT NULL REFERENCES investors(id),
  investment_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CLOSED','CANCELLED')),
  invested_amount REAL NOT NULL CHECK (invested_amount > 0),
  investor_profit_share_percent NUMERIC(7,4) NOT NULL,
  business_profit_share_percent NUMERIC(7,4) NOT NULL,
  investment_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (investor_profit_share_percent + business_profit_share_percent = 100)
);

CREATE TABLE IF NOT EXISTS investment_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  investment_id TEXT NOT NULL REFERENCES investments(id),
  product_lot_id TEXT NOT NULL REFERENCES product_lots(id),
  goods_receipt_item_id TEXT REFERENCES goods_receipt_items(id),
  allocated_principal REAL NOT NULL CHECK (allocated_principal > 0),
  allocated_base_quantity REAL NOT NULL CHECK (allocated_base_quantity > 0),
  principal_recovered REAL NOT NULL DEFAULT 0,
  remaining_principal REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investment_sale_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  investment_allocation_id TEXT NOT NULL REFERENCES investment_allocations(id),
  invoice_item_lot_id TEXT NOT NULL REFERENCES invoice_item_lots(id),
  sold_base_quantity REAL NOT NULL,
  principal_recovered REAL NOT NULL,
  gross_profit REAL NOT NULL,
  investor_profit REAL NOT NULL,
  business_profit REAL NOT NULL,
  loss_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS money_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  cash_session_id TEXT REFERENCES cash_sessions(id),
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  type TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','CARD','BANK','MOBILE','OTHER')),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  party_type TEXT,
  party_id TEXT,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_money_transactions_time ON money_transactions(occurred_at);
CREATE INDEX IF NOT EXISTS ix_money_transactions_reference ON money_transactions(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS investor_ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  investor_id TEXT NOT NULL REFERENCES investors(id),
  investment_id TEXT REFERENCES investments(id),
  type TEXT NOT NULL,
  investment_allocation_id TEXT REFERENCES investment_allocations(id),
  investment_sale_allocation_id TEXT REFERENCES investment_sale_allocations(id),
  money_transaction_id TEXT REFERENCES money_transactions(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  principal_balance_after REAL NOT NULL,
  profit_balance_after REAL NOT NULL,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  origin_device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_categories_name ON expense_categories(lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  cash_session_id TEXT REFERENCES cash_sessions(id),
  category_id TEXT NOT NULL REFERENCES expense_categories(id),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','CARD','BANK','MOBILE','OTHER')),
  description TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  money_transaction_id TEXT NOT NULL REFERENCES money_transactions(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_product_lots_supplier ON product_lots(supplier_id, received_date);
CREATE INDEX IF NOT EXISTS ix_branch_lots_stock ON branch_lots(branch_id, remaining_base_quantity);
CREATE INDEX IF NOT EXISTS ix_purchase_orders_supplier ON purchase_orders(supplier_id, order_date);
CREATE INDEX IF NOT EXISTS ix_payments_customer ON payments(customer_id, paid_at);
CREATE INDEX IF NOT EXISTS ix_claims_status ON warranty_claims(status, received_at);
CREATE INDEX IF NOT EXISTS ix_repairs_status ON repair_jobs(status, received_at);
