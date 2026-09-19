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
        CompleteRepairRequest, CreateRepairRequest, DeliverRepairRequest, Paginated,
        RepairListQuery, RepairResponse,
    },
    errors::AppError,
    services::RepairService,
    AppState,
};

pub async fn list_repairs(
    State(state): State<AppState>,
    Query(query): Query<RepairListQuery>,
) -> Result<Json<Paginated<RepairResponse>>, AppError> {
    Ok(Json(RepairService::list(&state.db, query).await?))
}

pub async fn get_repair(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<RepairResponse>, AppError> {
    Ok(Json(RepairService::get(&state.db, parse_id(&id)?).await?))
}

pub async fn create_repair(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateRepairRequest>,
) -> Result<(StatusCode, Json<RepairResponse>), AppError> {
    let job = RepairService::create(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(job)))
}

pub async fn start_repair(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<RepairResponse>, AppError> {
    Ok(Json(RepairService::start(&state.db, parse_id(&id)?).await?))
}

pub async fn complete_repair(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<CompleteRepairRequest>,
) -> Result<Json<RepairResponse>, AppError> {
    Ok(Json(
        RepairService::complete(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

pub async fn deliver_repair(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<DeliverRepairRequest>,
) -> Result<Json<RepairResponse>, AppError> {
    Ok(Json(
        RepairService::deliver(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
