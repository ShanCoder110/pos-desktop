use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};

use crate::backend::{
    context::RequestContext,
    dto::{
        AnalyticsQuery, AnalyticsReportResponse, CreateExpenseCategoryRequest,
        CreateExpenseRequest, DashboardReportResponse, ExpenseCategoryResponse, ExpenseListQuery,
        ExpenseResponse, LocalizationSettingsResponse, MoneyTransactionResponse, Paginated,
        ProfileSettingsResponse, ReceiptSettingsQuery, ReceiptSettingsResponse, SyncStatusResponse,
        TransactionListQuery, UpdateLocalizationRequest, UpdateProfileRequest,
        UpdateReceiptRequest,
    },
    errors::AppError,
    services::FinanceService,
    AppState,
};

pub async fn list_expense_categories(
    State(state): State<AppState>,
) -> Result<Json<Vec<ExpenseCategoryResponse>>, AppError> {
    Ok(Json(
        FinanceService::list_expense_categories(&state.db).await?,
    ))
}

pub async fn create_expense_category(
    State(state): State<AppState>,
    Json(request): Json<CreateExpenseCategoryRequest>,
) -> Result<(StatusCode, Json<ExpenseCategoryResponse>), AppError> {
    let category = FinanceService::create_expense_category(&state.db, request).await?;
    Ok((StatusCode::CREATED, Json(category)))
}

pub async fn list_expenses(
    State(state): State<AppState>,
    Query(query): Query<ExpenseListQuery>,
) -> Result<Json<Paginated<ExpenseResponse>>, AppError> {
    Ok(Json(FinanceService::list_expenses(&state.db, query).await?))
}

pub async fn create_expense(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateExpenseRequest>,
) -> Result<(StatusCode, Json<ExpenseResponse>), AppError> {
    let expense = FinanceService::create_expense(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(expense)))
}

pub async fn list_transactions(
    State(state): State<AppState>,
    Query(query): Query<TransactionListQuery>,
) -> Result<Json<Paginated<MoneyTransactionResponse>>, AppError> {
    Ok(Json(
        FinanceService::list_transactions(&state.db, query).await?,
    ))
}

pub async fn reports_dashboard(
    State(state): State<AppState>,
    ctx: RequestContext,
) -> Result<Json<DashboardReportResponse>, AppError> {
    Ok(Json(
        FinanceService::dashboard(&state.db, &ctx).await?,
    ))
}

pub async fn reports_analytics(
    State(state): State<AppState>,
    Query(query): Query<AnalyticsQuery>,
) -> Result<Json<AnalyticsReportResponse>, AppError> {
    Ok(Json(FinanceService::analytics(&state.db, query).await?))
}

pub async fn get_localization(
    State(state): State<AppState>,
) -> Result<Json<LocalizationSettingsResponse>, AppError> {
    Ok(Json(FinanceService::get_localization(&state.db).await?))
}

pub async fn update_localization(
    State(state): State<AppState>,
    Json(request): Json<UpdateLocalizationRequest>,
) -> Result<Json<LocalizationSettingsResponse>, AppError> {
    Ok(Json(
        FinanceService::update_localization(&state.db, request).await?,
    ))
}

pub async fn get_receipt_settings(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<ReceiptSettingsQuery>,
) -> Result<Json<ReceiptSettingsResponse>, AppError> {
    Ok(Json(
        FinanceService::get_receipt(&state.db, &ctx, query).await?,
    ))
}

pub async fn update_receipt_settings(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<ReceiptSettingsQuery>,
    Json(request): Json<UpdateReceiptRequest>,
) -> Result<Json<ReceiptSettingsResponse>, AppError> {
    Ok(Json(
        FinanceService::update_receipt(&state.db, &ctx, query, request).await?,
    ))
}

pub async fn get_profile_settings(
    State(state): State<AppState>,
    ctx: RequestContext,
) -> Result<Json<ProfileSettingsResponse>, AppError> {
    Ok(Json(
        FinanceService::get_profile(&state.db, &ctx).await?,
    ))
}

pub async fn update_profile_settings(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<UpdateProfileRequest>,
) -> Result<Json<ProfileSettingsResponse>, AppError> {
    Ok(Json(
        FinanceService::update_profile(&state.db, &ctx, request).await?,
    ))
}

pub async fn sync_status() -> Json<SyncStatusResponse> {
    Json(FinanceService::sync_status().await)
}
