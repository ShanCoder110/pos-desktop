use sea_orm_migration::prelude::*;

/// Rebuild customer/supplier `balance_after` as a running debit−credit total in
/// (`occurred_at`, `created_at`, `rowid`) order. Idempotent — safe to re-run.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        recompute_table(conn, "customer_ledger_entries", "customer_id").await?;
        recompute_table(conn, "supplier_ledger_entries", "supplier_id").await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}

async fn recompute_table(
    conn: &impl sea_orm::ConnectionTrait,
    table: &str,
    party_column: &str,
) -> Result<(), DbErr> {
    // Correlated running sum with stable tie-break on rowid (insert order).
    let sql = format!(
        "UPDATE {table}
         SET balance_after = (
           SELECT COALESCE(SUM(e2.debit - e2.credit), 0)
           FROM {table} e2
           WHERE e2.{party_column} = {table}.{party_column}
             AND (
               e2.occurred_at < {table}.occurred_at
               OR (e2.occurred_at = {table}.occurred_at AND e2.created_at < {table}.created_at)
               OR (e2.occurred_at = {table}.occurred_at AND e2.created_at = {table}.created_at AND e2.rowid <= {table}.rowid)
             )
         )"
    );
    conn.execute_unprepared(&sql).await?;
    Ok(())
}
