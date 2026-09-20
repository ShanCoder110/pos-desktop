use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{
        ERROR_BELOW_MINIMUM, ERROR_HOLD_NOT_FOUND, ERROR_INVOICE_ALREADY_VOIDED,
        ERROR_INVOICE_NOT_FOUND, ERROR_WALK_IN_CREDIT, INVOICE_STATUS_CANCELLED,
        INVOICE_STATUS_COMPLETED, LEDGER_ADJUSTMENT, LEDGER_SALE, MONEY_TYPE_SALE, MONEY_TYPE_VOID,
        PAYMENT_DIRECTION_IN, PAYMENT_DIRECTION_OUT, PAYMENT_STATUS_COMPLETED,
        PAYMENT_STATUS_CREDIT, PAYMENT_STATUS_PAID, PAYMENT_STATUS_PARTIAL, PAYMENT_STATUS_UNPAID,
        PAYMENT_STATUS_VOIDED, REFERENCE_INVOICE, STOCK_MOVEMENT_SALE,
    },
    context::RequestContext,
    dto::{
        CompleteSaleRequest, HoldRequest, HoldResponse, InvoiceItemResponse, InvoiceListQuery,
        InvoicePaymentResponse, InvoiceResponse, PageQuery, VoidRequest,
    },
    errors::AppError,
    repositories::stock_allocation::{allocate_fifo_with_branch_fallback, StockAllocationOptions},
    util::{money_value, now_utc, parse_optional_uuid, parse_uuid, quantity, trimmed},
};

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct InvoiceIdRow {
    id: Uuid,
}

#[derive(Debug, FromQueryResult)]
struct ProductUnitRow {
    product_name: String,
    sku: String,
    unit_display_name: String,
    conversion_to_base: Decimal,
    minimum_price: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct CustomerFlag {
    is_walk_in: i64,
}

#[derive(Debug, FromQueryResult)]
struct BalanceRow {
    balance_after: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct InvoiceHeader {
    id: Uuid,
    branch_id: Uuid,
    customer_id: Option<Uuid>,
    invoice_number: String,
    status: String,
    payment_status: String,
    subtotal: Decimal,
    discount: Decimal,
    tax: Decimal,
    total: Decimal,
    paid_amount: Decimal,
    credit_amount: Decimal,
    change_amount: Decimal,
    notes: Option<String>,
    cashier_name_snapshot: String,
    client_request_id: String,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    void_reason: Option<String>,
    voided_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct InvoiceItemRow {
    id: Uuid,
    product_id: Uuid,
    product_unit_id: Option<Uuid>,
    product_name: String,
    sku: String,
    unit_name: String,
    displayed_quantity: Decimal,
    conversion_to_base: Decimal,
    base_quantity: Decimal,
    unit_price: Decimal,
    minimum_price_snapshot: Decimal,
    price_mode: String,
    sold_below_minimum: i64,
    authorized_by: Option<Uuid>,
    discount: Decimal,
    tax: Decimal,
    line_total: Decimal,
    fifo_cost: Decimal,
    gross_profit: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct PaymentRow {
    id: Uuid,
    amount: Decimal,
    amount_tendered: Option<Decimal>,
    change_amount: Decimal,
    payment_method: String,
    reference_number: Option<String>,
    status: String,
    paid_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct ConsumptionRow {
    branch_id: Uuid,
    product_id: Uuid,
    product_lot_id: Uuid,
    base_quantity: Decimal,
    unit_cost: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct LedgerRow {
    customer_id: Uuid,
    debit: Decimal,
    credit: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct HoldRow {
    id: Uuid,
    branch_id: Uuid,
    customer_id: Option<Uuid>,
    label: String,
    cart_json: String,
    held_by: Uuid,
    held_at: chrono::DateTime<chrono::Utc>,
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

pub struct SalesRepository;

impl SalesRepository {
    pub async fn find_by_client_request_id(
        database: &impl ConnectionTrait,
        client_request_id: &str,
    ) -> Result<Option<Uuid>, AppError> {
        Ok(InvoiceIdRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id FROM invoices WHERE client_request_id = ? AND deleted_at IS NULL LIMIT 1",
            [client_request_id.into()],
        ))
        .one(database)
        .await?
        .map(|row| row.id))
    }

    pub async fn complete(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        request: &CompleteSaleRequest,
        invoice_number: String,
    ) -> Result<Uuid, AppError> {
        let cash_session_id = context.require_cash_session()?;
        let now = now_utc();
        let invoice_id = Uuid::new_v4();
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
        if paid_amount > total + change_amount {
            // allow tendered change already separated; clamp paid to total for status
        }
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
                "INSERT INTO invoices (id, branch_id, customer_id, invoice_number, status, payment_status, subtotal, discount, tax, total, paid_amount, credit_amount, change_amount, notes, created_by, cashier_name_snapshot, device_id, client_request_id, completed_at, cancelled_at, void_reason, voided_by, voided_at, version, deleted_at, origin_device_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 1, NULL, ?, ?, ?)",
                [
                    invoice_id.into(),
                    context.branch_id.into(),
                    customer_id.into(),
                    invoice_number.into(),
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
                    context.user_id.into(),
                    context.name.clone().into(),
                    context.device_id.into(),
                    request.client_request_id.clone().into(),
                    now.into(),
                    context.device_id.into(),
                    now.into(),
                    now.into(),
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
                .unwrap_or_else(|| format!("{}:pay:{index}", request.client_request_id));
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
                            format!("Credit sale {invoice_id}").into(),
                            now.into(),
                            context.user_id.into(),
                            now.into(),
                        ],
                    ))
                    .await?;
            }
        }

        Ok(invoice_id)
    }

    pub async fn list(
        database: &DatabaseConnection,
        query: &InvoiceListQuery,
    ) -> Result<(Vec<InvoiceResponse>, u64), AppError> {
        let (conditions, values) = invoice_conditions(query, None)?;
        let count_sql = format!("SELECT COUNT(*) AS count FROM invoices i WHERE {conditions}");
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            count_sql,
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        let direction = query.page.sort_direction.unwrap_or_default().sql();
        let sql = format!(
            "SELECT id, branch_id, customer_id, invoice_number, status, payment_status, subtotal, discount, tax, total, paid_amount, credit_amount, change_amount, notes, cashier_name_snapshot, client_request_id, completed_at, void_reason, voided_at, created_at, updated_at FROM invoices i WHERE {conditions} ORDER BY i.created_at {direction}, i.id ASC LIMIT ? OFFSET ?"
        );
        let mut page_values = values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = InvoiceHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            page_values,
        ))
        .all(database)
        .await?;
        let mut responses = Vec::with_capacity(rows.len());
        for row in rows {
            responses.push(hydrate_invoice(database, row).await?);
        }
        Ok((responses, count))
    }

    pub async fn find(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<Option<InvoiceResponse>, AppError> {
        let query = InvoiceListQuery::default();
        let (conditions, values) = invoice_conditions(&query, Some(id))?;
        let sql = format!(
            "SELECT id, branch_id, customer_id, invoice_number, status, payment_status, subtotal, discount, tax, total, paid_amount, credit_amount, change_amount, notes, cashier_name_snapshot, client_request_id, completed_at, void_reason, voided_at, created_at, updated_at FROM invoices i WHERE {conditions} LIMIT 1"
        );
        let row = InvoiceHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            values,
        ))
        .one(database)
        .await?;
        match row {
            Some(row) => Ok(Some(hydrate_invoice(database, row).await?)),
            None => Ok(None),
        }
    }

    pub async fn void(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        invoice_id: Uuid,
        request: &VoidRequest,
    ) -> Result<(), AppError> {
        let header = InvoiceHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, branch_id, customer_id, invoice_number, status, payment_status, subtotal, discount, tax, total, paid_amount, credit_amount, change_amount, notes, cashier_name_snapshot, client_request_id, completed_at, void_reason, voided_at, created_at, updated_at FROM invoices WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [invoice_id.into()],
        ))
        .one(transaction)
        .await?
        .ok_or(AppError::NotFound(ERROR_INVOICE_NOT_FOUND))?;
        if header.status == INVOICE_STATUS_CANCELLED || header.voided_at.is_some() {
            return Err(AppError::Conflict(ERROR_INVOICE_ALREADY_VOIDED.into()));
        }
        let now = now_utc();
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
                        format!("Void reverse {}", request.reason).into(),
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
                        consumption.branch_id.into(),
                        consumption.product_id.into(),
                        consumption.product_lot_id.into(),
                        movement_id.into(),
                        "InvoiceVoid".into(),
                        invoice_id.into(),
                        consumption.base_quantity.into(),
                        consumption.unit_cost.into(),
                        total_cost.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

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
                        format!("Void invoice {invoice_id}").into(),
                        now.into(),
                        context.user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

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
                        request.reason.clone().into(),
                        now.into(),
                        context.user_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE invoices SET status = ?, payment_status = ?, void_reason = ?, voided_by = ?, voided_at = ?, cancelled_at = ?, version = version + 1, updated_at = ? WHERE id = ?",
                [
                    INVOICE_STATUS_CANCELLED.into(),
                    PAYMENT_STATUS_REFUNDED_PLACEHOLDER.into(),
                    request.reason.clone().into(),
                    context.user_id.into(),
                    now.into(),
                    now.into(),
                    now.into(),
                    invoice_id.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn list_holds(
        database: &DatabaseConnection,
        branch_id: Uuid,
        query: &PageQuery,
    ) -> Result<(Vec<HoldResponse>, u64), AppError> {
        let mut parts = vec!["branch_id = ?".to_owned()];
        let mut values: Vec<sea_orm::Value> = vec![branch_id.into()];
        if let Some(search) = &query.search {
            parts.push("lower(label) LIKE ?".to_owned());
            values.push(format!("%{}%", search.to_lowercase()).into());
        }
        let conditions = parts.join(" AND ");
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM held_sales WHERE {conditions}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        let sql = format!(
            "SELECT id, branch_id, customer_id, label, cart_json, held_by, held_at, expires_at, updated_at FROM held_sales WHERE {conditions} ORDER BY held_at DESC LIMIT ? OFFSET ?"
        );
        values.push((query.per_page as i64).into());
        values.push((query.offset() as i64).into());
        let rows = HoldRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            values,
        ))
        .all(database)
        .await?;
        Ok((
            rows.into_iter()
                .map(map_hold)
                .collect::<Result<Vec<_>, _>>()?,
            count,
        ))
    }

    pub async fn find_hold(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<Option<HoldResponse>, AppError> {
        let row = HoldRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, branch_id, customer_id, label, cart_json, held_by, held_at, expires_at, updated_at FROM held_sales WHERE id = ? LIMIT 1",
            [id.into()],
        ))
        .one(database)
        .await?;
        row.map(map_hold).transpose()
    }

    pub async fn create_hold(
        database: &DatabaseConnection,
        context: &RequestContext,
        request: &HoldRequest,
    ) -> Result<HoldResponse, AppError> {
        let id = Uuid::new_v4();
        let now = now_utc();
        let customer_id = parse_optional_uuid(request.customer_id.as_deref(), "customerId")?;
        let expires_at = request
            .expires_at
            .as_deref()
            .map(|value| {
                chrono::DateTime::parse_from_rfc3339(value)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .map_err(|_| AppError::Validation("expiresAt must be RFC3339.".into()))
            })
            .transpose()?;
        let payload = serde_json::to_string(&request.payload).map_err(AppError::internal)?;
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO held_sales (id, branch_id, customer_id, label, cart_json, held_by, held_at, expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    id.into(),
                    context.branch_id.into(),
                    customer_id.into(),
                    request.label.trim().to_owned().into(),
                    payload.into(),
                    context.user_id.into(),
                    now.into(),
                    expires_at.into(),
                    now.into(),
                ],
            ))
            .await?;
        Self::find_hold(database, id)
            .await?
            .ok_or_else(|| AppError::Internal("Hold insert vanished.".into()))
    }

    pub async fn update_hold(
        database: &DatabaseConnection,
        id: Uuid,
        request: &HoldRequest,
    ) -> Result<Option<HoldResponse>, AppError> {
        let existing = Self::find_hold(database, id).await?;
        if existing.is_none() {
            return Ok(None);
        }
        let now = now_utc();
        let customer_id = parse_optional_uuid(request.customer_id.as_deref(), "customerId")?;
        let expires_at = request
            .expires_at
            .as_deref()
            .map(|value| {
                chrono::DateTime::parse_from_rfc3339(value)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .map_err(|_| AppError::Validation("expiresAt must be RFC3339.".into()))
            })
            .transpose()?;
        let payload = serde_json::to_string(&request.payload).map_err(AppError::internal)?;
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE held_sales SET customer_id = ?, label = ?, cart_json = ?, expires_at = ?, updated_at = ? WHERE id = ?",
                [
                    customer_id.into(),
                    request.label.trim().to_owned().into(),
                    payload.into(),
                    expires_at.into(),
                    now.into(),
                    id.into(),
                ],
            ))
            .await?;
        Self::find_hold(database, id).await
    }

    pub async fn delete_hold(database: &DatabaseConnection, id: Uuid) -> Result<bool, AppError> {
        let result = database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "DELETE FROM held_sales WHERE id = ?",
                [id.into()],
            ))
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

struct PreparedItem {
    product_id: Uuid,
    product_unit_id: Uuid,
    product_name: String,
    sku: String,
    unit_name: String,
    displayed: Decimal,
    conversion: Decimal,
    base_quantity: Decimal,
    unit_price: Decimal,
    minimum_price: Decimal,
    price_mode: String,
    sold_below_minimum: bool,
    authorized_by: Option<Uuid>,
    discount: Decimal,
    tax: Decimal,
    line_total: Decimal,
}

fn invoice_conditions(
    query: &InvoiceListQuery,
    id: Option<Uuid>,
) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["i.deleted_at IS NULL".to_owned()];
    let mut values = Vec::new();
    if let Some(id) = id {
        parts.push("i.id = ?".to_owned());
        values.push(id.into());
    }
    if let Some(branch_id) = &query.branch_id {
        parts.push("i.branch_id = ?".to_owned());
        values.push(parse_uuid(branch_id, "branchId")?.into());
    }
    if let Some(customer_id) = &query.customer_id {
        parts.push("i.customer_id = ?".to_owned());
        values.push(parse_uuid(customer_id, "customerId")?.into());
    }
    if let Some(status) = &query.status {
        parts.push("i.status = ?".to_owned());
        values.push(status.trim().to_uppercase().into());
    }
    if let Some(payment_status) = &query.payment_status {
        parts.push("i.payment_status = ?".to_owned());
        values.push(payment_status.trim().to_uppercase().into());
    }
    if let Some(search) = &query.page.search {
        parts.push(
            "(lower(i.invoice_number) LIKE ? OR lower(i.cashier_name_snapshot) LIKE ?)".to_owned(),
        );
        let needle = format!("%{}%", search.to_lowercase());
        values.extend([needle.clone().into(), needle.into()]);
    }
    Ok((parts.join(" AND "), values))
}

async fn hydrate_invoice(
    database: &impl ConnectionTrait,
    row: InvoiceHeader,
) -> Result<InvoiceResponse, AppError> {
    let items = InvoiceItemRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, product_id, product_unit_id, product_name, sku, unit_name, displayed_quantity, conversion_to_base, base_quantity, unit_price, minimum_price_snapshot, price_mode, sold_below_minimum, authorized_by, discount, tax, line_total, fifo_cost, gross_profit FROM invoice_items WHERE invoice_id = ? ORDER BY created_at ASC",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    let payments = PaymentRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, amount, amount_tendered, change_amount, payment_method, reference_number, status, paid_at FROM payments WHERE invoice_id = ? ORDER BY paid_at ASC",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    Ok(InvoiceResponse {
        id: row.id.to_string(),
        branch_id: row.branch_id.to_string(),
        customer_id: row.customer_id.map(|value| value.to_string()),
        invoice_number: row.invoice_number,
        status: row.status,
        payment_status: row.payment_status,
        subtotal: decimal(row.subtotal),
        discount: decimal(row.discount),
        tax: decimal(row.tax),
        total: decimal(row.total),
        paid_amount: decimal(row.paid_amount),
        credit_amount: decimal(row.credit_amount),
        change_amount: decimal(row.change_amount),
        notes: row.notes,
        cashier_name: row.cashier_name_snapshot,
        client_request_id: row.client_request_id,
        items: items
            .into_iter()
            .map(|item| InvoiceItemResponse {
                id: item.id.to_string(),
                product_id: item.product_id.to_string(),
                product_unit_id: item.product_unit_id.map(|value| value.to_string()),
                product_name: item.product_name,
                sku: item.sku,
                unit_name: item.unit_name,
                displayed_quantity: decimal(item.displayed_quantity),
                conversion_to_base: decimal(item.conversion_to_base),
                base_quantity: decimal(item.base_quantity),
                unit_price: decimal(item.unit_price),
                minimum_price_snapshot: decimal(item.minimum_price_snapshot),
                price_mode: item.price_mode,
                sold_below_minimum: item.sold_below_minimum != 0,
                authorized_by: item.authorized_by.map(|value| value.to_string()),
                discount: decimal(item.discount),
                tax: decimal(item.tax),
                line_total: decimal(item.line_total),
                fifo_cost: decimal(item.fifo_cost),
                gross_profit: decimal(item.gross_profit),
            })
            .collect(),
        payments: payments
            .into_iter()
            .map(|payment| InvoicePaymentResponse {
                id: payment.id.to_string(),
                amount: decimal(payment.amount),
                amount_tendered: payment.amount_tendered.map(decimal),
                change_amount: decimal(payment.change_amount),
                payment_method: payment.payment_method,
                reference_number: payment.reference_number,
                status: payment.status,
                paid_at: payment.paid_at.to_rfc3339(),
            })
            .collect(),
        completed_at: row.completed_at.map(|value| value.to_rfc3339()),
        void_reason: row.void_reason,
        voided_at: row.voided_at.map(|value| value.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    })
}

fn map_hold(row: HoldRow) -> Result<HoldResponse, AppError> {
    let payload = serde_json::from_str(&row.cart_json).unwrap_or(serde_json::Value::Null);
    Ok(HoldResponse {
        id: row.id.to_string(),
        branch_id: row.branch_id.to_string(),
        customer_id: row.customer_id.map(|value| value.to_string()),
        label: row.label,
        payload,
        held_by: row.held_by.to_string(),
        held_at: row.held_at.to_rfc3339(),
        expires_at: row.expires_at.map(|value| value.to_rfc3339()),
        updated_at: row.updated_at.to_rfc3339(),
    })
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}

const PAYMENT_STATUS_REFUNDED_PLACEHOLDER: &str = "REFUNDED";

#[allow(dead_code)]
fn hold_not_found() -> AppError {
    AppError::NotFound(ERROR_HOLD_NOT_FOUND)
}
