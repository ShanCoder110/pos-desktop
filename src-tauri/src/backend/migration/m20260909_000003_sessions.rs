use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(manager, include_str!("sessions.sql")).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(manager, include_str!("unseed_sessions.sql")).await
    }
}

async fn execute_script(manager: &SchemaManager<'_>, script: &str) -> Result<(), DbErr> {
    for statement in script.split(';') {
        let statement = statement
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n");
        if statement.is_empty() {
            continue;
        }
        manager
            .get_connection()
            .execute_unprepared(&statement)
            .await?;
    }
    Ok(())
}
