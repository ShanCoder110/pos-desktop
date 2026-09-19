use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared("PRAGMA foreign_keys=OFF").await?;

        let has_users = table_exists(conn, "users").await?;
        let has_staging = table_exists(conn, "users_partner_migration").await?;

        if has_staging && !has_users {
            finish_users_migration(conn).await?;
        } else if has_staging && has_users {
            conn.execute_unprepared("DROP TABLE users_partner_migration")
                .await?;
            ensure_user_indexes(conn).await?;
        } else if has_users {
            ensure_user_indexes(conn).await?;
        } else {
            execute_script(
                conn,
                include_str!("m20260918_000008_staff_partner_users.sql"),
            )
            .await?;
        }

        conn.execute_unprepared("PRAGMA foreign_keys=ON").await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(
            manager.get_connection(),
            include_str!("m20260918_000008_staff_partner_users.down.sql"),
        )
        .await
    }
}

async fn finish_users_migration<C: ConnectionTrait>(conn: &C) -> Result<(), DbErr> {
    conn.execute_unprepared("ALTER TABLE users_partner_migration RENAME TO users")
        .await?;
    ensure_user_indexes(conn).await?;
    Ok(())
}

async fn ensure_user_indexes<C: ConnectionTrait>(conn: &C) -> Result<(), DbErr> {
    conn.execute_unprepared(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone ON users(phone) WHERE phone IS NOT NULL AND phone <> '' AND deleted_at IS NULL",
    )
    .await?;
    conn.execute_unprepared(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(email) WHERE email IS NOT NULL AND email <> '' AND deleted_at IS NULL",
    )
    .await?;
    Ok(())
}

async fn table_exists<C: ConnectionTrait>(conn: &C, name: &str) -> Result<bool, DbErr> {
    let row = conn
        .query_one_raw(Statement::from_sql_and_values(
            DatabaseBackend::Sqlite,
            "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            [name.into()],
        ))
        .await?;
    Ok(row.is_some())
}

async fn execute_script<C: ConnectionTrait>(conn: &C, script: &str) -> Result<(), DbErr> {
    for statement in script.split(';').filter_map(normalize_sql_statement) {
        match conn.execute_unprepared(&statement).await {
            Ok(_) => {}
            Err(DbErr::Exec(runtime_error)) if is_ignorable_retry(&runtime_error, &statement) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn normalize_sql_statement(chunk: &str) -> Option<String> {
    let statement = chunk
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("--"))
        .collect::<Vec<_>>()
        .join("\n");
    (!statement.is_empty()).then_some(statement)
}

fn is_ignorable_retry(error: &sea_orm::RuntimeErr, statement: &str) -> bool {
    let message = match error {
        sea_orm::RuntimeErr::SqlxError(sqlx_error) => sqlx_error.to_string(),
        _ => return false,
    };
    let upper = statement.to_uppercase();
    if message.contains("duplicate column name") && upper.contains("ADD COLUMN") {
        return true;
    }
    if message.contains("already exists") && upper.contains("CREATE") {
        return true;
    }
    false
}
