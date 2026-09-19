use axum::{extract::Path, extract::State, Json};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{ERROR_CUSTOMER_NOT_FOUND, ERROR_INVALID_ID, ERROR_SUPPLIER_NOT_FOUND},
    context::RequestContext,
    dto::{AdjustBalanceRequest, AdjustBalanceResponse},
    errors::AppError,
    services::BalanceService,
    util::decimal,
    AppState,
};

fn parse_id(id: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(id).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}

pub async fn adjust_supplier_balance(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<AdjustBalanceRequest>,
) -> Result<Json<AdjustBalanceResponse>, AppError> {
    request.validate()?;
    let supplier_id = parse_id(&id)?;
    let balance = BalanceService::adjust_supplier(
        &state.db,
        supplier_id,
        request.amount,
        Some(request.notes.trim()),
        &ctx,
    )
    .await
    .map_err(|error| match error {
        AppError::NotFound(_) => AppError::NotFound(ERROR_SUPPLIER_NOT_FOUND),
        other => other,
    })?;
    Ok(Json(AdjustBalanceResponse {
        balance_after: decimal(balance),
    }))
}

pub async fn adjust_customer_balance(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<AdjustBalanceRequest>,
) -> Result<Json<AdjustBalanceResponse>, AppError> {
    request.validate()?;
    let customer_id = parse_id(&id)?;
    let balance = BalanceService::adjust_customer(
        &state.db,
        customer_id,
        request.amount,
        Some(request.notes.trim()),
        &ctx,
    )
    .await
    .map_err(|error| match error {
        AppError::NotFound(_) => AppError::NotFound(ERROR_CUSTOMER_NOT_FOUND),
        other => other,
    })?;
    Ok(Json(AdjustBalanceResponse {
        balance_after: decimal(balance),
    }))
}
