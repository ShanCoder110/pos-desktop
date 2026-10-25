use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for sql in [
            "CREATE INDEX IF NOT EXISTS ix_branch_lots_product_branch ON branch_lots(product_lot_id, branch_id)",
            "CREATE INDEX IF NOT EXISTS ix_claim_items_product ON warranty_claim_items(product_id)",
            "CREATE INDEX IF NOT EXISTS ix_product_units_live_product ON product_units(product_id, sort_order) WHERE deleted_at IS NULL",
            "CREATE INDEX IF NOT EXISTS ix_product_lots_live_fifo ON product_lots(product_id, received_date, created_at) WHERE deleted_at IS NULL AND remaining_base_quantity > 0",
        ] {
            manager.get_connection().execute_unprepared(sql).await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for name in [
            "ix_branch_lots_product_branch",
            "ix_claim_items_product",
            "ix_product_units_live_product",
            "ix_product_lots_live_fifo",
        ] {
            manager
                .get_connection()
                .execute_unprepared(&format!("DROP INDEX IF EXISTS {name}"))
                .await?;
        }
        Ok(())
    }
}
