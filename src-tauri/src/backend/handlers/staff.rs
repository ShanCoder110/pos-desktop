use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID,
    context::RequestContext,
    dto::{
        Paginated, StaffLedgerEntryResponse, StaffLedgerListQuery, StaffLedgerResponse,
        StaffPayoutRequest, StaffPayoutResponse,
    },
    errors::AppError,
    services::StaffService,
    AppState,
};

pub async fn list_staff_ledgers(
    State(state): State<AppState>,
    Query(query): Query<StaffLedgerListQuery>,
) -> Result<Json<Paginated<StaffLedgerEntryResponse>>, AppError> {
    Ok(Json(
        StaffService::list_staff_ledgers(&state.db, query).await?,
    ))
}

pub async fn get_user_ledger(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<StaffLedgerResponse>, AppError> {
    Ok(Json(
        StaffService::user_ledger(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_staff_payout(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<StaffPayoutRequest>,
) -> Result<(StatusCode, Json<StaffPayoutResponse>), AppError> {
    let payout = StaffService::record_payout(&state.db, &ctx, parse_id(&id)?, request).await?;
    Ok((StatusCode::CREATED, Json(payout)))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
