use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use sea_orm::DbErr;
use serde::Serialize;
use tracing::error;
use validator::ValidationErrors;

use super::constants::{
    ERROR_CONFLICT_CODE, ERROR_DATABASE_CODE, ERROR_DUPLICATE_CUSTOMER_PHONE, ERROR_DUPLICATE_RECORD,
    ERROR_FORBIDDEN_CODE, ERROR_INTERNAL, ERROR_INTERNAL_CODE, ERROR_NOT_FOUND_CODE,
    ERROR_UNAUTHORIZED_CODE, ERROR_VALIDATION_CODE, LOG_TARGET,
};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(&'static str),
    #[error("{0}")]
    Unauthorized(&'static str),
    #[error("{0}")]
    Forbidden(&'static str),
    #[error("{0}")]
    Conflict(String),
    #[error(transparent)]
    Database(#[from] DbErr),
    #[error("{0}")]
    Internal(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEnvelope {
    error: ErrorBody,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: &'static str,
    message: String,
    details: Option<serde_json::Value>,
}

impl AppError {
    pub fn internal(error: impl std::fmt::Display) -> Self {
        Self::Internal(error.to_string())
    }
}

impl From<ValidationErrors> for AppError {
    fn from(value: ValidationErrors) -> Self {
        Self::Validation(value.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message, details) = match &self {
            Self::Validation(message) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ERROR_VALIDATION_CODE,
                message.clone(),
                None,
            ),
            Self::NotFound(message) => (
                StatusCode::NOT_FOUND,
                ERROR_NOT_FOUND_CODE,
                (*message).to_string(),
                None,
            ),
            Self::Unauthorized(message) => (
                StatusCode::UNAUTHORIZED,
                ERROR_UNAUTHORIZED_CODE,
                (*message).to_string(),
                None,
            ),
            Self::Forbidden(message) => (
                StatusCode::FORBIDDEN,
                ERROR_FORBIDDEN_CODE,
                (*message).to_string(),
                None,
            ),
            Self::Conflict(message) => (
                StatusCode::CONFLICT,
                ERROR_CONFLICT_CODE,
                message.clone(),
                None,
            ),
            Self::Database(error_value) => {
                error!(target: LOG_TARGET, error = %error_value, "database request failed");
                let text = error_value.to_string().to_lowercase();
                if text.contains("ux_customers_phone") || text.contains("customers.phone") {
                    (
                        StatusCode::CONFLICT,
                        ERROR_CONFLICT_CODE,
                        ERROR_DUPLICATE_CUSTOMER_PHONE.to_string(),
                        None,
                    )
                } else if text.contains("unique") {
                    (
                        StatusCode::CONFLICT,
                        ERROR_CONFLICT_CODE,
                        ERROR_DUPLICATE_RECORD.to_string(),
                        None,
                    )
                } else {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        ERROR_DATABASE_CODE,
                        ERROR_INTERNAL.to_string(),
                        None,
                    )
                }
            }
            Self::Internal(error_value) => {
                error!(target: LOG_TARGET, error = %error_value, "internal request failure");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ERROR_INTERNAL_CODE,
                    ERROR_INTERNAL.to_string(),
                    None,
                )
            }
        };

        (
            status,
            Json(ErrorEnvelope {
                error: ErrorBody {
                    code,
                    message,
                    details,
                },
            }),
        )
            .into_response()
    }
}
