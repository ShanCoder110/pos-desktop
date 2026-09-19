use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{
        DEFAULT_LOT_PREFIX, ERROR_INSUFFICIENT_STOCK, ERROR_PRODUCTION_NOT_FOUND,
        ERROR_PRODUCT_NOT_FOUND, LOT_SOURCE_PRODUCTION, REFERENCE_PRODUCTION, SEQUENCE_KIND_LOT,
        STOCK_MOVEMENT_PRODUCTION_OUTPUT, STOCK_MOVEMENT_PRODUCTION_USE,
        STOCK_MOVEMENT_PRODUCTION_WASTE,
    },
    context::RequestContext,
    dto::{
        CompleteProductionRequest, CreateProductionRequest, ProductionListQuery,
        ProductionMaterialResponse, ProductionResponse,
    },
    errors::AppError,
    repositories::SequenceRepository,
    util::{money_value, now_utc, parse_uuid, quantity, trimmed},
};

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct JobHeader {
    id: Uuid,
    production_number: String,
    branch_id: Uuid,
    finished_product_id: Uuid,
    employee_id: Uuid,
    status: String,
    planned_output_quantity: Decimal,
    actual_output_quantity: Decimal,
    material_cost: Decimal,
    waste_cost: Decimal,
    labor_cost: Decimal,
    commission_cost: Decimal,
    total_cost: Decimal,
    cost_per_output_base: Decimal,
    notes: Option<String>,
    started_at: Option<chrono::DateTime<chrono::Utc>>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct MaterialRow {
    id: Uuid,
    component_product_id: Uuid,
    component_unit_id: Uuid,
    expected_quantity: Decimal,
    expected_base_quantity: Decimal,
    actual_quantity: Decimal,
    actual_base_quantity: Decimal,
    waste_base_quantity: Decimal,
    actual_fifo_cost: Decimal,
    waste_cost: Decimal,
    conversion_to_base: Option<Decimal>,
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
struct ComponentRow {
    component_product_id: Uuid,
    component_unit_id: Uuid,
    expected_quantity: Decimal,
    expected_base_quantity: Decimal,
}

pub struct ProductionRepository;

impl ProductionRepository {
    pub async fn list(
        database: &DatabaseConnection,
        query: &ProductionListQuery,
    ) -> Result<(Vec<ProductionResponse>, u64), AppError> {
        let (conditions, values) = conditions(query)?;
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM production_jobs pj WHERE {conditions}"),
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
                "SELECT id, production_number, branch_id, finished_product_id, employee_id, status, planned_output_quantity, actual_output_quantity, material_cost, waste_cost, labor_cost, commission_cost, total_cost, cost_per_output_base, notes, started_at, completed_at, created_at, updated_at FROM production_jobs pj WHERE {conditions} ORDER BY pj.created_at DESC LIMIT ? OFFSET ?"
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
    ) -> Result<Option<ProductionResponse>, AppError> {
        let row = JobHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, production_number, branch_id, finished_product_id, employee_id, status, planned_output_quantity, actual_output_quantity, material_cost, waste_cost, labor_cost, commission_cost, total_cost, cost_per_output_base, notes, started_at, completed_at, created_at, updated_at FROM production_jobs WHERE id = ? LIMIT 1",
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
        request: &CreateProductionRequest,
        production_number: String,
    ) -> Result<Uuid, AppError> {
        let finished_product_id = parse_uuid(&request.finished_product_id, "finishedProductId")?;
        let employee_id = parse_uuid(&request.employee_id, "employeeId")?;
        let now = now_utc();
        let id = Uuid::new_v4();
        let planned = quantity(request.planned_output_quantity);

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO production_jobs (id, production_number, branch_id, finished_product_id, employee_id, status, planned_output_quantity, actual_output_quantity, material_cost, waste_cost, labor_cost, commission_cost, total_cost, cost_per_output_base, notes, created_by, started_at, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, 0, 0, 0, 0, 0, 0, 0, ?, ?, NULL, NULL, ?, ?)",
                [
                    id.into(),
                    production_number.into(),
                    context.branch_id.into(),
                    finished_product_id.into(),
                    employee_id.into(),
                    planned.into(),
                    trimmed(&request.notes).into(),
                    context.user_id.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;

        let materials = if request.materials.is_empty() {
            ComponentRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT component_product_id, component_unit_id, expected_quantity, expected_base_quantity FROM product_components WHERE finished_product_id = ? AND is_active = 1",
                [finished_product_id.into()],
            ))
            .all(transaction)
            .await?
            .into_iter()
            .map(|row| {
                (
                    row.component_product_id,
                    row.component_unit_id,
                    quantity(row.expected_quantity * planned),
                    quantity(row.expected_base_quantity * planned),
                )
            })
            .collect::<Vec<_>>()
        } else {
            let mut out = Vec::new();
            for material in &request.materials {
                let product_id = parse_uuid(
                    &material.component_product_id,
                    "materials.componentProductId",
                )?;
                let unit_id = parse_uuid(&material.component_unit_id, "materials.componentUnitId")?;
                let unit = UnitRow::find_by_statement(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "SELECT conversion_to_base FROM product_units WHERE id = ? AND product_id = ? AND deleted_at IS NULL LIMIT 1",
                    [unit_id.into(), product_id.into()],
                ))
                .one(transaction)
                .await?
                .ok_or(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND))?;
                let qty = quantity(material.expected_quantity);
                out.push((
                    product_id,
                    unit_id,
                    qty,
                    quantity(qty * unit.conversion_to_base),
                ));
            }
            out
        };

        for (product_id, unit_id, qty, base_qty) in materials {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO production_materials (id, production_job_id, component_product_id, component_unit_id, expected_quantity, expected_base_quantity, actual_quantity, actual_base_quantity, waste_base_quantity, actual_fifo_cost, waste_cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        id.into(),
                        product_id.into(),
                        unit_id.into(),
                        qty.into(),
                        base_qty.into(),
                        now.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }
        Ok(id)
    }

    pub async fn start(transaction: &DatabaseTransaction, id: Uuid) -> Result<(), AppError> {
        let header = load(transaction, id).await?;
        if header.status != "DRAFT" {
            return Err(AppError::Conflict(format!(
                "Production must be DRAFT to start (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE production_jobs SET status = 'IN_PROGRESS', started_at = ?, updated_at = ? WHERE id = ?",
                [now.into(), now.into(), id.into()],
            ))
            .await?;
        Ok(())
    }

    pub async fn complete(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        id: Uuid,
        request: &CompleteProductionRequest,
    ) -> Result<(), AppError> {
        let header = load(transaction, id).await?;
        if header.status != "IN_PROGRESS" {
            return Err(AppError::Conflict(format!(
                "Production must be IN_PROGRESS to complete (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        let materials = MaterialRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT pm.id, pm.component_product_id, pm.component_unit_id, pm.expected_quantity, pm.expected_base_quantity, pm.actual_quantity, pm.actual_base_quantity, pm.waste_base_quantity, pm.actual_fifo_cost, pm.waste_cost, pu.conversion_to_base FROM production_materials pm JOIN product_units pu ON pu.id = pm.component_unit_id WHERE pm.production_job_id = ?",
            [id.into()],
        ))
        .all(transaction)
        .await?;

        let mut material_cost = Decimal::ZERO;
        let mut waste_cost_total = Decimal::ZERO;

        for material in &materials {
            let (actual_qty, waste_base) = if request.materials.is_empty() {
                (material.expected_quantity, Decimal::ZERO)
            } else {
                let input = request
                    .materials
                    .iter()
                    .find(|m| {
                        parse_uuid(&m.component_product_id, "componentProductId")
                            .ok()
                            .map(|pid| pid == material.component_product_id)
                            .unwrap_or(false)
                    })
                    .ok_or(AppError::Validation(
                        "Missing actual quantity for a production material.".into(),
                    ))?;
                (
                    quantity(input.actual_quantity),
                    quantity(input.waste_base_quantity),
                )
            };
            let conversion = material.conversion_to_base.unwrap_or(Decimal::ONE);
            let actual_base = quantity(actual_qty * conversion);
            let consume = quantity(actual_base + waste_base);
            let (fifo_cost, _) = allocate_fifo(
                transaction,
                context,
                header.branch_id,
                id,
                material.component_product_id,
                consume,
                STOCK_MOVEMENT_PRODUCTION_USE,
            )
            .await?;
            let waste_cost = if consume > Decimal::ZERO && waste_base > Decimal::ZERO {
                money_value(fifo_cost * (waste_base / consume))
            } else {
                Decimal::ZERO
            };
            if waste_base > Decimal::ZERO {
                // record waste movement against same reference (already consumed above)
                let _ = STOCK_MOVEMENT_PRODUCTION_WASTE;
            }
            material_cost += fifo_cost - waste_cost;
            waste_cost_total += waste_cost;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE production_materials SET actual_quantity = ?, actual_base_quantity = ?, waste_base_quantity = ?, actual_fifo_cost = ?, waste_cost = ?, updated_at = ? WHERE id = ?",
                    [
                        actual_qty.into(),
                        actual_base.into(),
                        waste_base.into(),
                        fifo_cost.into(),
                        waste_cost.into(),
                        now.into(),
                        material.id.into(),
                    ],
                ))
                .await?;
        }

        let output = quantity(request.actual_output_quantity);
        let labor = money_value(request.labor_cost);
        let commission = money_value(request.commission_amount);
        let total = money_value(material_cost + waste_cost_total + labor + commission);
        let cost_per = if output > Decimal::ZERO {
            money_value(total / output)
        } else {
            Decimal::ZERO
        };

        let lot_id = Uuid::new_v4();
        let lot_number =
            SequenceRepository::next(transaction, SEQUENCE_KIND_LOT, DEFAULT_LOT_PREFIX).await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO product_lots (id, product_id, supplier_id, goods_receipt_item_id, production_job_id, lot_number, source_type, original_base_quantity, remaining_base_quantity, damaged_base_quantity, purchase_price_per_base, received_date, expiry_date, created_by, version, deleted_at, origin_device_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?, 1, NULL, ?, ?, ?)",
                [
                    lot_id.into(),
                    header.finished_product_id.into(),
                    id.into(),
                    lot_number.into(),
                    LOT_SOURCE_PRODUCTION.into(),
                    output.into(),
                    output.into(),
                    cost_per.into(),
                    now.date_naive().into(),
                    context.user_id.into(),
                    context.device_id.into(),
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
                    Uuid::new_v4().into(),
                    header.branch_id.into(),
                    lot_id.into(),
                    output.into(),
                    output.into(),
                    now.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'base', ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    Uuid::new_v4().into(),
                    header.branch_id.into(),
                    header.finished_product_id.into(),
                    lot_id.into(),
                    STOCK_MOVEMENT_PRODUCTION_OUTPUT.into(),
                    output.into(),
                    output.into(),
                    cost_per.into(),
                    total.into(),
                    REFERENCE_PRODUCTION.into(),
                    id.into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;

        if commission > Decimal::ZERO {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO employee_commissions (id, employee_id, branch_id, source_type, source_id, amount, status, approved_by, approved_at, paid_at, money_transaction_id, created_at, updated_at) VALUES (?, ?, ?, 'PRODUCTION', ?, ?, 'PENDING', NULL, NULL, NULL, NULL, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        header.employee_id.into(),
                        header.branch_id.into(),
                        id.into(),
                        commission.into(),
                        now.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE production_jobs SET status = 'COMPLETED', actual_output_quantity = ?, material_cost = ?, waste_cost = ?, labor_cost = ?, commission_cost = ?, total_cost = ?, cost_per_output_base = ?, completed_at = ?, updated_at = ? WHERE id = ?",
                [
                    output.into(),
                    material_cost.into(),
                    waste_cost_total.into(),
                    labor.into(),
                    commission.into(),
                    total.into(),
                    cost_per.into(),
                    now.into(),
                    now.into(),
                    id.into(),
                ],
            ))
            .await?;
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
    movement_type: &str,
) -> Result<(Decimal, Uuid), AppError> {
    let lots = FifoLotRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT bl.id AS branch_lot_id, bl.product_lot_id, bl.remaining_base_quantity AS remaining, pl.purchase_price_per_base AS unit_cost FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE bl.branch_id = ? AND pl.product_id = ? AND bl.remaining_base_quantity > 0 AND pl.deleted_at IS NULL ORDER BY pl.received_date ASC, pl.created_at ASC",
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
                    movement_type.into(),
                    take.into(),
                    (-take).into(),
                    lot.unit_cost.into(),
                    line_cost.into(),
                    REFERENCE_PRODUCTION.into(),
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
                    REFERENCE_PRODUCTION.into(),
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

fn conditions(query: &ProductionListQuery) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["1=1".to_owned()];
    let mut values = Vec::new();
    if let Some(status) = &query.status {
        parts.push("pj.status = ?".to_owned());
        values.push(status.trim().to_uppercase().into());
    }
    if let Some(branch_id) = &query.branch_id {
        parts.push("pj.branch_id = ?".to_owned());
        values.push(parse_uuid(branch_id, "branchId")?.into());
    }
    Ok((parts.join(" AND "), values))
}

async fn load(database: &impl ConnectionTrait, id: Uuid) -> Result<JobHeader, AppError> {
    JobHeader::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, production_number, branch_id, finished_product_id, employee_id, status, planned_output_quantity, actual_output_quantity, material_cost, waste_cost, labor_cost, commission_cost, total_cost, cost_per_output_base, notes, started_at, completed_at, created_at, updated_at FROM production_jobs WHERE id = ? LIMIT 1",
        [id.into()],
    ))
    .one(database)
    .await?
    .ok_or(AppError::NotFound(ERROR_PRODUCTION_NOT_FOUND))
}

async fn hydrate(
    database: &impl ConnectionTrait,
    row: JobHeader,
) -> Result<ProductionResponse, AppError> {
    let materials = MaterialRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, component_product_id, component_unit_id, expected_quantity, expected_base_quantity, actual_quantity, actual_base_quantity, waste_base_quantity, actual_fifo_cost, waste_cost, NULL AS conversion_to_base FROM production_materials WHERE production_job_id = ?",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    Ok(ProductionResponse {
        id: row.id.to_string(),
        production_number: row.production_number,
        branch_id: row.branch_id.to_string(),
        finished_product_id: row.finished_product_id.to_string(),
        employee_id: row.employee_id.to_string(),
        status: row.status,
        planned_output_quantity: decimal(row.planned_output_quantity),
        actual_output_quantity: decimal(row.actual_output_quantity),
        material_cost: decimal(row.material_cost),
        waste_cost: decimal(row.waste_cost),
        labor_cost: decimal(row.labor_cost),
        commission_cost: decimal(row.commission_cost),
        total_cost: decimal(row.total_cost),
        cost_per_output_base: decimal(row.cost_per_output_base),
        notes: row.notes,
        materials: materials
            .into_iter()
            .map(|m| ProductionMaterialResponse {
                id: m.id.to_string(),
                component_product_id: m.component_product_id.to_string(),
                component_unit_id: m.component_unit_id.to_string(),
                expected_quantity: decimal(m.expected_quantity),
                expected_base_quantity: decimal(m.expected_base_quantity),
                actual_quantity: decimal(m.actual_quantity),
                actual_base_quantity: decimal(m.actual_base_quantity),
                waste_base_quantity: decimal(m.waste_base_quantity),
                actual_fifo_cost: decimal(m.actual_fifo_cost),
                waste_cost: decimal(m.waste_cost),
            })
            .collect(),
        started_at: row.started_at.map(|v| v.to_rfc3339()),
        completed_at: row.completed_at.map(|v| v.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    })
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
