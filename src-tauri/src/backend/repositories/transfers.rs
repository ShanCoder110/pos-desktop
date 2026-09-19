use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{
        ERROR_INSUFFICIENT_STOCK, ERROR_TRANSFER_NOT_FOUND, REFERENCE_TRANSFER,
        STOCK_MOVEMENT_TRANSFER_IN, STOCK_MOVEMENT_TRANSFER_OUT,
    },
    context::RequestContext,
    dto::{CreateTransferRequest, TransferItemResponse, TransferListQuery, TransferResponse},
    errors::AppError,
    util::{now_utc, parse_uuid, quantity, trimmed},
};

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct TransferHeader {
    id: Uuid,
    transfer_number: String,
    from_branch_id: Uuid,
    to_branch_id: Uuid,
    status: String,
    notes: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    sent_at: Option<chrono::DateTime<chrono::Utc>>,
    received_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, FromQueryResult)]
struct TransferItemRow {
    id: Uuid,
    product_id: Uuid,
    product_lot_id: Uuid,
    requested_base_quantity: Decimal,
    sent_base_quantity: Decimal,
    received_base_quantity: Decimal,
    damaged_in_transit_quantity: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct BranchLotQty {
    id: Uuid,
    remaining: Decimal,
    unit_cost: Decimal,
}

pub struct TransferRepository;

impl TransferRepository {
    pub async fn list(
        database: &DatabaseConnection,
        query: &TransferListQuery,
    ) -> Result<(Vec<TransferResponse>, u64), AppError> {
        let (conditions, values) = transfer_conditions(query)?;
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM stock_transfers st WHERE {conditions}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        let mut page_values = values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = TransferHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, transfer_number, from_branch_id, to_branch_id, status, notes, created_at, sent_at, received_at FROM stock_transfers st WHERE {conditions} ORDER BY st.created_at DESC LIMIT ? OFFSET ?"
            ),
            page_values,
        ))
        .all(database)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(hydrate(database, row).await?);
        }
        Ok((out, count))
    }

    pub async fn find(
        database: &impl ConnectionTrait,
        id: Uuid,
    ) -> Result<Option<TransferResponse>, AppError> {
        let row = TransferHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, transfer_number, from_branch_id, to_branch_id, status, notes, created_at, sent_at, received_at FROM stock_transfers WHERE id = ? LIMIT 1",
            [id.into()],
        ))
        .one(database)
        .await?;
        match row {
            Some(row) => Ok(Some(hydrate(database, row).await?)),
            None => Ok(None),
        }
    }

    pub async fn create(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        request: &CreateTransferRequest,
        transfer_number: String,
    ) -> Result<Uuid, AppError> {
        let from_branch_id = parse_uuid(&request.from_branch_id, "fromBranchId")?;
        let to_branch_id = parse_uuid(&request.to_branch_id, "toBranchId")?;
        if from_branch_id == to_branch_id {
            return Err(AppError::Validation(
                "fromBranchId and toBranchId must differ.".into(),
            ));
        }
        let now = now_utc();
        let id = Uuid::new_v4();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO stock_transfers (id, transfer_number, from_branch_id, to_branch_id, status, notes, created_by, sent_by, received_by, created_at, sent_at, received_at, cancelled_at) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, NULL, NULL, ?, NULL, NULL, NULL)",
                [
                    id.into(),
                    transfer_number.into(),
                    from_branch_id.into(),
                    to_branch_id.into(),
                    trimmed(&request.notes).into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        for item in &request.items {
            let product_id = parse_uuid(&item.product_id, "items.productId")?;
            let product_lot_id = parse_uuid(&item.product_lot_id, "items.productLotId")?;
            let qty = quantity(item.quantity);
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO stock_transfer_items (id, stock_transfer_id, product_id, product_lot_id, requested_base_quantity, sent_base_quantity, received_base_quantity, damaged_in_transit_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        id.into(),
                        product_id.into(),
                        product_lot_id.into(),
                        qty.into(),
                        now.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }
        Ok(id)
    }

    pub async fn send(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        id: Uuid,
    ) -> Result<(), AppError> {
        let header = load_header(transaction, id).await?;
        if header.status != "DRAFT" {
            return Err(AppError::Conflict(format!(
                "Transfer must be DRAFT to send (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        let items = TransferItemRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, product_id, product_lot_id, requested_base_quantity, sent_base_quantity, received_base_quantity, damaged_in_transit_quantity FROM stock_transfer_items WHERE stock_transfer_id = ?",
            [id.into()],
        ))
        .all(transaction)
        .await?;

        for item in items {
            let qty = quantity(item.requested_base_quantity);
            let branch_lot = BranchLotQty::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT bl.id, bl.remaining_base_quantity AS remaining, pl.purchase_price_per_base AS unit_cost FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE bl.branch_id = ? AND bl.product_lot_id = ? LIMIT 1",
                [header.from_branch_id.into(), item.product_lot_id.into()],
            ))
            .one(transaction)
            .await?
            .ok_or(AppError::Conflict(ERROR_INSUFFICIENT_STOCK.into()))?;
            if branch_lot.remaining < qty {
                return Err(AppError::Conflict(ERROR_INSUFFICIENT_STOCK.into()));
            }
            let total_cost = branch_lot.unit_cost * qty;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE branch_lots SET remaining_base_quantity = remaining_base_quantity - ?, updated_at = ? WHERE id = ?",
                    [qty.into(), now.into(), branch_lot.id.into()],
                ))
                .await?;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'base', ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        header.from_branch_id.into(),
                        item.product_id.into(),
                        item.product_lot_id.into(),
                        STOCK_MOVEMENT_TRANSFER_OUT.into(),
                        qty.into(),
                        (-qty).into(),
                        branch_lot.unit_cost.into(),
                        total_cost.into(),
                        REFERENCE_TRANSFER.into(),
                        id.into(),
                        now.into(),
                        context.user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE stock_transfer_items SET sent_base_quantity = ?, updated_at = ? WHERE id = ?",
                    [qty.into(), now.into(), item.id.into()],
                ))
                .await?;
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE stock_transfers SET status = 'SENT', sent_by = ?, sent_at = ? WHERE id = ?",
                [context.user_id.into(), now.into(), id.into()],
            ))
            .await?;
        Ok(())
    }

    pub async fn receive(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        id: Uuid,
    ) -> Result<(), AppError> {
        let header = load_header(transaction, id).await?;
        if !matches!(header.status.as_str(), "SENT" | "PARTIAL") {
            return Err(AppError::Conflict(format!(
                "Transfer must be SENT or PARTIAL to receive (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        let items = TransferItemRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, product_id, product_lot_id, requested_base_quantity, sent_base_quantity, received_base_quantity, damaged_in_transit_quantity FROM stock_transfer_items WHERE stock_transfer_id = ?",
            [id.into()],
        ))
        .all(transaction)
        .await?;

        for item in items {
            let qty = quantity(item.sent_base_quantity - item.received_base_quantity);
            if qty <= Decimal::ZERO {
                continue;
            }
            let unit_cost = BranchLotQty::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, remaining_base_quantity AS remaining, purchase_price_per_base AS unit_cost FROM product_lots WHERE id = ? LIMIT 1",
                [item.product_lot_id.into()],
            ))
            .one(transaction)
            .await?
            .map(|row| row.unit_cost)
            .unwrap_or(Decimal::ZERO);
            let total_cost = unit_cost * qty;

            let existing = BranchLotQty::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, remaining_base_quantity AS remaining, 0 AS unit_cost FROM branch_lots WHERE branch_id = ? AND product_lot_id = ? LIMIT 1",
                [header.to_branch_id.into(), item.product_lot_id.into()],
            ))
            .one(transaction)
            .await?;
            if let Some(existing) = existing {
                transaction
                    .execute_raw(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "UPDATE branch_lots SET remaining_base_quantity = remaining_base_quantity + ?, allocated_base_quantity = allocated_base_quantity + ?, updated_at = ? WHERE id = ?",
                        [qty.into(), qty.into(), now.into(), existing.id.into()],
                    ))
                    .await?;
            } else {
                transaction
                    .execute_raw(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "INSERT INTO branch_lots (id, branch_id, product_lot_id, allocated_base_quantity, remaining_base_quantity, reserved_base_quantity, damaged_base_quantity, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
                        [
                            Uuid::new_v4().into(),
                            header.to_branch_id.into(),
                            item.product_lot_id.into(),
                            qty.into(),
                            qty.into(),
                            now.into(),
                        ],
                    ))
                    .await?;
            }

            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'base', ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        header.to_branch_id.into(),
                        item.product_id.into(),
                        item.product_lot_id.into(),
                        STOCK_MOVEMENT_TRANSFER_IN.into(),
                        qty.into(),
                        qty.into(),
                        unit_cost.into(),
                        total_cost.into(),
                        REFERENCE_TRANSFER.into(),
                        id.into(),
                        now.into(),
                        context.user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE stock_transfer_items SET received_base_quantity = received_base_quantity + ?, updated_at = ? WHERE id = ?",
                    [qty.into(), now.into(), item.id.into()],
                ))
                .await?;
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE stock_transfers SET status = 'RECEIVED', received_by = ?, received_at = ? WHERE id = ?",
                [context.user_id.into(), now.into(), id.into()],
            ))
            .await?;
        let _ = ERROR_TRANSFER_NOT_FOUND;
        Ok(())
    }
}

async fn load_header(
    database: &impl ConnectionTrait,
    id: Uuid,
) -> Result<TransferHeader, AppError> {
    TransferHeader::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, transfer_number, from_branch_id, to_branch_id, status, notes, created_at, sent_at, received_at FROM stock_transfers WHERE id = ? LIMIT 1",
        [id.into()],
    ))
    .one(database)
    .await?
    .ok_or(AppError::NotFound(ERROR_TRANSFER_NOT_FOUND))
}

async fn hydrate(
    database: &impl ConnectionTrait,
    row: TransferHeader,
) -> Result<TransferResponse, AppError> {
    let items = TransferItemRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, product_id, product_lot_id, requested_base_quantity, sent_base_quantity, received_base_quantity, damaged_in_transit_quantity FROM stock_transfer_items WHERE stock_transfer_id = ?",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    Ok(TransferResponse {
        id: row.id.to_string(),
        transfer_number: row.transfer_number,
        from_branch_id: row.from_branch_id.to_string(),
        to_branch_id: row.to_branch_id.to_string(),
        status: row.status,
        notes: row.notes,
        items: items
            .into_iter()
            .map(|item| TransferItemResponse {
                id: item.id.to_string(),
                product_id: item.product_id.to_string(),
                product_lot_id: item.product_lot_id.to_string(),
                requested_base_quantity: decimal(item.requested_base_quantity),
                sent_base_quantity: decimal(item.sent_base_quantity),
                received_base_quantity: decimal(item.received_base_quantity),
                damaged_in_transit_quantity: decimal(item.damaged_in_transit_quantity),
            })
            .collect(),
        created_at: row.created_at.to_rfc3339(),
        sent_at: row.sent_at.map(|v| v.to_rfc3339()),
        received_at: row.received_at.map(|v| v.to_rfc3339()),
    })
}

fn transfer_conditions(
    query: &TransferListQuery,
) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["1=1".to_owned()];
    let mut values = Vec::new();
    if let Some(status) = &query.status {
        parts.push("st.status = ?".to_owned());
        values.push(status.trim().to_uppercase().into());
    }
    if let Some(from_branch_id) = &query.from_branch_id {
        parts.push("st.from_branch_id = ?".to_owned());
        values.push(parse_uuid(from_branch_id, "fromBranchId")?.into());
    }
    if let Some(to_branch_id) = &query.to_branch_id {
        parts.push("st.to_branch_id = ?".to_owned());
        values.push(parse_uuid(to_branch_id, "toBranchId")?.into());
    }
    if let Some(search) = &query.page.search {
        parts.push("lower(st.transfer_number) LIKE ?".to_owned());
        values.push(format!("%{}%", search.to_lowercase()).into());
    }
    Ok((parts.join(" AND "), values))
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
