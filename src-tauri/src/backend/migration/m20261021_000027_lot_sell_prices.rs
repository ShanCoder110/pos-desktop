use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        // Snapshot sell prices on each lot so soft-delete can fall back to a previous lot.
        conn.execute_unprepared(
            "ALTER TABLE product_lots ADD COLUMN minimum_price REAL NOT NULL DEFAULT 0",
        )
        .await?;
        conn.execute_unprepared(
            "ALTER TABLE product_lots ADD COLUMN wholesale_price REAL NOT NULL DEFAULT 0",
        )
        .await?;
        conn.execute_unprepared(
            "ALTER TABLE product_lots ADD COLUMN retail_price REAL NOT NULL DEFAULT 0",
        )
        .await?;
        // Backfill from goods receipt lines when present.
        conn.execute_unprepared(
            r#"
            UPDATE product_lots
            SET
              minimum_price = COALESCE((
                SELECT gri.minimum_price FROM goods_receipt_items gri
                WHERE gri.lot_id = product_lots.id
                   OR gri.id = product_lots.goods_receipt_item_id
                LIMIT 1
              ), minimum_price),
              wholesale_price = COALESCE((
                SELECT gri.wholesale_price FROM goods_receipt_items gri
                WHERE gri.lot_id = product_lots.id
                   OR gri.id = product_lots.goods_receipt_item_id
                LIMIT 1
              ), wholesale_price),
              retail_price = COALESCE((
                SELECT gri.retail_price FROM goods_receipt_items gri
                WHERE gri.lot_id = product_lots.id
                   OR gri.id = product_lots.goods_receipt_item_id
                LIMIT 1
              ), retail_price)
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared("ALTER TABLE product_lots DROP COLUMN retail_price")
            .await?;
        conn.execute_unprepared("ALTER TABLE product_lots DROP COLUMN wholesale_price")
            .await?;
        conn.execute_unprepared("ALTER TABLE product_lots DROP COLUMN minimum_price")
            .await?;
        Ok(())
    }
}
