use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

/// Convert hyphenated TEXT / 36-byte ASCII BLOB UUIDs to 16-byte BLOBs on
/// `id` and `*_id` columns. Idempotent: already-correct 16-byte blobs are skipped.
///
/// SeaORM `Uuid` decode expects length 16; TEXT (36) or BLOB(36) causes
/// `decoding column "id": invalid length: expected 16 bytes, found 36`.
#[derive(DeriveMigrationName)]
pub struct Migration;

/// Columns that look like `*_id` but are not UUID blobs.
const SKIP_COLUMNS: &[&str] = &[
    "client_request_id",
    "reference_number",
    "invoice_number",
    "lot_number",
    "adjustment_number",
    "return_number",
    "order_number",
    "transfer_number",
    "receipt_number",
    "job_number",
    "claim_number",
    "held_number",
    "po_number",
    "grn_number",
];

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    /// FK pragma + multi-table updates need a single connection outside the
    /// migrator's nested transaction (same pattern as 000019/000022).
    fn use_transaction(&self) -> Option<bool> {
        Some(false)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        convert_uuid_columns(conn).await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // Irreversible data repair — leave blobs as-is.
        Ok(())
    }
}

async fn convert_uuid_columns(conn: &impl ConnectionTrait) -> Result<(), DbErr> {
    conn.execute_unprepared("PRAGMA foreign_keys = OFF").await?;

    let fk_on = pragma_bool(conn, "PRAGMA foreign_keys").await?;
    if fk_on {
        return Err(DbErr::Custom(
            "PRAGMA foreign_keys must be OFF before UUID blob conversion \
             (is migrate using a multi-connection pool?)"
                .into(),
        ));
    }

    conn.execute_unprepared("BEGIN IMMEDIATE").await?;

    let result = convert_all_tables(conn).await;
    match result {
        Ok(()) => {
            let violations = conn
                .query_all_raw(Statement::from_string(
                    DbBackend::Sqlite,
                    "PRAGMA foreign_key_check".to_owned(),
                ))
                .await?;
            if !violations.is_empty() {
                let _ = conn.execute_unprepared("ROLLBACK").await;
                conn.execute_unprepared("PRAGMA foreign_keys = ON").await?;
                return Err(DbErr::Custom(format!(
                    "foreign_key_check failed after UUID blob conversion ({} violation(s))",
                    violations.len()
                )));
            }
            conn.execute_unprepared("COMMIT").await?;
            conn.execute_unprepared("PRAGMA foreign_keys = ON").await?;
            Ok(())
        }
        Err(err) => {
            let _ = conn.execute_unprepared("ROLLBACK").await;
            let _ = conn.execute_unprepared("PRAGMA foreign_keys = ON").await;
            Err(err)
        }
    }
}

async fn convert_all_tables(conn: &impl ConnectionTrait) -> Result<(), DbErr> {
    let tables = conn
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT name FROM sqlite_master
             WHERE type = 'table'
               AND name NOT LIKE 'sqlite_%'
               AND name != 'seaql_migrations'
             ORDER BY name"
                .to_owned(),
        ))
        .await?;

    for table_row in tables {
        let table: String = table_row
            .try_get("", "name")
            .or_else(|_| table_row.try_get_by_index(0))?;
        let columns = uuid_like_columns(conn, &table).await?;
        for column in columns {
            convert_column(conn, &table, &column).await?;
        }
    }
    Ok(())
}

async fn uuid_like_columns(conn: &impl ConnectionTrait, table: &str) -> Result<Vec<String>, DbErr> {
    let rows = conn
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            format!("PRAGMA table_info(\"{table}\")"),
        ))
        .await?;
    let mut out = Vec::new();
    for row in rows {
        let name: String = row
            .try_get_by_index(1)
            .or_else(|_| row.try_get("", "name"))
            .unwrap_or_default();
        if !is_uuid_column(&name) {
            continue;
        }
        out.push(name);
    }
    Ok(out)
}

fn is_uuid_column(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if SKIP_COLUMNS.iter().any(|skip| *skip == lower.as_str()) {
        return false;
    }
    lower == "id" || lower.ends_with("_id")
}

async fn convert_column(
    conn: &impl ConnectionTrait,
    table: &str,
    column: &str,
) -> Result<(), DbErr> {
    // TEXT 36 (hyphenated) or TEXT 32 (hex) or BLOB 36 (ASCII hyphenated) → 16-byte BLOB.
    // Already-correct BLOB 16 rows are untouched (WHERE filters them out).
    let sql = format!(
        "UPDATE \"{table}\"
         SET \"{column}\" = CASE
           WHEN typeof(\"{column}\") = 'text' AND length(\"{column}\") = 36
             THEN unhex(replace(\"{column}\", '-', ''))
           WHEN typeof(\"{column}\") = 'text' AND length(\"{column}\") = 32
             AND \"{column}\" GLOB '[0-9A-Fa-f]*'
             THEN unhex(\"{column}\")
           WHEN typeof(\"{column}\") = 'blob' AND length(\"{column}\") = 36
             THEN unhex(replace(CAST(\"{column}\" AS TEXT), '-', ''))
           ELSE \"{column}\"
         END
         WHERE \"{column}\" IS NOT NULL
           AND (
             (typeof(\"{column}\") = 'text' AND length(\"{column}\") IN (32, 36))
             OR (typeof(\"{column}\") = 'blob' AND length(\"{column}\") = 36)
           )"
    );
    conn.execute_unprepared(&sql).await?;
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
