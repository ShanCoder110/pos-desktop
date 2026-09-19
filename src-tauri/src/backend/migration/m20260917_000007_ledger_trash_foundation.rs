use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(
            manager,
            include_str!("m20260917_000007_ledger_trash_foundation.sql"),
        )
        .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(
            manager,
            include_str!("m20260917_000007_ledger_trash_foundation.down.sql"),
        )
        .await
    }
}

async fn execute_script(manager: &SchemaManager<'_>, script: &str) -> Result<(), DbErr> {
    for statement in script.split(';').filter_map(normalize_sql_statement) {
        match manager
            .get_connection()
            .execute_unprepared(&statement)
            .await
        {
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
