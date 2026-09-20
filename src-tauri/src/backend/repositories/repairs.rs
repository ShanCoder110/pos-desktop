use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{
        ERROR_INSUFFICIENT_STOCK, ERROR_PRODUCT_NOT_FOUND, ERROR_REPAIR_NOT_FOUND, LEDGER_SALE,
        PAYMENT_DIRECTION_IN, PAYMENT_STATUS_COMPLETED, PAYMENT_STATUS_CREDIT, PAYMENT_STATUS_PAID,
        PAYMENT_STATUS_PARTIAL, PAYMENT_STATUS_UNPAID, REFERENCE_REPAIR, STOCK_MOVEMENT_REPAIR_USE,
    },
    context::RequestContext,
    dto::{
        CompleteRepairRequest, CreateRepairRequest, DeliverRepairRequest, RepairListQuery,
        RepairPartResponse, RepairResponse,
    },
    errors::AppError,
    util::{money_value, now_utc, parse_optional_uuid, parse_uuid, quantity, trimmed},
};

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct JobHeader {
    id: Uuid,
    branch_id: Uuid,
    repair_number: String,
    customer_id: Option<Uuid>,
    assigned_employee_id: Option<Uuid>,
    item_name: String,
    complaint: String,
    serial_number: Option<String>,
    diagnosis: Option<String>,
    work_notes: Option<String>,
    status: String,
    payment_status: String,
    estimated_amount: Decimal,
    service_amount: Decimal,
    parts_amount: Decimal,
    discount: Decimal,
    total_amount: Decimal,
    paid_amount: Decimal,
    credit_amount: Decimal,
    material_cost: Decimal,
    waste_cost: Decimal,
    commission_cost: Decimal,
    received_at: chrono::DateTime<chrono::Utc>,
    ready_at: Option<chrono::DateTime<chrono::Utc>>,
    delivered_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct PartRow {
    id: Uuid,
    product_id: Uuid,
    product_unit_id: Uuid,
    displayed_quantity: Decimal,
    base_quantity: Decimal,
    waste_base_quantity: Decimal,
    selling_price: Decimal,
    line_total: Decimal,
    fifo_cost: Decimal,
    waste_cost: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct UnitRow {
    conversion_to_base: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct FifoLotRow {
    branch_lot_id: Uuid,
    product_lot_id: Uuid,
    remaining: Decimal,
    unit_cost: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct BalanceRow {
    balance_after: Decimal,
}

pub struct RepairRepository;

impl RepairRepository {
    pub async fn list(
        database: &DatabaseConnection,
        query: &RepairListQuery,
    ) -> Result<(Vec<RepairResponse>, u64), AppError> {
        let (conditions, values) = conditions(query)?;
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM repair_jobs rj WHERE {conditions}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        let mut page_values = values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = JobHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, branch_id, repair_number, customer_id, assigned_employee_id, item_name, complaint, serial_number, diagnosis, work_notes, status, payment_status, estimated_amount, service_amount, parts_amount, discount, total_amount, paid_amount, credit_amount, material_cost, waste_cost, commission_cost, received_at, ready_at, delivered_at, created_at, updated_at FROM repair_jobs rj WHERE {conditions} ORDER BY rj.created_at DESC LIMIT ? OFFSET ?"
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
    ) -> Result<Option<RepairResponse>, AppError> {
        let row = JobHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, branch_id, repair_number, customer_id, assigned_employee_id, item_name, complaint, serial_number, diagnosis, work_notes, status, payment_status, estimated_amount, service_amount, parts_amount, discount, total_amount, paid_amount, credit_amount, material_cost, waste_cost, commission_cost, received_at, ready_at, delivered_at, created_at, updated_at FROM repair_jobs WHERE id = ? LIMIT 1",
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
        request: &CreateRepairRequest,
        repair_number: String,
    ) -> Result<Uuid, AppError> {
        let now = now_utc();
        let id = Uuid::new_v4();
        let promised_at = request
            .promised_at
            .as_deref()
            .map(|value| {
                chrono::DateTime::parse_from_rfc3339(value)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .map_err(|_| AppError::Validation("promisedAt must be RFC3339.".into()))
            })
            .transpose()?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO repair_jobs (id, branch_id, repair_number, customer_id, assigned_employee_id, item_name, complaint, serial_number, diagnosis, work_notes, status, payment_status, estimated_amount, service_amount, parts_amount, discount, total_amount, paid_amount, credit_amount, material_cost, waste_cost, commission_cost, contribution, received_at, promised_at, ready_at, delivered_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'RECEIVED', ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, NULL, NULL, ?, ?, ?)",
                [
                    id.into(),
                    context.branch_id.into(),
                    repair_number.into(),
                    parse_optional_uuid(request.customer_id.as_deref(), "customerId")?.into(),
                    parse_optional_uuid(request.assigned_employee_id.as_deref(), "assignedEmployeeId")?
                        .into(),
                    request.item_name.trim().to_owned().into(),
                    request.complaint.trim().to_owned().into(),
                    trimmed(&request.serial_number).into(),
                    PAYMENT_STATUS_UNPAID.into(),
                    money_value(request.estimated_amount).into(),
                    now.into(),
                    promised_at.into(),
                    context.user_id.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(id)
    }

    pub async fn start(transaction: &DatabaseTransaction, id: Uuid) -> Result<(), AppError> {
        let header = load(transaction, id).await?;
        if header.status != "RECEIVED" {
            return Err(AppError::Conflict(format!(
                "Repair must be RECEIVED to start (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE repair_jobs SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ?",
                [now.into(), id.into()],
            ))
            .await?;
        Ok(())
    }

    pub async fn complete(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        id: Uuid,
        request: &CompleteRepairRequest,
    ) -> Result<(), AppError> {
        let header = load(transaction, id).await?;
        if header.status != "IN_PROGRESS" {
            return Err(AppError::Conflict(format!(
                "Repair must be IN_PROGRESS to complete (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        let mut parts_amount = Decimal::ZERO;
        let mut material_cost = Decimal::ZERO;
        let mut waste_cost_total = Decimal::ZERO;

        for part in &request.parts {
            let product_id = parse_uuid(&part.product_id, "parts.productId")?;
            let product_unit_id = parse_uuid(&part.product_unit_id, "parts.productUnitId")?;
            let unit = UnitRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT conversion_to_base FROM product_units WHERE id = ? AND product_id = ? AND deleted_at IS NULL LIMIT 1",
                [product_unit_id.into(), product_id.into()],
            ))
            .one(transaction)
            .await?
            .ok_or(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND))?;
            let displayed = quantity(part.quantity);
            let base_qty = quantity(displayed * unit.conversion_to_base);
            let waste = quantity(part.waste_base_quantity);
            let consume = quantity(base_qty + waste);
            let selling = money_value(part.selling_price);
            let line_total = money_value(selling * displayed);
            parts_amount += line_total;
            let (fifo_cost, _) = allocate_fifo(
                transaction,
                context,
                header.branch_id,
                id,
                product_id,
                consume,
            )
            .await?;
            let waste_cost = if consume > Decimal::ZERO && waste > Decimal::ZERO {
                money_value(fifo_cost * (waste / consume))
            } else {
                Decimal::ZERO
            };
            material_cost += fifo_cost - waste_cost;
            waste_cost_total += waste_cost;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO repair_parts (id, repair_job_id, product_id, product_unit_id, displayed_quantity, base_quantity, waste_base_quantity, selling_price, line_total, fifo_cost, waste_cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        id.into(),
                        product_id.into(),
                        product_unit_id.into(),
                        displayed.into(),
                        base_qty.into(),
                        waste.into(),
                        selling.into(),
                        line_total.into(),
                        fifo_cost.into(),
                        waste_cost.into(),
                        now.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

        let service = money_value(request.service_amount);
        let discount = money_value(request.discount);
        let commission = money_value(request.commission_amount);
        let total = money_value(service + parts_amount - discount);

        if commission > Decimal::ZERO {
            if let Some(employee_id) = header.assigned_employee_id {
                transaction
                    .execute_raw(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "INSERT INTO employee_commissions (id, employee_id, branch_id, source_type, source_id, amount, status, approved_by, approved_at, paid_at, money_transaction_id, created_at, updated_at) VALUES (?, ?, ?, 'REPAIR', ?, ?, 'PENDING', NULL, NULL, NULL, NULL, ?, ?)",
                        [
                            Uuid::new_v4().into(),
                            employee_id.into(),
                            header.branch_id.into(),
                            id.into(),
                            commission.into(),
                            now.into(),
                            now.into(),
                        ],
                    ))
                    .await?;
            }
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE repair_jobs SET status = 'READY', diagnosis = COALESCE(?, diagnosis), work_notes = COALESCE(?, work_notes), service_amount = ?, parts_amount = ?, discount = ?, total_amount = ?, material_cost = ?, waste_cost = ?, commission_cost = ?, ready_at = ?, updated_at = ? WHERE id = ?",
                [
                    trimmed(&request.diagnosis).into(),
                    trimmed(&request.work_notes).into(),
                    service.into(),
                    parts_amount.into(),
                    discount.into(),
                    total.into(),
                    material_cost.into(),
                    waste_cost_total.into(),
                    commission.into(),
                    now.into(),
                    now.into(),
                    id.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn deliver(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        id: Uuid,
        request: &DeliverRepairRequest,
    ) -> Result<(), AppError> {
        let header = load(transaction, id).await?;
        if header.status != "READY" {
            return Err(AppError::Conflict(format!(
                "Repair must be READY to deliver (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        let paid = money_value(request.paid_amount);
        let credit = money_value((header.total_amount - paid).max(Decimal::ZERO));
        let payment_status = if credit > Decimal::ZERO && paid == Decimal::ZERO {
            PAYMENT_STATUS_CREDIT
        } else if credit > Decimal::ZERO {
            PAYMENT_STATUS_PARTIAL
        } else if paid == Decimal::ZERO {
            PAYMENT_STATUS_UNPAID
        } else {
            PAYMENT_STATUS_PAID
        };

        if paid > Decimal::ZERO {
            let cash_session_id = context.require_cash_session()?;
            let method = request.payment_method.trim().to_uppercase();
            let payment_id = Uuid::new_v4();
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO payments (id, branch_id, customer_id, invoice_id, cash_session_id, amount, amount_tendered, change_amount, payment_method, reference_number, direction, status, received_by, paid_at, notes, client_request_id, created_at) VALUES (?, ?, ?, NULL, ?, ?, NULL, 0, ?, NULL, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        payment_id.into(),
                        header.branch_id.into(),
                        header.customer_id.into(),
                        cash_session_id.into(),
                        paid.into(),
                        method.clone().into(),
                        PAYMENT_DIRECTION_IN.into(),
                        PAYMENT_STATUS_COMPLETED.into(),
                        context.user_id.into(),
                        now.into(),
                        trimmed(&request.notes).into(),
                        format!("repair-pay-{id}").into(),
                        now.into(),
                    ],
                ))
                .await?;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO money_transactions (id, branch_id, cash_session_id, direction, type, amount, payment_method, reference_type, reference_id, party_type, party_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, 'REPAIR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        header.branch_id.into(),
                        cash_session_id.into(),
                        PAYMENT_DIRECTION_IN.into(),
                        paid.into(),
                        method.into(),
                        REFERENCE_REPAIR.into(),
                        id.into(),
                        header.customer_id.map(|_| "CUSTOMER").into(),
                        header.customer_id.into(),
                        trimmed(&request.notes).into(),
                        now.into(),
                        context.user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

        if credit > Decimal::ZERO {
            if let Some(customer_id) = header.customer_id {
                let previous = BalanceRow::find_by_statement(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "SELECT balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
                    [customer_id.into()],
                ))
                .one(transaction)
                .await?
                .map(|row| row.balance_after)
                .unwrap_or(Decimal::ZERO);
                let balance_after = previous + credit;
                transaction
                    .execute_raw(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "INSERT INTO customer_ledger_entries (id, customer_id, branch_id, type, invoice_id, payment_id, return_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 0, ?, ?, ?, ?, ?)",
                        [
                            Uuid::new_v4().into(),
                            customer_id.into(),
                            header.branch_id.into(),
                            LEDGER_SALE.into(),
                            credit.into(),
                            balance_after.into(),
                            format!("Repair credit {id}").into(),
                            now.into(),
                            context.user_id.into(),
                            now.into(),
                        ],
                    ))
                    .await?;
            }
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE repair_jobs SET status = 'DELIVERED', payment_status = ?, paid_amount = ?, credit_amount = ?, delivered_at = ?, updated_at = ? WHERE id = ?",
                [
                    payment_status.into(),
                    paid.into(),
                    credit.into(),
                    now.into(),
                    now.into(),
                    id.into(),
                ],
            ))
            .await?;
        let _ = ERROR_REPAIR_NOT_FOUND;
        Ok(())
    }
}

async fn allocate_fifo(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    branch_id: Uuid,
    reference_id: Uuid,
    product_id: Uuid,
    mut needed: Decimal,
) -> Result<(Decimal, Uuid), AppError> {
    let lots = FifoLotRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT bl.id AS branch_lot_id, bl.product_lot_id, bl.remaining_base_quantity AS remaining, CAST(pl.purchase_price_per_base AS REAL) AS unit_cost FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE bl.branch_id = ? AND pl.product_id = ? AND bl.remaining_base_quantity > 0 AND pl.deleted_at IS NULL ORDER BY pl.received_date ASC, pl.created_at ASC",
        [branch_id.into(), product_id.into()],
    ))
    .all(transaction)
    .await?;
    let available: Decimal = lots.iter().map(|l| l.remaining).sum();
    if available < needed {
        return Err(AppError::Conflict(ERROR_INSUFFICIENT_STOCK.into()));
    }
    let now = now_utc();
    let mut fifo_cost = Decimal::ZERO;
    let mut first_id = None;
    for lot in lots {
        if needed <= Decimal::ZERO {
            break;
        }
        let take = needed.min(lot.remaining);
        if take <= Decimal::ZERO {
            continue;
        }
        let movement_id = Uuid::new_v4();
        if first_id.is_none() {
            first_id = Some(movement_id);
        }
        let line_cost = money_value(lot.unit_cost * take);
        fifo_cost += line_cost;
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
                "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'base', ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    movement_id.into(),
                    branch_id.into(),
                    product_id.into(),
                    lot.product_lot_id.into(),
                    STOCK_MOVEMENT_REPAIR_USE.into(),
                    take.into(),
                    (-take).into(),
                    lot.unit_cost.into(),
                    line_cost.into(),
                    REFERENCE_REPAIR.into(),
                    reference_id.into(),
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
                    branch_id.into(),
                    product_id.into(),
                    lot.product_lot_id.into(),
                    movement_id.into(),
                    REFERENCE_REPAIR.into(),
                    reference_id.into(),
                    take.into(),
                    lot.unit_cost.into(),
                    line_cost.into(),
                    now.into(),
                ],
            ))
            .await?;
        needed -= take;
    }
    Ok((
        fifo_cost,
        first_id.ok_or(AppError::Conflict(ERROR_INSUFFICIENT_STOCK.into()))?,
    ))
}

fn conditions(query: &RepairListQuery) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["1=1".to_owned()];
    let mut values = Vec::new();
    if let Some(status) = &query.status {
        parts.push("rj.status = ?".to_owned());
        values.push(status.trim().to_uppercase().into());
    }
    if let Some(branch_id) = &query.branch_id {
        parts.push("rj.branch_id = ?".to_owned());
        values.push(parse_uuid(branch_id, "branchId")?.into());
    }
    if let Some(customer_id) = &query.customer_id {
        parts.push("rj.customer_id = ?".to_owned());
        values.push(parse_uuid(customer_id, "customerId")?.into());
    }
    Ok((parts.join(" AND "), values))
}

async fn load(database: &impl ConnectionTrait, id: Uuid) -> Result<JobHeader, AppError> {
    JobHeader::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, branch_id, repair_number, customer_id, assigned_employee_id, item_name, complaint, serial_number, diagnosis, work_notes, status, payment_status, estimated_amount, service_amount, parts_amount, discount, total_amount, paid_amount, credit_amount, material_cost, waste_cost, commission_cost, received_at, ready_at, delivered_at, created_at, updated_at FROM repair_jobs WHERE id = ? LIMIT 1",
        [id.into()],
    ))
    .one(database)
    .await?
    .ok_or(AppError::NotFound(ERROR_REPAIR_NOT_FOUND))
}

async fn hydrate(
    database: &impl ConnectionTrait,
    row: JobHeader,
) -> Result<RepairResponse, AppError> {
    let parts = PartRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, product_id, product_unit_id, displayed_quantity, base_quantity, waste_base_quantity, selling_price, line_total, fifo_cost, waste_cost FROM repair_parts WHERE repair_job_id = ?",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    Ok(RepairResponse {
        id: row.id.to_string(),
        branch_id: row.branch_id.to_string(),
        repair_number: row.repair_number,
        customer_id: row.customer_id.map(|v| v.to_string()),
        assigned_employee_id: row.assigned_employee_id.map(|v| v.to_string()),
        item_name: row.item_name,
        complaint: row.complaint,
        serial_number: row.serial_number,
        diagnosis: row.diagnosis,
        work_notes: row.work_notes,
        status: row.status,
        payment_status: row.payment_status,
        estimated_amount: decimal(row.estimated_amount),
        service_amount: decimal(row.service_amount),
        parts_amount: decimal(row.parts_amount),
        discount: decimal(row.discount),
        total_amount: decimal(row.total_amount),
        paid_amount: decimal(row.paid_amount),
        credit_amount: decimal(row.credit_amount),
        material_cost: decimal(row.material_cost),
        waste_cost: decimal(row.waste_cost),
        commission_cost: decimal(row.commission_cost),
        parts: parts
            .into_iter()
            .map(|p| RepairPartResponse {
                id: p.id.to_string(),
                product_id: p.product_id.to_string(),
                product_unit_id: p.product_unit_id.to_string(),
                displayed_quantity: decimal(p.displayed_quantity),
                base_quantity: decimal(p.base_quantity),
                waste_base_quantity: decimal(p.waste_base_quantity),
                selling_price: decimal(p.selling_price),
                line_total: decimal(p.line_total),
                fifo_cost: decimal(p.fifo_cost),
                waste_cost: decimal(p.waste_cost),
            })
            .collect(),
        received_at: row.received_at.to_rfc3339(),
        ready_at: row.ready_at.map(|v| v.to_rfc3339()),
        delivered_at: row.delivered_at.map(|v| v.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    })
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
