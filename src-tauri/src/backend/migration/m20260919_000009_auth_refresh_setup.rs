use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        if !column_exists(conn, "sessions", "refresh_token_hash").await? {
            conn.execute_unprepared("ALTER TABLE sessions ADD COLUMN refresh_token_hash TEXT")
                .await?;
        }
        if !column_exists(conn, "sessions", "refresh_expires_at").await? {
            conn.execute_unprepared("ALTER TABLE sessions ADD COLUMN refresh_expires_at TEXT")
                .await?;
        }
        execute_script(
            manager,
            include_str!("m20260919_000009_auth_refresh_setup.sql"),
        )
        .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(
            manager,
            include_str!("m20260919_000009_auth_refresh_setup.down.sql"),
        )
        .await
    }
}

async fn column_exists(
    conn: &impl ConnectionTrait,
    table: &str,
    column: &str,
) -> Result<bool, DbErr> {
    let sql = format!("SELECT name FROM pragma_table_info('{table}') WHERE name = '{column}'");
    let rows = conn
        .query_all_raw(Statement::from_string(DbBackend::Sqlite, sql))
        .await?;
    Ok(!rows.is_empty())
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
