-- Seed one local shop: main branch, device, walk-in customer, settings, sequences.
-- Owner account is created during first-run onboarding (auth/setup), not here.
-- IDs are binary UUIDs to match SeaORM's SQLite UUID storage.

INSERT OR IGNORE INTO branches
  (id, name, code, type, phone, address, is_main, is_active, version, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000001', 'Main Store', 'MAIN', 'STORE', NULL, NULL, 1, 1, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO devices
  (id, branch_id, name, device_key_hash, is_active, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000003', X'20000000000040008000000000000001', 'Counter 1',
   'local-device-seed', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO customers
  (id, name, phone, email, address, credit_limit, is_walk_in, notes, is_active, version, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000004', 'Walk-in', '', NULL, '', NULL, 1, '', 1, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO localization_settings
  (id, currency_symbol, currency_code, language, expiry_reminder_days, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000005', 'Rs', 'PKR', 'EN', 30,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO branch_settings
  (id, branch_id, allow_negative_stock, require_confirmed_cross_branch_transfer, fifo_enabled,
   default_walk_in_customer_id, invoice_prefix, repair_prefix, production_prefix, lot_prefix, sku_prefix,
   created_at, updated_at)
VALUES
  (X'20000000000040008000000000000006', X'20000000000040008000000000000001', 0, 1, 1,
   X'20000000000040008000000000000004', 'INV', 'RPR', 'PRD', 'L', 'P',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO receipt_settings
  (id, branch_id, paper_width, shop_name, shop_name_size_pt, shop_name_bold, header_display,
   show_logo, logo_height_pt, font_family, body_size_pt, items_table_bordered,
   tagline_align, tagline_size_pt, contact_align, contact_size_pt, promo_align, promo_size_pt, promo_bold,
   footer_note_size_pt, footer_note_bold, software_credit_size_pt, show_customer_balance, show_item_discount,
   show_cashier_name, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000007', X'20000000000040008000000000000001', 'MM_80', 'Dukan POS', 16, 1, 'SHOP_NAME',
   0, 40, 'Arial', 10, 1,
   'CENTER', 10, 'CENTER', 10, 'CENTER', 14, 1,
   9, 1, 8, 1, 0, 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO expense_categories
  (id, name, is_active, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000010', 'Rent', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000011', 'Utilities', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000012', 'Transport', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000013', 'Misc', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO document_sequences
  (id, kind, branch_id, device_id, prefix, pad, next_value, created_at, updated_at)
VALUES
  (X'20000000000040008000000000000020', 'product_sku', NULL, NULL, 'P', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000021', 'product_barcode', NULL, NULL, '890', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000022', 'lot', NULL, NULL, 'L', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000023', 'invoice', NULL, NULL, 'INV', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000024', 'purchase_order', NULL, NULL, 'PO', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000025', 'transfer', NULL, NULL, 'TR', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000026', 'production', NULL, NULL, 'PRD', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000027', 'repair', NULL, NULL, 'RPR', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (X'20000000000040008000000000000028', 'receipt', NULL, NULL, 'GR', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
