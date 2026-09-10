use sea_orm_migration::prelude::*;

mod m20260907_000001_initial;
mod m20260909_000002_seed_units;
mod m20260909_000003_sessions;
mod m20260909_000004_seed_shop;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260907_000001_initial::Migration),
            Box::new(m20260909_000002_seed_units::Migration),
            Box::new(m20260909_000003_sessions::Migration),
            Box::new(m20260909_000004_seed_shop::Migration),
        ]
    }
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database};
    use sea_orm_migration::{MigratorTrait, SchemaManager};
    use uuid::Uuid;

    use crate::backend::{
        constants::{SEED_OWNER_USERNAME, SEED_USER_ID},
        dto::PageQuery,
        repositories::MasterKind,
        services::MasterService,
    };

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
        assert_eq!(count, 16);
        let units = MasterService::list(&database, MasterKind::Unit, PageQuery::default())
            .await
            .expect("load seeded units through service");
        assert_eq!(units.data.len(), 16);
        assert!(units
            .data
            .iter()
            .any(|unit| unit.name == "Piece" && unit.symbol.as_deref() == Some("pc")));

        let owner = database
            .query_one_raw(sea_orm::Statement::from_sql_and_values(
                sea_orm::DbBackend::Sqlite,
                "SELECT id, username FROM users WHERE username = ?",
                [SEED_OWNER_USERNAME.into()],
            ))
            .await
            .expect("query owner")
            .expect("owner row");
        let owner_id: Uuid = owner.try_get("", "id").expect("owner id");
        assert_eq!(owner_id.to_string(), SEED_USER_ID);
    }
}
