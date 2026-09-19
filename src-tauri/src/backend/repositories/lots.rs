use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{
        ERROR_INVALID_CATEGORY_ID, ERROR_LOT_NOT_FOUND, ERROR_PRODUCT_NOT_FOUND,
        ERROR_SUPPLIER_REQUIRED, LEDGER_PURCHASE, LOT_SOURCE_OPENING, LOT_SOURCE_PURCHASE,
        REFERENCE_GOODS_RECEIPT, REFERENCE_PRODUCT_OPENING, STOCK_MOVEMENT_ADJUSTMENT,
        STOCK_MOVEMENT_PURCHASE,
    },
    dto::{BranchLotResponse, LotListQuery, LotResponse, ReceiveLotRequest},
    errors::AppError,
    util::{money_value, now_utc, parse_date, parse_optional_uuid, parse_uuid, quantity, trimmed},
};

#[derive(Debug, FromQueryResult)]
struct LotRow {
    id: Uuid,
    product_id: Uuid,
    product_name: String,
    supplier_id: Option<Uuid>,
    lot_number: String,
    source_type: String,
    original_base_quantity: Decimal,
    remaining_base_quantity: Decimal,
    damaged_base_quantity: Decimal,
    purchase_price_per_base: Decimal,
    received_date: chrono::NaiveDate,
    expiry_date: Option<chrono::NaiveDate>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct BranchLotRow {
    id: Uuid,
    branch_id: Uuid,
    product_lot_id: Uuid,
    allocated_base_quantity: Decimal,
    remaining_base_quantity: Decimal,
    reserved_base_quantity: Decimal,
    damaged_base_quantity: Decimal,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct BalanceRow {
    balance_after: Decimal,
}

pub struct LotRepository;

impl LotRepository {
    pub async fn list(
        database: &DatabaseConnection,
        query: &LotListQuery,
    ) -> Result<(Vec<LotResponse>, u64), AppError> {
        let (conditions, values) = build_conditions(query, None)?;
        let count_sql = format!(
            "SELECT COUNT(*) AS count FROM product_lots pl JOIN products p ON p.id = pl.product_id WHERE {conditions}"
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

        let sort = match query.page.sort_by.as_deref() {
            Some("lotNumber") => "pl.lot_number",
            Some("receivedDate") => "pl.received_date",
            Some("remaining") => "pl.remaining_base_quantity",
            _ => "pl.created_at",
        };
        let direction = query.page.sort_direction.unwrap_or_default().sql();
        let sql = format!(
            "SELECT pl.id, pl.product_id, p.name AS product_name, pl.supplier_id, pl.lot_number, pl.source_type, pl.original_base_quantity, pl.remaining_base_quantity, pl.damaged_base_quantity, pl.purchase_price_per_base, pl.received_date, pl.expiry_date, pl.created_at, pl.updated_at FROM product_lots pl JOIN products p ON p.id = pl.product_id WHERE {conditions} ORDER BY {sort} {direction}, pl.id ASC LIMIT ? OFFSET ?"
        );
        let mut page_values = values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = LotRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            page_values,
        ))
        .all(database)
        .await?;
        Ok((hydrate(database, rows).await?, count))
    }

    pub async fn find(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<Option<LotResponse>, AppError> {
        let query = LotListQuery::default();
        let (conditions, values) = build_conditions(&query, Some(id))?;
        let sql = format!(
            "SELECT pl.id, pl.product_id, p.name AS product_name, pl.supplier_id, pl.lot_number, pl.source_type, pl.original_base_quantity, pl.remaining_base_quantity, pl.damaged_base_quantity, pl.purchase_price_per_base, pl.received_date, pl.expiry_date, pl.created_at, pl.updated_at FROM product_lots pl JOIN products p ON p.id = pl.product_id WHERE {conditions} LIMIT 1"
        );
        let rows = LotRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            values,
        ))
        .all(database)
        .await?;
        Ok(hydrate(database, rows).await?.into_iter().next())
    }

    pub async fn receive(
        transaction: &DatabaseTransaction,
        request: &ReceiveLotRequest,
        branch_id: Uuid,
        user_id: Uuid,
        lot_number: String,
    ) -> Result<Uuid, AppError> {
        let product_id = parse_uuid(&request.product_id, "productId")?;
        let product_exists = transaction
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1",
                [product_id.into()],
            ))
            .await?;
        if product_exists.is_none() {
            return Err(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND));
        }

        let source = request.source_type.trim().to_uppercase();
        let source_type = match source.as_str() {
            "OPENING" => LOT_SOURCE_OPENING,
            "PURCHASE" => LOT_SOURCE_PURCHASE,
            _ => {
                return Err(AppError::Validation(
                    "sourceType must be OPENING or PURCHASE.".into(),
                ))
            }
        };
        let supplier_id = parse_optional_uuid(request.supplier_id.as_deref(), "supplierId")?;
        if source_type == LOT_SOURCE_PURCHASE && supplier_id.is_none() {
            return Err(AppError::Validation(ERROR_SUPPLIER_REQUIRED.into()));
        }

        let qty = quantity(request.quantity);
        let cost = money_value(request.cost);
        let received_date = parse_date(
            &request.received_date,
            crate::backend::constants::ERROR_INVALID_RECEIVED_DATE,
        )?;
        let expiry_date = request
            .expiry_date
            .as_deref()
            .map(|value| parse_date(value, crate::backend::constants::ERROR_INVALID_EXPIRY_DATE))
            .transpose()?;
        let now = now_utc();
        let lot_id = Uuid::new_v4();
        let branch_lot_id = Uuid::new_v4();
        let movement_id = Uuid::new_v4();
        let (movement_type, reference_type) = if source_type == LOT_SOURCE_OPENING {
            (STOCK_MOVEMENT_ADJUSTMENT, REFERENCE_PRODUCT_OPENING)
        } else {
            (STOCK_MOVEMENT_PURCHASE, REFERENCE_GOODS_RECEIPT)
        };

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO product_lots (id, product_id, supplier_id, goods_receipt_item_id, production_job_id, lot_number, source_type, original_base_quantity, remaining_base_quantity, damaged_base_quantity, purchase_price_per_base, received_date, expiry_date, created_by, version, deleted_at, origin_device_id, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, NULL, NULL, ?, ?)",
                [
                    lot_id.into(),
                    product_id.into(),
                    supplier_id.into(),
                    lot_number.into(),
                    source_type.into(),
                    qty.into(),
                    qty.into(),
                    cost.into(),
                    received_date.into(),
                    expiry_date.into(),
                    user_id.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO branch_lots (id, branch_id, product_lot_id, allocated_base_quantity, remaining_base_quantity, reserved_base_quantity, damaged_base_quantity, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
                [
                    branch_lot_id.into(),
                    branch_id.into(),
                    lot_id.into(),
                    qty.into(),
                    qty.into(),
                    now.into(),
                ],
            ))
            .await?;

        let total_cost = money_value(cost * qty);
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    movement_id.into(),
                    branch_id.into(),
                    product_id.into(),
                    lot_id.into(),
                    movement_type.into(),
                    qty.into(),
                    "base".into(),
                    qty.into(),
                    cost.into(),
                    total_cost.into(),
                    reference_type.into(),
                    lot_id.into(),
                    now.into(),
                    user_id.into(),
                    now.into(),
                ],
            ))
            .await?;

        if let Some(supplier_id) = supplier_id {
            let previous = BalanceRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT CAST(balance_after AS REAL) AS balance_after FROM supplier_ledger_entries WHERE supplier_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
                [supplier_id.into()],
            ))
            .one(transaction)
            .await?
            .map(|row| row.balance_after)
            .unwrap_or(Decimal::ZERO);
            let balance_after = previous + total_cost;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO supplier_ledger_entries (id, supplier_id, branch_id, type, purchase_order_id, goods_receipt_id, money_transaction_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 0, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        supplier_id.into(),
                        branch_id.into(),
                        LEDGER_PURCHASE.into(),
                        total_cost.into(),
                        balance_after.into(),
                        format!("Lot receive {lot_id}").into(),
                        now.into(),
                        user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

        if request.min.is_some() || request.wholesale.is_some() || request.retail.is_some() {
            let mut sets = Vec::new();
            let mut price_values: Vec<sea_orm::Value> = Vec::new();
            if let Some(min) = request.min {
                sets.push("minimum_price = ?");
                price_values.push(money_value(min).into());
            }
            if let Some(wholesale) = request.wholesale {
                sets.push("wholesale_price = ?");
                price_values.push(money_value(wholesale).into());
            }
            if let Some(retail) = request.retail {
                sets.push("retail_price = ?");
                price_values.push(money_value(retail).into());
            }
            sets.push("updated_at = ?");
            price_values.push(now.into());
            price_values.push(product_id.into());
            let sql = format!(
                "UPDATE product_units SET {} WHERE product_id = ? AND is_base = 1 AND deleted_at IS NULL",
                sets.join(", ")
            );
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    sql,
                    price_values,
                ))
                .await?;
        }

        let _ = ERROR_LOT_NOT_FOUND;
        let _ = ERROR_INVALID_CATEGORY_ID;
        let _ = trimmed(&None);
        Ok(lot_id)
    }
}

fn build_conditions(
    query: &LotListQuery,
    id: Option<Uuid>,
) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["pl.deleted_at IS NULL".to_owned()];
    let mut values = Vec::new();
    if let Some(id) = id {
        parts.push("pl.id = ?".to_owned());
        values.push(id.into());
    }
    if let Some(product_id) = &query.product_id {
        parts.push("pl.product_id = ?".to_owned());
        values.push(parse_uuid(product_id, "productId")?.into());
    }
    if let Some(branch_id) = &query.branch_id {
        parts.push(
            "EXISTS (SELECT 1 FROM branch_lots bl WHERE bl.product_lot_id = pl.id AND bl.branch_id = ?)"
                .to_owned(),
        );
        values.push(parse_uuid(branch_id, "branchId")?.into());
    }
    if let Some(source_type) = &query.source_type {
        parts.push("pl.source_type = ?".to_owned());
        values.push(source_type.trim().to_uppercase().into());
    }
    if let Some(search) = &query.page.search {
        parts.push(
            "(lower(pl.lot_number) LIKE ? OR lower(p.name) LIKE ? OR lower(p.sku) LIKE ?)"
                .to_owned(),
        );
        let needle = format!("%{}%", search.to_lowercase());
        values.extend([needle.clone().into(), needle.clone().into(), needle.into()]);
    }
    Ok((parts.join(" AND "), values))
}

async fn hydrate(
    database: &DatabaseConnection,
    rows: Vec<LotRow>,
) -> Result<Vec<LotResponse>, AppError> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }
    let ids: Vec<Uuid> = rows.iter().map(|row| row.id).collect();
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT id, branch_id, product_lot_id, allocated_base_quantity, remaining_base_quantity, reserved_base_quantity, damaged_base_quantity, updated_at FROM branch_lots WHERE product_lot_id IN ({placeholders})"
    );
    let values: Vec<sea_orm::Value> = ids.into_iter().map(Into::into).collect();
    let branch_rows = BranchLotRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        sql,
        values,
    ))
    .all(database)
    .await?;
    let mut by_lot: std::collections::HashMap<Uuid, Vec<BranchLotResponse>> =
        std::collections::HashMap::new();
    for row in branch_rows {
        by_lot
            .entry(row.product_lot_id)
            .or_default()
            .push(BranchLotResponse {
                id: row.id.to_string(),
                branch_id: row.branch_id.to_string(),
                product_lot_id: row.product_lot_id.to_string(),
                allocated_base_quantity: decimal(row.allocated_base_quantity),
                remaining_base_quantity: decimal(row.remaining_base_quantity),
                reserved_base_quantity: decimal(row.reserved_base_quantity),
                damaged_base_quantity: decimal(row.damaged_base_quantity),
                updated_at: row.updated_at.to_rfc3339(),
            });
    }

    Ok(rows
        .into_iter()
        .map(|row| LotResponse {
            id: row.id.to_string(),
            product_id: row.product_id.to_string(),
            product_name: row.product_name,
            supplier_id: row.supplier_id.map(|value| value.to_string()),
            lot_number: row.lot_number,
            source_type: row.source_type,
            original_base_quantity: decimal(row.original_base_quantity),
            remaining_base_quantity: decimal(row.remaining_base_quantity),
            damaged_base_quantity: decimal(row.damaged_base_quantity),
            purchase_price_per_base: decimal(row.purchase_price_per_base),
            received_date: row.received_date.to_string(),
            expiry_date: row.expiry_date.map(|value| value.to_string()),
            branch_lots: by_lot.remove(&row.id).unwrap_or_default(),
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        })
        .collect())
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
