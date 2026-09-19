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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LedgerParty {
    Supplier(Uuid),
    Customer(Uuid),
}

pub struct LedgerEntryInput<'a> {
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
            LedgerParty::Supplier(id) => (
                "SELECT CAST(balance_after AS REAL) AS balance_after FROM supplier_ledger_entries WHERE supplier_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
                id,
            ),
            LedgerParty::Customer(id) => (
                "SELECT CAST(balance_after AS REAL) AS balance_after FROM customer_ledger_entries WHERE customer_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 1",
                id,
            ),
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
        let id = Uuid::new_v4();
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
}
