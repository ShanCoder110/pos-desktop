use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID, context::RequestContext, dto::TrashItemResponse, errors::AppError,
    services::TrashService, AppState,
};

#[derive(serde::Deserialize)]
pub struct TrashListQuery {
    pub entity: String,
}

pub async fn list_trash(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Query(query): Query<TrashListQuery>,
) -> Result<Json<Vec<TrashItemResponse>>, AppError> {
    Ok(Json(TrashService::list(&state.db, &query.entity).await?))
}

pub async fn restore_trash(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Path((entity, id)): Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    let id = Uuid::parse_str(&id).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))?;
    TrashService::restore(&state.db, &entity, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn purge_trash(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path((entity, id)): Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    let id = Uuid::parse_str(&id).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))?;
    TrashService::purge(&state.db, &ctx, &entity, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
