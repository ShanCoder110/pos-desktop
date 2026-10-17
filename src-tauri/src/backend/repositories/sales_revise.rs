use rust_decimal::Decimal;
use sea_orm::{ConnectionTrait, DatabaseTransaction, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{
    accounting::line_gross_profit,
    constants::{
        ERROR_BELOW_MINIMUM, ERROR_INVOICE_ALREADY_VOIDED, ERROR_INVOICE_HAS_RETURNS,
        ERROR_INVOICE_NOT_FOUND, ERROR_REVISE_BELOW_ALLOCATED, ERROR_WALK_IN_CREDIT,
        INVOICE_STATUS_COMPLETED, LEDGER_SALE, MONEY_TYPE_SALE, MONEY_TYPE_VOID,
        PAYMENT_DIRECTION_IN, PAYMENT_DIRECTION_OUT, PAYMENT_STATUS_COMPLETED,
        PAYMENT_STATUS_CREDIT, PAYMENT_STATUS_PAID, PAYMENT_STATUS_PARTIAL,
        PAYMENT_STATUS_PARTIALLY_RETURNED, PAYMENT_STATUS_RETURNED, PAYMENT_STATUS_UNPAID,
        PAYMENT_STATUS_VOIDED, REFERENCE_INVOICE, STOCK_MOVEMENT_SALE,
    },
    context::RequestContext,
    dto::CompleteSaleRequest,
    errors::AppError,
    qty::to_base_qty,
    repositories::stock_allocation::{
        allocate_fifo_with_branch_fallback, ensure_demand_in_stock, StockAllocationOptions,
        StockDemand,
    },
    util::{money_value, now_utc, parse_optional_uuid, parse_uuid, quantity, trimmed},
};

use super::{
    reverse_invoice_ledger, ConsumptionRow, CustomerFlag, InvoiceHeader, PaymentRow, PreparedItem,
    ProductUnitRow,
};
use crate::backend::repositories::{LedgerEntryInput, LedgerParty, LedgerRepository};

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
    // Block fully / partially returned invoices (no net-of-return edit path).
    if header.payment_status == PAYMENT_STATUS_RETURNED
        || header.payment_status == PAYMENT_STATUS_PARTIALLY_RETURNED
        || returns > 0
    {
        return Err(AppError::Validation(ERROR_INVOICE_HAS_RETURNS.into()));
    }

    // Identical lines / payments / discounts / totals → skip reverse+repost so we
    // do not write net-zero ADJUSTMENT+SALE ledger pairs or churn stock/payments.
    if revise_request_is_noop(transaction, &header, invoice_id, request).await? {
        return Ok(());
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

    // Capture before void_payments — voided rows must not inflate "allocated".
    let allocated_paid = allocated_paid_on_invoice(transaction, &header, invoice_id).await?;

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
    reverse_invoice_ledger(
        transaction,
        header.branch_id,
        invoice_id,
        now,
        context,
        &format!("Revise invoice {invoice_id}"),
    )
    .await?;
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
            [REFERENCE_INVOICE.into(), invoice_id.into()],
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
    let mut demands = Vec::new();
    for item in &request.items {
        let product_id = parse_uuid(&item.product_id, "items.productId")?;
        let product_unit_id = parse_uuid(&item.product_unit_id, "items.productUnitId")?;
        let row = ProductUnitRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT p.name AS product_name, p.sku, pu.display_name AS unit_display_name, pu.conversion_to_base, pu.factor_direction, pu.minimum_price FROM products p JOIN product_units pu ON pu.product_id = p.id WHERE p.id = ? AND pu.id = ? AND p.deleted_at IS NULL AND pu.deleted_at IS NULL LIMIT 1",
            [product_id.into(), product_unit_id.into()],
        ))
        .one(transaction)
        .await?
        .ok_or(AppError::NotFound(crate::backend::constants::ERROR_PRODUCT_NOT_FOUND))?;

        let displayed = quantity(item.quantity);
        let base_quantity = to_base_qty(displayed, row.conversion_to_base, &row.factor_direction);
        let conversion = if displayed.is_zero() {
            quantity(row.conversion_to_base)
        } else {
            quantity(base_quantity / displayed)
        };
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
        demands.push(StockDemand {
            product_id,
            product_name: row.product_name.clone(),
            displayed,
            unit_name: row.unit_display_name.clone(),
            factor: row.conversion_to_base,
            direction: row.factor_direction.clone(),
            base_qty: base_quantity,
        });
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

    ensure_demand_in_stock(transaction, &demands).await?;

    let discount = money_value(request.discount);
    let tax = money_value(request.tax);
    let total = money_value(subtotal - discount + tax);
    let mut sale_tender_paid = Decimal::ZERO;
    let mut change_amount = Decimal::ZERO;
    for payment in &request.payments {
        sale_tender_paid += money_value(payment.amount);
        if let Some(tendered) = payment.amount_tendered {
            let tendered = money_value(tendered);
            let amount = money_value(payment.amount);
            if tendered > amount {
                change_amount += tendered - amount;
            }
        }
    }
    sale_tender_paid = money_value(sale_tender_paid);
    change_amount = money_value(change_amount);
    let sale_tender_applied = money_value(sale_tender_paid.min(total));

    // paid_amount may include later customer-payment allocations (no invoice payment
    // row). Preserve that slice; do not re-post it as a new cash tender.
    if total < allocated_paid {
        return Err(AppError::Validation(ERROR_REVISE_BELOW_ALLOCATED.into()));
    }
    let allocated_applied = money_value(allocated_paid.min(total - sale_tender_applied));
    let applied_paid = money_value(sale_tender_applied + allocated_applied);
    let credit_amount = money_value(total - applied_paid);
    // Ledger SALE is the credit taken at this sale/revise (total − tenders), not the
    // remaining open credit after allocations.
    let sale_ledger_debit = money_value(total - sale_tender_applied);
    if sale_ledger_debit > Decimal::ZERO && (customer_id.is_none() || is_walk_in) {
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

    let discount_base = money_value(
        prepared_items
            .iter()
            .map(|p| p.unit_price * p.displayed - p.discount)
            .sum::<Decimal>(),
    );
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
        let gross_profit = line_gross_profit(
            prepared.unit_price,
            prepared.displayed,
            prepared.discount,
            fifo_cost,
            discount,
            discount_base,
        );
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

    if sale_ledger_debit > Decimal::ZERO {
        if let Some(customer_id) = customer_id {
            let note = format!("Revised credit sale {invoice_id}");
            LedgerRepository::post_entry(
                transaction,
                LedgerEntryInput {
                    id: None,
                    party: LedgerParty::Customer(customer_id),
                    branch_id: context.branch_id,
                    entry_type: LEDGER_SALE,
                    debit: sale_ledger_debit,
                    credit: Decimal::ZERO,
                    notes: Some(&note),
                    occurred_at: now,
                    created_by: context.user_id,
                    purchase_order_id: None,
                    goods_receipt_id: None,
                    money_transaction_id: None,
                    invoice_id: Some(invoice_id),
                    payment_id: None,
                    return_id: None,
                },
            )
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

#[derive(Debug, FromQueryResult)]
struct ExistingItemRow {
    product_id: Uuid,
    product_unit_id: Option<Uuid>,
    displayed_quantity: Decimal,
    unit_price: Decimal,
    price_mode: String,
    discount: Decimal,
    tax: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct ExistingPaymentRow {
    amount: Decimal,
    payment_method: String,
    status: String,
}

/// True when revise would rewrite the same bill (customer, lines, payments, discount/tax/total).
async fn revise_request_is_noop(
    transaction: &DatabaseTransaction,
    header: &InvoiceHeader,
    invoice_id: Uuid,
    request: &CompleteSaleRequest,
) -> Result<bool, AppError> {
    let request_customer = parse_optional_uuid(request.customer_id.as_deref(), "customerId")?;
    if request_customer != header.customer_id {
        return Ok(false);
    }
    if money_value(request.discount) != money_value(header.discount) {
        return Ok(false);
    }
    if money_value(request.tax) != money_value(header.tax) {
        return Ok(false);
    }
    let request_notes = trimmed(&request.notes);
    if request_notes != header.notes {
        return Ok(false);
    }

    let existing_items = ExistingItemRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT product_id, product_unit_id, displayed_quantity, unit_price, price_mode, discount, tax FROM invoice_items WHERE invoice_id = ? ORDER BY created_at ASC, id ASC",
        [invoice_id.into()],
    ))
    .all(transaction)
    .await?;
    if existing_items.len() != request.items.len() {
        return Ok(false);
    }

    let mut existing_keys: Vec<(String, String, Decimal, Decimal, String, Decimal, Decimal)> =
        existing_items
            .into_iter()
            .map(|row| {
                (
                    row.product_id.to_string(),
                    row.product_unit_id
                        .map(|id| id.to_string())
                        .unwrap_or_default(),
                    quantity(row.displayed_quantity),
                    money_value(row.unit_price),
                    row.price_mode.trim().to_uppercase(),
                    money_value(row.discount),
                    money_value(row.tax),
                )
            })
            .collect();
    existing_keys.sort();

    let mut request_keys: Vec<(String, String, Decimal, Decimal, String, Decimal, Decimal)> =
        Vec::with_capacity(request.items.len());
    let mut request_subtotal = Decimal::ZERO;
    for item in &request.items {
        let product_id = parse_uuid(&item.product_id, "items.productId")?;
        let product_unit_id = parse_uuid(&item.product_unit_id, "items.productUnitId")?;
        let displayed = quantity(item.quantity);
        let unit_price = money_value(item.unit_price);
        let line_discount = money_value(item.discount);
        let line_tax = money_value(item.tax);
        let line_total = money_value(unit_price * displayed - line_discount + line_tax);
        request_subtotal += line_total;
        request_keys.push((
            product_id.to_string(),
            product_unit_id.to_string(),
            displayed,
            unit_price,
            item.price_mode.trim().to_uppercase(),
            line_discount,
            line_tax,
        ));
    }
    request_keys.sort();
    if existing_keys != request_keys {
        return Ok(false);
    }

    let request_total =
        money_value(request_subtotal - money_value(request.discount) + money_value(request.tax));
    if request_total != money_value(header.total) {
        return Ok(false);
    }

    let existing_payments = ExistingPaymentRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT amount, payment_method, status FROM payments WHERE invoice_id = ?",
        [invoice_id.into()],
    ))
    .all(transaction)
    .await?;
    let mut existing_pay_keys: Vec<(String, Decimal)> = existing_payments
        .iter()
        .filter(|row| row.status != PAYMENT_STATUS_VOIDED)
        .map(|row| {
            (
                row.payment_method.trim().to_uppercase(),
                money_value(row.amount),
            )
        })
        .collect();
    existing_pay_keys.sort();

    let mut request_pay_keys: Vec<(String, Decimal)> = request
        .payments
        .iter()
        .map(|payment| {
            (
                payment.payment_method.trim().to_uppercase(),
                money_value(payment.amount),
            )
        })
        .collect();
    request_pay_keys.sort();
    if existing_pay_keys != request_pay_keys {
        return Ok(false);
    }

    // Compare sale tenders only. header.paid_amount may also include later
    // customer-payment allocations that are not invoice payment rows.
    let existing_tender: Decimal = existing_payments
        .iter()
        .filter(|row| row.status != PAYMENT_STATUS_VOIDED)
        .fold(Decimal::ZERO, |sum, row| sum + money_value(row.amount));
    let existing_tender = money_value(existing_tender);
    let request_tender: Decimal = request.payments.iter().fold(Decimal::ZERO, |sum, payment| {
        sum + money_value(payment.amount)
    });
    let request_tender = money_value(request_tender.min(request_total));
    if request_tender != existing_tender.min(money_value(header.total)) {
        return Ok(false);
    }
    let allocated =
        money_value((money_value(header.paid_amount) - existing_tender).max(Decimal::ZERO));
    let effective_paid =
        money_value(request_tender + allocated.min(request_total - request_tender));
    let effective_credit = money_value(request_total - effective_paid);
    if effective_paid != money_value(header.paid_amount) {
        return Ok(false);
    }
    if effective_credit != money_value(header.credit_amount) {
        return Ok(false);
    }

    Ok(true)
}

/// Portion of invoice.paid_amount that came from later customer-payment allocation
/// (not from COMPLETED payments with this invoice_id).
async fn allocated_paid_on_invoice(
    transaction: &DatabaseTransaction,
    header: &InvoiceHeader,
    invoice_id: Uuid,
) -> Result<Decimal, AppError> {
    let tender_rows = ExistingPaymentRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT amount, payment_method, status FROM payments WHERE invoice_id = ?",
        [invoice_id.into()],
    ))
    .all(transaction)
    .await?;
    let tender: Decimal = tender_rows
        .into_iter()
        .filter(|row| row.status != PAYMENT_STATUS_VOIDED)
        .fold(Decimal::ZERO, |sum, row| sum + money_value(row.amount));
    let tender = money_value(tender);
    Ok(money_value(
        (money_value(header.paid_amount) - tender).max(Decimal::ZERO),
    ))
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
        [REFERENCE_INVOICE.into(), invoice_id.into()],
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
