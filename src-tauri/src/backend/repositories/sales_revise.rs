use rust_decimal::Decimal;
use sea_orm::{ConnectionTrait, DatabaseTransaction, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{
    constants::{
        ERROR_BELOW_MINIMUM, ERROR_INVOICE_ALREADY_VOIDED, ERROR_INVOICE_HAS_RETURNS,
        ERROR_INVOICE_NOT_FOUND, ERROR_WALK_IN_CREDIT, INVOICE_STATUS_COMPLETED, LEDGER_ADJUSTMENT,
        LEDGER_SALE, MONEY_TYPE_SALE, MONEY_TYPE_VOID, PAYMENT_DIRECTION_IN, PAYMENT_DIRECTION_OUT,
        PAYMENT_STATUS_COMPLETED, PAYMENT_STATUS_CREDIT, PAYMENT_STATUS_PAID,
        PAYMENT_STATUS_PARTIAL, PAYMENT_STATUS_UNPAID, PAYMENT_STATUS_VOIDED, REFERENCE_INVOICE,
        STOCK_MOVEMENT_SALE,
    },
    context::RequestContext,
    dto::CompleteSaleRequest,
    errors::AppError,
    repositories::stock_allocation::{allocate_fifo_with_branch_fallback, StockAllocationOptions},
    util::{money_value, now_utc, parse_optional_uuid, parse_uuid, quantity, trimmed},
};

use super::{
    BalanceRow, ConsumptionRow, CustomerFlag, InvoiceHeader, LedgerRow, PaymentRow, PreparedItem,
    ProductUnitRow,
};

#[derive(Debug, FromQueryResult)]
struct ReturnCountRow {
    count: i64,
}

pub async fn revise_invoice(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    invoice_id: Uuid,
    request: &CompleteSaleRequest,
) -> Result<(), AppError> {
    let header = InvoiceHeader::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, branch_id, customer_id, invoice_number, status, payment_status, subtotal, discount, tax, total, paid_amount, credit_amount, change_amount, notes, cashier_name_snapshot, client_request_id, completed_at, void_reason, voided_at, created_at, updated_at FROM invoices WHERE id = ? AND deleted_at IS NULL LIMIT 1",
        [invoice_id.into()],
    ))
    .one(transaction)
    .await?
    .ok_or(AppError::NotFound(ERROR_INVOICE_NOT_FOUND))?;
    if header.status != INVOICE_STATUS_COMPLETED || header.voided_at.is_some() {
        return Err(AppError::Conflict(ERROR_INVOICE_ALREADY_VOIDED.into()));
    }
    let returns = ReturnCountRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS count FROM sale_returns WHERE invoice_id = ? AND status = 'COMPLETED'",
        [invoice_id.into()],
    ))
    .one(transaction)
    .await?
    .map(|row| row.count)
    .unwrap_or(0);
    if returns > 0 {
        return Err(AppError::Conflict(ERROR_INVOICE_HAS_RETURNS.into()));
    }

    let before_json = serde_json::json!({
        "subtotal": header.subtotal,
        "discount": header.discount,
        "tax": header.tax,
        "total": header.total,
        "paidAmount": header.paid_amount,
        "creditAmount": header.credit_amount,
        "customerId": header.customer_id.map(|v| v.to_string()),
        "notes": header.notes,
    })
    .to_string();

    let now = now_utc();
    reverse_stock(
        transaction,
        context,
        invoice_id,
        &header,
        "Revise reverse",
        now,
    )
    .await?;
    reverse_ledger(transaction, &header, invoice_id, now, context).await?;
    void_payments(
        transaction,
        context,
        &header,
        invoice_id,
        "Invoice revised",
        now,
    )
    .await?;

    transaction
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM lot_consumptions WHERE reference_type = ? AND reference_id = ?",
            [REFERENCE_INVOICE.into(), invoice_id.to_string().into()],
        ))
        .await?;
    transaction
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM invoice_items WHERE invoice_id = ?",
            [invoice_id.into()],
        ))
        .await?;

    let customer_id = parse_optional_uuid(request.customer_id.as_deref(), "customerId")?;
    let mut is_walk_in = true;
    if let Some(customer_id) = customer_id {
        let flag = CustomerFlag::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT is_walk_in FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [customer_id.into()],
        ))
        .one(transaction)
        .await?
        .ok_or(AppError::NotFound(
            crate::backend::constants::ERROR_CUSTOMER_NOT_FOUND,
        ))?;
        is_walk_in = flag.is_walk_in != 0;
    }

    let mut subtotal = Decimal::ZERO;
    let mut prepared_items = Vec::new();
    for item in &request.items {
        let product_id = parse_uuid(&item.product_id, "items.productId")?;
        let product_unit_id = parse_uuid(&item.product_unit_id, "items.productUnitId")?;
        let row = ProductUnitRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT p.name AS product_name, p.sku, pu.display_name AS unit_display_name, pu.conversion_to_base, pu.minimum_price FROM products p JOIN product_units pu ON pu.product_id = p.id WHERE p.id = ? AND pu.id = ? AND p.deleted_at IS NULL AND pu.deleted_at IS NULL LIMIT 1",
            [product_id.into(), product_unit_id.into()],
        ))
        .one(transaction)
        .await?
        .ok_or(AppError::NotFound(crate::backend::constants::ERROR_PRODUCT_NOT_FOUND))?;

        let displayed = quantity(item.quantity);
        let conversion = quantity(row.conversion_to_base);
        let base_quantity = quantity(displayed * conversion);
        let unit_price = money_value(item.unit_price);
        let line_discount = money_value(item.discount);
        let line_tax = money_value(item.tax);
        let line_total = money_value(unit_price * displayed - line_discount + line_tax);
        let below_min = unit_price < row.minimum_price;
        if below_min && (!item.sold_below_minimum || trimmed(&item.authorized_by).is_none()) {
            return Err(AppError::Forbidden(ERROR_BELOW_MINIMUM));
        }
        let authorized_by = parse_optional_uuid(item.authorized_by.as_deref(), "authorizedBy")?;
        subtotal += line_total;
        prepared_items.push(PreparedItem {
            product_id,
            product_unit_id,
            product_name: row.product_name,
            sku: row.sku,
            unit_name: row.unit_display_name,
            displayed,
            conversion,
            base_quantity,
            unit_price,
            minimum_price: row.minimum_price,
            price_mode: item.price_mode.trim().to_uppercase(),
            sold_below_minimum: below_min || item.sold_below_minimum,
            authorized_by,
            discount: line_discount,
            tax: line_tax,
            line_total,
        });
    }

    let discount = money_value(request.discount);
    let tax = money_value(request.tax);
    let total = money_value(subtotal - discount + tax);
    let mut paid_amount = Decimal::ZERO;
    let mut change_amount = Decimal::ZERO;
    for payment in &request.payments {
        paid_amount += money_value(payment.amount);
        if let Some(tendered) = payment.amount_tendered {
            let tendered = money_value(tendered);
            let amount = money_value(payment.amount);
            if tendered > amount {
                change_amount += tendered - amount;
            }
        }
    }
    paid_amount = money_value(paid_amount);
    change_amount = money_value(change_amount);
    let applied_paid = money_value(paid_amount.min(total));
    let credit_amount = money_value(total - applied_paid);
    if credit_amount > Decimal::ZERO && (customer_id.is_none() || is_walk_in) {
        return Err(AppError::Validation(ERROR_WALK_IN_CREDIT.into()));
    }
    let payment_status = if credit_amount > Decimal::ZERO && applied_paid == Decimal::ZERO {
        PAYMENT_STATUS_CREDIT
    } else if credit_amount > Decimal::ZERO {
        PAYMENT_STATUS_PARTIAL
    } else if applied_paid == Decimal::ZERO {
        PAYMENT_STATUS_UNPAID
    } else {
        PAYMENT_STATUS_PAID
    };

    transaction
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE invoices SET customer_id = ?, status = ?, payment_status = ?, subtotal = ?, discount = ?, tax = ?, total = ?, paid_amount = ?, credit_amount = ?, change_amount = ?, notes = ?, version = version + 1, updated_at = ? WHERE id = ?",
            [
                customer_id.into(),
                INVOICE_STATUS_COMPLETED.into(),
                payment_status.into(),
                subtotal.into(),
                discount.into(),
                tax.into(),
                total.into(),
                applied_paid.into(),
                credit_amount.into(),
                change_amount.into(),
                trimmed(&request.notes).into(),
                now.into(),
                invoice_id.into(),
            ],
        ))
        .await?;

    for prepared in prepared_items {
        let item_id = Uuid::new_v4();
        let fifo = allocate_fifo_with_branch_fallback(
            transaction,
            context,
            StockAllocationOptions {
                selling_branch_id: context.branch_id,
                reference_id: invoice_id,
                product_id: prepared.product_id,
                needed: prepared.base_quantity,
                unit_name: &prepared.unit_name,
                displayed: prepared.displayed,
                movement_type: STOCK_MOVEMENT_SALE,
                reference_type: REFERENCE_INVOICE,
            },
        )
        .await?;
        let fifo_cost = money_value(fifo.fifo_cost);
        let gross_profit = money_value(prepared.line_total - fifo_cost);
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO invoice_items (id, invoice_id, product_id, product_unit_id, product_name, sku, unit_name, displayed_quantity, conversion_to_base, base_quantity, unit_price, minimum_price_snapshot, price_mode, sold_below_minimum, authorized_by, discount, tax, line_total, fifo_cost, gross_profit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    item_id.into(),
                    invoice_id.into(),
                    prepared.product_id.into(),
                    prepared.product_unit_id.into(),
                    prepared.product_name.into(),
                    prepared.sku.into(),
                    prepared.unit_name.into(),
                    prepared.displayed.into(),
                    prepared.conversion.into(),
                    prepared.base_quantity.into(),
                    prepared.unit_price.into(),
                    prepared.minimum_price.into(),
                    prepared.price_mode.into(),
                    (prepared.sold_below_minimum as i32).into(),
                    prepared.authorized_by.into(),
                    prepared.discount.into(),
                    prepared.tax.into(),
                    prepared.line_total.into(),
                    fifo_cost.into(),
                    gross_profit.into(),
                    now.into(),
                ],
            ))
            .await?;
    }

    let cash_session_id = if request.payments.is_empty() {
        context.cash_session_id
    } else {
        Some(context.require_cash_session()?)
    };

    for (index, payment) in request.payments.iter().enumerate() {
        let payment_id = Uuid::new_v4();
        let amount = money_value(payment.amount);
        let tendered = payment.amount_tendered.map(money_value);
        let payment_change = tendered
            .map(|value| money_value((value - amount).max(Decimal::ZERO)))
            .unwrap_or(Decimal::ZERO);
        let client_request_id = payment
            .client_request_id
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| format!("{}:revise:pay:{index}", request.client_request_id));
        let method = payment.payment_method.trim().to_uppercase();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO payments (id, branch_id, customer_id, invoice_id, cash_session_id, amount, amount_tendered, change_amount, payment_method, reference_number, direction, status, received_by, paid_at, notes, client_request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    payment_id.into(),
                    context.branch_id.into(),
                    customer_id.into(),
                    invoice_id.into(),
                    cash_session_id.into(),
                    amount.into(),
                    tendered.into(),
                    payment_change.into(),
                    method.clone().into(),
                    trimmed(&payment.reference_number).into(),
                    PAYMENT_DIRECTION_IN.into(),
                    PAYMENT_STATUS_COMPLETED.into(),
                    context.user_id.into(),
                    now.into(),
                    trimmed(&payment.notes).into(),
                    client_request_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO money_transactions (id, branch_id, cash_session_id, direction, type, amount, payment_method, reference_type, reference_id, party_type, party_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    Uuid::new_v4().into(),
                    context.branch_id.into(),
                    cash_session_id.into(),
                    PAYMENT_DIRECTION_IN.into(),
                    MONEY_TYPE_SALE.into(),
                    amount.into(),
                    method.into(),
                    REFERENCE_INVOICE.into(),
                    invoice_id.into(),
                    customer_id.map(|_| "CUSTOMER").into(),
                    customer_id.into(),
                    trimmed(&payment.notes).into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
    }

    if credit_amount > Decimal::ZERO {
        if let Some(customer_id) = customer_id {
            let previous = BalanceRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
                [customer_id.into()],
            ))
            .one(transaction)
            .await?
            .map(|row| row.balance_after)
            .unwrap_or(Decimal::ZERO);
            let balance_after = previous + credit_amount;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO customer_ledger_entries (id, customer_id, branch_id, type, invoice_id, payment_id, return_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 0, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        customer_id.into(),
                        context.branch_id.into(),
                        LEDGER_SALE.into(),
                        invoice_id.into(),
                        credit_amount.into(),
                        balance_after.into(),
                        format!("Revised credit sale {invoice_id}").into(),
                        now.into(),
                        context.user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE customers SET in_credit_book = 1, updated_at = ? WHERE id = ? AND is_walk_in = 0 AND deleted_at IS NULL",
                    [now.to_rfc3339().into(), customer_id.into()],
                ))
                .await?;
        }
    }

    let after_json = serde_json::json!({
        "subtotal": subtotal,
        "discount": discount,
        "tax": tax,
        "total": total,
        "paidAmount": applied_paid,
        "creditAmount": credit_amount,
        "customerId": customer_id.map(|v| v.to_string()),
        "notes": trimmed(&request.notes),
        "revisionClientRequestId": request.client_request_id,
    })
    .to_string();

    transaction
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO audit_logs (id, branch_id, user_id, device_id, entity_type, entity_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, ?, 'INVOICE', ?, 'REVISE', ?, ?, ?)",
            [
                Uuid::new_v4().into(),
                context.branch_id.into(),
                context.user_id.into(),
                context.device_id.into(),
                invoice_id.into(),
                before_json.into(),
                after_json.into(),
                now.into(),
            ],
        ))
        .await?;

    Ok(())
}

async fn reverse_stock(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    invoice_id: Uuid,
    _header: &InvoiceHeader,
    note: &str,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    let consumptions = ConsumptionRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT branch_id, product_id, product_lot_id, base_quantity, CAST(unit_cost AS REAL) AS unit_cost FROM lot_consumptions WHERE reference_type = ? AND reference_id = ?",
        [REFERENCE_INVOICE.into(), invoice_id.to_string().into()],
    ))
    .all(transaction)
    .await?;

    for consumption in consumptions {
        let movement_id = Uuid::new_v4();
        let total_cost = money_value(consumption.unit_cost * consumption.base_quantity);
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE branch_lots SET remaining_base_quantity = remaining_base_quantity + ?, updated_at = ? WHERE branch_id = ? AND product_lot_id = ?",
                [
                    consumption.base_quantity.into(),
                    now.into(),
                    consumption.branch_id.into(),
                    consumption.product_lot_id.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE product_lots SET remaining_base_quantity = remaining_base_quantity + ?, version = version + 1, updated_at = ? WHERE id = ?",
                [
                    consumption.base_quantity.into(),
                    now.into(),
                    consumption.product_lot_id.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    movement_id.into(),
                    consumption.branch_id.into(),
                    consumption.product_id.into(),
                    consumption.product_lot_id.into(),
                    STOCK_MOVEMENT_SALE.into(),
                    consumption.base_quantity.into(),
                    "base".into(),
                    consumption.base_quantity.into(),
                    consumption.unit_cost.into(),
                    total_cost.into(),
                    REFERENCE_INVOICE.into(),
                    invoice_id.into(),
                    note.into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
    }
    Ok(())
}

async fn reverse_ledger(
    transaction: &DatabaseTransaction,
    header: &InvoiceHeader,
    invoice_id: Uuid,
    now: chrono::DateTime<chrono::Utc>,
    context: &RequestContext,
) -> Result<(), AppError> {
    let ledgers = LedgerRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT customer_id, debit, credit FROM customer_ledger_entries WHERE invoice_id = ?",
        [invoice_id.into()],
    ))
    .all(transaction)
    .await?;
    for ledger in ledgers {
        let previous = BalanceRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
            [ledger.customer_id.into()],
        ))
        .one(transaction)
        .await?
        .map(|row| row.balance_after)
        .unwrap_or(Decimal::ZERO);
        let balance_after = previous - ledger.debit + ledger.credit;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO customer_ledger_entries (id, customer_id, branch_id, type, invoice_id, payment_id, return_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)",
                [
                    Uuid::new_v4().into(),
                    ledger.customer_id.into(),
                    header.branch_id.into(),
                    LEDGER_ADJUSTMENT.into(),
                    invoice_id.into(),
                    ledger.credit.into(),
                    ledger.debit.into(),
                    balance_after.into(),
                    format!("Revise invoice {invoice_id}").into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
    }
    Ok(())
}

async fn void_payments(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    header: &InvoiceHeader,
    invoice_id: Uuid,
    reason: &str,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    let payments = PaymentRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, amount, amount_tendered, change_amount, payment_method, reference_number, status, paid_at FROM payments WHERE invoice_id = ?",
        [invoice_id.into()],
    ))
    .all(transaction)
    .await?;
    for payment in payments {
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE payments SET status = ? WHERE id = ?",
                [PAYMENT_STATUS_VOIDED.into(), payment.id.into()],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO money_transactions (id, branch_id, cash_session_id, direction, type, amount, payment_method, reference_type, reference_id, party_type, party_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    Uuid::new_v4().into(),
                    header.branch_id.into(),
                    context.cash_session_id.into(),
                    PAYMENT_DIRECTION_OUT.into(),
                    MONEY_TYPE_VOID.into(),
                    payment.amount.into(),
                    payment.payment_method.into(),
                    REFERENCE_INVOICE.into(),
                    invoice_id.into(),
                    header.customer_id.map(|_| "CUSTOMER").into(),
                    header.customer_id.into(),
                    reason.into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
    }
    Ok(())
}
