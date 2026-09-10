use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{
        DEFAULT_LOT_PREFIX, ERROR_PO_NOT_FOUND, ERROR_PRODUCT_NOT_FOUND, ERROR_SUPPLIER_NOT_FOUND,
        LEDGER_PAYMENT, LEDGER_PURCHASE, LOT_SOURCE_PURCHASE, PAYMENT_DIRECTION_OUT,
        REFERENCE_GOODS_RECEIPT, SEQUENCE_KIND_LOT, STOCK_MOVEMENT_PURCHASE,
    },
    context::RequestContext,
    dto::{
        CreatePurchaseOrderRequest, PurchaseOrderItemResponse, PurchaseOrderListQuery,
        PurchaseOrderResponse, ReceivePurchaseOrderRequest, SupplierLedgerEntryResponse,
        SupplierPaymentRequest, SupplierPaymentResponse,
    },
    errors::AppError,
    repositories::SequenceRepository,
    util::{money_value, now_utc, parse_date, parse_uuid, quantity, trimmed},
};

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct PoHeader {
    id: Uuid,
    branch_id: Uuid,
    supplier_id: Uuid,
    order_number: String,
    status: String,
    order_date: chrono::NaiveDate,
    expected_date: Option<chrono::NaiveDate>,
    subtotal: Decimal,
    discount: Decimal,
    tax: Decimal,
    total: Decimal,
    notes: Option<String>,
    ordered_at: Option<chrono::DateTime<chrono::Utc>>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Clone, Debug, FromQueryResult)]
struct PoItemRow {
    id: Uuid,
    product_id: Uuid,
    unit_id: Uuid,
    unit_name_snapshot: String,
    ordered_quantity: Decimal,
    ordered_base_quantity: Decimal,
    expected_unit_cost: Decimal,
    received_base_quantity: Decimal,
    line_total: Decimal,
    notes: Option<String>,
}

#[derive(Debug, FromQueryResult)]
struct UnitRow {
    display_name: String,
    conversion_to_base: Decimal,
    minimum_price: Decimal,
    wholesale_price: Decimal,
    retail_price: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct BalanceRow {
    balance_after: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct LedgerRow {
    id: Uuid,
    supplier_id: Uuid,
    branch_id: Uuid,
    entry_type: String,
    purchase_order_id: Option<Uuid>,
    goods_receipt_id: Option<Uuid>,
    money_transaction_id: Option<Uuid>,
    debit: Decimal,
    credit: Decimal,
    balance_after: Decimal,
    notes: Option<String>,
    occurred_at: chrono::DateTime<chrono::Utc>,
    created_at: chrono::DateTime<chrono::Utc>,
}

pub struct PurchasingRepository;

impl PurchasingRepository {
    pub async fn list(
        database: &DatabaseConnection,
        query: &PurchaseOrderListQuery,
    ) -> Result<(Vec<PurchaseOrderResponse>, u64), AppError> {
        let (conditions, values) = po_conditions(query, None)?;
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM purchase_orders po WHERE {conditions}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        let direction = query.page.sort_direction.unwrap_or_default().sql();
        let mut page_values = values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = PoHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, branch_id, supplier_id, order_number, status, order_date, expected_date, subtotal, discount, tax, total, notes, ordered_at, completed_at, created_at, updated_at FROM purchase_orders po WHERE {conditions} ORDER BY po.created_at {direction}, po.id ASC LIMIT ? OFFSET ?"
            ),
            page_values,
        ))
        .all(database)
        .await?;
        let mut responses = Vec::with_capacity(rows.len());
        for row in rows {
            responses.push(hydrate_po(database, row).await?);
        }
        Ok((responses, count))
    }

    pub async fn find(
        database: &impl ConnectionTrait,
        id: Uuid,
    ) -> Result<Option<PurchaseOrderResponse>, AppError> {
        let row = PoHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, branch_id, supplier_id, order_number, status, order_date, expected_date, subtotal, discount, tax, total, notes, ordered_at, completed_at, created_at, updated_at FROM purchase_orders WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [id.into()],
        ))
        .one(database)
        .await?;
        match row {
            Some(row) => Ok(Some(hydrate_po(database, row).await?)),
            None => Ok(None),
        }
    }

    pub async fn create_draft(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        request: &CreatePurchaseOrderRequest,
        order_number: String,
    ) -> Result<Uuid, AppError> {
        let supplier_id = parse_uuid(&request.supplier_id, "supplierId")?;
        ensure_supplier(transaction, supplier_id).await?;
        let now = now_utc();
        let order_date = match &request.order_date {
            Some(value) => parse_date(value, "orderDate must be YYYY-MM-DD.")?,
            None => now.date_naive(),
        };
        let expected_date = request
            .expected_date
            .as_deref()
            .map(|value| parse_date(value, "expectedDate must be YYYY-MM-DD."))
            .transpose()?;
        let po_id = Uuid::new_v4();
        let mut subtotal = Decimal::ZERO;
        let mut prepared = Vec::new();
        for item in &request.items {
            let product_id = parse_uuid(&item.product_id, "items.productId")?;
            let unit_id = parse_uuid(&item.unit_id, "items.unitId")?;
            let unit = load_unit(transaction, product_id, unit_id).await?;
            let qty = quantity(item.quantity);
            let cost = money_value(item.unit_cost);
            let base_qty = quantity(qty * unit.conversion_to_base);
            let line_total = money_value(cost * qty);
            subtotal += line_total;
            prepared.push((
                product_id,
                unit_id,
                unit.display_name,
                qty,
                base_qty,
                cost,
                line_total,
                trimmed(&item.notes),
            ));
        }
        let discount = money_value(request.discount);
        let tax = money_value(request.tax);
        let total = money_value(subtotal - discount + tax);

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO purchase_orders (id, branch_id, supplier_id, order_number, status, order_date, expected_date, subtotal, discount, tax, total, notes, created_by, approved_by, ordered_at, completed_at, cancelled_at, version, deleted_at, origin_device_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 1, NULL, ?, ?, ?)",
                [
                    po_id.into(),
                    context.branch_id.into(),
                    supplier_id.into(),
                    order_number.into(),
                    order_date.into(),
                    expected_date.into(),
                    subtotal.into(),
                    discount.into(),
                    tax.into(),
                    total.into(),
                    trimmed(&request.notes).into(),
                    context.user_id.into(),
                    context.device_id.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;

        for (product_id, unit_id, unit_name, qty, base_qty, cost, line_total, notes) in prepared {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO purchase_order_items (id, purchase_order_id, product_id, unit_id, unit_name_snapshot, ordered_quantity, ordered_base_quantity, expected_unit_cost, received_base_quantity, discount, tax, line_total, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        po_id.into(),
                        product_id.into(),
                        unit_id.into(),
                        unit_name.into(),
                        qty.into(),
                        base_qty.into(),
                        cost.into(),
                        line_total.into(),
                        notes.into(),
                        now.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }
        Ok(po_id)
    }

    pub async fn mark_ordered(
        transaction: &DatabaseTransaction,
        id: Uuid,
    ) -> Result<(), AppError> {
        let header = load_header(transaction, id).await?;
        if header.status != "DRAFT" {
            return Err(AppError::Conflict(format!(
                "Purchase order must be DRAFT to order (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE purchase_orders SET status = 'ORDERED', ordered_at = ?, version = version + 1, updated_at = ? WHERE id = ?",
                [now.into(), now.into(), id.into()],
            ))
            .await?;
        Ok(())
    }

    pub async fn receive(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        po_id: Uuid,
        request: &ReceivePurchaseOrderRequest,
        receipt_number: String,
    ) -> Result<Uuid, AppError> {
        let header = load_header(transaction, po_id).await?;
        if !matches!(header.status.as_str(), "ORDERED" | "PARTIAL") {
            return Err(AppError::Conflict(format!(
                "Purchase order must be ORDERED or PARTIAL to receive (current: {}).",
                header.status
            )));
        }
        let now = now_utc();
        let received_date = match &request.received_date {
            Some(value) => parse_date(value, "receivedDate must be YYYY-MM-DD.")?,
            None => now.date_naive(),
        };
        let items = PoItemRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, product_id, unit_id, unit_name_snapshot, ordered_quantity, ordered_base_quantity, expected_unit_cost, received_base_quantity, line_total, notes FROM purchase_order_items WHERE purchase_order_id = ?",
            [po_id.into()],
        ))
        .all(transaction)
        .await?;
        if items.is_empty() {
            return Err(AppError::Validation("Purchase order has no items.".into()));
        }

        let receive_plan: Vec<(PoItemRow, Decimal, Option<chrono::NaiveDate>)> =
            if request.items.is_empty() {
                items
                    .into_iter()
                    .filter_map(|item| {
                        let remaining = quantity(item.ordered_base_quantity - item.received_base_quantity);
                        (remaining > Decimal::ZERO).then_some((item, remaining, None))
                    })
                    .collect()
            } else {
                let mut plan = Vec::new();
                for input in &request.items {
                    let item_id = parse_uuid(&input.purchase_order_item_id, "items.purchaseOrderItemId")?;
                    let item = items
                        .iter()
                        .find(|row| row.id == item_id)
                        .ok_or(AppError::Validation("Unknown purchase order item.".into()))?
                        .clone();
                    let unit = load_unit(transaction, item.product_id, item.unit_id).await?;
                    let displayed = quantity(input.quantity);
                    let base_qty = quantity(displayed * unit.conversion_to_base);
                    let remaining = quantity(item.ordered_base_quantity - item.received_base_quantity);
                    if base_qty > remaining {
                        return Err(AppError::Validation(
                            "Receive quantity exceeds remaining ordered quantity.".into(),
                        ));
                    }
                    let expiry = input
                        .expiry_date
                        .as_deref()
                        .map(|value| parse_date(value, "expiryDate must be YYYY-MM-DD."))
                        .transpose()?;
                    plan.push((item, base_qty, expiry));
                }
                plan
            };

        if receive_plan.is_empty() {
            return Err(AppError::Validation("Nothing left to receive.".into()));
        }

        let receipt_id = Uuid::new_v4();
        let mut subtotal = Decimal::ZERO;
        let mut prepared_lines = Vec::new();
        for (item, base_qty, expiry) in receive_plan {
            let unit = load_unit(transaction, item.product_id, item.unit_id).await?;
            let cost_per_base = money_value(item.expected_unit_cost / unit.conversion_to_base);
            let line_total = money_value(cost_per_base * base_qty);
            subtotal += line_total;
            let displayed = quantity(base_qty / unit.conversion_to_base);
            prepared_lines.push(PreparedReceive {
                po_item_id: item.id,
                product_id: item.product_id,
                unit_id: item.unit_id,
                unit_name: item.unit_name_snapshot.clone(),
                displayed,
                base_qty,
                cost_per_base,
                line_total,
                min: unit.minimum_price,
                wholesale: unit.wholesale_price,
                retail: unit.retail_price,
                expiry,
            });
        }
        let total = money_value(subtotal);

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO goods_receipts (id, purchase_order_id, supplier_id, branch_id, receipt_number, supplier_invoice_number, received_date, status, subtotal, discount, tax, total, notes, received_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, 0, 0, ?, ?, ?, ?, ?)",
                [
                    receipt_id.into(),
                    po_id.into(),
                    header.supplier_id.into(),
                    header.branch_id.into(),
                    receipt_number.into(),
                    trimmed(&request.supplier_invoice_number).into(),
                    received_date.into(),
                    subtotal.into(),
                    total.into(),
                    trimmed(&request.notes).into(),
                    context.user_id.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;

        for line in prepared_lines {
            let lot_id = Uuid::new_v4();
            let gri_id = Uuid::new_v4();
            let branch_lot_id = Uuid::new_v4();
            let movement_id = Uuid::new_v4();
            let lot_number =
                SequenceRepository::next(transaction, SEQUENCE_KIND_LOT, DEFAULT_LOT_PREFIX)
                    .await?;

            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO product_lots (id, product_id, supplier_id, goods_receipt_item_id, production_job_id, lot_number, source_type, original_base_quantity, remaining_base_quantity, damaged_base_quantity, purchase_price_per_base, received_date, expiry_date, created_by, version, deleted_at, origin_device_id, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, NULL, ?, ?, ?)",
                    [
                        lot_id.into(),
                        line.product_id.into(),
                        header.supplier_id.into(),
                        lot_number.into(),
                        LOT_SOURCE_PURCHASE.into(),
                        line.base_qty.into(),
                        line.base_qty.into(),
                        line.cost_per_base.into(),
                        received_date.into(),
                        line.expiry.into(),
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
                        branch_lot_id.into(),
                        header.branch_id.into(),
                        lot_id.into(),
                        line.base_qty.into(),
                        line.base_qty.into(),
                        now.into(),
                    ],
                ))
                .await?;

            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        movement_id.into(),
                        header.branch_id.into(),
                        line.product_id.into(),
                        lot_id.into(),
                        STOCK_MOVEMENT_PURCHASE.into(),
                        line.displayed.into(),
                        line.unit_name.into(),
                        line.base_qty.into(),
                        line.cost_per_base.into(),
                        line.line_total.into(),
                        REFERENCE_GOODS_RECEIPT.into(),
                        receipt_id.into(),
                        now.into(),
                        context.user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;

            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO goods_receipt_items (id, goods_receipt_id, purchase_order_item_id, product_id, unit_id, quantity, base_quantity, purchase_price_per_base, minimum_price, wholesale_price, retail_price, expiry_date, lot_id, line_total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        gri_id.into(),
                        receipt_id.into(),
                        line.po_item_id.into(),
                        line.product_id.into(),
                        line.unit_id.into(),
                        line.displayed.into(),
                        line.base_qty.into(),
                        line.cost_per_base.into(),
                        line.min.into(),
                        line.wholesale.into(),
                        line.retail.into(),
                        line.expiry.into(),
                        lot_id.into(),
                        line.line_total.into(),
                        now.into(),
                    ],
                ))
                .await?;

            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE product_lots SET goods_receipt_item_id = ?, updated_at = ? WHERE id = ?",
                    [gri_id.into(), now.into(), lot_id.into()],
                ))
                .await?;

            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE purchase_order_items SET received_base_quantity = received_base_quantity + ?, updated_at = ? WHERE id = ?",
                    [line.base_qty.into(), now.into(), line.po_item_id.into()],
                ))
                .await?;
        }

        let previous = BalanceRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT balance_after FROM supplier_ledger_entries WHERE supplier_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
            [header.supplier_id.into()],
        ))
        .one(transaction)
        .await?
        .map(|row| row.balance_after)
        .unwrap_or(Decimal::ZERO);
        let balance_after = previous + total;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO supplier_ledger_entries (id, supplier_id, branch_id, type, purchase_order_id, goods_receipt_id, money_transaction_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?, ?, ?, ?)",
                [
                    Uuid::new_v4().into(),
                    header.supplier_id.into(),
                    header.branch_id.into(),
                    LEDGER_PURCHASE.into(),
                    po_id.into(),
                    receipt_id.into(),
                    total.into(),
                    balance_after.into(),
                    format!("Goods receipt {receipt_id}").into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;

        let remaining = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM purchase_order_items WHERE purchase_order_id = ? AND received_base_quantity < ordered_base_quantity",
            [po_id.into()],
        ))
        .one(transaction)
        .await?
        .map(|row| row.count)
        .unwrap_or(0);
        let (status, completed_at): (&str, Option<chrono::DateTime<chrono::Utc>>) = if remaining == 0 {
            ("COMPLETED", Some(now))
        } else {
            ("PARTIAL", None)
        };
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE purchase_orders SET status = ?, completed_at = COALESCE(?, completed_at), version = version + 1, updated_at = ? WHERE id = ?",
                [status.into(), completed_at.into(), now.into(), po_id.into()],
            ))
            .await?;

        Ok(receipt_id)
    }

    pub async fn supplier_ledger(
        database: &DatabaseConnection,
        supplier_id: Uuid,
    ) -> Result<Vec<SupplierLedgerEntryResponse>, AppError> {
        ensure_supplier(database, supplier_id).await?;
        let rows = LedgerRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, supplier_id, branch_id, type AS entry_type, purchase_order_id, goods_receipt_id, money_transaction_id, debit, credit, balance_after, notes, occurred_at, created_at FROM supplier_ledger_entries WHERE supplier_id = ? ORDER BY occurred_at ASC, created_at ASC",
            [supplier_id.into()],
        ))
        .all(database)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| SupplierLedgerEntryResponse {
                id: row.id.to_string(),
                supplier_id: row.supplier_id.to_string(),
                branch_id: row.branch_id.to_string(),
                entry_type: row.entry_type,
                purchase_order_id: row.purchase_order_id.map(|v| v.to_string()),
                goods_receipt_id: row.goods_receipt_id.map(|v| v.to_string()),
                money_transaction_id: row.money_transaction_id.map(|v| v.to_string()),
                debit: decimal(row.debit),
                credit: decimal(row.credit),
                balance_after: decimal(row.balance_after),
                notes: row.notes,
                occurred_at: row.occurred_at.to_rfc3339(),
                created_at: row.created_at.to_rfc3339(),
            })
            .collect())
    }

    pub async fn supplier_payment(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        supplier_id: Uuid,
        request: &SupplierPaymentRequest,
    ) -> Result<SupplierPaymentResponse, AppError> {
        ensure_supplier(transaction, supplier_id).await?;
        let cash_session_id = context.require_cash_session()?;
        let now = now_utc();
        let amount = money_value(request.amount);
        let method = request.payment_method.trim().to_uppercase();
        if !matches!(method.as_str(), "CASH" | "CARD" | "BANK" | "MOBILE" | "OTHER") {
            return Err(AppError::Validation("Invalid paymentMethod.".into()));
        }
        let money_id = Uuid::new_v4();
        let ledger_id = Uuid::new_v4();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO money_transactions (id, branch_id, cash_session_id, direction, type, amount, payment_method, reference_type, reference_id, party_type, party_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, 'SUPPLIER_PAYMENT', ?, ?, 'Supplier', ?, 'SUPPLIER', ?, ?, ?, ?, ?)",
                [
                    money_id.into(),
                    context.branch_id.into(),
                    cash_session_id.into(),
                    PAYMENT_DIRECTION_OUT.into(),
                    amount.into(),
                    method.clone().into(),
                    supplier_id.into(),
                    supplier_id.into(),
                    trimmed(&request.notes).into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        let previous = BalanceRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT balance_after FROM supplier_ledger_entries WHERE supplier_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
            [supplier_id.into()],
        ))
        .one(transaction)
        .await?
        .map(|row| row.balance_after)
        .unwrap_or(Decimal::ZERO);
        let balance_after = previous - amount;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO supplier_ledger_entries (id, supplier_id, branch_id, type, purchase_order_id, goods_receipt_id, money_transaction_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, 0, ?, ?, ?, ?, ?, ?)",
                [
                    ledger_id.into(),
                    supplier_id.into(),
                    context.branch_id.into(),
                    LEDGER_PAYMENT.into(),
                    money_id.into(),
                    amount.into(),
                    balance_after.into(),
                    trimmed(&request.notes)
                        .unwrap_or_else(|| format!("Supplier payment {}", request.reference_number.as_deref().unwrap_or("")))
                        .into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        let _ = ERROR_PO_NOT_FOUND;
        Ok(SupplierPaymentResponse {
            id: ledger_id.to_string(),
            supplier_id: supplier_id.to_string(),
            amount: decimal(amount),
            payment_method: method,
            money_transaction_id: money_id.to_string(),
            balance_after: decimal(balance_after),
            occurred_at: now.to_rfc3339(),
        })
    }
}

struct PreparedReceive {
    po_item_id: Uuid,
    product_id: Uuid,
    unit_id: Uuid,
    unit_name: String,
    displayed: Decimal,
    base_qty: Decimal,
    cost_per_base: Decimal,
    line_total: Decimal,
    min: Decimal,
    wholesale: Decimal,
    retail: Decimal,
    expiry: Option<chrono::NaiveDate>,
}

fn po_conditions(
    query: &PurchaseOrderListQuery,
    id: Option<Uuid>,
) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["po.deleted_at IS NULL".to_owned()];
    let mut values = Vec::new();
    if let Some(id) = id {
        parts.push("po.id = ?".to_owned());
        values.push(id.into());
    }
    if let Some(supplier_id) = &query.supplier_id {
        parts.push("po.supplier_id = ?".to_owned());
        values.push(parse_uuid(supplier_id, "supplierId")?.into());
    }
    if let Some(branch_id) = &query.branch_id {
        parts.push("po.branch_id = ?".to_owned());
        values.push(parse_uuid(branch_id, "branchId")?.into());
    }
    if let Some(status) = &query.status {
        parts.push("po.status = ?".to_owned());
        values.push(status.trim().to_uppercase().into());
    }
    if let Some(search) = &query.page.search {
        parts.push("lower(po.order_number) LIKE ?".to_owned());
        values.push(format!("%{}%", search.to_lowercase()).into());
    }
    Ok((parts.join(" AND "), values))
}

async fn hydrate_po(
    database: &impl ConnectionTrait,
    row: PoHeader,
) -> Result<PurchaseOrderResponse, AppError> {
    let items = PoItemRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, product_id, unit_id, unit_name_snapshot, ordered_quantity, ordered_base_quantity, expected_unit_cost, received_base_quantity, line_total, notes FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY created_at ASC",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    Ok(PurchaseOrderResponse {
        id: row.id.to_string(),
        branch_id: row.branch_id.to_string(),
        supplier_id: row.supplier_id.to_string(),
        order_number: row.order_number,
        status: row.status,
        order_date: row.order_date.to_string(),
        expected_date: row.expected_date.map(|v| v.to_string()),
        subtotal: decimal(row.subtotal),
        discount: decimal(row.discount),
        tax: decimal(row.tax),
        total: decimal(row.total),
        notes: row.notes,
        items: items
            .into_iter()
            .map(|item| PurchaseOrderItemResponse {
                id: item.id.to_string(),
                product_id: item.product_id.to_string(),
                unit_id: item.unit_id.to_string(),
                unit_name: item.unit_name_snapshot,
                ordered_quantity: decimal(item.ordered_quantity),
                ordered_base_quantity: decimal(item.ordered_base_quantity),
                expected_unit_cost: decimal(item.expected_unit_cost),
                received_base_quantity: decimal(item.received_base_quantity),
                line_total: decimal(item.line_total),
                notes: item.notes,
            })
            .collect(),
        ordered_at: row.ordered_at.map(|v| v.to_rfc3339()),
        completed_at: row.completed_at.map(|v| v.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    })
}

async fn load_header(
    database: &impl ConnectionTrait,
    id: Uuid,
) -> Result<PoHeader, AppError> {
    PoHeader::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, branch_id, supplier_id, order_number, status, order_date, expected_date, subtotal, discount, tax, total, notes, ordered_at, completed_at, created_at, updated_at FROM purchase_orders WHERE id = ? AND deleted_at IS NULL LIMIT 1",
        [id.into()],
    ))
    .one(database)
    .await?
    .ok_or(AppError::NotFound(ERROR_PO_NOT_FOUND))
}

async fn load_unit(
    database: &impl ConnectionTrait,
    product_id: Uuid,
    unit_id: Uuid,
) -> Result<UnitRow, AppError> {
    UnitRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT display_name, conversion_to_base, minimum_price, wholesale_price, retail_price FROM product_units WHERE id = ? AND product_id = ? AND deleted_at IS NULL LIMIT 1",
        [unit_id.into(), product_id.into()],
    ))
    .one(database)
    .await?
    .ok_or(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND))
}

async fn ensure_supplier(database: &impl ConnectionTrait, id: Uuid) -> Result<(), AppError> {
    let row = database
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id FROM suppliers WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [id.into()],
        ))
        .await?;
    if row.is_none() {
        return Err(AppError::NotFound(ERROR_SUPPLIER_NOT_FOUND));
    }
    Ok(())
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
