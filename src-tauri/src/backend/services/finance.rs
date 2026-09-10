use sea_orm::{DatabaseConnection, TransactionTrait};
use validator::Validate;

use crate::backend::{
    context::RequestContext,
    dto::{
        AnalyticsQuery, AnalyticsReportResponse, CreateExpenseCategoryRequest,
        CreateExpenseRequest, DashboardReportResponse, ExpenseCategoryResponse, ExpenseListQuery,
        ExpenseResponse, LocalizationSettingsResponse, MoneyTransactionResponse, Paginated,
        PaginationMeta, ProfileSettingsResponse, ReceiptSettingsQuery, ReceiptSettingsResponse,
        SyncStatusResponse, TransactionListQuery, UpdateLocalizationRequest, UpdateProfileRequest,
        UpdateReceiptRequest,
    },
    errors::AppError,
    repositories::FinanceRepository,
    util::money_value,
};

pub struct FinanceService;

impl FinanceService {
    pub async fn list_expense_categories(
        database: &DatabaseConnection,
    ) -> Result<Vec<ExpenseCategoryResponse>, AppError> {
        FinanceRepository::list_expense_categories(database).await
    }

    pub async fn create_expense_category(
        database: &DatabaseConnection,
        request: CreateExpenseCategoryRequest,
    ) -> Result<ExpenseCategoryResponse, AppError> {
        request.validate()?;
        FinanceRepository::create_expense_category(database, &request).await
    }

    pub async fn list_expenses(
        database: &DatabaseConnection,
        mut query: ExpenseListQuery,
    ) -> Result<Paginated<ExpenseResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = FinanceRepository::list_expenses(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn create_expense(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateExpenseRequest,
    ) -> Result<ExpenseResponse, AppError> {
        request.amount = money_value(request.amount);
        request.validate()?;
        let transaction = database.begin().await?;
        let response =
            FinanceRepository::create_expense(&transaction, context, &request).await?;
        transaction.commit().await?;
        Ok(response)
    }

    pub async fn list_transactions(
        database: &DatabaseConnection,
        mut query: TransactionListQuery,
    ) -> Result<Paginated<MoneyTransactionResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = FinanceRepository::list_transactions(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn dashboard(
        database: &DatabaseConnection,
        context: &RequestContext,
    ) -> Result<DashboardReportResponse, AppError> {
        FinanceRepository::dashboard(database, context.branch_id).await
    }

    pub async fn analytics(
        database: &DatabaseConnection,
        query: AnalyticsQuery,
    ) -> Result<AnalyticsReportResponse, AppError> {
        FinanceRepository::analytics(database, &query).await
    }

    pub async fn get_localization(
        database: &DatabaseConnection,
    ) -> Result<LocalizationSettingsResponse, AppError> {
        FinanceRepository::get_localization(database).await
    }

    pub async fn update_localization(
        database: &DatabaseConnection,
        request: UpdateLocalizationRequest,
    ) -> Result<LocalizationSettingsResponse, AppError> {
        request.validate()?;
        FinanceRepository::update_localization(database, &request).await
    }

    pub async fn get_receipt(
        database: &DatabaseConnection,
        context: &RequestContext,
        query: ReceiptSettingsQuery,
    ) -> Result<ReceiptSettingsResponse, AppError> {
        FinanceRepository::get_receipt(database, &query, context.branch_id).await
    }

    pub async fn update_receipt(
        database: &DatabaseConnection,
        context: &RequestContext,
        query: ReceiptSettingsQuery,
        request: UpdateReceiptRequest,
    ) -> Result<ReceiptSettingsResponse, AppError> {
        FinanceRepository::update_receipt(database, &query, context.branch_id, &request).await
    }

    pub async fn get_profile(
        database: &DatabaseConnection,
        context: &RequestContext,
    ) -> Result<ProfileSettingsResponse, AppError> {
        FinanceRepository::get_profile(database, context.branch_id).await
    }

    pub async fn update_profile(
        database: &DatabaseConnection,
        context: &RequestContext,
        request: UpdateProfileRequest,
    ) -> Result<ProfileSettingsResponse, AppError> {
        FinanceRepository::update_profile(database, context.branch_id, &request).await
    }

    pub async fn sync_status() -> SyncStatusResponse {
        SyncStatusResponse {
            enabled: false,
            pending_mutations: 0,
        }
    }
}
