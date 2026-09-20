use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID,
    context::RequestContext,
    dto::{LotListQuery, LotResponse, Paginated, ReceiveLotRequest, UpdateLotRequest},
    errors::AppError,
    services::LotService,
    AppState,
};

pub async fn list_lots(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Query(query): Query<LotListQuery>,
) -> Result<Json<Paginated<LotResponse>>, AppError> {
    Ok(Json(LotService::list(&state.db, query).await?))
}

pub async fn get_lot(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<LotResponse>, AppError> {
    Ok(Json(LotService::get(&state.db, parse_id(&id)?).await?))
}

pub async fn receive_lot(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<ReceiveLotRequest>,
) -> Result<(StatusCode, Json<LotResponse>), AppError> {
    let lot = LotService::receive(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(lot)))
}

pub async fn update_lot(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<UpdateLotRequest>,
) -> Result<Json<LotResponse>, AppError> {
    Ok(Json(
        LotService::update(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
