//! Stock count / on-hand adjustment at a branch.
//! Converts the counted unit to base qty, writes ADJUSTMENT movements with
//! before/after/diff, and keeps product_lots + branch_lots (product.stock) aligned.

use rust_decimal::Decimal;
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use super::lots::{lot_committed_sold, lot_returned_to_supplier};
use crate::backend::{
    constants::{
        DEFAULT_LOT_PREFIX, DEFAULT_STOCK_ADJUSTMENT_PREFIX, ERROR_INSUFFICIENT_STOCK,
        ERROR_PRODUCT_NOT_FOUND, ERROR_STOCK_COUNT_NEGATIVE, ERROR_STOCK_COUNT_TOO_LARGE,
        ERROR_UNIT_NOT_FOUND, LOT_SOURCE_ADJUSTMENT, MAX_STOCK_COUNT_BASE_UNITS,
        REFERENCE_STOCK_ADJUSTMENT, SEQUENCE_KIND_LOT, SEQUENCE_KIND_STOCK_ADJUSTMENT,
        STOCK_ADJUSTMENT_STATUS_POSTED, STOCK_MOVEMENT_ADJUSTMENT,
    },
    context::RequestContext,
    dto::{StockCountResponse, StockReconcileFix, StockReconcileResponse},
    errors::AppError,
    qty::to_base_qty,
    repositories::SequenceRepository,
    util::{money_value, now_utc, optional_uuid_blob, quantity, uuid_blob},
};

#[derive(Debug, FromQueryResult)]
struct QtyRow {
    qty: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct UnitRow {
    display_name: String,
    conversion_to_base: Decimal,
    factor_direction: String,
}

#[derive(Debug, FromQueryResult)]
struct FifoLotRow {
    branch_lot_id: Uuid,
    product_lot_id: Uuid,
    remaining: Decimal,
    unit_cost: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct NewestLotRow {
    branch_lot_id: Option<Uuid>,
    product_lot_id: Uuid,
    remaining: Decimal,
    unit_cost: Decimal,
    original: Decimal,
    damaged: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct LastCostRow {
    unit_cost: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct MismatchRow {
    product_id: Uuid,
    product_name: String,
    lot_id: Uuid,
    lot_number: String,
    lot_remaining: Decimal,
    branch_remaining: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct CountProductsRow {
    count: i64,
}

pub struct StockCountApply {
    pub product_id: Uuid,
    pub branch_id: Uuid,
    pub product_unit_id: Uuid,
    pub counted_displayed: Decimal,
    pub reason: String,
}

pub struct StockCountRepository;

impl StockCountRepository {
    pub async fn branch_stock(
        database: &impl ConnectionTrait,
        product_id: Uuid,
        branch_id: Uuid,
    ) -> Result<Decimal, AppError> {
        let row = QtyRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT CAST(COALESCE(SUM(bl.remaining_base_quantity), 0) AS REAL) AS qty
             FROM branch_lots bl
             JOIN product_lots pl ON pl.id = bl.product_lot_id
             WHERE pl.product_id = ? AND bl.branch_id = ? AND pl.deleted_at IS NULL",
            [product_id.into(), branch_id.into()],
        ))
        .one(database)
        .await?;
        Ok(row.map(|r| quantity(r.qty)).unwrap_or(Decimal::ZERO))
    }

    pub async fn apply(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        input: StockCountApply,
    ) -> Result<StockCountResponse, AppError> {
        if input.counted_displayed < Decimal::ZERO {
            return Err(AppError::Validation(ERROR_STOCK_COUNT_NEGATIVE.into()));
        }
        let product_exists = transaction
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1",
                [input.product_id.into()],
            ))
            .await?;
        if product_exists.is_none() {
            return Err(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND));
        }

        let unit = UnitRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT display_name, conversion_to_base, factor_direction
             FROM product_units
             WHERE id = ? AND product_id = ? AND deleted_at IS NULL LIMIT 1",
            [input.product_unit_id.into(), input.product_id.into()],
        ))
        .one(transaction)
        .await?
        .ok_or(AppError::NotFound(ERROR_UNIT_NOT_FOUND))?;

        let counted_base = to_base_qty(
            input.counted_displayed,
            unit.conversion_to_base,
            &unit.factor_direction,
        );
        let max_base = Decimal::from(MAX_STOCK_COUNT_BASE_UNITS);
        if counted_base > max_base {
            return Err(AppError::Validation(ERROR_STOCK_COUNT_TOO_LARGE.into()));
        }
        let old_qty = Self::branch_stock(transaction, input.product_id, input.branch_id).await?;
        let diff = quantity(counted_base - old_qty);
        let now = now_utc();
        let last_cost = last_unit_cost(transaction, input.product_id, input.branch_id).await?;

        let adjustment_id = Uuid::new_v4();
        let adjustment_number = SequenceRepository::next(
            transaction,
            SEQUENCE_KIND_STOCK_ADJUSTMENT,
            DEFAULT_STOCK_ADJUSTMENT_PREFIX,
        )
        .await?;

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO stock_adjustments (id, branch_id, adjustment_number, reason, notes, status, created_by, approved_by, occurred_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)",
                [
                    uuid_blob(adjustment_id),
                    uuid_blob(input.branch_id),
                    adjustment_number.clone().into(),
                    input.reason.clone().into(),
                    STOCK_ADJUSTMENT_STATUS_POSTED.into(),
                    uuid_blob(context.user_id),
                    uuid_blob(context.user_id),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO stock_adjustment_items (id, stock_adjustment_id, product_id, product_lot_id, system_base_quantity, counted_base_quantity, difference_base_quantity, unit_cost, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)",
                [
                    uuid_blob(Uuid::new_v4()),
                    uuid_blob(adjustment_id),
                    uuid_blob(input.product_id),
                    old_qty.into(),
                    counted_base.into(),
                    diff.into(),
                    last_cost.into(),
                    now.into(),
                ],
            ))
            .await?;

        let (movement_ids, created_adjustment_lot_id) = if diff < Decimal::ZERO {
            let ids = consume_fifo_down(
                transaction,
                context,
                input.branch_id,
                input.product_id,
                input.product_unit_id,
                adjustment_id,
                quantity(-diff),
                input.counted_displayed,
                &unit.display_name,
                &input.reason,
                old_qty,
                counted_base,
                now,
            )
            .await?;
            (ids, None)
        } else if diff > Decimal::ZERO {
            increase_stock(
                transaction,
                context,
                input.branch_id,
                input.product_id,
                input.product_unit_id,
                adjustment_id,
                diff,
                input.counted_displayed,
                &unit.display_name,
                &input.reason,
                old_qty,
                counted_base,
                last_cost,
                now,
            )
            .await?
        } else {
            let mid = insert_movement(
                transaction,
                context,
                input.branch_id,
                input.product_id,
                None,
                input.product_unit_id,
                input.counted_displayed,
                &unit.display_name,
                Decimal::ZERO,
                old_qty,
                counted_base,
                last_cost,
                adjustment_id,
                &input.reason,
                now,
            )
            .await?;
            (vec![mid], None)
        };

        let new_qty = Self::branch_stock(transaction, input.product_id, input.branch_id).await?;
        Ok(StockCountResponse {
            id: adjustment_id.to_string(),
            adjustment_number,
            product_id: input.product_id.to_string(),
            branch_id: input.branch_id.to_string(),
            product_unit_id: input.product_unit_id.to_string(),
            displayed_unit_name: unit.display_name,
            counted_quantity: decimal_f64(input.counted_displayed),
            old_quantity: decimal_f64(old_qty),
            new_quantity: decimal_f64(new_qty),
            difference: decimal_f64(diff),
            reason: input.reason,
            movement_ids: movement_ids.into_iter().map(|id| id.to_string()).collect(),
            created_adjustment_lot_id: created_adjustment_lot_id.map(|id| id.to_string()),
            supplier_ledger_posted: false,
            occurred_at: now.to_rfc3339(),
        })
    }

    /// Ensure for every lot: SUM(branch_lots.remaining) == lot.remaining.
    /// Repairs by syncing branch_lots to the lot remaining (never touches sales history).
    pub async fn reconcile(
        database: &DatabaseConnection,
    ) -> Result<StockReconcileResponse, AppError> {
        let checked = CountProductsRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM products WHERE deleted_at IS NULL",
            [],
        ))
        .one(database)
        .await?
        .map(|row| row.count.max(0) as u64)
        .unwrap_or(0);

        let mismatches = MismatchRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT p.id AS product_id, p.name AS product_name, pl.id AS lot_id, pl.lot_number,
                    CAST(pl.remaining_base_quantity AS REAL) AS lot_remaining,
                    CAST(COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl WHERE bl.product_lot_id = pl.id), 0) AS REAL) AS branch_remaining
             FROM product_lots pl
             JOIN products p ON p.id = pl.product_id
             WHERE pl.deleted_at IS NULL AND p.deleted_at IS NULL
               AND ABS(pl.remaining_base_quantity - COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl WHERE bl.product_lot_id = pl.id), 0)) > 0.000001",
            [],
        ))
        .all(database)
        .await?;

        let mismatched_before = mismatches.len() as u64;
        let mut fixes = Vec::new();
        let now = now_utc();

        for row in mismatches {
            let before = quantity(row.branch_remaining);
            let target = quantity(row.lot_remaining);
            sync_branch_lots_to_lot(database, row.lot_id, target, now).await?;
            let after = QtyRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT CAST(COALESCE(SUM(remaining_base_quantity), 0) AS REAL) AS qty FROM branch_lots WHERE product_lot_id = ?",
                [row.lot_id.into()],
            ))
            .one(database)
            .await?
            .map(|r| quantity(r.qty))
            .unwrap_or(Decimal::ZERO);

            eprintln!(
                "stock reconcile: product={} ({}) lot={} ({}) branch_lots {} → {} (lot remaining {})",
                row.product_id,
                row.product_name,
                row.lot_id,
                row.lot_number,
                before,
                after,
                target
            );
            fixes.push(StockReconcileFix {
                product_id: row.product_id.to_string(),
                product_name: row.product_name,
                lot_id: row.lot_id.to_string(),
                lot_number: row.lot_number,
                lot_remaining: decimal_f64(target),
                branch_lots_before: decimal_f64(before),
                branch_lots_after: decimal_f64(after),
            });
        }

        Ok(StockReconcileResponse {
            checked_products: checked,
            mismatched_before,
            fixes,
        })
    }
}

fn decimal_f64(value: Decimal) -> f64 {
    use rust_decimal::prelude::ToPrimitive;
    value.to_f64().unwrap_or_default()
}

async fn last_unit_cost(
    database: &impl ConnectionTrait,
    product_id: Uuid,
    branch_id: Uuid,
) -> Result<Decimal, AppError> {
    if let Some(row) = LastCostRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT CAST(pl.purchase_price_per_base AS REAL) AS unit_cost
         FROM branch_lots bl
         JOIN product_lots pl ON pl.id = bl.product_lot_id
         WHERE pl.product_id = ? AND bl.branch_id = ? AND pl.deleted_at IS NULL
         ORDER BY pl.received_date DESC, pl.created_at DESC
         LIMIT 1",
        [product_id.into(), branch_id.into()],
    ))
    .one(database)
    .await?
    {
        return Ok(money_value(row.unit_cost));
    }
    if let Some(row) = LastCostRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT CAST(COALESCE(pu.cost_reference, 0) AS REAL) AS unit_cost
         FROM product_units pu
         WHERE pu.product_id = ? AND pu.is_base = 1 AND pu.deleted_at IS NULL
         LIMIT 1",
        [product_id.into()],
    ))
    .one(database)
    .await?
    {
        return Ok(money_value(row.unit_cost));
    }
    Ok(Decimal::ZERO)
}

async fn lot_max_remaining(
    database: &impl ConnectionTrait,
    lot_id: Uuid,
    original: Decimal,
    damaged: Decimal,
) -> Result<Decimal, AppError> {
    let sold = lot_committed_sold(database, lot_id).await?;
    let returned = lot_returned_to_supplier(database, lot_id).await?;
    Ok(quantity(original - sold - damaged - returned).max(Decimal::ZERO))
}

#[allow(clippy::too_many_arguments)]
async fn insert_movement(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    branch_id: Uuid,
    product_id: Uuid,
    product_lot_id: Option<Uuid>,
    product_unit_id: Uuid,
    displayed: Decimal,
    unit_name: &str,
    delta: Decimal,
    qty_before: Decimal,
    qty_after: Decimal,
    unit_cost: Decimal,
    reference_id: Uuid,
    reason: &str,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<Uuid, AppError> {
    let movement_id = Uuid::new_v4();
    let total_cost = money_value(unit_cost * delta.abs());
    transaction
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, product_unit_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, quantity_before, quantity_after, unit_cost, total_cost, reference_type, reference_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                uuid_blob(movement_id),
                uuid_blob(branch_id),
                uuid_blob(product_id),
                optional_uuid_blob(product_lot_id),
                uuid_blob(product_unit_id),
                STOCK_MOVEMENT_ADJUSTMENT.into(),
                displayed.into(),
                unit_name.into(),
                delta.into(),
                qty_before.into(),
                qty_after.into(),
                unit_cost.into(),
                total_cost.into(),
                REFERENCE_STOCK_ADJUSTMENT.into(),
                uuid_blob(reference_id),
                reason.into(),
                now.into(),
                uuid_blob(context.user_id),
                now.into(),
            ],
        ))
        .await?;
    Ok(movement_id)
}

#[allow(clippy::too_many_arguments)]
async fn consume_fifo_down(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    branch_id: Uuid,
    product_id: Uuid,
    product_unit_id: Uuid,
    reference_id: Uuid,
    needed: Decimal,
    displayed: Decimal,
    unit_name: &str,
    reason: &str,
    product_before: Decimal,
    product_after: Decimal,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<Vec<Uuid>, AppError> {
    let lots = FifoLotRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT bl.id AS branch_lot_id, bl.product_lot_id, bl.remaining_base_quantity AS remaining,
                CAST(pl.purchase_price_per_base AS REAL) AS unit_cost
         FROM branch_lots bl
         JOIN product_lots pl ON pl.id = bl.product_lot_id
         WHERE bl.branch_id = ? AND pl.product_id = ? AND bl.remaining_base_quantity > 0 AND pl.deleted_at IS NULL
         ORDER BY pl.received_date ASC, pl.created_at ASC",
        [branch_id.into(), product_id.into()],
    ))
    .all(transaction)
    .await?;

    let mut remaining_need = needed;
    let mut movement_ids = Vec::new();
    let mut first_display = true;
    for lot in lots {
        if remaining_need <= Decimal::ZERO {
            break;
        }
        let available = quantity(lot.remaining).max(Decimal::ZERO);
        let take = remaining_need.min(available);
        if take <= Decimal::ZERO {
            continue;
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE branch_lots SET remaining_base_quantity = remaining_base_quantity - ?, updated_at = ? WHERE id = ?",
                [take.into(), now.into(), uuid_blob(lot.branch_lot_id)],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE product_lots SET remaining_base_quantity = remaining_base_quantity - ?, version = version + 1, updated_at = ? WHERE id = ?",
                [take.into(), now.into(), uuid_blob(lot.product_lot_id)],
            ))
            .await?;

        let displayed_qty = if first_display {
            displayed
        } else {
            Decimal::ZERO
        };
        first_display = false;
        let mid = insert_movement(
            transaction,
            context,
            branch_id,
            product_id,
            Some(lot.product_lot_id),
            product_unit_id,
            displayed_qty,
            unit_name,
            -take,
            product_before,
            product_after,
            money_value(lot.unit_cost),
            reference_id,
            reason,
            now,
        )
        .await?;
        movement_ids.push(mid);
        remaining_need = quantity(remaining_need - take);
    }
    if remaining_need > Decimal::ZERO {
        return Err(AppError::Conflict(ERROR_INSUFFICIENT_STOCK.into()));
    }
    Ok(movement_ids)
}

#[allow(clippy::too_many_arguments)]
async fn increase_stock(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    branch_id: Uuid,
    product_id: Uuid,
    product_unit_id: Uuid,
    reference_id: Uuid,
    amount: Decimal,
    displayed: Decimal,
    unit_name: &str,
    reason: &str,
    product_before: Decimal,
    product_after: Decimal,
    last_cost: Decimal,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(Vec<Uuid>, Option<Uuid>), AppError> {
    let mut remaining_add = amount;
    let mut movement_ids = Vec::new();
    let mut created_lot_id = None;
    let mut first_display = true;

    // Newest open lots at this branch first (room within cap).
    let newest = NewestLotRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT bl.id AS branch_lot_id, pl.id AS product_lot_id,
                bl.remaining_base_quantity AS remaining,
                CAST(pl.purchase_price_per_base AS REAL) AS unit_cost,
                pl.original_base_quantity AS original,
                pl.damaged_base_quantity AS damaged
         FROM product_lots pl
         LEFT JOIN branch_lots bl ON bl.product_lot_id = pl.id AND bl.branch_id = ?
         WHERE pl.product_id = ? AND pl.deleted_at IS NULL
         ORDER BY pl.received_date DESC, pl.created_at DESC",
        [branch_id.into(), product_id.into()],
    ))
    .all(transaction)
    .await?;

    for lot in newest {
        if remaining_add <= Decimal::ZERO {
            break;
        }
        let max_rem =
            lot_max_remaining(transaction, lot.product_lot_id, lot.original, lot.damaged).await?;
        let current = quantity(lot.remaining).max(Decimal::ZERO);
        let room = quantity(max_rem - current);
        if room <= Decimal::ZERO {
            continue;
        }
        let add = remaining_add.min(room);
        if add <= Decimal::ZERO {
            continue;
        }

        if let Some(branch_lot_id) = lot.branch_lot_id {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE branch_lots SET remaining_base_quantity = remaining_base_quantity + ?, allocated_base_quantity = allocated_base_quantity + ?, updated_at = ? WHERE id = ?",
                    [add.into(), add.into(), now.into(), uuid_blob(branch_lot_id)],
                ))
                .await?;
        } else {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO branch_lots (id, branch_id, product_lot_id, allocated_base_quantity, remaining_base_quantity, reserved_base_quantity, damaged_base_quantity, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
                    [
                        uuid_blob(Uuid::new_v4()),
                        uuid_blob(branch_id),
                        uuid_blob(lot.product_lot_id),
                        add.into(),
                        add.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE product_lots SET remaining_base_quantity = remaining_base_quantity + ?, version = version + 1, updated_at = ? WHERE id = ?",
                [add.into(), now.into(), uuid_blob(lot.product_lot_id)],
            ))
            .await?;

        let displayed_qty = if first_display {
            displayed
        } else {
            Decimal::ZERO
        };
        first_display = false;
        let mid = insert_movement(
            transaction,
            context,
            branch_id,
            product_id,
            Some(lot.product_lot_id),
            product_unit_id,
            displayed_qty,
            unit_name,
            add,
            product_before,
            product_after,
            money_value(lot.unit_cost),
            reference_id,
            reason,
            now,
        )
        .await?;
        movement_ids.push(mid);
        remaining_add = quantity(remaining_add - add);
    }

    if remaining_add > Decimal::ZERO {
        // Create an ADJUSTMENT lot at last cost for the overflow.
        let lot_id = Uuid::new_v4();
        let lot_number =
            SequenceRepository::next(transaction, SEQUENCE_KIND_LOT, DEFAULT_LOT_PREFIX).await?;
        let received_date = now.date_naive();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO product_lots (id, product_id, supplier_id, goods_receipt_item_id, production_job_id, lot_number, source_type, original_base_quantity, remaining_base_quantity, damaged_base_quantity, purchase_price_per_base, received_date, expiry_date, created_by, version, deleted_at, origin_device_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, ?, 0, ?, ?, NULL, ?, 1, NULL, ?, ?, ?)",
                [
                    uuid_blob(lot_id),
                    uuid_blob(product_id),
                    lot_number.into(),
                    LOT_SOURCE_ADJUSTMENT.into(),
                    remaining_add.into(),
                    remaining_add.into(),
                    last_cost.into(),
                    received_date.into(),
                    uuid_blob(context.user_id),
                    uuid_blob(context.device_id),
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
                    uuid_blob(Uuid::new_v4()),
                    uuid_blob(branch_id),
                    uuid_blob(lot_id),
                    remaining_add.into(),
                    remaining_add.into(),
                    now.into(),
                ],
            ))
            .await?;
        let displayed_qty = if first_display {
            displayed
        } else {
            Decimal::ZERO
        };
        let mid = insert_movement(
            transaction,
            context,
            branch_id,
            product_id,
            Some(lot_id),
            product_unit_id,
            displayed_qty,
            unit_name,
            remaining_add,
            product_before,
            product_after,
            last_cost,
            reference_id,
            reason,
            now,
        )
        .await?;
        movement_ids.push(mid);
        created_lot_id = Some(lot_id);
    }

    Ok((movement_ids, created_lot_id))
}

/// Align branch_lots remaining to the lot's remaining without deleting history.
/// Puts the full lot remaining on the first branch row; zeros the rest.
async fn sync_branch_lots_to_lot(
    database: &impl ConnectionTrait,
    lot_id: Uuid,
    target: Decimal,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    #[derive(Debug, FromQueryResult)]
    struct BranchRow {
        id: Uuid,
    }
    let rows = BranchRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id FROM branch_lots WHERE product_lot_id = ? ORDER BY remaining_base_quantity DESC, id ASC",
        [lot_id.into()],
    ))
    .all(database)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    for (index, row) in rows.iter().enumerate() {
        let assign = if index == 0 {
            target.max(Decimal::ZERO)
        } else {
            Decimal::ZERO
        };
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE branch_lots SET remaining_base_quantity = ?, updated_at = ? WHERE id = ?",
                [assign.into(), now.into(), uuid_blob(row.id)],
            ))
            .await?;
    }
    Ok(())
}
