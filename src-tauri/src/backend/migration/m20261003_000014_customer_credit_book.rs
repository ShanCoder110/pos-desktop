use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        let existing = conn
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT name FROM pragma_table_info('customers') WHERE name = 'in_credit_book'"
                    .to_owned(),
            ))
            .await?;
        if existing.is_some() {
            return Ok(());
        }
        run_script(
            manager,
            include_str!("m20261003_000014_customer_credit_book.sql"),
        )
        .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        run_script(
            manager,
            include_str!("m20261003_000014_customer_credit_book.down.sql"),
        )
        .await
    }
}

async fn run_script(manager: &SchemaManager<'_>, script: &str) -> Result<(), DbErr> {
    for statement in script
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        // Drop leading SQL comments so ALTER is not skipped when the chunk starts with `--`.
        let sql = statement
            .lines()
            .filter(|line| !line.trim_start().starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_owned();
        if sql.is_empty() {
            continue;
        }
        manager.get_connection().execute_unprepared(&sql).await?;
    }
    Ok(())
}
