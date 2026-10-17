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
        let database = Database::connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");
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
    }
}
