use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use chrono::Utc;

use crate::backend::{
    constants::{AUTH_BEARER_PREFIX, AUTH_HEADER, ERROR_UNAUTHORIZED},
    context::RequestContext,
    errors::AppError,
    repositories::AuthRepository,
    security::hash_token,
    AppState,
};

impl FromRequestParts<AppState> for RequestContext {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        match load_context(parts, state).await? {
            Some(context) => Ok(context),
            None => Err(AppError::Unauthorized(ERROR_UNAUTHORIZED)),
        }
    }
}

/// Optional auth: missing Authorization yields `None`; invalid tokens still error.
pub struct OptionalRequestContext(pub Option<RequestContext>);

impl FromRequestParts<AppState> for OptionalRequestContext {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(Self(load_context(parts, state).await?))
    }
}

async fn load_context(
    parts: &mut Parts,
    state: &AppState,
) -> Result<Option<RequestContext>, AppError> {
    let Some(header) = parts.headers.get(AUTH_HEADER) else {
        return Ok(None);
    };
    let value = header
        .to_str()
        .map_err(|_| AppError::Unauthorized(ERROR_UNAUTHORIZED))?;
    let Some(token) = value.strip_prefix(AUTH_BEARER_PREFIX) else {
        return Err(AppError::Unauthorized(ERROR_UNAUTHORIZED));
    };
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::Unauthorized(ERROR_UNAUTHORIZED));
    }
    let row = AuthRepository::find_session_by_token_hash(&state.db, &hash_token(token)).await?;
    let Some(row) = row else {
        return Err(AppError::Unauthorized(ERROR_UNAUTHORIZED));
    };
    if row.revoked_at.is_some() || row.expires_at <= Utc::now() || !row.is_active {
        return Err(AppError::Unauthorized(ERROR_UNAUTHORIZED));
    }
    Ok(Some(row.into_context()))
}
