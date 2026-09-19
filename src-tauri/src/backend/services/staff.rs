use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::ERROR_STAFF_PAYOUT_DENIED,
    context::RequestContext,
    dto::{
        Paginated, PaginationMeta, StaffLedgerEntryResponse, StaffLedgerListQuery,
        StaffLedgerResponse, StaffPayoutRequest, StaffPayoutResponse,
    },
    errors::AppError,
    repositories::StaffRepository,
    util::money_value,
};

pub struct StaffService;

impl StaffService {
    pub async fn list_staff_ledgers(
        database: &DatabaseConnection,
        mut query: StaffLedgerListQuery,
    ) -> Result<Paginated<StaffLedgerEntryResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = StaffRepository::list_staff_ledgers(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn user_ledger(
        database: &DatabaseConnection,
        user_id: Uuid,
    ) -> Result<StaffLedgerResponse, AppError> {
        let (total_paid, paid_this_month, entries) =
            StaffRepository::user_ledger(database, user_id).await?;
        Ok(StaffLedgerResponse {
            user_id: user_id.to_string(),
            total_paid,
            paid_this_month,
            entries,
        })
    }

    pub async fn record_payout(
        database: &DatabaseConnection,
        context: &RequestContext,
        user_id: Uuid,
        mut request: StaffPayoutRequest,
    ) -> Result<StaffPayoutResponse, AppError> {
        ensure_payout_permission(context)?;
        request.amount = money_value(request.amount);
        request.validate()?;
        let transaction = database.begin().await?;
        let response =
            StaffRepository::record_payout(&transaction, context, user_id, &request).await?;
        transaction.commit().await?;
        Ok(response)
    }
}

fn ensure_payout_permission(context: &RequestContext) -> Result<(), AppError> {
    if matches!(context.role.as_str(), "OWNER" | "MANAGER") {
        Ok(())
    } else {
        Err(AppError::Forbidden(ERROR_STAFF_PAYOUT_DENIED.into()))
    }
}
