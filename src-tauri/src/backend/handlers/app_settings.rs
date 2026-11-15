use crate::backend::{
    context::RequestContext, errors::AppError, repositories::AppSettingsRepository, AppState,
};
use axum::{extract::State, Json};
use serde_json::Value;

pub async fn get_app_settings(
    State(state): State<AppState>,
    ctx: RequestContext,
) -> Result<Json<Option<Value>>, AppError> {
    Ok(Json(AppSettingsRepository::get(&state.db, &ctx).await?))
}
pub async fn update_app_settings(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(settings): Json<Value>,
) -> Result<Json<Value>, AppError> {
    Ok(Json(
        AppSettingsRepository::put(&state.db, &ctx, settings).await?,
    ))
}
