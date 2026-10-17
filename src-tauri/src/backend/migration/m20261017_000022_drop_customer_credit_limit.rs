use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

/// Drop `customers.credit_limit` again (added by 000021). No-op when absent.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    /// Rebuild needs FK off on this connection — same constraints as 000019.
    fn use_transaction(&self) -> Option<bool> {
        Some(false)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        if !column_exists(conn, "customers", "credit_limit").await? {
            return Ok(());
        }
        rebuild_customers(
            conn,
            include_str!("m20261017_000022_drop_customer_credit_limit.sql"),
        )
        .await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // Permanent removal — down is intentionally a no-op.
        Ok(())
    }
}

async fn column_exists(
    conn: &impl ConnectionTrait,
    table: &str,
    column: &str,
) -> Result<bool, DbErr> {
    let rows = conn
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            format!("PRAGMA table_info({table})"),
        ))
        .await?;
    for row in rows {
        // PRAGMA table_info: cid, name, type, notnull, dflt_value, pk
        let name: String = row
            .try_get_by_index(1)
            .or_else(|_| row.try_get("", "name"))
            .unwrap_or_default();
        if name.eq_ignore_ascii_case(column) {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn rebuild_customers(conn: &impl ConnectionTrait, script: &str) -> Result<(), DbErr> {
    conn.execute_unprepared("PRAGMA foreign_keys = OFF").await?;
    conn.execute_unprepared("PRAGMA legacy_alter_table = ON")
        .await?;

    let fk_on = pragma_bool(conn, "PRAGMA foreign_keys").await?;
    if fk_on {
        return Err(DbErr::Custom(
            "PRAGMA foreign_keys must be OFF before rebuilding customers \
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
            "foreign_key_check failed after customers rebuild ({} violation(s))",
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
    let value: i64 = row
        .try_get_by_index(0)
        .or_else(|_| row.try_get("", "foreign_keys"))
        .unwrap_or(0);
    Ok(value != 0)
}

async fn execute_script(conn: &impl ConnectionTrait, script: &str) -> Result<(), DbErr> {
    for statement in script.split(';').map(|chunk| {
        chunk
            .lines()
            .filter(|line| !line.trim_start().starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_owned()
    }) {
        if statement.is_empty() || statement.to_uppercase().starts_with("PRAGMA ") {
            continue;
        }
        conn.execute_unprepared(&statement).await?;
    }
    Ok(())
}
