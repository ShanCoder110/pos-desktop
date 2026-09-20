use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::backend::{
    constants::{
        DEFAULT_TRANSFER_PREFIX, ERROR_INVALID_CATEGORY_ID, ERROR_LOT_NOT_FOUND,
        ERROR_PRODUCT_NOT_FOUND, ERROR_SUPPLIER_REQUIRED, LEDGER_PURCHASE, LOT_SOURCE_OPENING,
        LOT_SOURCE_PURCHASE, REFERENCE_GOODS_RECEIPT, REFERENCE_PRODUCT_OPENING,
        SEQUENCE_KIND_TRANSFER, STOCK_MOVEMENT_ADJUSTMENT, STOCK_MOVEMENT_PURCHASE,
    },
    context::RequestContext,
    dto::{
        BranchAllocationInput, BranchLotResponse, CreateTransferRequest, LotListQuery, LotResponse,
        ReceiveLotRequest, TransferItemInput, UpdateLotRequest,
    },
    errors::AppError,
    repositories::{SequenceRepository, TransferRepository},
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

#[derive(Debug, FromQueryResult)]
struct LotUpdateRow {
    product_id: Uuid,
    original_base_quantity: Decimal,
    remaining_base_quantity: Decimal,
    damaged_base_quantity: Decimal,
    supplier_id: Option<Uuid>,
}

#[derive(Debug, FromQueryResult)]
struct BranchLotRemainingRow {
    branch_id: Uuid,
    remaining: Decimal,
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
            "SELECT pl.id, pl.product_id, p.name AS product_name, pl.supplier_id, pl.lot_number, pl.source_type, pl.original_base_quantity, pl.remaining_base_quantity, pl.damaged_base_quantity, CAST(pl.purchase_price_per_base AS REAL) AS purchase_price_per_base, pl.received_date, pl.expiry_date, pl.created_at, pl.updated_at FROM product_lots pl JOIN products p ON p.id = pl.product_id WHERE {conditions} ORDER BY {sort} {direction}, pl.id ASC LIMIT ? OFFSET ?"
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
            "SELECT pl.id, pl.product_id, p.name AS product_name, pl.supplier_id, pl.lot_number, pl.source_type, pl.original_base_quantity, pl.remaining_base_quantity, pl.damaged_base_quantity, CAST(pl.purchase_price_per_base AS REAL) AS purchase_price_per_base, pl.received_date, pl.expiry_date, pl.created_at, pl.updated_at FROM product_lots pl JOIN products p ON p.id = pl.product_id WHERE {conditions} LIMIT 1"
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

    pub async fn update(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        id: Uuid,
        request: &UpdateLotRequest,
    ) -> Result<Uuid, AppError> {
        let row = LotUpdateRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT product_id, original_base_quantity, remaining_base_quantity, damaged_base_quantity, supplier_id FROM product_lots WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [id.into()],
        ))
        .one(transaction)
        .await?;
        let Some(row) = row else {
            return Err(AppError::NotFound(ERROR_LOT_NOT_FOUND));
        };
        let product_id = row.product_id;
        let original = quantity(row.original_base_quantity);
        let remaining = quantity(row.remaining_base_quantity);
        let damaged = quantity(row.damaged_base_quantity);
        let sold = original - remaining - damaged;
        let next_damaged = request.damaged_quantity.map(quantity).unwrap_or(damaged);
        let next_remaining = if let Some(remaining) = request.remaining_quantity {
            quantity(remaining)
        } else {
            original - sold - next_damaged
        };
        if next_damaged < Decimal::ZERO || next_remaining < Decimal::ZERO {
            return Err(AppError::Validation(
                "Quantities cannot be negative.".into(),
            ));
        }
        if next_damaged + next_remaining > original {
            return Err(AppError::Validation(
                "Remaining and damaged quantities cannot exceed the original lot quantity.".into(),
            ));
        }
        let now = now_utc();
        let supplier_id = if request.supplier_id.is_some() {
            parse_optional_uuid(request.supplier_id.as_deref(), "supplierId")?
        } else {
            row.supplier_id
        };
        let next_cost = request.cost.map(money_value);
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE product_lots SET supplier_id = ?, remaining_base_quantity = ?, damaged_base_quantity = ?, purchase_price_per_base = COALESCE(?, purchase_price_per_base), version = version + 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
                [
                    supplier_id.into(),
                    next_remaining.into(),
                    next_damaged.into(),
                    next_cost.into(),
                    now.into(),
                    id.into(),
                ],
            ))
            .await?;
        apply_product_unit_prices(transaction, product_id, request, now).await?;
        if !request.branch_allocations.is_empty() {
            apply_branch_reallocation(
                transaction,
                context,
                id,
                product_id,
                next_remaining,
                &request.branch_allocations,
            )
            .await?;
        }
        Ok(id)
    }

    pub async fn receive(
        transaction: &DatabaseTransaction,
        request: &ReceiveLotRequest,
        allocations: Vec<(Uuid, rust_decimal::Decimal)>,
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

        let ledger_branch_id = allocations
            .first()
            .map(|(branch_id, _)| *branch_id)
            .unwrap_or_else(Uuid::nil);

        for (branch_id, branch_qty) in allocations {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO branch_lots (id, branch_id, product_lot_id, allocated_base_quantity, remaining_base_quantity, reserved_base_quantity, damaged_base_quantity, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
                    [
                        Uuid::new_v4().into(),
                        branch_id.into(),
                        lot_id.into(),
                        branch_qty.into(),
                        branch_qty.into(),
                        now.into(),
                    ],
                ))
                .await?;

            let branch_cost = money_value(cost * branch_qty);
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        branch_id.into(),
                        product_id.into(),
                        lot_id.into(),
                        movement_type.into(),
                        branch_qty.into(),
                        "base".into(),
                        branch_qty.into(),
                        cost.into(),
                        branch_cost.into(),
                        reference_type.into(),
                        lot_id.into(),
                        now.into(),
                        user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

        let total_cost = money_value(cost * qty);
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
                        ledger_branch_id.into(),
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

        apply_product_unit_prices_from_receive(transaction, product_id, request, now).await?;

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

async fn apply_product_unit_prices(
    transaction: &DatabaseTransaction,
    product_id: Uuid,
    request: &UpdateLotRequest,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    if request.min.is_none() && request.wholesale.is_none() && request.retail.is_none() {
        return Ok(());
    }
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
    if let Some(cost) = request.cost {
        sets.push("cost_reference = ?");
        price_values.push(money_value(cost).into());
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
    Ok(())
}

async fn apply_product_unit_prices_from_receive(
    transaction: &DatabaseTransaction,
    product_id: Uuid,
    request: &ReceiveLotRequest,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    if request.min.is_none() && request.wholesale.is_none() && request.retail.is_none() {
        return Ok(());
    }
    let update = UpdateLotRequest {
        supplier_id: None,
        remaining_quantity: None,
        damaged_quantity: None,
        cost: None,
        min: request.min,
        wholesale: request.wholesale,
        retail: request.retail,
        branch_allocations: Vec::new(),
    };
    apply_product_unit_prices(transaction, product_id, &update, now).await
}

async fn apply_branch_reallocation(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    lot_id: Uuid,
    product_id: Uuid,
    lot_remaining: Decimal,
    allocations: &[BranchAllocationInput],
) -> Result<(), AppError> {
    let mut target = HashMap::<Uuid, Decimal>::new();
    let mut target_total = Decimal::ZERO;
    for row in allocations {
        let branch_id = parse_uuid(&row.branch_id, "branchAllocations.branchId")?;
        let qty = quantity(row.quantity);
        target_total += qty;
        target.insert(
            branch_id,
            target.get(&branch_id).unwrap_or(&Decimal::ZERO) + qty,
        );
    }
    if (target_total - lot_remaining).abs() > Decimal::new(1, 6) {
        return Err(AppError::Validation(
            "Branch quantities must equal the lot remaining quantity.".into(),
        ));
    }

    let current_rows = BranchLotRemainingRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT branch_id, remaining_base_quantity AS remaining FROM branch_lots WHERE product_lot_id = ?",
        [lot_id.into()],
    ))
    .all(transaction)
    .await?;
    let mut current = HashMap::<Uuid, Decimal>::new();
    for row in current_rows {
        current.insert(row.branch_id, quantity(row.remaining));
    }

    let mut decreases: Vec<(Uuid, Decimal)> = Vec::new();
    let mut increases: Vec<(Uuid, Decimal)> = Vec::new();
    let branch_ids: std::collections::HashSet<Uuid> =
        current.keys().chain(target.keys()).copied().collect();
    for branch_id in branch_ids {
        let before = current.get(&branch_id).copied().unwrap_or(Decimal::ZERO);
        let after = target.get(&branch_id).copied().unwrap_or(Decimal::ZERO);
        let delta = after - before;
        if delta < Decimal::ZERO {
            decreases.push((branch_id, -delta));
        } else if delta > Decimal::ZERO {
            increases.push((branch_id, delta));
        }
    }

    let mut di = 0usize;
    let mut ii = 0usize;
    while di < decreases.len() && ii < increases.len() {
        let (from_branch, from_left) = decreases[di];
        let (to_branch, to_left) = increases[ii];
        let move_qty = from_left.min(to_left);
        if move_qty > Decimal::ZERO {
            create_completed_transfer(
                transaction,
                context,
                from_branch,
                to_branch,
                product_id,
                lot_id,
                move_qty,
                "Rebalanced from lot edit",
            )
            .await?;
            decreases[di].1 -= move_qty;
            increases[ii].1 -= move_qty;
        }
        if decreases[di].1 <= Decimal::ZERO {
            di += 1;
        }
        if increases[ii].1 <= Decimal::ZERO {
            ii += 1;
        }
    }

    if decreases.iter().any(|(_, left)| *left > Decimal::ZERO)
        || increases.iter().any(|(_, left)| *left > Decimal::ZERO)
    {
        return Err(AppError::Validation(
            "Could not balance branch quantities for this lot.".into(),
        ));
    }

    Ok(())
}

async fn create_completed_transfer(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    from_branch_id: Uuid,
    to_branch_id: Uuid,
    product_id: Uuid,
    lot_id: Uuid,
    qty: Decimal,
    notes: &str,
) -> Result<(), AppError> {
    let transfer_number =
        SequenceRepository::next(transaction, SEQUENCE_KIND_TRANSFER, DEFAULT_TRANSFER_PREFIX)
            .await?;
    let request = CreateTransferRequest {
        from_branch_id: from_branch_id.to_string(),
        to_branch_id: to_branch_id.to_string(),
        notes: Some(notes.into()),
        items: vec![TransferItemInput {
            product_id: product_id.to_string(),
            product_lot_id: lot_id.to_string(),
            quantity: qty,
        }],
    };
    let transfer_id =
        TransferRepository::create(transaction, context, &request, transfer_number).await?;
    TransferRepository::send(transaction, context, transfer_id).await?;
    TransferRepository::receive(transaction, context, transfer_id).await?;
    Ok(())
}
