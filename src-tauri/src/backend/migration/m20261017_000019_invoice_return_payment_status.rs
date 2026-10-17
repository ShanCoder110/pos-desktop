use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

/// Allow invoice payment_status RETURNED / PARTIALLY_RETURNED after credit returns.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    /// Must not run inside a transaction: SQLite ignores PRAGMA foreign_keys
    /// changes while a transaction is open, and we need FK off to rebuild.
    fn use_transaction(&self) -> Option<bool> {
        Some(false)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        rebuild_invoices(
            conn,
            include_str!("m20261017_000019_invoice_return_payment_status.sql"),
        )
        .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        rebuild_invoices(
            conn,
            include_str!("m20261017_000019_invoice_return_payment_status.down.sql"),
        )
        .await
    }
}

/// Rebuild invoices with FKs disabled on this connection, then verify integrity.
///
/// Callers must run this outside a transaction and on a **single** SQLite
/// connection (migrate with `max_connections(1)`). sqlx enables foreign_keys=ON
/// per pooled connection, so a multi-connection pool would ignore PRAGMA OFF
/// set on a different checkout.
async fn rebuild_invoices(conn: &impl ConnectionTrait, script: &str) -> Result<(), DbErr> {
    conn.execute_unprepared("PRAGMA foreign_keys = OFF").await?;
    // Avoid SQLite rewriting child FK names during rename (post-3.26 behavior).
    conn.execute_unprepared("PRAGMA legacy_alter_table = ON")
        .await?;

    let fk_on = pragma_bool(conn, "PRAGMA foreign_keys").await?;
    if fk_on {
        return Err(DbErr::Custom(
            "PRAGMA foreign_keys must be OFF before rebuilding invoices \
             (is migrate using a multi-connection pool?)"
                .into(),
        ));
    }

    execute_script(conn, script).await?;

    let violations = conn
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA foreign_key_check".to_owned(),
        ))
        .await?;
    if !violations.is_empty() {
        return Err(DbErr::Custom(format!(
            "foreign_key_check failed after invoices rebuild ({} violation(s))",
            violations.len()
        )));
    }

    conn.execute_unprepared("PRAGMA legacy_alter_table = OFF")
        .await?;
    conn.execute_unprepared("PRAGMA foreign_keys = ON").await?;
    Ok(())
}

async fn pragma_bool(conn: &impl ConnectionTrait, pragma: &str) -> Result<bool, DbErr> {
    let row = conn
        .query_one_raw(Statement::from_string(DbBackend::Sqlite, pragma.to_owned()))
        .await?
        .ok_or_else(|| DbErr::Custom(format!("no row for {pragma}")))?;
    // PRAGMA foreign_keys returns a single integer column (0/1).
    let value: i64 = row
        .try_get_by_index(0)
        .or_else(|_| row.try_get("", "foreign_keys"))
        .unwrap_or(0);
    Ok(value != 0)
}

async fn execute_script(conn: &impl ConnectionTrait, script: &str) -> Result<(), DbErr> {
    for statement in script
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        // PRAGMA lines are handled in Rust around the rebuild.
        .filter(|value| !value.to_uppercase().starts_with("PRAGMA "))
    {
        conn.execute_unprepared(statement).await?;
    }
    Ok(())
}
