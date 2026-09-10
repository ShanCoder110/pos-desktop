use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID,
    context::RequestContext,
    dto::{CreateTransferRequest, Paginated, TransferListQuery, TransferResponse},
    errors::AppError,
    services::TransferService,
    AppState,
};

pub async fn list_transfers(
    State(state): State<AppState>,
    Query(query): Query<TransferListQuery>,
) -> Result<Json<Paginated<TransferResponse>>, AppError> {
    Ok(Json(TransferService::list(&state.db, query).await?))
}

pub async fn get_transfer(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<TransferResponse>, AppError> {
    Ok(Json(
        TransferService::get(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_transfer(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateTransferRequest>,
) -> Result<(StatusCode, Json<TransferResponse>), AppError> {
    let transfer = TransferService::create(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(transfer)))
}

pub async fn send_transfer(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<TransferResponse>, AppError> {
    Ok(Json(
        TransferService::send(&state.db, &ctx, parse_id(&id)?).await?,
    ))
}

pub async fn receive_transfer(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<TransferResponse>, AppError> {
    Ok(Json(
        TransferService::receive(&state.db, &ctx, parse_id(&id)?).await?,
    ))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
