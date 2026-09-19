use chrono::Datelike;
use rust_decimal::Decimal;
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, FromQueryResult, Statement,
};
use uuid::Uuid;

use crate::backend::{
    constants::{ERROR_USER_NOT_FOUND, LEDGER_COMMISSION, LEDGER_SALARY, PAYMENT_DIRECTION_OUT},
    context::RequestContext,
    dto::{
        StaffLedgerEntryResponse, StaffLedgerListQuery, StaffPayoutRequest, StaffPayoutResponse,
    },
    errors::AppError,
    util::{decimal, money_value, now_utc, trimmed},
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
struct StaffLedgerListRow {
    id: Uuid,
    user_id: Uuid,
    user_name: String,
    branch_id: Uuid,
    entry_type: String,
    money_transaction_id: Option<Uuid>,
    debit: Decimal,
    credit: Decimal,
    balance_after: Decimal,
    notes: Option<String>,
    occurred_at: chrono::DateTime<chrono::Utc>,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct LedgerRow {
    id: Uuid,
    user_id: Uuid,
    branch_id: Uuid,
    entry_type: String,
    money_transaction_id: Option<Uuid>,
    debit: Decimal,
    credit: Decimal,
    balance_after: Decimal,
    notes: Option<String>,
    occurred_at: chrono::DateTime<chrono::Utc>,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, FromQueryResult)]
struct SumRow {
    total: Decimal,
}

pub struct StaffRepository;

impl StaffRepository {
    pub async fn ensure_user(
        transaction: &DatabaseTransaction,
        user_id: Uuid,
    ) -> Result<(), AppError> {
        let exists = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1",
            [user_id.into()],
        ))
        .one(transaction)
        .await?
        .map(|row| row.count > 0)
        .unwrap_or(false);
        if exists {
            Ok(())
        } else {
            Err(AppError::NotFound(ERROR_USER_NOT_FOUND))
        }
    }

    pub async fn list_staff_ledgers(
        database: &DatabaseConnection,
        query: &StaffLedgerListQuery,
    ) -> Result<(Vec<StaffLedgerEntryResponse>, u64), AppError> {
        let page = query.page.clone().normalized();
        let mut parts = vec!["u.deleted_at IS NULL".to_owned()];
        let mut values = Vec::new();
        if let Some(search) = &page.search {
            let pattern = format!("%{}%", search.to_lowercase());
            parts.push("(lower(u.name) LIKE ? OR lower(sle.type) LIKE ? OR lower(COALESCE(sle.notes, '')) LIKE ?)".to_owned());
            values.push(pattern.clone().into());
            values.push(pattern.clone().into());
            values.push(pattern.into());
        }
        if let Some(user) = query
            .user
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push("lower(u.name) LIKE ?".to_owned());
            values.push(format!("%{}%", user.to_lowercase()).into());
        }
        if let Some(entry_type) = query
            .entry_type
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push("sle.type = ?".to_owned());
            values.push(entry_type.to_uppercase().into());
        }
        if let Some(notes) = page.notes.as_deref() {
            parts.push("lower(COALESCE(sle.notes, '')) LIKE ?".to_owned());
            values.push(format!("%{}%", notes.to_lowercase()).into());
        }
        if let Some(debit) = query.debit {
            parts.push("sle.debit >= ?".to_owned());
            values.push(debit.into());
        }
        if let Some(credit) = query.credit {
            parts.push("sle.credit >= ?".to_owned());
            values.push(credit.into());
        }
        if let Some(from) = query
            .occurred_from
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push("date(sle.occurred_at) >= date(?)".to_owned());
            values.push(from.into());
        }
        if let Some(to) = query
            .occurred_to
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push("date(sle.occurred_at) <= date(?)".to_owned());
            values.push(to.into());
        }
        let where_sql = parts.join(" AND ");
        let count_sql = format!(
            "SELECT COUNT(*) AS count FROM staff_ledger_entries sle INNER JOIN users u ON u.id = sle.user_id WHERE {where_sql}"
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
            "SELECT sle.id, sle.user_id, u.name AS user_name, sle.branch_id, sle.type AS entry_type, sle.money_transaction_id, CAST(sle.debit AS REAL) AS debit, CAST(sle.credit AS REAL) AS credit, CAST(sle.balance_after AS REAL) AS balance_after, sle.notes, sle.occurred_at, sle.created_at FROM staff_ledger_entries sle INNER JOIN users u ON u.id = sle.user_id WHERE {where_sql} ORDER BY sle.created_at DESC, sle.id DESC LIMIT ? OFFSET ?"
        );
        let mut page_values = values;
        page_values.push((page.per_page as i64).into());
        page_values.push((page.offset() as i64).into());
        let rows = StaffLedgerListRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            page_values,
        ))
        .all(database)
        .await?;
        Ok((
            rows.into_iter()
                .map(|row| StaffLedgerEntryResponse {
                    id: row.id.to_string(),
                    user_id: row.user_id.to_string(),
                    user_name: Some(row.user_name),
                    branch_id: row.branch_id.to_string(),
                    entry_type: row.entry_type,
                    money_transaction_id: row.money_transaction_id.map(|value| value.to_string()),
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

    pub async fn user_ledger(
        database: &DatabaseConnection,
        user_id: Uuid,
    ) -> Result<(f64, f64, Vec<StaffLedgerEntryResponse>), AppError> {
        let rows = LedgerRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, user_id, branch_id, type AS entry_type, money_transaction_id, CAST(debit AS REAL) AS debit, CAST(credit AS REAL) AS credit, CAST(balance_after AS REAL) AS balance_after, notes, occurred_at, created_at FROM staff_ledger_entries WHERE user_id = ? ORDER BY created_at DESC, id DESC",
            [user_id.into()],
        ))
        .all(database)
        .await?;
        let total_paid = rows
            .first()
            .map(|row| decimal(row.balance_after))
            .unwrap_or(0.0);
        let month_start = chrono::Utc::now()
            .date_naive()
            .with_day(1)
            .unwrap_or_else(|| chrono::Utc::now().date_naive())
            .format("%Y-%m-%d")
            .to_string();
        let paid_this_month = SumRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COALESCE(SUM(debit), 0) AS total FROM staff_ledger_entries WHERE user_id = ? AND date(occurred_at) >= date(?)",
            [user_id.into(), month_start.into()],
        ))
        .one(database)
        .await?
        .map(|row| decimal(row.total))
        .unwrap_or(0.0);
        let entries = rows
            .into_iter()
            .map(|row| StaffLedgerEntryResponse {
                id: row.id.to_string(),
                user_id: row.user_id.to_string(),
                user_name: None,
                branch_id: row.branch_id.to_string(),
                entry_type: row.entry_type,
                money_transaction_id: row.money_transaction_id.map(|value| value.to_string()),
                debit: decimal(row.debit),
                credit: decimal(row.credit),
                balance_after: decimal(row.balance_after),
                notes: row.notes,
                occurred_at: row.occurred_at.to_rfc3339(),
                created_at: row.created_at.to_rfc3339(),
            })
            .collect();
        Ok((total_paid, paid_this_month, entries))
    }

    pub async fn record_payout(
        transaction: &DatabaseTransaction,
        context: &RequestContext,
        user_id: Uuid,
        request: &StaffPayoutRequest,
    ) -> Result<StaffPayoutResponse, AppError> {
        Self::ensure_user(transaction, user_id).await?;
        let cash_session_id = context.require_cash_session()?;
        let now = now_utc();
        let amount = money_value(request.amount);
        let payout_type = request.payout_type.trim().to_uppercase();
        if payout_type != LEDGER_SALARY && payout_type != LEDGER_COMMISSION {
            return Err(AppError::Validation(
                crate::backend::constants::ERROR_STAFF_PAYOUT_TYPE.into(),
            ));
        }
        let method = request.payment_method.trim().to_uppercase();
        if !matches!(
            method.as_str(),
            "CASH" | "CARD" | "BANK" | "MOBILE" | "OTHER"
        ) {
            return Err(AppError::Validation("Invalid paymentMethod.".into()));
        }
        let money_id = Uuid::new_v4();
        let ledger_id = Uuid::new_v4();
        let previous = BalanceRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT CAST(balance_after AS REAL) AS balance_after FROM staff_ledger_entries WHERE user_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
            [user_id.into()],
        ))
        .one(transaction)
        .await?
        .map(|row| row.balance_after)
        .unwrap_or(Decimal::ZERO);
        let balance_after = previous + amount;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO money_transactions (id, branch_id, cash_session_id, direction, type, amount, payment_method, reference_type, reference_id, party_type, party_id, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, 'STAFF_PAYOUT', ?, ?, 'StaffPayout', ?, 'USER', ?, ?, ?, ?, ?)",
                [
                    money_id.into(),
                    context.branch_id.into(),
                    cash_session_id.into(),
                    PAYMENT_DIRECTION_OUT.into(),
                    amount.into(),
                    method.clone().into(),
                    ledger_id.into(),
                    user_id.into(),
                    user_id.into(),
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
                "INSERT INTO staff_ledger_entries (id, user_id, branch_id, type, money_transaction_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)",
                [
                    ledger_id.into(),
                    user_id.into(),
                    context.branch_id.into(),
                    payout_type.clone().into(),
                    money_id.into(),
                    amount.into(),
                    balance_after.into(),
                    trimmed(&request.notes)
                        .unwrap_or_else(|| format!("{payout_type} payout"))
                        .into(),
                    now.into(),
                    context.user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
        Ok(StaffPayoutResponse {
            id: ledger_id.to_string(),
            user_id: user_id.to_string(),
            amount: decimal(amount),
            payout_type,
            payment_method: method,
            money_transaction_id: money_id.to_string(),
            balance_after: decimal(balance_after),
            occurred_at: now.to_rfc3339(),
        })
    }
}
