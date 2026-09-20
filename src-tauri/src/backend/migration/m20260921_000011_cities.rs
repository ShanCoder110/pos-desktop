use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(manager, include_str!("m20260921_000011_cities.sql")).await?;
        execute_script(manager, include_str!("seed_cities.sql")).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        execute_script(
            manager,
            "UPDATE users SET city_id = NULL;
             UPDATE suppliers SET city_id = NULL;
             UPDATE customers SET city_id = NULL;
             DELETE FROM cities;
             DROP TABLE IF EXISTS cities",
        )
        .await
    }
}

async fn execute_script(manager: &SchemaManager<'_>, script: &str) -> Result<(), DbErr> {
    for statement in script
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        manager
            .get_connection()
            .execute_unprepared(statement)
            .await?;
    }
    Ok(())
}
