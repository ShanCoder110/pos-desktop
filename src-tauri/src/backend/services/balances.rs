use rust_decimal::{prelude::FromPrimitive, Decimal};
use sea_orm::{ConnectionTrait, DatabaseConnection, TransactionTrait};
use uuid::Uuid;

use crate::backend::{
    constants::{ERROR_ADJUSTMENT_NOTE_REQUIRED, ERROR_ADJUST_BALANCE_DENIED},
    context::RequestContext,
    errors::AppError,
    repositories::{LedgerParty, LedgerRepository},
    util::{money_value, now_utc},
};

fn ensure_adjust_permission(context: &RequestContext) -> Result<(), AppError> {
    if matches!(context.role.as_str(), "OWNER" | "MANAGER") {
        Ok(())
    } else {
        Err(AppError::Forbidden(ERROR_ADJUST_BALANCE_DENIED.into()))
    }
}

pub struct BalanceService;

impl BalanceService {
    pub async fn supplier_balance(
        database: &DatabaseConnection,
        supplier_id: Uuid,
    ) -> Result<Decimal, AppError> {
        LedgerRepository::current_balance(database, LedgerParty::Supplier(supplier_id)).await
    }

    pub async fn customer_balance(
        database: &DatabaseConnection,
        customer_id: Uuid,
    ) -> Result<Decimal, AppError> {
        LedgerRepository::current_balance(database, LedgerParty::Customer(customer_id)).await
    }

    /// Opening balance on create. Positive = party is owed / customer owes; negative = advance.
    pub async fn post_opening_in_txn(
        database: &impl ConnectionTrait,
        party: LedgerParty,
        amount: Option<f64>,
        context: &RequestContext,
        at: chrono::DateTime<chrono::Utc>,
    ) -> Result<Decimal, AppError> {
        let amount = money_value(amount.and_then(Decimal::from_f64).unwrap_or(Decimal::ZERO));
        if amount == Decimal::ZERO {
            return LedgerRepository::current_balance(database, party).await;
        }
        LedgerRepository::post_opening(
            database,
            party,
            context.branch_id,
            amount,
            at,
            context.user_id,
        )
        .await
    }

    pub async fn adjust_supplier(
        database: &DatabaseConnection,
        supplier_id: Uuid,
        amount: Decimal,
        notes: Option<&str>,
        context: &RequestContext,
    ) -> Result<Decimal, AppError> {
        ensure_adjust_permission(context)?;
        if notes
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(AppError::Validation(ERROR_ADJUSTMENT_NOTE_REQUIRED.into()));
        }
        let txn = database.begin().await?;
        let balance = LedgerRepository::post_adjustment(
            &txn,
            LedgerParty::Supplier(supplier_id),
            context.branch_id,
            amount,
            notes,
            now_utc(),
            context.user_id,
        )
        .await?;
        txn.commit().await?;
        Ok(balance)
    }

    pub async fn adjust_customer(
        database: &DatabaseConnection,
        customer_id: Uuid,
        amount: Decimal,
        notes: Option<&str>,
        context: &RequestContext,
    ) -> Result<Decimal, AppError> {
        ensure_adjust_permission(context)?;
        if notes
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(AppError::Validation(ERROR_ADJUSTMENT_NOTE_REQUIRED.into()));
        }
        let txn = database.begin().await?;
        let balance = LedgerRepository::post_adjustment(
            &txn,
            LedgerParty::Customer(customer_id),
            context.branch_id,
            amount,
            notes,
            now_utc(),
            context.user_id,
        )
        .await?;
        txn.commit().await?;
        Ok(balance)
    }
}
