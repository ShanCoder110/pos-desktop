use rust_decimal::Decimal;
use sea_orm::{ConnectionTrait, DatabaseTransaction, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INSUFFICIENT_STOCK,
    context::RequestContext,
    errors::AppError,
    util::{money_value, now_utc},
};

#[derive(Debug, FromQueryResult)]
struct FifoLotRow {
    branch_lot_id: Uuid,
    product_lot_id: Uuid,
    branch_id: Uuid,
    remaining: Decimal,
    unit_cost: Decimal,
}

pub struct StockAllocationOptions<'a> {
    pub selling_branch_id: Uuid,
    pub reference_id: Uuid,
    pub product_id: Uuid,
    pub needed: Decimal,
    pub unit_name: &'a str,
    pub displayed: Decimal,
    pub movement_type: &'a str,
    pub reference_type: &'a str,
}

pub struct StockAllocationResult {
    pub fifo_cost: Decimal,
    pub first_movement_id: Option<Uuid>,
}

pub async fn allocate_fifo_with_branch_fallback(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    options: StockAllocationOptions<'_>,
) -> Result<StockAllocationResult, AppError> {
    let mut remaining = options.needed;
    let mut total_fifo = Decimal::ZERO;
    let mut first_movement_id = None;
    let mut first_display = true;

    // 1) This branch, oldest lots first (split lots stay FIFO here before any other branch).
    let local = allocate_fifo_from_branch(
        transaction,
        context,
        options.selling_branch_id,
        options.selling_branch_id,
        options.reference_id,
        options.product_id,
        remaining,
        options.displayed,
        options.unit_name,
        options.movement_type,
        options.reference_type,
    )
    .await?;
    if local.allocated > Decimal::ZERO {
        first_display = false;
        total_fifo += local.fifo_cost;
        remaining = local.remaining;
        first_movement_id = local.first_movement_id;
    }

    // 2) Other branches, still lot FIFO (oldest received_date), main branch first on the same lot date.
    if remaining > Decimal::ZERO {
        let overflow = allocate_fifo_from_other_branches(
            transaction,
            context,
            options.selling_branch_id,
            options.reference_id,
            options.product_id,
            remaining,
            if first_display {
                options.displayed
            } else {
                Decimal::ZERO
            },
            options.unit_name,
            options.movement_type,
            options.reference_type,
        )
        .await?;
        total_fifo += overflow.fifo_cost;
        remaining = overflow.remaining;
        if first_movement_id.is_none() {
            first_movement_id = overflow.first_movement_id;
        }
    }

    if remaining > Decimal::ZERO {
        return Err(AppError::Conflict(ERROR_INSUFFICIENT_STOCK.into()));
    }

    Ok(StockAllocationResult {
        fifo_cost: total_fifo,
        first_movement_id,
    })
}

struct PartialAllocation {
    fifo_cost: Decimal,
    allocated: Decimal,
    remaining: Decimal,
    first_movement_id: Option<Uuid>,
}

async fn allocate_fifo_from_other_branches(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    selling_branch_id: Uuid,
    reference_id: Uuid,
    product_id: Uuid,
    needed: Decimal,
    displayed: Decimal,
    unit_name: &str,
    movement_type: &str,
    reference_type: &str,
) -> Result<PartialAllocation, AppError> {
    let lots = FifoLotRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT bl.id AS branch_lot_id, bl.product_lot_id, bl.branch_id, bl.remaining_base_quantity AS remaining, CAST(pl.purchase_price_per_base AS REAL) AS unit_cost
         FROM branch_lots bl
         JOIN product_lots pl ON pl.id = bl.product_lot_id
         JOIN branches b ON b.id = bl.branch_id AND b.deleted_at IS NULL AND b.is_active = 1
         WHERE bl.branch_id != ? AND pl.product_id = ? AND bl.remaining_base_quantity > 0 AND pl.deleted_at IS NULL
         ORDER BY pl.received_date ASC, pl.created_at ASC, CASE WHEN b.is_main = 1 THEN 0 ELSE 1 END, b.name ASC",
        [selling_branch_id.into(), product_id.into()],
    ))
    .all(transaction)
    .await?;
    consume_lots(
        transaction,
        context,
        lots,
        selling_branch_id,
        reference_id,
        product_id,
        needed,
        displayed,
        unit_name,
        movement_type,
        reference_type,
        true,
    )
    .await
}

async fn allocate_fifo_from_branch(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    source_branch_id: Uuid,
    selling_branch_id: Uuid,
    reference_id: Uuid,
    product_id: Uuid,
    needed: Decimal,
    displayed: Decimal,
    unit_name: &str,
    movement_type: &str,
    reference_type: &str,
) -> Result<PartialAllocation, AppError> {
    let lots = FifoLotRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT bl.id AS branch_lot_id, bl.product_lot_id, bl.branch_id, bl.remaining_base_quantity AS remaining, CAST(pl.purchase_price_per_base AS REAL) AS unit_cost
         FROM branch_lots bl
         JOIN product_lots pl ON pl.id = bl.product_lot_id
         WHERE bl.branch_id = ? AND pl.product_id = ? AND bl.remaining_base_quantity > 0 AND pl.deleted_at IS NULL
         ORDER BY pl.received_date ASC, pl.created_at ASC",
        [source_branch_id.into(), product_id.into()],
    ))
    .all(transaction)
    .await?;
    consume_lots(
        transaction,
        context,
        lots,
        selling_branch_id,
        reference_id,
        product_id,
        needed,
        displayed,
        unit_name,
        movement_type,
        reference_type,
        source_branch_id != selling_branch_id,
    )
    .await
}

async fn consume_lots(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    lots: Vec<FifoLotRow>,
    selling_branch_id: Uuid,
    reference_id: Uuid,
    product_id: Uuid,
    needed: Decimal,
    displayed: Decimal,
    unit_name: &str,
    movement_type: &str,
    reference_type: &str,
    cross_branch: bool,
) -> Result<PartialAllocation, AppError> {
    let now = now_utc();
    let mut remaining = needed;
    let mut fifo_cost = Decimal::ZERO;
    let mut allocated = Decimal::ZERO;
    let mut first_movement_id = None;
    let mut first_display = true;
    let notes = if cross_branch {
        Some(format!(
            "Auto-fulfilled for sale at branch {selling_branch_id}"
        ))
    } else {
        None
    };

    for lot in lots {
        if remaining <= Decimal::ZERO {
            break;
        }
        let take = remaining.min(lot.remaining);
        if take <= Decimal::ZERO {
            continue;
        }
        let movement_id = Uuid::new_v4();
        if first_movement_id.is_none() {
            first_movement_id = Some(movement_id);
        }
        let line_cost = money_value(lot.unit_cost * take);
        fifo_cost += line_cost;
        allocated += take;
        let displayed_qty = if first_display {
            displayed
        } else {
            Decimal::ZERO
        };
        first_display = false;

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE branch_lots SET remaining_base_quantity = remaining_base_quantity - ?, updated_at = ? WHERE id = ?",
                [take.into(), now.into(), lot.branch_lot_id.into()],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE product_lots SET remaining_base_quantity = remaining_base_quantity - ?, version = version + 1, updated_at = ? WHERE id = ?",
                [take.into(), now.into(), lot.product_lot_id.into()],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    movement_id.into(),
                    lot.branch_id.into(),
                    product_id.into(),
                    lot.product_lot_id.into(),
                    movement_type.into(),
                    displayed_qty.into(),
                    unit_name.into(),
                    (-take).into(),
                    lot.unit_cost.into(),
                    line_cost.into(),
                    reference_type.into(),
                    reference_id.into(),
                    notes.clone().into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO lot_consumptions (id, branch_id, product_id, product_lot_id, stock_movement_id, reference_type, reference_id, base_quantity, unit_cost, total_cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    Uuid::new_v4().into(),
                    lot.branch_id.into(),
                    product_id.into(),
                    lot.product_lot_id.into(),
                    movement_id.into(),
                    reference_type.into(),
                    reference_id.into(),
                    take.into(),
                    lot.unit_cost.into(),
                    line_cost.into(),
                    now.into(),
                ],
            ))
            .await?;
        remaining -= take;
    }

    Ok(PartialAllocation {
        fifo_cost,
        allocated,
        remaining,
        first_movement_id,
    })
}
