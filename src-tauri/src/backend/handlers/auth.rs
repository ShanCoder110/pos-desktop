use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID,
    context::RequestContext,
    dto::{
        CashSessionCloseRequest, CashSessionOpenRequest, CashSessionResponse, LoginRequest,
        LoginResponse, LogoutResponse, MeResponse,
    },
    errors::AppError,
    services::AuthService,
    AppState,
};

pub async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    Ok(Json(AuthService::login(&state.db, request).await?))
}

pub async fn logout(
    State(state): State<AppState>,
    ctx: RequestContext,
) -> Result<Json<LogoutResponse>, AppError> {
    Ok(Json(AuthService::logout(&state.db, &ctx).await?))
}

pub async fn me(
    State(state): State<AppState>,
    ctx: RequestContext,
) -> Result<Json<MeResponse>, AppError> {
    Ok(Json(AuthService::me(&state.db, &ctx).await?))
}

pub async fn open_cash_session(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CashSessionOpenRequest>,
) -> Result<(StatusCode, Json<CashSessionResponse>), AppError> {
    let session = AuthService::open_cash_session(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(session)))
}

pub async fn current_cash_session(
    State(state): State<AppState>,
    ctx: RequestContext,
) -> Result<Json<Option<CashSessionResponse>>, AppError> {
    Ok(Json(
        AuthService::current_cash_session(&state.db, &ctx).await?,
    ))
}

pub async fn close_cash_session(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<CashSessionCloseRequest>,
) -> Result<Json<CashSessionResponse>, AppError> {
    Ok(Json(
        AuthService::close_cash_session(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
