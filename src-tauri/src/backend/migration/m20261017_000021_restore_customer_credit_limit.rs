use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        // Idempotent: ignore if the column already exists on partially-upgraded DBs.
        let _ = conn
            .execute_unprepared("ALTER TABLE customers ADD COLUMN credit_limit REAL")
            .await;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite cannot DROP COLUMN portably here; leave the column in place.
        Ok(())
    }
}
