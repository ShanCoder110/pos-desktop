use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::errors::AppError;

#[derive(Debug, FromQueryResult)]
struct TrashRow {
    id: Uuid,
    name: String,
    deleted_at: String,
    deleted_by: Option<Uuid>,
}

pub struct TrashRepository;

impl TrashRepository {
    pub async fn list(
        database: &DatabaseConnection,
        entity: &str,
    ) -> Result<Vec<(Uuid, String, String, Option<Uuid>)>, AppError> {
        let sql = match entity {
            "suppliers" => {
                "SELECT id, name, deleted_at, deleted_by FROM suppliers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
            }
            "customers" => {
                "SELECT id, name, deleted_at, deleted_by FROM customers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
            }
            "users" => {
                "SELECT id, name, deleted_at, deleted_by FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
            }
            _ => return Err(AppError::Validation("Unknown trash entity.".into())),
        };
        let rows = TrashRow::find_by_statement(Statement::from_string(DbBackend::Sqlite, sql))
            .all(database)
            .await?;
        Ok(rows
            .into_iter()
            .map(|row| (row.id, row.name, row.deleted_at, row.deleted_by))
            .collect())
    }

    pub async fn restore(
        database: &DatabaseConnection,
        entity: &str,
        id: Uuid,
    ) -> Result<bool, AppError> {
        let sql = format!(
            "UPDATE {} SET deleted_at = NULL, deleted_by = NULL, is_active = 1, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL",
            table_name(entity)?
        );
        let now = chrono::Utc::now();
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &sql,
                [now.into(), id.into()],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn purge(
        database: &DatabaseConnection,
        entity: &str,
        id: Uuid,
    ) -> Result<bool, AppError> {
        let sql = format!(
            "DELETE FROM {} WHERE id = ? AND deleted_at IS NOT NULL",
            table_name(entity)?
        );
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &sql,
                [id.into()],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

fn table_name(entity: &str) -> Result<&'static str, AppError> {
    match entity {
        "suppliers" => Ok("suppliers"),
        "customers" => Ok("customers"),
        "users" => Ok("users"),
        _ => Err(AppError::Validation("Unknown trash entity.".into())),
    }
}
