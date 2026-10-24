use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let connection = manager.get_connection();
        for sql in [
            "CREATE INDEX IF NOT EXISTS ix_invoice_items_invoice_time ON invoice_items(invoice_id, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_payments_invoice_time ON payments(invoice_id, paid_at)",
            "CREATE INDEX IF NOT EXISTS ix_customer_ledger_party_time ON customer_ledger_entries(customer_id, occurred_at DESC, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_supplier_ledger_party_time ON supplier_ledger_entries(supplier_id, occurred_at DESC, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_products_active_created ON products(created_at DESC, id) WHERE deleted_at IS NULL",
            "CREATE INDEX IF NOT EXISTS ix_products_active_name_nocase ON products(name COLLATE NOCASE, id) WHERE deleted_at IS NULL",
        ] {
            connection.execute_unprepared(sql).await?;
        }

        // Older installations may have balances written before the stable rowid
        // ordering was used. Repair them once during upgrade, not on every launch.
        crate::backend::repositories::LedgerRepository::recompute_balances(connection)
            .await
            .map_err(|error| DbErr::Custom(error.to_string()))?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let connection = manager.get_connection();
        for name in [
            "ix_invoice_items_invoice_time",
            "ix_payments_invoice_time",
            "ix_customer_ledger_party_time",
            "ix_supplier_ledger_party_time",
            "ix_products_active_created",
            "ix_products_active_name_nocase",
        ] {
            connection
                .execute_unprepared(&format!("DROP INDEX IF EXISTS {name}"))
                .await?;
        }
        Ok(())
    }
}
