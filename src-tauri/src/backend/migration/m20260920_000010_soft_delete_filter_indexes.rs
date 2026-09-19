use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        run_script(
            manager,
            include_str!("m20260920_000010_soft_delete_filter_indexes.sql"),
        )
        .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        run_script(
            manager,
            include_str!("m20260920_000010_soft_delete_filter_indexes.down.sql"),
        )
        .await
    }
}

async fn run_script(manager: &SchemaManager<'_>, script: &str) -> Result<(), DbErr> {
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
