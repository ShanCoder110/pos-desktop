use sea_orm_migration::prelude::*;

/// Case-insensitive unique SKU (custom + auto P-####). Replaces case-sensitive ux_products_sku.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        let _ = conn
            .execute_unprepared("DROP INDEX IF EXISTS ux_products_sku")
            .await;
        conn.execute_unprepared(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_products_sku_lower
             ON products(lower(sku))
             WHERE deleted_at IS NULL",
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        let _ = conn
            .execute_unprepared("DROP INDEX IF EXISTS ux_products_sku_lower")
            .await;
        conn.execute_unprepared(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_products_sku
             ON products(sku)
             WHERE deleted_at IS NULL",
        )
        .await?;
        Ok(())
    }
}
