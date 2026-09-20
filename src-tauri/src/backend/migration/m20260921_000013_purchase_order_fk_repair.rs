use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !needs_repair(manager).await? {
            return Ok(());
        }

        execute_script(
            manager,
            include_str!("m20260921_000013_purchase_order_fk_repair.sql"),
        )
        .await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}

async fn needs_repair(manager: &SchemaManager<'_>) -> Result<bool, DbErr> {
    let connection = manager.get_connection();
    for table in [
        "purchase_order_items",
        "goods_receipts",
        "supplier_ledger_entries",
    ] {
        let rows = connection
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                format!("PRAGMA foreign_key_list({table})"),
            ))
            .await?;

        for row in rows {
            let referenced_table = row.try_get::<String>("", "table")?;
            if referenced_table == "purchase_orders_legacy" {
                return Ok(true);
            }
        }
    }

    Ok(false)
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
