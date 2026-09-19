use chrono::Duration;
use rust_decimal::{prelude::FromPrimitive, Decimal};
use sea_orm::DatabaseConnection;
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    config::Config,
    constants::{
        ERROR_CASH_SESSION_OPEN, ERROR_DEVICE_NOT_FOUND, ERROR_INVALID_CREDENTIALS,
        ERROR_INVALID_REFRESH_TOKEN, ERROR_SESSION_NOT_FOUND, ERROR_SETUP_ALREADY_COMPLETE,
        ERROR_SETUP_REQUIRED, ERROR_UNAUTHORIZED, SEED_BRANCH_ID, SEED_USER_ID,
    },
    context::RequestContext,
    dto::{
        AuthStatusResponse, CashSessionCloseRequest, CashSessionOpenRequest, CashSessionResponse,
        LoginRequest, LoginResponse, LogoutResponse, MeResponse, ReceiptSettingsQuery,
        RefreshRequest, SetupRequest, UpdateReceiptRequest,
    },
    errors::AppError,
    repositories::{AuthRepository, FinanceRepository, OrgRepository},
    security::{generate_session_token, hash_password, hash_token, verify_password},
    util::{money_value, now_utc, optional_pk_mobile, parse_uuid, trimmed},
};

pub struct AuthService;

struct IssuedTokens {
    access_token: String,
    access_expires_at: chrono::DateTime<chrono::Utc>,
    refresh_token: String,
    refresh_expires_at: chrono::DateTime<chrono::Utc>,
}

impl AuthService {
    pub async fn status(database: &DatabaseConnection) -> Result<AuthStatusResponse, AppError> {
        let (needs_setup, shop_name) = AuthRepository::setup_status(database).await?;
        Ok(AuthStatusResponse {
            needs_setup,
            shop_name,
        })
    }

    pub async fn setup(
        database: &DatabaseConnection,
        request: SetupRequest,
    ) -> Result<LoginResponse, AppError> {
        request.validate()?;
        let (needs_setup, _) = AuthRepository::setup_status(database).await?;
        if !needs_setup {
            return Err(AppError::Conflict(ERROR_SETUP_ALREADY_COMPLETE.into()));
        }
        let branch_id = parse_uuid(SEED_BRANCH_ID, "branchId")?;
        let owner_id = parse_uuid(SEED_USER_ID, "ownerId")?;
        let device_id = parse_uuid(&request.device_id, "deviceId")?;
        let phone = optional_pk_mobile(request.phone.as_deref())?;
        let email = trimmed(&request.email);
        let username = sanitize_username(request.username.trim());
        if username.is_empty() {
            return Err(AppError::Validation("Enter a username.".into()));
        }
        let existing_owner = OrgRepository::find_user(database, owner_id).await?;
        if OrgRepository::username_exists(database, &username).await? {
            let taken_by_other = match &existing_owner {
                Some(user) => user.username != username,
                None => true,
            };
            if taken_by_other {
                return Err(AppError::Conflict("Username is already taken.".into()));
            }
        }
        let now = now_utc();
        let password_hash = hash_password(request.password.trim())?;
        let branch = OrgRepository::find_branch(database, branch_id)
            .await?
            .ok_or(AppError::internal("main branch missing"))?;
        OrgRepository::update_branch(
            database,
            branch_id,
            request.shop_name.trim(),
            &branch.code,
            &branch.branch_type,
            phone.as_deref(),
            Some(request.address.trim()),
            branch.is_main,
            branch.is_active,
            now,
        )
        .await?;
        if existing_owner.is_some() {
            OrgRepository::update_user(
                database,
                owner_id,
                request.owner_name.trim(),
                &username,
                Some(&password_hash),
                phone.as_deref(),
                email.as_deref(),
                "OWNER",
                Some(branch_id),
                true,
                now,
            )
            .await?;
        } else {
            OrgRepository::create_user(
                database,
                owner_id,
                request.owner_name.trim(),
                &username,
                &password_hash,
                phone.as_deref(),
                email.as_deref(),
                "OWNER",
                Some(branch_id),
                true,
                now,
            )
            .await?;
        }
        let device_name = trimmed(&request.device_name)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Counter 1".to_owned());
        OrgRepository::ensure_device(database, device_id, branch_id, &device_name, now).await?;
        let receipt_query = ReceiptSettingsQuery {
            branch_id: Some(branch_id.to_string()),
        };
        FinanceRepository::update_receipt(
            database,
            &receipt_query,
            branch_id,
            &UpdateReceiptRequest {
                paper_width: None,
                shop_name: Some(request.shop_name.trim().to_owned()),
                header_display: None,
                show_logo: request.show_logo,
                tagline: trimmed(&request.tagline),
                contact_line: trimmed(&request.contact_line).or(phone.clone()),
                footer_note: None,
                show_customer_balance: None,
                show_item_discount: None,
                show_cashier_name: None,
            },
        )
        .await?;
        AuthRepository::mark_setup_complete(database, now).await?;
        issue_login_response(database, owner_id, device_id, branch_id, now).await
    }

    pub async fn login(
        database: &DatabaseConnection,
        request: LoginRequest,
    ) -> Result<LoginResponse, AppError> {
        request.validate()?;
        let (needs_setup, _) = AuthRepository::setup_status(database).await?;
        if needs_setup {
            return Err(AppError::Forbidden(ERROR_SETUP_REQUIRED));
        }
        let email = request.email.trim();
        if email.is_empty() {
            return Err(AppError::Validation("Enter an email.".into()));
        }
        let device_id = parse_uuid(&request.device_id, "deviceId")?;
        let user = AuthRepository::find_user_by_email(database, email)
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
        AuthRepository::touch_last_login(database, user.id, now).await?;
        OrgRepository::touch_device_seen(database, device_id, now).await?;
        issue_login_response(database, user.id, device_id, branch_id, now).await
    }

    pub async fn refresh(
        database: &DatabaseConnection,
        request: RefreshRequest,
    ) -> Result<LoginResponse, AppError> {
        request.validate()?;
        let (needs_setup, _) = AuthRepository::setup_status(database).await?;
        if needs_setup {
            return Err(AppError::Forbidden(ERROR_SETUP_REQUIRED));
        }
        let refresh_token = request.refresh_token.trim();
        if refresh_token.is_empty() {
            return Err(AppError::Unauthorized(ERROR_INVALID_REFRESH_TOKEN));
        }
        let device_id = parse_uuid(&request.device_id, "deviceId")?;
        let row =
            AuthRepository::find_session_by_refresh_hash(database, &hash_token(refresh_token))
                .await?
                .ok_or(AppError::Unauthorized(ERROR_INVALID_REFRESH_TOKEN))?;
        if row.revoked_at.is_some()
            || row.refresh_expires_at <= now_utc()
            || !row.is_active
            || row.device_id != device_id
        {
            return Err(AppError::Unauthorized(ERROR_INVALID_REFRESH_TOKEN));
        }
        let tokens = new_tokens(now_utc());
        let rotated = AuthRepository::rotate_session_tokens(
            database,
            row.session_id,
            &hash_token(&tokens.access_token),
            &hash_token(&tokens.refresh_token),
            tokens.access_expires_at,
            tokens.refresh_expires_at,
            now_utc(),
        )
        .await?;
        if !rotated {
            return Err(AppError::Unauthorized(ERROR_INVALID_REFRESH_TOKEN));
        }
        let permissions = AuthRepository::list_permissions(database, row.user_id).await?;
        let user = AuthRepository::find_user_by_username(database, &row.username)
            .await?
            .ok_or(AppError::Unauthorized(ERROR_INVALID_REFRESH_TOKEN))?;
        let user_response =
            crate::backend::repositories::user_response_from_auth(user, permissions);
        let cash_session = AuthRepository::find_open_cash_session(database, device_id).await?;
        Ok(LoginResponse {
            token: tokens.access_token,
            expires_at: tokens.access_expires_at.to_rfc3339(),
            refresh_token: tokens.refresh_token,
            refresh_expires_at: tokens.refresh_expires_at.to_rfc3339(),
            user: user_response,
            branch_id: row.branch_id.to_string(),
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
        let opening_float = Decimal::from_f64(session.opening_float).unwrap_or(Decimal::ZERO);
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

async fn issue_login_response(
    database: &DatabaseConnection,
    user_id: Uuid,
    device_id: Uuid,
    branch_id: Uuid,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<LoginResponse, AppError> {
    let tokens = new_tokens(now);
    let session_id = Uuid::new_v4();
    AuthRepository::create_session(
        database,
        session_id,
        user_id,
        device_id,
        branch_id,
        &hash_token(&tokens.access_token),
        &hash_token(&tokens.refresh_token),
        tokens.access_expires_at,
        tokens.refresh_expires_at,
        now,
    )
    .await?;
    let user = AuthRepository::load_user_response(database, user_id)
        .await?
        .ok_or(AppError::Unauthorized(ERROR_INVALID_CREDENTIALS))?;
    let cash_session = AuthRepository::find_open_cash_session(database, device_id).await?;
    Ok(LoginResponse {
        token: tokens.access_token,
        expires_at: tokens.access_expires_at.to_rfc3339(),
        refresh_token: tokens.refresh_token,
        refresh_expires_at: tokens.refresh_expires_at.to_rfc3339(),
        user,
        branch_id: branch_id.to_string(),
        device_id: device_id.to_string(),
        cash_session_id: cash_session.map(|session| session.id),
    })
}

fn new_tokens(now: chrono::DateTime<chrono::Utc>) -> IssuedTokens {
    let config = Config::get();
    IssuedTokens {
        access_token: generate_session_token(),
        access_expires_at: now + Duration::minutes(config.access_token_ttl_minutes),
        refresh_token: generate_session_token(),
        refresh_expires_at: now + Duration::days(config.refresh_token_ttl_days),
    }
}

fn sanitize_username(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .chars()
        .take(80)
        .collect()
}
