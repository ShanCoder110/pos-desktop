use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{DatabaseConnection, DbBackend, FromQueryResult, Statement};

use crate::backend::{
    dto::{StockListQuery, StockMovementListQuery, StockMovementResponse, StockRow},
    errors::AppError,
    util::parse_uuid,
};

#[derive(Debug, FromQueryResult)]
struct StockProjection {
    product_id: uuid::Uuid,
    product_name: String,
    sku: String,
    barcode: String,
    unit: String,
    branch_id: uuid::Uuid,
    remaining: Decimal,
    reserved: Decimal,
    damaged: Decimal,
    minimum_stock: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct MovementRow {
    id: uuid::Uuid,
    branch_id: uuid::Uuid,
    product_id: uuid::Uuid,
    product_name: String,
    product_lot_id: Option<uuid::Uuid>,
    movement_type: String,
    displayed_quantity: Decimal,
    displayed_unit_name: String,
    base_quantity_delta: Decimal,
    unit_cost: Option<Decimal>,
    total_cost: Option<Decimal>,
    reference_type: String,
    reference_id: String,
    notes: Option<String>,
    occurred_at: chrono::DateTime<chrono::Utc>,
    created_by: uuid::Uuid,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

pub struct StockRepository;

impl StockRepository {
    pub async fn list(
        database: &DatabaseConnection,
        query: &StockListQuery,
        default_branch_id: Option<uuid::Uuid>,
    ) -> Result<(Vec<StockRow>, u64), AppError> {
        let mut parts = vec!["p.deleted_at IS NULL".to_owned()];
        let mut values: Vec<sea_orm::Value> = Vec::new();
        let branch_id = match &query.branch_id {
            Some(value) => Some(parse_uuid(value, "branchId")?),
            None => default_branch_id,
        };
        if let Some(branch_id) = branch_id {
            parts.push("bl.branch_id = ?".to_owned());
            values.push(branch_id.into());
        }
        if let Some(product_id) = &query.product_id {
            parts.push("p.id = ?".to_owned());
            values.push(parse_uuid(product_id, "productId")?.into());
        }
        if let Some(search) = &query.page.search {
            parts.push(
                "(lower(p.name) LIKE ? OR lower(p.sku) LIKE ? OR lower(p.barcode) LIKE ?)"
                    .to_owned(),
            );
            let needle = format!("%{}%", search.to_lowercase());
            values.extend([needle.clone().into(), needle.clone().into(), needle.into()]);
        }
        if query.low_stock == Some(true) {
            parts.push("aggregated.remaining < p.minimum_stock".to_owned());
        }
        let conditions = parts.join(" AND ");

        let base_from = "FROM products p JOIN units u ON u.id = p.base_unit_id JOIN (
            SELECT bl.branch_id, pl.product_id,
                   SUM(bl.remaining_base_quantity) AS remaining,
                   SUM(bl.reserved_base_quantity) AS reserved,
                   SUM(bl.damaged_base_quantity) AS damaged
            FROM branch_lots bl
            JOIN product_lots pl ON pl.id = bl.product_lot_id
            WHERE pl.deleted_at IS NULL
            GROUP BY bl.branch_id, pl.product_id
        ) aggregated ON aggregated.product_id = p.id
        JOIN branch_lots bl ON bl.branch_id = aggregated.branch_id";

        // Simplify: aggregate per branch+product directly
        let from_sql = "FROM (
            SELECT bl.branch_id, pl.product_id,
                   SUM(bl.remaining_base_quantity) AS remaining,
                   SUM(bl.reserved_base_quantity) AS reserved,
                   SUM(bl.damaged_base_quantity) AS damaged
            FROM branch_lots bl
            JOIN product_lots pl ON pl.id = bl.product_lot_id
            WHERE pl.deleted_at IS NULL
            GROUP BY bl.branch_id, pl.product_id
        ) stock
        JOIN products p ON p.id = stock.product_id
        JOIN units u ON u.id = p.base_unit_id";

        let mut filter_parts = vec!["p.deleted_at IS NULL".to_owned()];
        let mut filter_values: Vec<sea_orm::Value> = Vec::new();
        if let Some(branch_id) = branch_id {
            filter_parts.push("stock.branch_id = ?".to_owned());
            filter_values.push(branch_id.into());
        }
        if let Some(product_id) = &query.product_id {
            filter_parts.push("p.id = ?".to_owned());
            filter_values.push(parse_uuid(product_id, "productId")?.into());
        }
        if let Some(search) = &query.page.search {
            filter_parts.push(
                "(lower(p.name) LIKE ? OR lower(p.sku) LIKE ? OR lower(p.barcode) LIKE ?)"
                    .to_owned(),
            );
            let needle = format!("%{}%", search.to_lowercase());
            filter_values.extend([needle.clone().into(), needle.clone().into(), needle.into()]);
        }
        if query.low_stock == Some(true) {
            filter_parts.push("stock.remaining < p.minimum_stock".to_owned());
        }
        let filter = filter_parts.join(" AND ");

        let count_sql = format!("SELECT COUNT(*) AS count {from_sql} WHERE {filter}");
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            count_sql,
            filter_values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);

        let sort = match query.page.sort_by.as_deref() {
            Some("name") => "p.name",
            Some("remaining") => "stock.remaining",
            Some("sku") => "p.sku",
            _ => "p.created_at",
        };
        let direction = query.page.sort_direction.unwrap_or_default().sql();
        let sql = format!(
            "SELECT p.id AS product_id, p.name AS product_name, p.sku, p.barcode, u.symbol AS unit, stock.branch_id, stock.remaining, stock.reserved, stock.damaged, p.minimum_stock {from_sql} WHERE {filter} ORDER BY {sort} {direction}, p.id ASC LIMIT ? OFFSET ?"
        );
        let mut page_values = filter_values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = StockProjection::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            page_values,
        ))
        .all(database)
        .await?;

        let _ = (conditions, values, base_from);
        Ok((
            rows.into_iter()
                .map(|row| {
                    let remaining = decimal(row.remaining);
                    StockRow {
                        product_id: row.product_id.to_string(),
                        product_name: row.product_name,
                        sku: row.sku,
                        barcode: row.barcode,
                        unit: row.unit,
                        branch_id: row.branch_id.to_string(),
                        remaining,
                        reserved: decimal(row.reserved),
                        damaged: decimal(row.damaged),
                        minimum_stock: decimal(row.minimum_stock),
                        is_low: remaining < decimal(row.minimum_stock),
                    }
                })
                .collect(),
            count,
        ))
    }

    pub async fn list_movements(
        database: &DatabaseConnection,
        query: &StockMovementListQuery,
        default_branch_id: Option<uuid::Uuid>,
    ) -> Result<(Vec<StockMovementResponse>, u64), AppError> {
        let mut parts = vec!["1 = 1".to_owned()];
        let mut values: Vec<sea_orm::Value> = Vec::new();
        let branch_id = match &query.branch_id {
            Some(value) => Some(parse_uuid(value, "branchId")?),
            None => default_branch_id,
        };
        if let Some(branch_id) = branch_id {
            parts.push("sm.branch_id = ?".to_owned());
            values.push(branch_id.into());
        }
        if let Some(product_id) = &query.product_id {
            parts.push("sm.product_id = ?".to_owned());
            values.push(parse_uuid(product_id, "productId")?.into());
        }
        if let Some(movement_type) = &query.movement_type {
            parts.push("sm.type = ?".to_owned());
            values.push(movement_type.trim().to_uppercase().into());
        }
        if let Some(search) = &query.page.search {
            parts.push("(lower(p.name) LIKE ? OR lower(sm.reference_type) LIKE ?)".to_owned());
            let needle = format!("%{}%", search.to_lowercase());
            values.extend([needle.clone().into(), needle.into()]);
        }
        let conditions = parts.join(" AND ");

        let count_sql = format!(
            "SELECT COUNT(*) AS count FROM stock_movements sm JOIN products p ON p.id = sm.product_id WHERE {conditions}"
        );
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            count_sql,
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);

        let direction = query.page.sort_direction.unwrap_or_default().sql();
        let sql = format!(
            "SELECT sm.id, sm.branch_id, sm.product_id, p.name AS product_name, sm.product_lot_id, sm.type AS movement_type, sm.displayed_quantity, sm.displayed_unit_name, sm.base_quantity_delta, sm.unit_cost, sm.total_cost, sm.reference_type, sm.reference_id, sm.notes, sm.occurred_at, sm.created_by, sm.created_at FROM stock_movements sm JOIN products p ON p.id = sm.product_id WHERE {conditions} ORDER BY sm.created_at {direction}, sm.id DESC LIMIT ? OFFSET ?"
        );
        let mut page_values = values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = MovementRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            page_values,
        ))
        .all(database)
        .await?;

        Ok((
            rows.into_iter()
                .map(|row| StockMovementResponse {
                    id: row.id.to_string(),
                    branch_id: row.branch_id.to_string(),
                    product_id: row.product_id.to_string(),
                    product_name: row.product_name,
                    product_lot_id: row.product_lot_id.map(|value| value.to_string()),
                    movement_type: row.movement_type,
                    displayed_quantity: decimal(row.displayed_quantity),
                    displayed_unit_name: row.displayed_unit_name,
                    base_quantity_delta: decimal(row.base_quantity_delta),
                    unit_cost: row.unit_cost.map(decimal),
                    total_cost: row.total_cost.map(decimal),
                    reference_type: row.reference_type,
                    reference_id: row.reference_id,
                    notes: row.notes,
                    occurred_at: row.occurred_at.to_rfc3339(),
                    created_by: row.created_by.to_string(),
                    created_at: row.created_at.to_rfc3339(),
                })
                .collect(),
            count,
        ))
    }
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
