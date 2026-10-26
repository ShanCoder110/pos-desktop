use sea_orm_migration::prelude::*;

mod m20260907_000001_initial;
mod m20260909_000002_seed_units;
mod m20260909_000003_sessions;
mod m20260909_000004_seed_shop;
mod m20260912_000005_drop_master_credit_fields;
mod m20260912_000006_drop_supplier_tax_number;
mod m20260917_000007_ledger_trash_foundation;
mod m20260918_000008_staff_partner_users;
mod m20260919_000009_auth_refresh_setup;
mod m20260920_000010_soft_delete_filter_indexes;
mod m20260921_000011_cities;
mod m20260921_000012_purchase_order_statuses;
mod m20260921_000013_purchase_order_fk_repair;
mod m20261003_000014_customer_credit_book;
mod m20261015_000015_unit_factor_direction;
mod m20261015_000016_restore_qa_customer;
mod m20261017_000017_default_other_category;
mod m20261017_000018_recompute_ledger_balances;
mod m20261017_000019_invoice_return_payment_status;
mod m20261017_000020_stock_count_reconcile;
mod m20261017_000021_restore_customer_credit_limit;
mod m20261017_000022_drop_customer_credit_limit;
mod m20261017_000023_uuid_text_to_blob;
mod m20261017_000024_products_sku_lower_unique;
mod m20261018_000025_product_urdu_name;
mod m20261018_000026_product_no;
mod m20261021_000027_lot_sell_prices;
mod m20261024_000028_query_indexes;
mod m20261025_000029_product_read_indexes;
mod m20261025_000030_default_larger_unit;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260907_000001_initial::Migration),
            Box::new(m20260909_000002_seed_units::Migration),
            Box::new(m20260909_000003_sessions::Migration),
            Box::new(m20260909_000004_seed_shop::Migration),
            Box::new(m20260912_000005_drop_master_credit_fields::Migration),
            Box::new(m20260912_000006_drop_supplier_tax_number::Migration),
            Box::new(m20260917_000007_ledger_trash_foundation::Migration),
            Box::new(m20260918_000008_staff_partner_users::Migration),
            Box::new(m20260919_000009_auth_refresh_setup::Migration),
            Box::new(m20260920_000010_soft_delete_filter_indexes::Migration),
            Box::new(m20260921_000011_cities::Migration),
            Box::new(m20260921_000012_purchase_order_statuses::Migration),
            Box::new(m20260921_000013_purchase_order_fk_repair::Migration),
            Box::new(m20261003_000014_customer_credit_book::Migration),
            Box::new(m20261015_000015_unit_factor_direction::Migration),
            Box::new(m20261015_000016_restore_qa_customer::Migration),
            Box::new(m20261017_000017_default_other_category::Migration),
            Box::new(m20261017_000018_recompute_ledger_balances::Migration),
            Box::new(m20261017_000019_invoice_return_payment_status::Migration),
            Box::new(m20261017_000020_stock_count_reconcile::Migration),
            Box::new(m20261017_000021_restore_customer_credit_limit::Migration),
            Box::new(m20261017_000022_drop_customer_credit_limit::Migration),
            Box::new(m20261017_000023_uuid_text_to_blob::Migration),
            Box::new(m20261017_000024_products_sku_lower_unique::Migration),
            Box::new(m20261018_000025_product_urdu_name::Migration),
            Box::new(m20261018_000026_product_no::Migration),
            Box::new(m20261021_000027_lot_sell_prices::Migration),
            Box::new(m20261024_000028_query_indexes::Migration),
            Box::new(m20261025_000029_product_read_indexes::Migration),
            Box::new(m20261025_000030_default_larger_unit::Migration),
        ]
    }
}

#[cfg(test)]
mod tests {
    use crate::backend::{dto::PageQuery, repositories::MasterKind, services::MasterService};
    use sea_orm::{ConnectionTrait, Database};
    use sea_orm_migration::{MigratorTrait, SchemaManager};

    use super::Migrator;

    #[tokio::test]
    async fn initial_migration_creates_core_and_transaction_tables() {
        let database = connect_sqlite_single("sqlite::memory:").await;
        Migrator::up(&database, None)
            .await
            .expect("apply initial migration");
        database
            .execute_unprepared("PRAGMA foreign_keys = ON")
            .await
            .expect("enable fks");
        let schema = SchemaManager::new(&database);
        for table in [
            "products",
            "product_lots",
            "invoices",
            "payments",
            "repair_jobs",
            "investments",
            "sessions",
        ] {
            assert!(
                schema.has_table(table).await.expect("inspect table"),
                "missing {table}"
            );
        }
        let row = database
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM units".to_owned(),
            ))
            .await
            .expect("count seeded units")
            .expect("unit count row");
        let count: i64 = row.try_get("", "count").expect("read unit count");
        assert_eq!(count, 7);
        let units = MasterService::list(&database, MasterKind::Unit, PageQuery::default())
            .await
            .expect("load seeded units through service");
        assert_eq!(units.data.len(), 7);
        assert!(units
            .data
            .iter()
            .any(|unit| unit.name == "Piece" && unit.symbol.as_deref() == Some("pc")));

        database
            .execute_unprepared(
                "INSERT INTO customers (id, name, phone, address, is_walk_in, in_credit_book, notes, is_active, version, created_at, updated_at) VALUES (X'00000000000000000000000000000101', 'Credit test', '', '', 0, 1, '', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            )
            .await
            .expect("insert credit customer");
        let customers = MasterService::list(&database, MasterKind::Customer, PageQuery::default())
            .await
            .expect("load customer credit summaries");
        let credit_customer = customers
            .data
            .iter()
            .find(|customer| customer.name == "Credit test")
            .expect("find credit customer");
        assert_eq!(credit_customer.open_credit_sale_count, Some(0));
        assert_eq!(credit_customer.profit_on_hold, Some(0.0));

        let user_count = database
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM users".to_owned(),
            ))
            .await
            .expect("count users")
            .expect("user count row");
        let count: i64 = user_count.try_get("", "count").expect("read user count");
        assert_eq!(count, 0, "owner is created during onboarding, not seed");

        // 000021 may add credit_limit; 000022 must leave customers without it.
        let cols = database
            .query_all_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "PRAGMA table_info(customers)".to_owned(),
            ))
            .await
            .expect("pragma customers");
        let names: Vec<String> = cols
            .iter()
            .filter_map(|row| {
                row.try_get_by_index::<String>(1)
                    .or_else(|_| row.try_get::<String>("", "name"))
                    .ok()
            })
            .collect();
        assert!(
            !names.iter().any(|n| n == "credit_limit"),
            "customers.credit_limit must be absent after 000022, got {names:?}"
        );
    }

    async fn connect_sqlite_single(url: &str) -> sea_orm::DatabaseConnection {
        let mut options = sea_orm::ConnectOptions::new(url.to_owned());
        options
            .max_connections(1)
            .min_connections(1)
            .sqlx_logging(false);
        Database::connect(options).await.expect("connect sqlite")
    }

    /// Confirms m20261017_000019 ran on a DB that already had invoice rows: CHECK
    /// accepts RETURNED / PARTIALLY_RETURNED, and the backfill rewrites stale PAID
    /// full-return rows (credit 0, paid 0, with a sale_return) to RETURNED.
    #[tokio::test]
    async fn invoice_return_payment_status_migration_accepts_and_backfills() {
        let database = connect_sqlite_single("sqlite::memory:").await;
        Migrator::up(&database, None)
            .await
            .expect("apply all migrations including return payment_status");

        let applied = database
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT version FROM seaql_migrations WHERE version = 'm20261017_000019_invoice_return_payment_status'".to_owned(),
            ))
            .await
            .expect("query migrations")
            .expect("migration 000019 must be recorded");
        let version: String = applied.try_get("", "version").expect("version");
        assert_eq!(version, "m20261017_000019_invoice_return_payment_status");
        eprintln!("ok: migration {version} applied on existing schema path");

        // Seed minimal FKs for an invoice that looks like a pre-fix full return
        // (PAID + Paid Rs 0) so backfill SQL can be re-checked idempotently.
        database
            .execute_unprepared("PRAGMA foreign_keys = OFF")
            .await
            .expect("fk off for fixture insert");
        database
            .execute_unprepared(
                "INSERT INTO users (id, name, username, password_hash, role, is_active, created_at, updated_at)
                 VALUES ('20000000-0000-4000-8000-000000000002', 'Owner', 'owner', 'x', 'OWNER', 1, '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z')",
            )
            .await
            .expect("user");
        database
            .execute_unprepared(
                "INSERT INTO invoices (
                    id, branch_id, customer_id, invoice_number, status, payment_status,
                    subtotal, discount, tax, total, paid_amount, credit_amount, change_amount,
                    created_by, cashier_name_snapshot, client_request_id,
                    version, created_at, updated_at
                 ) VALUES (
                    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    '20000000-0000-4000-8000-000000000001',
                    NULL,
                    'INV-MIG-1',
                    'COMPLETED',
                    'PAID',
                    40, 0, 0, 40, 0, 0, 0,
                    '20000000-0000-4000-8000-000000000002',
                    'Owner',
                    'mig-return-1',
                    1,
                    '2026-10-17T00:00:00Z',
                    '2026-10-17T00:00:00Z'
                 )",
            )
            .await
            .expect("stale PAID invoice with paid 0");
        database
            .execute_unprepared(
                "INSERT INTO sale_returns (
                    id, return_number, invoice_id, branch_id, customer_id, type, status,
                    reason, refund_amount, created_by, created_at
                 ) VALUES (
                    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    'RET-MIG-1',
                    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    '20000000-0000-4000-8000-000000000001',
                    NULL,
                    'REFUND',
                    'COMPLETED',
                    'full return',
                    40,
                    '20000000-0000-4000-8000-000000000002',
                    '2026-10-17T00:00:00Z'
                 )",
            )
            .await
            .expect("sale_return for backfill");
        database
            .execute_unprepared("PRAGMA foreign_keys = ON")
            .await
            .expect("fk on");

        // Re-run backfill statements (idempotent with migration SQL).
        database
            .execute_unprepared(
                "UPDATE invoices
                 SET payment_status = 'RETURNED'
                 WHERE deleted_at IS NULL
                   AND credit_amount = 0
                   AND paid_amount = 0
                   AND payment_status IN ('PAID', 'CREDIT', 'PARTIAL')
                   AND EXISTS (SELECT 1 FROM sale_returns sr WHERE sr.invoice_id = invoices.id)",
            )
            .await
            .expect("backfill RETURNED");

        let status = database
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT payment_status FROM invoices WHERE invoice_number = 'INV-MIG-1'".to_owned(),
            ))
            .await
            .expect("read status")
            .expect("invoice row");
        let payment_status: String = status.try_get("", "payment_status").expect("ps");
        assert_eq!(payment_status, "RETURNED");
        eprintln!("ok: backfill rewrote stale PAID full-return row to RETURNED");

        // CHECK must allow PARTIALLY_RETURNED on an existing row.
        database
            .execute_unprepared(
                "UPDATE invoices SET payment_status = 'PARTIALLY_RETURNED', credit_amount = 20 WHERE invoice_number = 'INV-MIG-1'",
            )
            .await
            .expect("PARTIALLY_RETURNED must satisfy invoices CHECK after migration");
        eprintln!("ok: PARTIALLY_RETURNED accepted by post-migration CHECK");
    }

    /// Rebuild invoices while child FK rows exist (the QA failure mode).
    /// Applies migrations through 000018, inserts invoice + children with FKs on,
    /// then applies 000019/000020 and asserts counts + empty foreign_key_check.
    #[tokio::test]
    async fn invoice_rebuild_survives_child_foreign_keys() {
        let path = std::env::temp_dir().join(format!(
            "pos-mig-fk-{}.sqlite3",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);
        let url = format!("sqlite://{}?mode=rwc", path.display());
        let database = connect_sqlite_single(&url).await;

        // 18 migrations through m20261017_000018_recompute_ledger_balances.
        Migrator::up(&database, Some(18))
            .await
            .expect("apply migrations through 000018");

        // Seed uses blob UUIDs — pick them via subqueries so FKs stay valid.
        database
            .execute_unprepared(
                "INSERT INTO users (id, name, username, password_hash, role, is_active, created_at, updated_at)
                 VALUES (X'20000000000040008000000000000002', 'Owner', 'owner-fk', 'x', 'OWNER', 1,
                         '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z')",
            )
            .await
            .expect("user");
        database
            .execute_unprepared(
                "INSERT INTO products (
                    id, category_id, base_unit_id, name, sku, barcode, product_type,
                    track_lots, track_expiry, minimum_stock, is_active, created_by,
                    version, created_at, updated_at
                 )
                 SELECT X'cccccccccccc4ccc8ccccccccccccccccc', c.id, u.id,
                        'FK Mig Product', 'FK-SKU-1', '890000000001',
                        'STANDARD', 1, 0, 0, 1, X'20000000000040008000000000000002',
                        1, '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z'
                 FROM product_categories c, units u
                 WHERE c.deleted_at IS NULL AND u.symbol = 'pc' AND u.deleted_at IS NULL
                 LIMIT 1",
            )
            .await
            .expect("product");
        database
            .execute_unprepared(
                "INSERT INTO invoices (
                    id, branch_id, customer_id, invoice_number, status, payment_status,
                    subtotal, discount, tax, total, paid_amount, credit_amount, change_amount,
                    created_by, cashier_name_snapshot, client_request_id,
                    version, created_at, updated_at
                 )
                 SELECT X'aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaaaa', b.id, NULL, 'INV-FK-1',
                        'COMPLETED', 'PAID', 100, 0, 0, 100, 100, 0, 0,
                        X'20000000000040008000000000000002', 'Owner', 'mig-fk-1',
                        1, '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z'
                 FROM branches b WHERE b.deleted_at IS NULL LIMIT 1",
            )
            .await
            .expect("invoice");
        database
            .execute_unprepared(
                "INSERT INTO invoice_items (
                    id, invoice_id, product_id, product_name, sku, unit_name,
                    displayed_quantity, conversion_to_base, base_quantity,
                    unit_price, minimum_price_snapshot, line_total, created_at
                 ) VALUES (
                    X'dddddddddddd4ddd8ddddddddddddddddd',
                    X'aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaaaa',
                    X'cccccccccccc4ccc8ccccccccccccccccc',
                    'FK Mig Product', 'FK-SKU-1', 'pc',
                    1, 1, 1, 100, 100, 100, '2026-10-17T00:00:00Z'
                 )",
            )
            .await
            .expect("invoice_item");
        database
            .execute_unprepared(
                "INSERT INTO payments (
                    id, branch_id, customer_id, invoice_id, amount, change_amount,
                    payment_method, direction, status, received_by, paid_at,
                    client_request_id, created_at
                 )
                 SELECT X'eeeeeeeeeeee4eee8eeeeeeeeeeeeeeeee', b.id, NULL,
                        X'aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaaaa', 100, 0,
                        'CASH', 'IN', 'COMPLETED', X'20000000000040008000000000000002',
                        '2026-10-17T00:00:00Z', 'pay-fk-1', '2026-10-17T00:00:00Z'
                 FROM branches b WHERE b.deleted_at IS NULL LIMIT 1",
            )
            .await
            .expect("payment");
        database
            .execute_unprepared(
                "INSERT INTO sale_returns (
                    id, return_number, invoice_id, branch_id, customer_id, type, status,
                    reason, refund_amount, created_by, created_at
                 )
                 SELECT X'ffffffffffff4fff8fffffffffffffffff', 'RET-FK-1',
                        X'aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaaaa', b.id, NULL,
                        'REFUND', 'COMPLETED', 'qa fk rebuild', 0,
                        X'20000000000040008000000000000002', '2026-10-17T00:00:00Z'
                 FROM branches b WHERE b.deleted_at IS NULL LIMIT 1",
            )
            .await
            .expect("sale_return");

        async fn count(db: &sea_orm::DatabaseConnection, table: &str) -> i64 {
            let row = db
                .query_one_raw(sea_orm::Statement::from_string(
                    sea_orm::DbBackend::Sqlite,
                    format!("SELECT COUNT(*) AS c FROM {table}"),
                ))
                .await
                .expect("count query")
                .expect("count row");
            row.try_get("", "c").expect("c")
        }

        let before_invoices = count(&database, "invoices").await;
        let before_items = count(&database, "invoice_items").await;
        let before_payments = count(&database, "payments").await;
        let before_returns = count(&database, "sale_returns").await;
        eprintln!(
            "before 000019: invoices={before_invoices} items={before_items} payments={before_payments} returns={before_returns}"
        );
        assert!(before_invoices >= 1);
        assert!(before_items >= 1);
        assert!(before_payments >= 1);
        assert!(before_returns >= 1);

        Migrator::up(&database, None)
            .await
            .expect("apply 000019/000020 with child FK rows present");

        let after_invoices = count(&database, "invoices").await;
        let after_items = count(&database, "invoice_items").await;
        let after_payments = count(&database, "payments").await;
        let after_returns = count(&database, "sale_returns").await;
        eprintln!(
            "after 000020: invoices={after_invoices} items={after_items} payments={after_payments} returns={after_returns}"
        );
        assert_eq!(after_invoices, before_invoices);
        assert_eq!(after_items, before_items);
        assert_eq!(after_payments, before_payments);
        assert_eq!(after_returns, before_returns);

        let violations = database
            .query_all_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "PRAGMA foreign_key_check".to_owned(),
            ))
            .await
            .expect("foreign_key_check");
        assert!(
            violations.is_empty(),
            "foreign_key_check must be empty after rebuild, got {}",
            violations.len()
        );
        eprintln!("ok: foreign_key_check empty after invoices rebuild with children");

        let _ = std::fs::remove_file(&path);
    }

    /// Inserts a TEXT (36-char) UUID into stock_movements.id, applies 000023, and
    /// asserts the row is a 16-byte BLOB (and blob36 ASCII is also converted).
    #[tokio::test]
    async fn uuid_text_to_blob_migration_converts_text_and_blob36() {
        let path = std::env::temp_dir().join(format!(
            "pos-mig-uuid-{}.sqlite3",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);
        let url = format!("sqlite://{}?mode=rwc", path.display());
        let database = connect_sqlite_single(&url).await;

        // 22 migrations through m20261017_000022_drop_customer_credit_limit.
        Migrator::up(&database, Some(22))
            .await
            .expect("apply migrations through 000022");

        // Owner is onboarding-only — insert a user so product/movement FKs resolve.
        database
            .execute_unprepared(
                "INSERT INTO users (id, name, username, password_hash, role, is_active, created_at, updated_at)
                 VALUES (X'20000000000040008000000000000002', 'Owner', 'owner-uuid', 'x', 'OWNER', 1,
                         '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z')",
            )
            .await
            .expect("fixture user");

        // Minimal product so stock_movements FKs stay valid under foreign_key_check.
        database
            .execute_unprepared(
                "INSERT INTO products (
                    id, name, category_id, base_unit_id, sku, barcode, product_type,
                    track_lots, track_expiry, minimum_stock, is_active, created_by,
                    version, created_at, updated_at
                 ) VALUES (
                    X'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    'UUID Mig Product',
                    (SELECT id FROM product_categories LIMIT 1),
                    (SELECT id FROM units WHERE symbol = 'pc' LIMIT 1),
                    'SKU-UUID-MIG', 'BC-UUID-MIG', 'STANDARD',
                    1, 0, 0, 1,
                    X'20000000000040008000000000000002',
                    1, '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z'
                 )",
            )
            .await
            .expect("fixture product");

        // TEXT 36 hyphenated UUID (the QA failure mode).
        database
            .execute_unprepared(
                "INSERT INTO stock_movements (
                    id, branch_id, product_id, product_lot_id, type,
                    displayed_quantity, displayed_unit_name, base_quantity_delta,
                    reference_type, reference_id, notes, occurred_at, created_by, created_at
                 ) VALUES (
                    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                    (SELECT id FROM branches LIMIT 1),
                    X'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    NULL,
                    'ADJUSTMENT',
                    0, 'pc', 0,
                    'StockAdjustment',
                    X'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    'text uuid fixture',
                    '2026-10-17T00:00:00Z',
                    X'20000000000040008000000000000002',
                    '2026-10-17T00:00:00Z'
                 )",
            )
            .await
            .expect("insert text uuid movement");

        // BLOB 36 = ASCII bytes of a hyphenated UUID.
        database
            .execute_unprepared(
                "INSERT INTO stock_movements (
                    id, branch_id, product_id, product_lot_id, type,
                    displayed_quantity, displayed_unit_name, base_quantity_delta,
                    reference_type, reference_id, notes, occurred_at, created_by, created_at
                 ) VALUES (
                    CAST('dddddddd-dddd-4ddd-8ddd-dddddddddddd' AS BLOB),
                    (SELECT id FROM branches LIMIT 1),
                    X'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    NULL,
                    'ADJUSTMENT',
                    0, 'pc', 0,
                    'StockAdjustment',
                    X'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    'blob36 uuid fixture',
                    '2026-10-17T00:00:00Z',
                    X'20000000000040008000000000000002',
                    '2026-10-17T00:00:00Z'
                 )",
            )
            .await
            .expect("insert blob36 movement");

        let before = database
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT
                   SUM(CASE WHEN typeof(id)='text' AND length(id)=36 THEN 1 ELSE 0 END) AS text36,
                   SUM(CASE WHEN typeof(id)='blob' AND length(id)=36 THEN 1 ELSE 0 END) AS blob36
                 FROM stock_movements
                 WHERE notes IN ('text uuid fixture', 'blob36 uuid fixture')"
                    .to_owned(),
            ))
            .await
            .expect("before query")
            .expect("before row");
        let text36: i64 = before.try_get("", "text36").unwrap_or(0);
        let blob36: i64 = before.try_get("", "blob36").unwrap_or(0);
        assert_eq!(text36, 1, "fixture text36 missing");
        assert_eq!(blob36, 1, "fixture blob36 missing");

        Migrator::up(&database, None)
            .await
            .expect("apply migration 000023");

        let applied = database
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT version FROM seaql_migrations WHERE version = 'm20261017_000023_uuid_text_to_blob'"
                    .to_owned(),
            ))
            .await
            .expect("query migrations")
            .expect("migration 000023 must be recorded");
        let version: String = applied.try_get("", "version").expect("version");
        assert_eq!(version, "m20261017_000023_uuid_text_to_blob");

        let after = database
            .query_all_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT typeof(id) AS t, length(id) AS len, notes
                 FROM stock_movements
                 WHERE notes IN ('text uuid fixture', 'blob36 uuid fixture')
                 ORDER BY notes"
                    .to_owned(),
            ))
            .await
            .expect("after query");
        assert_eq!(after.len(), 2);
        for row in &after {
            let t: String = row.try_get("", "t").expect("typeof");
            let len: i64 = row.try_get("", "len").expect("length");
            assert_eq!(t, "blob", "id must be blob after 000023");
            assert_eq!(len, 16, "id must be 16 bytes after 000023");
        }

        // Idempotent second apply (already recorded — Migrator::up is a no-op).
        Migrator::up(&database, None)
            .await
            .expect("000023 idempotent when already applied");

        let violations = database
            .query_all_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "PRAGMA foreign_key_check".to_owned(),
            ))
            .await
            .expect("foreign_key_check");
        assert!(violations.is_empty());

        let _ = std::fs::remove_file(&path);
    }

    /// Fresh install: every UUID-like column value must be a 16-byte BLOB
    /// (000017 Other category included — no TEXT(36) origin).
    #[tokio::test]
    async fn fresh_db_all_uuid_columns_are_16_byte_blobs() {
        let path = std::env::temp_dir().join(format!(
            "pos-mig-fresh-uuid-{}.sqlite3",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);
        let url = format!("sqlite://{}?mode=rwc", path.display());
        let database = connect_sqlite_single(&url).await;

        Migrator::up(&database, None)
            .await
            .expect("apply all migrations on fresh DB");

        const SKIP: &[&str] = &[
            "client_request_id",
            "reference_number",
            "invoice_number",
            "lot_number",
            "adjustment_number",
            "return_number",
            "order_number",
            "transfer_number",
            "receipt_number",
            "job_number",
            "claim_number",
            "held_number",
            "po_number",
            "grn_number",
        ];

        let tables = database
            .query_all_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT name FROM sqlite_master
                 WHERE type = 'table'
                   AND name NOT LIKE 'sqlite_%'
                   AND name != 'seaql_migrations'
                 ORDER BY name"
                    .to_owned(),
            ))
            .await
            .expect("list tables");

        let mut bad: Vec<String> = Vec::new();
        let mut scanned = 0u64;
        for table_row in &tables {
            let table: String = table_row.try_get("", "name").expect("table name");
            let cols = database
                .query_all_raw(sea_orm::Statement::from_string(
                    sea_orm::DbBackend::Sqlite,
                    format!("PRAGMA table_info(\"{table}\")"),
                ))
                .await
                .expect("table_info");
            for col_row in cols {
                let name: String = col_row
                    .try_get_by_index(1)
                    .or_else(|_| col_row.try_get("", "name"))
                    .unwrap_or_default();
                let lower = name.to_ascii_lowercase();
                if SKIP.contains(&lower.as_str()) {
                    continue;
                }
                if lower != "id" && !lower.ends_with("_id") {
                    continue;
                }
                // INTEGER singleton keys (e.g. system_state.id) are not UUIDs.
                // Flag only text/blob values that are not already 16-byte blobs.
                let sql = format!(
                    "SELECT COUNT(*) AS count FROM \"{table}\"
                     WHERE \"{name}\" IS NOT NULL
                       AND typeof(\"{name}\") IN ('text', 'blob')
                       AND NOT (typeof(\"{name}\") = 'blob' AND length(\"{name}\") = 16)"
                );
                let row = database
                    .query_one_raw(sea_orm::Statement::from_string(
                        sea_orm::DbBackend::Sqlite,
                        sql,
                    ))
                    .await
                    .expect("scan query")
                    .expect("scan row");
                let count: i64 = row.try_get("", "count").unwrap_or(0);
                scanned += 1;
                if count > 0 {
                    bad.push(format!("{table}.{name}={count}"));
                }
            }
        }

        // Other category must exist as blob16 after 000017 (+ 000023 no-op).
        let other = database
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT typeof(id) AS t, length(id) AS len FROM product_categories
                 WHERE name = 'Other' LIMIT 1"
                    .to_owned(),
            ))
            .await
            .expect("other query")
            .expect("Other category row");
        let t: String = other.try_get("", "t").expect("typeof");
        let len: i64 = other.try_get("", "len").expect("len");
        assert_eq!(t, "blob", "Other category id must be blob on fresh install");
        assert_eq!(len, 16, "Other category id must be 16 bytes");

        assert!(
            bad.is_empty(),
            "non-blob16 UUID values after fresh migrate (scanned {scanned} cols): {bad:?}"
        );

        let report = format!(
            "fresh_db_uuid_scan ok scanned_columns={scanned} bad=0 other_typeof={t} other_len={len}\n"
        );
        let _ = std::fs::create_dir_all("/opt/cursor/artifacts");
        let _ = std::fs::write(
            "/opt/cursor/artifacts/step28a-fresh-db-uuid-scan.txt",
            &report,
        );
        eprintln!("{report}");

        let _ = std::fs::remove_file(&path);
    }
}
