use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{errors::AppError, repositories::ProductRepository};

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
            "products" => {
                "SELECT id, name, deleted_at, NULL AS deleted_by FROM products WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
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
        if entity == "products" {
            return ProductRepository::restore_soft_deleted(database, id).await;
        }
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
        if entity == "products" {
            return purge_product(database, id).await;
        }
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

async fn purge_product(database: &DatabaseConnection, id: Uuid) -> Result<bool, AppError> {
    // invoice_items / invoice_item_lots keep FKs — never hard-delete sold products.
    let refs = ProductRefs::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT
           (SELECT COUNT(*) FROM invoice_items WHERE product_id = ?) AS invoices,
           (SELECT COUNT(*) FROM invoice_item_lots iil
              JOIN product_lots pl ON pl.id = iil.product_lot_id
             WHERE pl.product_id = ?) AS lot_links",
        [id.into(), id.into()],
    ))
    .one(database)
    .await?
    .unwrap_or(ProductRefs {
        invoices: 0,
        lot_links: 0,
    });
    if refs.invoices > 0 || refs.lot_links > 0 {
        return Err(AppError::Validation(
            "Cannot permanently delete — product is on past invoices.".into(),
        ));
    }
    let still = TrashRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, name, deleted_at, NULL AS deleted_by FROM products WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1",
        [id.into()],
    ))
    .one(database)
    .await?;
    if still.is_none() {
        return Ok(false);
    }
    database
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM branch_lots WHERE product_lot_id IN (SELECT id FROM product_lots WHERE product_id = ?)",
            [id.into()],
        ))
        .await?;
    database
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM product_lots WHERE product_id = ?",
            [id.into()],
        ))
        .await?;
    database
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM product_units WHERE product_id = ?",
            [id.into()],
        ))
        .await?;
    let result = database
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM products WHERE id = ? AND deleted_at IS NOT NULL",
            [id.into()],
        ))
        .await?;
    Ok(result.rows_affected() > 0)
}

#[derive(Debug, FromQueryResult)]
struct ProductRefs {
    invoices: i64,
    lot_links: i64,
}

fn table_name(entity: &str) -> Result<&'static str, AppError> {
    match entity {
        "suppliers" => Ok("suppliers"),
        "customers" => Ok("customers"),
        "users" => Ok("users"),
        "products" => Ok("products"),
        _ => Err(AppError::Validation("Unknown trash entity.".into())),
    }
}
