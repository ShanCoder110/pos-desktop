use sea_orm::{ConnectionTrait, DatabaseTransaction, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{constants::DEFAULT_SEQUENCE_PADDING, errors::AppError};

#[derive(Debug, FromQueryResult)]
struct SequenceValue {
    id: Uuid,
    prefix: String,
    pad: i16,
    next_value: i64,
}

pub struct SequenceRepository;

impl SequenceRepository {
    pub async fn next(
        transaction: &DatabaseTransaction,
        kind: &str,
        fallback_prefix: &str,
    ) -> Result<String, AppError> {
        let statement = Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, prefix, pad, next_value FROM document_sequences WHERE kind = ? AND branch_id IS NULL AND device_id IS NULL LIMIT 1",
            [kind.into()],
        );
        let row = SequenceValue::find_by_statement(statement)
            .one(transaction)
            .await?;
        let value = if let Some(row) = row {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE document_sequences SET next_value = next_value + 1, updated_at = ? WHERE id = ?",
                    [chrono::Utc::now().into(), row.id.into()],
                ))
                .await?;
            row
        } else {
            let id = Uuid::new_v4();
            let now = chrono::Utc::now();
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO document_sequences (id, kind, prefix, pad, next_value, created_at, updated_at) VALUES (?, ?, ?, ?, 2, ?, ?)",
                    [
                        id.into(),
                        kind.into(),
                        fallback_prefix.into(),
                        (DEFAULT_SEQUENCE_PADDING as i32).into(),
                        now.into(),
                        now.into(),
                    ],
                ))
                .await?;
            SequenceValue {
                id,
                prefix: fallback_prefix.to_owned(),
                pad: DEFAULT_SEQUENCE_PADDING as i16,
                next_value: 1,
            }
        };

        Ok(format!(
            "{}-{:0width$}",
            value.prefix,
            value.next_value,
            width = value.pad as usize
        ))
    }
}
