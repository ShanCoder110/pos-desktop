use rust_decimal::Decimal;
use sea_orm::{ConnectionTrait, DbBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::backend::{
    constants::{LEDGER_ADJUSTMENT, LEDGER_OPENING_BALANCE, LEDGER_PREVIOUS_BALANCE_NOTE},
    errors::AppError,
    util::money_value,
};

#[derive(Debug, FromQueryResult)]
struct BalanceRow {
    balance_after: Decimal,
}

#[derive(Debug, FromQueryResult)]
struct PartyIdRow {
    party_id: Uuid,
}

#[derive(Debug, FromQueryResult)]
struct LedgerRecomputeRow {
    id: Uuid,
    debit: Decimal,
    credit: Decimal,
    balance_after: Decimal,
}

/// Stable "latest entry" order: wall-clock first, then insert order via SQLite rowid.
/// Ties on occurred_at/created_at (common inside one revise txn) used to pick the wrong prior balance.
const CUSTOMER_LATEST_SQL: &str = "SELECT CAST(balance_after AS REAL) AS balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at DESC, created_at DESC, rowid DESC LIMIT 1";
const SUPPLIER_LATEST_SQL: &str = "SELECT CAST(balance_after AS REAL) AS balance_after FROM supplier_ledger_entries WHERE supplier_id = ? ORDER BY occurred_at DESC, created_at DESC, rowid DESC LIMIT 1";
const CUSTOMER_REPLAY_SQL: &str = "SELECT id, CAST(debit AS REAL) AS debit, CAST(credit AS REAL) AS credit, CAST(balance_after AS REAL) AS balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at ASC, created_at ASC, rowid ASC";
const SUPPLIER_REPLAY_SQL: &str = "SELECT id, CAST(debit AS REAL) AS debit, CAST(credit AS REAL) AS credit, CAST(balance_after AS REAL) AS balance_after FROM supplier_ledger_entries WHERE supplier_id = ? ORDER BY occurred_at ASC, created_at ASC, rowid ASC";

/// Sold on credit = net of sales/adjustments/returns (RETURN reduces sold; revise ADJUSTMENT nets).
/// Excludes cash payments so sold − paid = ledger balance.
pub const CUSTOMER_SOLD_SQL: &str = "CAST(COALESCE((SELECT SUM(cle.debit - cle.credit) FROM customer_ledger_entries cle WHERE cle.customer_id = customers.id AND cle.type NOT IN ('PAYMENT_RECEIVED', 'PAYMENT', 'PAYMENT_MADE')), 0) AS REAL)";
/// Paid on credit = cash actually received (or refunded). Returns are not paid.
pub const CUSTOMER_PAID_SQL: &str = "CAST(COALESCE((SELECT SUM(cle.credit - cle.debit) FROM customer_ledger_entries cle WHERE cle.customer_id = customers.id AND cle.type IN ('PAYMENT_RECEIVED', 'PAYMENT', 'PAYMENT_MADE')), 0) AS REAL)";
pub const CUSTOMER_BALANCE_SQL: &str = "CAST((SELECT cle.balance_after FROM customer_ledger_entries cle WHERE cle.customer_id = customers.id ORDER BY cle.occurred_at DESC, cle.created_at DESC, cle.rowid DESC LIMIT 1) AS REAL)";
pub const SUPPLIER_BALANCE_SQL: &str = "CAST((SELECT sle.balance_after FROM supplier_ledger_entries sle WHERE sle.supplier_id = suppliers.id ORDER BY sle.occurred_at DESC, sle.created_at DESC, sle.rowid DESC LIMIT 1) AS REAL)";

#[derive(Clone, Debug, PartialEq)]
pub struct PartyCreditTotals {
    pub balance: Decimal,
    pub sold: Decimal,
    pub paid: Decimal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LedgerParty {
    Supplier(Uuid),
    Customer(Uuid),
}

pub struct LedgerEntryInput<'a> {
    /// When set, use this id; otherwise allocate a new UUID.
    pub id: Option<Uuid>,
    pub party: LedgerParty,
    pub branch_id: Uuid,
    pub entry_type: &'a str,
    pub debit: Decimal,
    pub credit: Decimal,
    pub notes: Option<&'a str>,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
    pub created_by: Uuid,
    pub purchase_order_id: Option<Uuid>,
    pub goods_receipt_id: Option<Uuid>,
    pub money_transaction_id: Option<Uuid>,
    pub invoice_id: Option<Uuid>,
    pub payment_id: Option<Uuid>,
    pub return_id: Option<Uuid>,
}

pub struct LedgerRepository;

impl LedgerRepository {
    pub async fn current_balance(
        database: &impl ConnectionTrait,
        party: LedgerParty,
    ) -> Result<Decimal, AppError> {
        let (sql, id) = match party {
            LedgerParty::Supplier(id) => (SUPPLIER_LATEST_SQL, id),
            LedgerParty::Customer(id) => (CUSTOMER_LATEST_SQL, id),
        };
        Ok(
            BalanceRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                sql,
                [id.into()],
            ))
            .one(database)
            .await?
            .map(|row| row.balance_after)
            .unwrap_or(Decimal::ZERO),
        )
    }

    pub async fn post_entry(
        database: &impl ConnectionTrait,
        input: LedgerEntryInput<'_>,
    ) -> Result<Decimal, AppError> {
        let debit = money_value(input.debit);
        let credit = money_value(input.credit);
        if debit < Decimal::ZERO || credit < Decimal::ZERO {
            return Err(AppError::Validation(
                "Ledger debit and credit cannot be negative.".into(),
            ));
        }
        if debit == Decimal::ZERO && credit == Decimal::ZERO {
            return Self::current_balance(database, input.party).await;
        }
        let previous = Self::current_balance(database, input.party).await?;
        let balance_after = money_value(previous + debit - credit);
        let id = input.id.unwrap_or_else(Uuid::new_v4);
        match input.party {
            LedgerParty::Supplier(supplier_id) => {
                database
                    .execute_raw(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "INSERT INTO supplier_ledger_entries (id, supplier_id, branch_id, type, purchase_order_id, goods_receipt_id, money_transaction_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [
                            id.into(),
                            supplier_id.into(),
                            input.branch_id.into(),
                            input.entry_type.into(),
                            input.purchase_order_id.into(),
                            input.goods_receipt_id.into(),
                            input.money_transaction_id.into(),
                            debit.into(),
                            credit.into(),
                            balance_after.into(),
                            input.notes.into(),
                            input.occurred_at.into(),
                            input.created_by.into(),
                            input.occurred_at.into(),
                        ],
                    ))
                    .await?;
            }
            LedgerParty::Customer(customer_id) => {
                database
                    .execute_raw(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "INSERT INTO customer_ledger_entries (id, customer_id, branch_id, type, invoice_id, payment_id, return_id, debit, credit, balance_after, notes, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [
                            id.into(),
                            customer_id.into(),
                            input.branch_id.into(),
                            input.entry_type.into(),
                            input.invoice_id.into(),
                            input.payment_id.into(),
                            input.return_id.into(),
                            debit.into(),
                            credit.into(),
                            balance_after.into(),
                            input.notes.into(),
                            input.occurred_at.into(),
                            input.created_by.into(),
                            input.occurred_at.into(),
                        ],
                    ))
                    .await?;
            }
        }
        Ok(balance_after)
    }

    #[allow(clippy::too_many_arguments)]
    /// Signed amount: positive increases payable/owes (debit), negative is advance (credit).
    pub async fn post_signed_amount(
        database: &impl ConnectionTrait,
        party: LedgerParty,
        branch_id: Uuid,
        entry_type: &str,
        amount: Decimal,
        notes: Option<&str>,
        occurred_at: chrono::DateTime<chrono::Utc>,
        created_by: Uuid,
    ) -> Result<Decimal, AppError> {
        let amount = money_value(amount);
        if amount == Decimal::ZERO {
            return Self::current_balance(database, party).await;
        }
        let (debit, credit) = if amount > Decimal::ZERO {
            (amount, Decimal::ZERO)
        } else {
            (Decimal::ZERO, -amount)
        };
        Self::post_entry(
            database,
            LedgerEntryInput {
                id: None,
                party,
                branch_id,
                entry_type,
                debit,
                credit,
                notes,
                occurred_at,
                created_by,
                purchase_order_id: None,
                goods_receipt_id: None,
                money_transaction_id: None,
                invoice_id: None,
                payment_id: None,
                return_id: None,
            },
        )
        .await
    }

    pub async fn post_opening(
        database: &impl ConnectionTrait,
        party: LedgerParty,
        branch_id: Uuid,
        amount: Decimal,
        occurred_at: chrono::DateTime<chrono::Utc>,
        created_by: Uuid,
    ) -> Result<Decimal, AppError> {
        Self::post_signed_amount(
            database,
            party,
            branch_id,
            LEDGER_OPENING_BALANCE,
            amount,
            Some(LEDGER_PREVIOUS_BALANCE_NOTE),
            occurred_at,
            created_by,
        )
        .await
    }

    pub async fn post_adjustment(
        database: &impl ConnectionTrait,
        party: LedgerParty,
        branch_id: Uuid,
        amount: Decimal,
        notes: Option<&str>,
        occurred_at: chrono::DateTime<chrono::Utc>,
        created_by: Uuid,
    ) -> Result<Decimal, AppError> {
        Self::post_signed_amount(
            database,
            party,
            branch_id,
            LEDGER_ADJUSTMENT,
            amount,
            notes,
            occurred_at,
            created_by,
        )
        .await
    }

    /// Ledger-derived credit book totals for one customer. `sold - paid` equals `balance`
    /// (sold already nets RETURN rows; paid is cash only).
    pub async fn customer_credit_totals(
        database: &impl ConnectionTrait,
        customer_id: Uuid,
    ) -> Result<PartyCreditTotals, AppError> {
        #[derive(Debug, FromQueryResult)]
        struct TotalsRow {
            balance: Decimal,
            sold: Decimal,
            paid: Decimal,
        }
        let row = TotalsRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT
                CAST(COALESCE((SELECT balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at DESC, created_at DESC, rowid DESC LIMIT 1), 0) AS REAL) AS balance,
                CAST(COALESCE((SELECT SUM(debit - credit) FROM customer_ledger_entries WHERE customer_id = ? AND type NOT IN ('PAYMENT_RECEIVED', 'PAYMENT', 'PAYMENT_MADE')), 0) AS REAL) AS sold,
                CAST(COALESCE((SELECT SUM(credit - debit) FROM customer_ledger_entries WHERE customer_id = ? AND type IN ('PAYMENT_RECEIVED', 'PAYMENT', 'PAYMENT_MADE')), 0) AS REAL) AS paid",
            [customer_id.into(), customer_id.into(), customer_id.into()],
        ))
        .one(database)
        .await?
        .unwrap_or(TotalsRow {
            balance: Decimal::ZERO,
            sold: Decimal::ZERO,
            paid: Decimal::ZERO,
        });
        Ok(PartyCreditTotals {
            balance: money_value(row.balance),
            sold: money_value(row.sold),
            paid: money_value(row.paid),
        })
    }

    /// Shop-wide credit outstanding: sum of each customer's latest positive balance_after.
    pub async fn credit_outstanding(
        database: &impl ConnectionTrait,
        branch_id: Option<Uuid>,
    ) -> Result<Decimal, AppError> {
        let (sql, values): (String, Vec<sea_orm::Value>) = if let Some(branch_id) = branch_id {
            (
                "SELECT CAST(COALESCE(SUM(balance_after), 0) AS REAL) AS balance_after FROM (
                    SELECT customer_id, balance_after,
                           ROW_NUMBER() OVER (
                             PARTITION BY customer_id
                             ORDER BY occurred_at DESC, created_at DESC, rowid DESC
                           ) AS rn
                    FROM customer_ledger_entries
                    WHERE branch_id = ?
                  ) t WHERE rn = 1 AND balance_after > 0"
                    .to_owned(),
                vec![branch_id.into()],
            )
        } else {
            (
                "SELECT CAST(COALESCE(SUM(balance_after), 0) AS REAL) AS balance_after FROM (
                    SELECT customer_id, balance_after,
                           ROW_NUMBER() OVER (
                             PARTITION BY customer_id
                             ORDER BY occurred_at DESC, created_at DESC, rowid DESC
                           ) AS rn
                    FROM customer_ledger_entries
                  ) t WHERE rn = 1 AND balance_after > 0"
                    .to_owned(),
                vec![],
            )
        };
        let primary = BalanceRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            values,
        ))
        .one(database)
        .await;
        match primary {
            Ok(Some(row)) => Ok(money_value(row.balance_after)),
            Ok(None) => Ok(Decimal::ZERO),
            Err(_) => {
                // Older SQLite without window functions: correlate latest rowid per customer.
                let fallback_sql = if branch_id.is_some() {
                    "SELECT CAST(COALESCE(SUM(cle.balance_after), 0) AS REAL) AS balance_after
                     FROM customer_ledger_entries cle
                     WHERE cle.branch_id = ?
                       AND cle.rowid = (
                         SELECT c2.rowid FROM customer_ledger_entries c2
                         WHERE c2.customer_id = cle.customer_id
                         ORDER BY c2.occurred_at DESC, c2.created_at DESC, c2.rowid DESC
                         LIMIT 1
                       )
                       AND cle.balance_after > 0"
                } else {
                    "SELECT CAST(COALESCE(SUM(cle.balance_after), 0) AS REAL) AS balance_after
                     FROM customer_ledger_entries cle
                     WHERE cle.rowid = (
                         SELECT c2.rowid FROM customer_ledger_entries c2
                         WHERE c2.customer_id = cle.customer_id
                         ORDER BY c2.occurred_at DESC, c2.created_at DESC, c2.rowid DESC
                         LIMIT 1
                       )
                       AND cle.balance_after > 0"
                };
                let values: Vec<sea_orm::Value> =
                    branch_id.map(|id| vec![id.into()]).unwrap_or_default();
                Ok(
                    BalanceRow::find_by_statement(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        fallback_sql,
                        values,
                    ))
                    .one(database)
                    .await?
                    .map(|row| money_value(row.balance_after))
                    .unwrap_or(Decimal::ZERO),
                )
            }
        }
    }

    /// Idempotent repair: rebuild `balance_after` for every customer and supplier row in
    /// (`occurred_at`, `created_at`, `rowid`) order as a running sum of debit − credit.
    pub async fn recompute_balances(database: &impl ConnectionTrait) -> Result<u64, AppError> {
        let mut touched = 0u64;
        touched += Self::recompute_party_table(
            database,
            "customer_ledger_entries",
            "customer_id",
            CUSTOMER_REPLAY_SQL,
        )
        .await?;
        touched += Self::recompute_party_table(
            database,
            "supplier_ledger_entries",
            "supplier_id",
            SUPPLIER_REPLAY_SQL,
        )
        .await?;
        Ok(touched)
    }

    async fn recompute_party_table(
        database: &impl ConnectionTrait,
        table: &str,
        party_column: &str,
        replay_sql: &str,
    ) -> Result<u64, AppError> {
        let parties = PartyIdRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            format!("SELECT DISTINCT {party_column} AS party_id FROM {table}"),
            [],
        ))
        .all(database)
        .await?;
        let mut touched = 0u64;
        let update_sql =
            format!("UPDATE {table} SET balance_after = ? WHERE id = ? AND balance_after != ?");
        for party in parties {
            let rows = LedgerRecomputeRow::find_by_statement(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                replay_sql,
                [party.party_id.into()],
            ))
            .all(database)
            .await?;
            let mut running = Decimal::ZERO;
            for row in rows {
                running = money_value(running + row.debit - row.credit);
                if row.balance_after != running {
                    database
                        .execute_raw(Statement::from_sql_and_values(
                            DbBackend::Sqlite,
                            update_sql.as_str(),
                            [running.into(), row.id.into(), running.into()],
                        ))
                        .await?;
                    touched += 1;
                }
            }
        }
        Ok(touched)
    }
}
