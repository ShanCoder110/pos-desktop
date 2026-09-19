use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !column_exists(manager).await? {
            return Ok(());
        }
        manager
            .get_connection()
            .execute_unprepared("ALTER TABLE suppliers DROP COLUMN tax_number")
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if column_exists(manager).await? {
            return Ok(());
        }
        manager
            .get_connection()
            .execute_unprepared("ALTER TABLE suppliers ADD COLUMN tax_number TEXT")
            .await?;
        Ok(())
    }
}

async fn column_exists(manager: &SchemaManager<'_>) -> Result<bool, DbErr> {
    let rows = manager
        .get_connection()
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT name FROM pragma_table_info('suppliers') WHERE name = 'tax_number'".to_owned(),
        ))
        .await?;
    Ok(!rows.is_empty())
}
