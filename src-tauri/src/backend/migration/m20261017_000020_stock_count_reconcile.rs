use sea_orm_migration::prelude::*;

/// Stock count support: movement before/after columns + one-off repair of
/// branch_lots vs product_lots remaining mismatches (never deletes sales history).
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        // Idempotent column adds for SQLite (ignore duplicate-column errors).
        let _ = conn
            .execute_unprepared("ALTER TABLE stock_movements ADD COLUMN quantity_before REAL")
            .await;
        let _ = conn
            .execute_unprepared("ALTER TABLE stock_movements ADD COLUMN quantity_after REAL")
            .await;

        // Report mismatches before repair (lot remaining vs sum of branch_lots).
        let rows = conn
            .query_all_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT pl.id AS lot_id, pl.lot_number, p.name AS product_name,
                        CAST(pl.remaining_base_quantity AS REAL) AS lot_remaining,
                        CAST(COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl WHERE bl.product_lot_id = pl.id), 0) AS REAL) AS branch_remaining
                 FROM product_lots pl
                 JOIN products p ON p.id = pl.product_id
                 WHERE pl.deleted_at IS NULL
                   AND ABS(pl.remaining_base_quantity - COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl WHERE bl.product_lot_id = pl.id), 0)) > 0.000001"
                    .to_owned(),
            ))
            .await?;

        for row in &rows {
            let lot_number: String = row.try_get("", "lot_number").unwrap_or_else(|_| "?".into());
            let product_name: String = row
                .try_get("", "product_name")
                .unwrap_or_else(|_| "?".into());
            let lot_remaining: f64 = row.try_get("", "lot_remaining").unwrap_or(0.0);
            let branch_remaining: f64 = row.try_get("", "branch_remaining").unwrap_or(0.0);
            eprintln!(
                "stock reconcile migration: {product_name} / {lot_number}: branch_lots {branch_remaining} → lot remaining {lot_remaining} (no sales history deleted)"
            );
        }

        // Put full lot remaining on the largest branch row; zero siblings.
        // Uses a correlated update so totals match lot.remaining without touching movements.
        conn.execute_unprepared(
            "UPDATE branch_lots
             SET remaining_base_quantity = CASE
               WHEN id = (
                 SELECT bl2.id FROM branch_lots bl2
                 WHERE bl2.product_lot_id = branch_lots.product_lot_id
                 ORDER BY bl2.remaining_base_quantity DESC, bl2.id ASC
                 LIMIT 1
               )
               THEN (SELECT pl.remaining_base_quantity FROM product_lots pl WHERE pl.id = branch_lots.product_lot_id)
               ELSE 0
             END,
             updated_at = COALESCE(updated_at, datetime('now'))
             WHERE product_lot_id IN (
               SELECT pl.id FROM product_lots pl
               WHERE pl.deleted_at IS NULL
                 AND ABS(pl.remaining_base_quantity - COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl WHERE bl.product_lot_id = pl.id), 0)) > 0.000001
             )",
        )
        .await?;

        if !rows.is_empty() {
            eprintln!(
                "stock reconcile migration: repaired {} mismatched lot(s)",
                rows.len()
            );
        }

        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite cannot DROP COLUMN portably; leave columns in place.
        Ok(())
    }
}
