use chrono::Duration;
use rust_decimal::{prelude::FromPrimitive, Decimal};
use sea_orm::DatabaseConnection;
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{
        ERROR_CASH_SESSION_OPEN, ERROR_DEVICE_NOT_FOUND, ERROR_INVALID_CREDENTIALS,
        ERROR_SESSION_NOT_FOUND, ERROR_UNAUTHORIZED, SESSION_TTL_HOURS,
    },
    context::RequestContext,
    dto::{
        CashSessionCloseRequest, CashSessionOpenRequest, CashSessionResponse, LoginRequest,
        LoginResponse, LogoutResponse, MeResponse,
    },
    errors::AppError,
    repositories::{AuthRepository, OrgRepository},
    security::{generate_session_token, hash_token, verify_password},
    util::{money_value, now_utc, parse_uuid, trimmed},
};

pub struct AuthService;

impl AuthService {
    pub async fn login(
        database: &DatabaseConnection,
        request: LoginRequest,
    ) -> Result<LoginResponse, AppError> {
        request.validate()?;
        let username = request.username.trim();
        let device_id = parse_uuid(&request.device_id, "deviceId")?;
        let user = AuthRepository::find_user_by_username(database, username)
            .await?
            .ok_or(AppError::Unauthorized(ERROR_INVALID_CREDENTIALS))?;
        if !user.is_active {
            return Err(AppError::Unauthorized(ERROR_INVALID_CREDENTIALS));
        }
        if !verify_password(&request.password, &user.password_hash)? {
            return Err(AppError::Unauthorized(ERROR_INVALID_CREDENTIALS));
        }
        let device = OrgRepository::find_device(database, device_id)
            .await?
            .ok_or(AppError::NotFound(ERROR_DEVICE_NOT_FOUND))?;
        if !device.is_active {
            return Err(AppError::Forbidden(
                crate::backend::constants::ERROR_FORBIDDEN,
            ));
        }
        let branch_id = parse_uuid(&device.branch_id, "branchId")?;
        let now = now_utc();
        let expires_at = now + Duration::hours(SESSION_TTL_HOURS);
        let token = generate_session_token();
        let session_id = Uuid::new_v4();
        AuthRepository::create_session(
            database,
            session_id,
            user.id,
            device_id,
            branch_id,
            &hash_token(&token),
            expires_at,
            now,
        )
        .await?;
        AuthRepository::touch_last_login(database, user.id, now).await?;
        OrgRepository::touch_device_seen(database, device_id, now).await?;
        let permissions = AuthRepository::list_permissions(database, user.id).await?;
        let user_response =
            crate::backend::repositories::user_response_from_auth(user, permissions);
        let cash_session = AuthRepository::find_open_cash_session(database, device_id).await?;
        Ok(LoginResponse {
            token,
            expires_at: expires_at.to_rfc3339(),
            user: user_response,
            branch_id: branch_id.to_string(),
            device_id: device_id.to_string(),
            cash_session_id: cash_session.map(|session| session.id),
        })
    }

    pub async fn logout(
        database: &DatabaseConnection,
        ctx: &RequestContext,
    ) -> Result<LogoutResponse, AppError> {
        let revoked = AuthRepository::revoke_session(database, ctx.session_id, now_utc()).await?;
        Ok(LogoutResponse { revoked })
    }

    pub async fn me(
        database: &DatabaseConnection,
        ctx: &RequestContext,
    ) -> Result<MeResponse, AppError> {
        let user = AuthRepository::load_user_response(database, ctx.user_id)
            .await?
            .ok_or(AppError::Unauthorized(ERROR_UNAUTHORIZED))?;
        let device = OrgRepository::find_device(database, ctx.device_id).await?;
        Ok(MeResponse {
            user,
            session_id: ctx.session_id.to_string(),
            branch_id: ctx.branch_id.to_string(),
            device_id: ctx.device_id.to_string(),
            device_name: device.map(|row| row.name),
            cash_session_id: ctx.cash_session_id.map(|value| value.to_string()),
        })
    }

    pub async fn open_cash_session(
        database: &DatabaseConnection,
        ctx: &RequestContext,
        request: CashSessionOpenRequest,
    ) -> Result<CashSessionResponse, AppError> {
        request.validate()?;
        if request.opening_float < Decimal::ZERO {
            return Err(AppError::Validation(
                "openingFloat cannot be negative.".into(),
            ));
        }
        if AuthRepository::find_open_cash_session(database, ctx.device_id)
            .await?
            .is_some()
        {
            return Err(AppError::Conflict(ERROR_CASH_SESSION_OPEN.into()));
        }
        let id = Uuid::new_v4();
        let now = now_utc();
        AuthRepository::create_cash_session(
            database,
            id,
            ctx.branch_id,
            ctx.device_id,
            ctx.user_id,
            money_value(request.opening_float),
            now,
        )
        .await?;
        AuthRepository::find_cash_session(database, id)
            .await?
            .ok_or_else(|| AppError::internal("cash session missing after create"))
    }

    pub async fn current_cash_session(
        database: &DatabaseConnection,
        ctx: &RequestContext,
    ) -> Result<Option<CashSessionResponse>, AppError> {
        AuthRepository::find_open_cash_session(database, ctx.device_id).await
    }

    pub async fn close_cash_session(
        database: &DatabaseConnection,
        ctx: &RequestContext,
        session_id: Uuid,
        request: CashSessionCloseRequest,
    ) -> Result<CashSessionResponse, AppError> {
        request.validate()?;
        if request.counted_cash < Decimal::ZERO {
            return Err(AppError::Validation(
                "countedCash cannot be negative.".into(),
            ));
        }
        let session = AuthRepository::find_cash_session(database, session_id)
            .await?
            .ok_or(AppError::NotFound(ERROR_SESSION_NOT_FOUND))?;
        if session.status != "OPEN" {
            return Err(AppError::Conflict("Cash session is already closed.".into()));
        }
        let device_id = parse_uuid(&session.device_id, "deviceId")?;
        if device_id != ctx.device_id {
            return Err(AppError::Forbidden(
                crate::backend::constants::ERROR_FORBIDDEN,
            ));
        }
        let opening_float =
            Decimal::from_f64(session.opening_float).unwrap_or(Decimal::ZERO);
        let expected = money_value(
            AuthRepository::cash_session_expected(database, session_id, opening_float).await?,
        );
        let counted = money_value(request.counted_cash);
        let variance = money_value(counted - expected);
        let notes = trimmed(&request.notes);
        let now = now_utc();
        let closed = AuthRepository::close_cash_session(
            database,
            session_id,
            expected,
            counted,
            variance,
            notes.as_deref(),
            now,
        )
        .await?;
        if !closed {
            return Err(AppError::Conflict("Cash session is already closed.".into()));
        }
        AuthRepository::find_cash_session(database, session_id)
            .await?
            .ok_or(AppError::NotFound(ERROR_SESSION_NOT_FOUND))
    }
}
