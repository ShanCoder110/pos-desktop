use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{
        ERROR_CLAIM_NOT_FOUND, ERROR_CUSTOMER_NOT_FOUND, ERROR_INSUFFICIENT_STOCK,
        ERROR_INVOICE_NOT_FOUND, ERROR_PRODUCT_NOT_FOUND, ERROR_RETURN_NOT_FOUND,
        LEDGER_PAYMENT_MADE, LEDGER_PAYMENT_RECEIVED, LOT_SOURCE_RETURN, PAYMENT_DIRECTION_IN,
        PAYMENT_DIRECTION_OUT, PAYMENT_STATUS_COMPLETED, REFERENCE_RETURN,
        STOCK_MOVEMENT_REPLACEMENT, STOCK_MOVEMENT_RETURN,
    },
    context::RequestContext,
    dto::{
        ClaimItemResponse, ClaimListQuery, ClaimResponse, ClaimStatusHistoryResponse,
        CreateClaimRequest, CreateReturnRequest, CustomerLedgerEntryResponse,
        CustomerLedgerListQuery, CustomerLedgerResponse, CustomerPaymentRequest,
        CustomerPaymentResponse, ReturnItemResponse, ReturnListQuery, ReturnResponse,
    },
    errors::AppError,
    util::{money_value, now_utc, parse_optional_uuid, parse_uuid, quantity, trimmed},
};

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct BalanceRow {
    balance_after: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct LedgerRow {
    id: Uuid,
    customer_id: Uuid,
    branch_id: Uuid,
    entry_type: String,
    invoice_id: Option<Uuid>,
    payment_id: Option<Uuid>,
    return_id: Option<Uuid>,
    debit: Decimal,
    credit: Decimal,
    balance_after: Decimal,
    notes: Option<String>,
    occurred_at: chrono::DateTime<chrono::Utc>,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct CustomerLedgerListRow {
    id: Uuid,
    customer_id: Uuid,
    customer_name: String,
    branch_id: Uuid,
    entry_type: String,
    invoice_id: Option<Uuid>,
    payment_id: Option<Uuid>,
    return_id: Option<Uuid>,
    debit: Decimal,
    credit: Decimal,
    balance_after: Decimal,
    notes: Option<String>,
    occurred_at: chrono::DateTime<chrono::Utc>,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct InvoiceMeta {
    branch_id: Uuid,
    customer_id: Option<Uuid>,
}

#[derive(Debug, FromQueryResult)]
struct InvoiceItemMeta {
    product_id: Uuid,
    conversion_to_base: Decimal,
    unit_name: String,
}

#[derive(Debug, FromQueryResult)]
struct UnitMeta {
    display_name: String,
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
struct ReturnHeader {
    id: Uuid,
    return_number: String,
    invoice_id: Uuid,
    branch_id: Uuid,
    customer_id: Option<Uuid>,
    return_type: String,
    status: String,
    reason: String,
    notes: Option<String>,
    refund_amount: Decimal,
    created_at: chrono::DateTime<chrono::Utc>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, FromQueryResult)]
struct ReturnItemRow {
    id: Uuid,
    invoice_item_id: Uuid,
    product_id: Uuid,
    displayed_quantity: Decimal,
    base_quantity: Decimal,
    condition: String,
    refund_amount: Decimal,
    restock_action: String,
}

#[derive(Debug, FromQueryResult)]
struct ClaimHeader {
    id: Uuid,
    claim_number: String,
    invoice_id: Option<Uuid>,
    customer_id: Option<Uuid>,
    branch_id: Uuid,
    supplier_id: Option<Uuid>,
    status: String,
    problem: String,
    diagnosis: Option<String>,
    resolution: Option<String>,
    received_at: chrono::DateTime<chrono::Utc>,
    resolved_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct ClaimItemRow {
    id: Uuid,
    product_id: Uuid,
    product_lot_id: Option<Uuid>,
    serial_number: Option<String>,
    quantity: Decimal,
    condition: String,
    action: String,
    cost: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct ClaimHistoryRow {
    id: Uuid,
    from_status: Option<String>,
    to_status: String,
    notes: Option<String>,
    changed_by: Uuid,
    changed_at: chrono::DateTime<chrono::Utc>,
}

pub struct CreditRepository;

impl CreditRepository {
    pub async fn customer_ledger(
        database: &DatabaseConnection,
        customer_id: Uuid,
    ) -> Result<CustomerLedgerResponse, AppError> {
        ensure_customer(database, customer_id).await?;
        let rows = LedgerRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, customer_id, branch_id, type AS entry_type, invoice_id, payment_id, return_id, debit, credit, balance_after, notes, occurred_at, created_at FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at ASC, created_at ASC",
            [customer_id.into()],
        ))
        .all(database)
        .await?;
        let balance = rows
            .last()
            .map(|row| row.balance_after)
            .unwrap_or(Decimal::ZERO);
        Ok(CustomerLedgerResponse {
            customer_id: customer_id.to_string(),
            balance: decimal(balance),
            entries: rows
                .into_iter()
                .map(|row| CustomerLedgerEntryResponse {
                    id: row.id.to_string(),
                    customer_id: row.customer_id.to_string(),
                    customer_name: None,
                    branch_id: row.branch_id.to_string(),
                    entry_type: row.entry_type,
                    invoice_id: row.invoice_id.map(|v| v.to_string()),
                    payment_id: row.payment_id.map(|v| v.to_string()),
                    return_id: row.return_id.map(|v| v.to_string()),
                    debit: decimal(row.debit),
                    credit: decimal(row.credit),
                    balance_after: decimal(row.balance_after),
                    notes: row.notes,
                    occurred_at: row.occurred_at.to_rfc3339(),
                    created_at: row.created_at.to_rfc3339(),
                })
                .collect(),
        })
    }

    pub async fn customer_payment(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        customer_id: Uuid,
        request: &CustomerPaymentRequest,
    ) -> Result<CustomerPaymentResponse, AppError> {
        ensure_customer(transaction, customer_id).await?;
        let cash_session_id = context.require_cash_session()?;
        let now = now_utc();
        let amount = money_value(request.amount);
        let method = request.payment_method.trim().to_uppercase();
        if !matches!(
            method.as_str(),
            "CASH" | "CARD" | "BANK" | "MOBILE" | "OTHER"
        ) {
            return Err(AppError::Validation("Invalid paymentMethod.".into()));
        }
        let payment_id = Uuid::new_v4();
        let money_id = Uuid::new_v4();
        let ledger_id = Uuid::new_v4();
        let client_request_id = request
            .client_request_id
            .clone()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| format!("cust-pay-{payment_id}"));
        let previous = BalanceRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT CAST(balance_after AS REAL) AS balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
            [customer_id.into()],
        ))
        .one(transaction)
        .await?
        .map(|row| row.balance_after)
        .unwrap_or(Decimal::ZERO);
        // Positive balance = customer owes (collect). Negative = advance (refund).
        let collecting = previous >= Decimal::ZERO;
        let (direction, entry_type, debit, credit, balance_after) = if collecting {
            (
                PAYMENT_DIRECTION_IN,
                LEDGER_PAYMENT_RECEIVED,
                Decimal::ZERO,
                amount,
                previous - amount,
            )
        } else {
            (
                PAYMENT_DIRECTION_OUT,
                LEDGER_PAYMENT_MADE,
                amount,
                Decimal::ZERO,
                previous + amount,
            )
        };

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO payments (id, branch_id, customer_id, invoice_id, cash_session_id, amount, amount_tendered, change_amount, payment_method, reference_number, direction, status, received_by, paid_at, notes, client_request_id, created_at) VALUES (?, ?, ?, NULL, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    payment_id.into(),
                    context.branch_id.into(),
                    customer_id.into(),
                    cash_session_id.into(),
                    amount.into(),
                    method.clone().into(),
                    trimmed(&request.reference_number).into(),
                    direction.into(),
                    PAYMENT_STATUS_COMPLETED.into(),
                    context.user_id.into(),
                    now.into(),
                    trimmed(&request.notes).into(),
                    client_request_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO money_transactions (id, branch_id, cash_session_id, direction, type, amount, payment_method, reference_type, reference_id, party_type, party_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, 'CUSTOMER_PAYMENT', ?, ?, 'Payment', ?, 'CUSTOMER', ?, ?, ?, ?, ?)",
                [
                    money_id.into(),
                    context.branch_id.into(),
                    cash_session_id.into(),
                    direction.into(),
                    amount.into(),
                    method.clone().into(),
                    payment_id.into(),
                    customer_id.into(),
                    trimmed(&request.notes).into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO customer_ledger_entries (id, customer_id, branch_id, type, invoice_id, payment_id, return_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?)",
                [
                    ledger_id.into(),
                    customer_id.into(),
                    context.branch_id.into(),
                    entry_type.into(),
                    payment_id.into(),
                    debit.into(),
                    credit.into(),
                    balance_after.into(),
                    trimmed(&request.notes)
                        .unwrap_or_else(|| {
                            if collecting {
                                "Customer payment".into()
                            } else {
                                "Customer refund".into()
                            }
                        })
                        .into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(CustomerPaymentResponse {
            id: payment_id.to_string(),
            customer_id: customer_id.to_string(),
            amount: decimal(amount),
            payment_method: method,
            money_transaction_id: money_id.to_string(),
            balance_after: decimal(balance_after),
            occurred_at: now.to_rfc3339(),
        })
    }

    pub async fn list_customer_ledgers(
        database: &DatabaseConnection,
        query: &CustomerLedgerListQuery,
    ) -> Result<(Vec<CustomerLedgerEntryResponse>, u64), AppError> {
        let page = query.page.clone().normalized();
        let mut parts = vec!["1 = 1".to_owned()];
        let mut values = Vec::new();
        if let Some(search) = &page.search {
            let pattern = format!("%{}%", search.to_lowercase());
            parts.push("(lower(c.name) LIKE ? OR lower(cle.type) LIKE ? OR lower(COALESCE(cle.notes, '')) LIKE ?)".to_owned());
            values.push(pattern.clone().into());
            values.push(pattern.clone().into());
            values.push(pattern.into());
        }
        if let Some(customer) = query
            .customer
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push("lower(c.name) LIKE ?".to_owned());
            values.push(format!("%{}%", customer.to_lowercase()).into());
        }
        if let Some(entry_type) = query
            .entry_type
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push("cle.type = ?".to_owned());
            values.push(entry_type.to_uppercase().into());
        }
        if let Some(notes) = page.notes.as_deref() {
            parts.push("lower(COALESCE(cle.notes, '')) LIKE ?".to_owned());
            values.push(format!("%{}%", notes.to_lowercase()).into());
        }
        if let Some(balance) = page.balance.as_deref() {
            match balance.to_ascii_lowercase().as_str() {
                "payable" | "owes" => parts.push("cle.balance_after > 0".to_owned()),
                "advance" => parts.push("cle.balance_after < 0".to_owned()),
                "settled" => parts.push("cle.balance_after = 0".to_owned()),
                _ => {}
            }
        }
        if let Some(debit) = query.debit {
            parts.push("cle.debit >= ?".to_owned());
            values.push(debit.into());
        }
        if let Some(credit) = query.credit {
            parts.push("cle.credit >= ?".to_owned());
            values.push(credit.into());
        }
        if let Some(from) = query
            .occurred_from
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push("date(cle.occurred_at) >= date(?)".to_owned());
            values.push(from.into());
        }
        if let Some(to) = query
            .occurred_to
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push("date(cle.occurred_at) <= date(?)".to_owned());
            values.push(to.into());
        }
        let where_sql = parts.join(" AND ");
        let count_sql = format!(
            "SELECT COUNT(*) AS count FROM customer_ledger_entries cle INNER JOIN customers c ON c.id = cle.customer_id WHERE {where_sql}"
        );
        let total = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            count_sql,
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| row.count.max(0) as u64)
        .unwrap_or(0);
        let sql = format!(
            "SELECT cle.id, cle.customer_id, c.name AS customer_name, cle.branch_id, cle.type AS entry_type, cle.invoice_id, cle.payment_id, cle.return_id, CAST(cle.debit AS REAL) AS debit, CAST(cle.credit AS REAL) AS credit, CAST(cle.balance_after AS REAL) AS balance_after, cle.notes, cle.occurred_at, cle.created_at FROM customer_ledger_entries cle INNER JOIN customers c ON c.id = cle.customer_id WHERE {where_sql} ORDER BY cle.created_at DESC, cle.id DESC LIMIT ? OFFSET ?"
        );
        let mut page_values = values;
        page_values.push((page.per_page as i64).into());
        page_values.push((page.offset() as i64).into());
        let rows = CustomerLedgerListRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            page_values,
        ))
        .all(database)
        .await?;
        Ok((
            rows.into_iter()
                .map(|row| CustomerLedgerEntryResponse {
                    id: row.id.to_string(),
                    customer_id: row.customer_id.to_string(),
                    customer_name: Some(row.customer_name),
                    branch_id: row.branch_id.to_string(),
                    entry_type: row.entry_type,
                    invoice_id: row.invoice_id.map(|value| value.to_string()),
                    payment_id: row.payment_id.map(|value| value.to_string()),
                    return_id: row.return_id.map(|value| value.to_string()),
                    debit: decimal(row.debit),
                    credit: decimal(row.credit),
                    balance_after: decimal(row.balance_after),
                    notes: row.notes,
                    occurred_at: row.occurred_at.to_rfc3339(),
                    created_at: row.created_at.to_rfc3339(),
                })
                .collect(),
            total,
        ))
    }

    pub async fn list_returns(
        database: &DatabaseConnection,
        query: &ReturnListQuery,
    ) -> Result<(Vec<ReturnResponse>, u64), AppError> {
        let (conditions, values) = return_conditions(query, None)?;
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM sale_returns sr WHERE {conditions}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        let mut page_values = values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = ReturnHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, return_number, invoice_id, branch_id, customer_id, type AS return_type, status, reason, notes, refund_amount, created_at, completed_at FROM sale_returns sr WHERE {conditions} ORDER BY sr.created_at DESC LIMIT ? OFFSET ?"
            ),
            page_values,
        ))
        .all(database)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(hydrate_return(database, row).await?);
        }
        Ok((out, count))
    }

    pub async fn find_return(
        database: &impl ConnectionTrait,
        id: Uuid,
    ) -> Result<Option<ReturnResponse>, AppError> {
        let row = ReturnHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, return_number, invoice_id, branch_id, customer_id, type AS return_type, status, reason, notes, refund_amount, created_at, completed_at FROM sale_returns WHERE id = ? LIMIT 1",
            [id.into()],
        ))
        .one(database)
        .await?;
        match row {
            Some(row) => Ok(Some(hydrate_return(database, row).await?)),
            None => Ok(None),
        }
    }

    pub async fn create_return(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        request: &CreateReturnRequest,
        return_number: String,
    ) -> Result<Uuid, AppError> {
        let invoice_id = parse_uuid(&request.invoice_id, "invoiceId")?;
        let invoice = InvoiceMeta::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT branch_id, customer_id FROM invoices WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [invoice_id.into()],
        ))
        .one(transaction)
        .await?
        .ok_or(AppError::NotFound(ERROR_INVOICE_NOT_FOUND))?;
        let now = now_utc();
        let return_id = Uuid::new_v4();
        let return_type = request.return_type.trim().to_uppercase();
        let mut refund_total = Decimal::ZERO;

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO sale_returns (id, return_number, invoice_id, branch_id, customer_id, type, status, reason, notes, refund_amount, created_by, approved_by, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, 0, ?, NULL, ?, ?)",
                [
                    return_id.into(),
                    return_number.into(),
                    invoice_id.into(),
                    invoice.branch_id.into(),
                    invoice.customer_id.into(),
                    return_type.clone().into(),
                    request.reason.trim().to_owned().into(),
                    trimmed(&request.notes).into(),
                    context.user_id.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;

        for item in &request.items {
            let invoice_item_id = parse_uuid(&item.invoice_item_id, "items.invoiceItemId")?;
            let meta = InvoiceItemMeta::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT product_id, conversion_to_base, unit_name FROM invoice_items WHERE id = ? AND invoice_id = ? LIMIT 1",
                [invoice_item_id.into(), invoice_id.into()],
            ))
            .one(transaction)
            .await?
            .ok_or(AppError::Validation("Invoice item not found on invoice.".into()))?;
            let displayed = quantity(item.quantity);
            let base_qty = quantity(displayed * meta.conversion_to_base);
            let condition = item.condition.trim().to_uppercase();
            let refund_amount = money_value(item.refund_amount);
            refund_total += refund_amount;
            let restock = if condition == "GOOD" && return_type == "REFUND" {
                "RESTOCK"
            } else {
                "NO_RESTOCK"
            };
            let original_lot = parse_optional_uuid(
                item.original_product_lot_id.as_deref(),
                "originalProductLotId",
            )?;
            let mut movement_id: Option<Uuid> = None;

            if restock == "RESTOCK" {
                let lot_id = if let Some(lot_id) = original_lot {
                    lot_id
                } else {
                    // create return lot
                    let new_lot = Uuid::new_v4();
                    transaction
                        .execute_raw(Statement::from_sql_and_values(
                            DbBackend::Sqlite,
                            "INSERT INTO product_lots (id, product_id, supplier_id, goods_receipt_item_id, production_job_id, lot_number, source_type, original_base_quantity, remaining_base_quantity, damaged_base_quantity, purchase_price_per_base, received_date, expiry_date, created_by, version, deleted_at, origin_device_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, ?, 0, 0, ?, NULL, ?, 1, NULL, ?, ?, ?)",
                            [
                                new_lot.into(),
                                meta.product_id.into(),
                                format!("RET-{}", &return_id.to_string()[..8]).into(),
                                LOT_SOURCE_RETURN.into(),
                                base_qty.into(),
                                base_qty.into(),
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
                                invoice.branch_id.into(),
                                new_lot.into(),
                                base_qty.into(),
                                base_qty.into(),
                                now.into(),
                            ],
                        ))
                        .await?;
                    new_lot
                };

                if original_lot.is_some() {
                    transaction
                        .execute_raw(Statement::from_sql_and_values(
                            DbBackend::Sqlite,
                            "UPDATE product_lots SET remaining_base_quantity = remaining_base_quantity + ?, version = version + 1, updated_at = ? WHERE id = ?",
                            [base_qty.into(), now.into(), lot_id.into()],
                        ))
                        .await?;
                    let updated = transaction
                        .execute_raw(Statement::from_sql_and_values(
                            DbBackend::Sqlite,
                            "UPDATE branch_lots SET remaining_base_quantity = remaining_base_quantity + ?, updated_at = ? WHERE branch_id = ? AND product_lot_id = ?",
                            [
                                base_qty.into(),
                                now.into(),
                                invoice.branch_id.into(),
                                lot_id.into(),
                            ],
                        ))
                        .await?;
                    if updated.rows_affected() == 0 {
                        transaction
                            .execute_raw(Statement::from_sql_and_values(
                                DbBackend::Sqlite,
                                "INSERT INTO branch_lots (id, branch_id, product_lot_id, allocated_base_quantity, remaining_base_quantity, reserved_base_quantity, damaged_base_quantity, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
                                [
                                    Uuid::new_v4().into(),
                                    invoice.branch_id.into(),
                                    lot_id.into(),
                                    base_qty.into(),
                                    base_qty.into(),
                                    now.into(),
                                ],
                            ))
                            .await?;
                    }
                }

                let mid = Uuid::new_v4();
                movement_id = Some(mid);
                transaction
                    .execute_raw(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)",
                        [
                            mid.into(),
                            invoice.branch_id.into(),
                            meta.product_id.into(),
                            lot_id.into(),
                            STOCK_MOVEMENT_RETURN.into(),
                            displayed.into(),
                            meta.unit_name.clone().into(),
                            base_qty.into(),
                            REFERENCE_RETURN.into(),
                            return_id.into(),
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
                    "INSERT INTO sale_return_items (id, sale_return_id, invoice_item_id, product_id, original_product_lot_id, displayed_quantity, base_quantity, condition, refund_amount, restock_action, stock_movement_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        return_id.into(),
                        invoice_item_id.into(),
                        meta.product_id.into(),
                        original_lot.into(),
                        displayed.into(),
                        base_qty.into(),
                        condition.into(),
                        refund_amount.into(),
                        restock.into(),
                        movement_id.into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

        if return_type == "REPLACEMENT" {
            for replacement in &request.replacements {
                let product_id = parse_uuid(&replacement.product_id, "replacements.productId")?;
                let product_unit_id =
                    parse_uuid(&replacement.product_unit_id, "replacements.productUnitId")?;
                let unit = UnitMeta::find_by_statement(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "SELECT display_name, conversion_to_base FROM product_units WHERE id = ? AND product_id = ? AND deleted_at IS NULL LIMIT 1",
                    [product_unit_id.into(), product_id.into()],
                ))
                .one(transaction)
                .await?
                .ok_or(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND))?;
                let displayed = quantity(replacement.quantity);
                let base_qty = quantity(displayed * unit.conversion_to_base);
                let unit_price = money_value(replacement.unit_price);
                let movement_id = allocate_fifo(
                    transaction,
                    context,
                    invoice.branch_id,
                    return_id,
                    product_id,
                    base_qty,
                    &unit.display_name,
                    displayed,
                    STOCK_MOVEMENT_REPLACEMENT,
                )
                .await?;
                transaction
                    .execute_raw(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "INSERT INTO replacement_items (id, sale_return_id, product_id, product_unit_id, displayed_quantity, base_quantity, unit_price, invoice_item_lot_id, stock_movement_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
                        [
                            Uuid::new_v4().into(),
                            return_id.into(),
                            product_id.into(),
                            product_unit_id.into(),
                            displayed.into(),
                            base_qty.into(),
                            unit_price.into(),
                            movement_id.into(),
                            now.into(),
                        ],
                    ))
                    .await?;
            }
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE sale_returns SET refund_amount = ?, completed_at = ? WHERE id = ?",
                [
                    money_value(refund_total).into(),
                    now.into(),
                    return_id.into(),
                ],
            ))
            .await?;

        let _ = ERROR_RETURN_NOT_FOUND;
        Ok(return_id)
    }

    pub async fn list_claims(
        database: &DatabaseConnection,
        query: &ClaimListQuery,
    ) -> Result<(Vec<ClaimResponse>, u64), AppError> {
        let (conditions, values) = claim_conditions(query, None)?;
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT COUNT(*) AS count FROM warranty_claims wc WHERE {conditions}"),
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);
        let mut page_values = values;
        page_values.push((query.page.per_page as i64).into());
        page_values.push((query.page.offset() as i64).into());
        let rows = ClaimHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!(
                "SELECT id, claim_number, invoice_id, customer_id, branch_id, supplier_id, status, problem, diagnosis, resolution, received_at, resolved_at, created_at, updated_at FROM warranty_claims wc WHERE {conditions} ORDER BY wc.created_at DESC LIMIT ? OFFSET ?"
            ),
            page_values,
        ))
        .all(database)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(hydrate_claim(database, row).await?);
        }
        Ok((out, count))
    }

    pub async fn find_claim(
        database: &impl ConnectionTrait,
        id: Uuid,
    ) -> Result<Option<ClaimResponse>, AppError> {
        let row = ClaimHeader::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, claim_number, invoice_id, customer_id, branch_id, supplier_id, status, problem, diagnosis, resolution, received_at, resolved_at, created_at, updated_at FROM warranty_claims WHERE id = ? LIMIT 1",
            [id.into()],
        ))
        .one(database)
        .await?;
        match row {
            Some(row) => Ok(Some(hydrate_claim(database, row).await?)),
            None => Ok(None),
        }
    }

    pub async fn create_claim(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        request: &CreateClaimRequest,
        claim_number: String,
    ) -> Result<Uuid, AppError> {
        let now = now_utc();
        let claim_id = Uuid::new_v4();
        let invoice_id = parse_optional_uuid(request.invoice_id.as_deref(), "invoiceId")?;
        let customer_id = parse_optional_uuid(request.customer_id.as_deref(), "customerId")?;
        let supplier_id = parse_optional_uuid(request.supplier_id.as_deref(), "supplierId")?;
        let assigned_to = parse_optional_uuid(request.assigned_to.as_deref(), "assignedTo")?;

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO warranty_claims (id, claim_number, invoice_id, customer_id, branch_id, supplier_id, status, problem, diagnosis, resolution, received_at, resolved_at, created_by, assigned_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, NULL, ?, NULL, ?, ?, ?, ?)",
                [
                    claim_id.into(),
                    claim_number.into(),
                    invoice_id.into(),
                    customer_id.into(),
                    context.branch_id.into(),
                    supplier_id.into(),
                    request.problem.trim().to_owned().into(),
                    trimmed(&request.diagnosis).into(),
                    now.into(),
                    context.user_id.into(),
                    assigned_to.into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await?;

        for item in &request.items {
            let product_id = parse_uuid(&item.product_id, "items.productId")?;
            let action = item.action.trim().to_uppercase();
            if !matches!(action.as_str(), "REPAIR" | "REPLACE" | "REFUND" | "REJECT") {
                return Err(AppError::Validation("Invalid claim item action.".into()));
            }
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO warranty_claim_items (id, warranty_claim_id, invoice_item_id, product_id, product_lot_id, serial_number, quantity, condition, action, replacement_product_id, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        Uuid::new_v4().into(),
                        claim_id.into(),
                        parse_optional_uuid(item.invoice_item_id.as_deref(), "invoiceItemId")?.into(),
                        product_id.into(),
                        parse_optional_uuid(item.product_lot_id.as_deref(), "productLotId")?.into(),
                        trimmed(&item.serial_number).into(),
                        quantity(item.quantity).into(),
                        item.condition.trim().to_uppercase().into(),
                        action.into(),
                        parse_optional_uuid(
                            item.replacement_product_id.as_deref(),
                            "replacementProductId",
                        )?
                        .into(),
                        money_value(item.cost).into(),
                        now.into(),
                    ],
                ))
                .await?;
        }

        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO claim_status_history (id, warranty_claim_id, from_status, to_status, notes, changed_by, changed_at) VALUES (?, ?, NULL, 'OPEN', ?, ?, ?)",
                [
                    Uuid::new_v4().into(),
                    claim_id.into(),
                    "Claim opened".into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        let _ = ERROR_CLAIM_NOT_FOUND;
        Ok(claim_id)
    }
}

async fn allocate_fifo(
    transaction: &DatabaseTransaction,
    context: &RequestContext,
    branch_id: Uuid,
    reference_id: Uuid,
    product_id: Uuid,
    mut needed: Decimal,
    unit_name: &str,
    displayed: Decimal,
    movement_type: &str,
) -> Result<Uuid, AppError> {
    let lots = FifoLotRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT bl.id AS branch_lot_id, bl.product_lot_id, bl.remaining_base_quantity AS remaining, pl.purchase_price_per_base AS unit_cost FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE bl.branch_id = ? AND pl.product_id = ? AND bl.remaining_base_quantity > 0 AND pl.deleted_at IS NULL ORDER BY pl.received_date ASC, pl.created_at ASC",
        [branch_id.into(), product_id.into()],
    ))
    .all(transaction)
    .await?;
    let available: Decimal = lots.iter().map(|lot| lot.remaining).sum();
    if available < needed {
        return Err(AppError::Conflict(ERROR_INSUFFICIENT_STOCK.into()));
    }
    let now = now_utc();
    let mut first_movement_id = None;
    let mut first = true;
    for lot in lots {
        if needed <= Decimal::ZERO {
            break;
        }
        let take = needed.min(lot.remaining);
        if take <= Decimal::ZERO {
            continue;
        }
        let movement_id = Uuid::new_v4();
        if first_movement_id.is_none() {
            first_movement_id = Some(movement_id);
        }
        let line_cost = money_value(lot.unit_cost * take);
        let displayed_qty = if first { displayed } else { Decimal::ZERO };
        first = false;
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
                "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    movement_id.into(),
                    branch_id.into(),
                    product_id.into(),
                    lot.product_lot_id.into(),
                    movement_type.into(),
                    displayed_qty.into(),
                    unit_name.into(),
                    (-take).into(),
                    lot.unit_cost.into(),
                    line_cost.into(),
                    REFERENCE_RETURN.into(),
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
                    REFERENCE_RETURN.into(),
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
    first_movement_id.ok_or_else(|| AppError::Conflict(ERROR_INSUFFICIENT_STOCK.into()))
}

fn return_conditions(
    query: &ReturnListQuery,
    id: Option<Uuid>,
) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["1=1".to_owned()];
    let mut values = Vec::new();
    if let Some(id) = id {
        parts.push("sr.id = ?".to_owned());
        values.push(id.into());
    }
    if let Some(branch_id) = &query.branch_id {
        parts.push("sr.branch_id = ?".to_owned());
        values.push(parse_uuid(branch_id, "branchId")?.into());
    }
    if let Some(invoice_id) = &query.invoice_id {
        parts.push("sr.invoice_id = ?".to_owned());
        values.push(parse_uuid(invoice_id, "invoiceId")?.into());
    }
    if let Some(status) = &query.status {
        parts.push("sr.status = ?".to_owned());
        values.push(status.trim().to_uppercase().into());
    }
    Ok((parts.join(" AND "), values))
}

fn claim_conditions(
    query: &ClaimListQuery,
    id: Option<Uuid>,
) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["1=1".to_owned()];
    let mut values = Vec::new();
    if let Some(id) = id {
        parts.push("wc.id = ?".to_owned());
        values.push(id.into());
    }
    if let Some(branch_id) = &query.branch_id {
        parts.push("wc.branch_id = ?".to_owned());
        values.push(parse_uuid(branch_id, "branchId")?.into());
    }
    if let Some(status) = &query.status {
        parts.push("wc.status = ?".to_owned());
        values.push(status.trim().to_uppercase().into());
    }
    if let Some(customer_id) = &query.customer_id {
        parts.push("wc.customer_id = ?".to_owned());
        values.push(parse_uuid(customer_id, "customerId")?.into());
    }
    Ok((parts.join(" AND "), values))
}

async fn hydrate_return(
    database: &impl ConnectionTrait,
    row: ReturnHeader,
) -> Result<ReturnResponse, AppError> {
    let items = ReturnItemRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, invoice_item_id, product_id, displayed_quantity, base_quantity, condition, refund_amount, restock_action FROM sale_return_items WHERE sale_return_id = ?",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    Ok(ReturnResponse {
        id: row.id.to_string(),
        return_number: row.return_number,
        invoice_id: row.invoice_id.to_string(),
        branch_id: row.branch_id.to_string(),
        customer_id: row.customer_id.map(|v| v.to_string()),
        return_type: row.return_type,
        status: row.status,
        reason: row.reason,
        notes: row.notes,
        refund_amount: decimal(row.refund_amount),
        items: items
            .into_iter()
            .map(|item| ReturnItemResponse {
                id: item.id.to_string(),
                invoice_item_id: item.invoice_item_id.to_string(),
                product_id: item.product_id.to_string(),
                displayed_quantity: decimal(item.displayed_quantity),
                base_quantity: decimal(item.base_quantity),
                condition: item.condition,
                refund_amount: decimal(item.refund_amount),
                restock_action: item.restock_action,
            })
            .collect(),
        created_at: row.created_at.to_rfc3339(),
        completed_at: row.completed_at.map(|v| v.to_rfc3339()),
    })
}

async fn hydrate_claim(
    database: &impl ConnectionTrait,
    row: ClaimHeader,
) -> Result<ClaimResponse, AppError> {
    let items = ClaimItemRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, product_id, product_lot_id, serial_number, quantity, condition, action, cost FROM warranty_claim_items WHERE warranty_claim_id = ?",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    let history = ClaimHistoryRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, from_status, to_status, notes, changed_by, changed_at FROM claim_status_history WHERE warranty_claim_id = ? ORDER BY changed_at ASC",
        [row.id.into()],
    ))
    .all(database)
    .await?;
    Ok(ClaimResponse {
        id: row.id.to_string(),
        claim_number: row.claim_number,
        invoice_id: row.invoice_id.map(|v| v.to_string()),
        customer_id: row.customer_id.map(|v| v.to_string()),
        branch_id: row.branch_id.to_string(),
        supplier_id: row.supplier_id.map(|v| v.to_string()),
        status: row.status,
        problem: row.problem,
        diagnosis: row.diagnosis,
        resolution: row.resolution,
        items: items
            .into_iter()
            .map(|item| ClaimItemResponse {
                id: item.id.to_string(),
                product_id: item.product_id.to_string(),
                product_lot_id: item.product_lot_id.map(|v| v.to_string()),
                serial_number: item.serial_number,
                quantity: decimal(item.quantity),
                condition: item.condition,
                action: item.action,
                cost: decimal(item.cost),
            })
            .collect(),
        status_history: history
            .into_iter()
            .map(|h| ClaimStatusHistoryResponse {
                id: h.id.to_string(),
                from_status: h.from_status,
                to_status: h.to_status,
                notes: h.notes,
                changed_by: h.changed_by.to_string(),
                changed_at: h.changed_at.to_rfc3339(),
            })
            .collect(),
        received_at: row.received_at.to_rfc3339(),
        resolved_at: row.resolved_at.map(|v| v.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    })
}

async fn ensure_customer(database: &impl ConnectionTrait, id: Uuid) -> Result<(), AppError> {
    let row = database
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [id.into()],
        ))
        .await?;
    if row.is_none() {
        return Err(AppError::NotFound(ERROR_CUSTOMER_NOT_FOUND));
    }
    Ok(())
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
