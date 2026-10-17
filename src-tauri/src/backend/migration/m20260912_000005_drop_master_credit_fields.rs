use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        // Idempotent: initial.sql may omit columns that were historically dropped here.
        drop_column_if_exists(conn, "suppliers", "tax_number").await?;
        drop_column_if_exists(conn, "suppliers", "payment_terms_days").await?;
        drop_column_if_exists(conn, "suppliers", "credit_limit").await?;
        drop_column_if_exists(conn, "customers", "credit_limit").await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(
            manager,
            include_str!("m20260912_000005_drop_master_credit_fields.down.sql"),
        )
        .await
    }
}

async fn drop_column_if_exists(
    conn: &impl ConnectionTrait,
    table: &str,
    column: &str,
) -> Result<(), DbErr> {
    if !column_exists(conn, table, column).await? {
        return Ok(());
    }
    conn.execute_unprepared(&format!("ALTER TABLE {table} DROP COLUMN {column}"))
        .await?;
    Ok(())
}

async fn column_exists(
    conn: &impl ConnectionTrait,
    table: &str,
    column: &str,
) -> Result<bool, DbErr> {
    let rows = conn
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            format!("PRAGMA table_info({table})"),
        ))
        .await?;
    for row in rows {
        let name: String = row
            .try_get_by_index(1)
            .or_else(|_| row.try_get("", "name"))
            .unwrap_or_default();
        if name.eq_ignore_ascii_case(column) {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn execute_script(manager: &SchemaManager<'_>, script: &str) -> Result<(), DbErr> {
    for statement in script
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.starts_with("--"))
    {
        manager
            .get_connection()
            .execute_unprepared(statement)
            .await?;
    }
    Ok(())
}
