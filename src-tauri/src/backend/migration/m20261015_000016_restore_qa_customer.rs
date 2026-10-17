use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            "UPDATE customers SET deleted_at = NULL, is_active = 1, updated_at = datetime('now') WHERE id = '1535eac3-cb40-4bcd-b66e-877e710f1f67'",
        )
        .await?;
        conn.execute_unprepared(
            "UPDATE product_lots SET purchase_price_per_base = COALESCE((SELECT CASE WHEN ii.base_quantity = 0 THEN ii.fifo_cost ELSE ii.fifo_cost / ii.base_quantity END FROM sale_return_items sri JOIN invoice_items ii ON ii.id = sri.invoice_item_id WHERE sri.product_id = product_lots.product_id AND ii.base_quantity > 0 ORDER BY ii.created_at DESC LIMIT 1), purchase_price_per_base) WHERE lot_number LIKE 'RET-%' AND purchase_price_per_base = 0",
        )
        .await?;
        conn.execute_unprepared(
            "UPDATE customer_ledger_entries SET notes = 'Sale ' || (SELECT invoice_number FROM invoices WHERE invoices.id = customer_ledger_entries.invoice_id) WHERE invoice_id IS NOT NULL AND notes LIKE 'Credit sale %'",
        )
        .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
