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
        CompleteProductionRequest, CreateProductionRequest, Paginated, ProductionListQuery,
        ProductionResponse,
    },
    errors::AppError,
    services::ProductionService,
    AppState,
};

pub async fn list_production(
    State(state): State<AppState>,
    Query(query): Query<ProductionListQuery>,
) -> Result<Json<Paginated<ProductionResponse>>, AppError> {
    Ok(Json(ProductionService::list(&state.db, query).await?))
}

pub async fn get_production(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ProductionResponse>, AppError> {
    Ok(Json(
        ProductionService::get(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_production(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateProductionRequest>,
) -> Result<(StatusCode, Json<ProductionResponse>), AppError> {
    let job = ProductionService::create(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(job)))
}

pub async fn start_production(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ProductionResponse>, AppError> {
    Ok(Json(
        ProductionService::start(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn complete_production(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<CompleteProductionRequest>,
) -> Result<Json<ProductionResponse>, AppError> {
    Ok(Json(
        ProductionService::complete(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
