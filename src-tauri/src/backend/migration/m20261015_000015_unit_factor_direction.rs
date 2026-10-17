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
                "SELECT name FROM pragma_table_info('product_units') WHERE name = 'factor_direction'"
                    .to_owned(),
            ))
            .await?;
        if existing.is_some() {
            return Ok(());
        }
        conn.execute_unprepared(
            "ALTER TABLE product_units ADD COLUMN factor_direction TEXT NOT NULL DEFAULT 'multiply'",
        )
        .await?;
        // gaz/m/ft/g store "how many fit in 1 stock unit", not a multiplier.
        conn.execute_unprepared(
            "UPDATE product_units SET factor_direction = 'divide' WHERE conversion_to_base > 1 AND (lower(display_name) IN ('gaz', 'meter', 'foot', 'gram', 'm', 'ft', 'g') OR lower(COALESCE((SELECT symbol FROM units WHERE units.id = product_units.unit_id), '')) IN ('gaz', 'm', 'ft', 'g'))",
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("ALTER TABLE product_units DROP COLUMN factor_direction")
            .await?;
        Ok(())
    }
}
