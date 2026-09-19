use sea_orm::DatabaseConnection;
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    config::Config,
    constants::{
        CODE_USERNAME_DUPLICATE, CODE_USER_EMAIL_DUPLICATE, CODE_USER_PHONE_DUPLICATE,
        DEFAULT_INVOICE_PREFIX, DEFAULT_LOT_PREFIX, DEFAULT_PRODUCTION_PREFIX,
        DEFAULT_REPAIR_PREFIX, DEFAULT_SKU_PREFIX, ERROR_BRANCH_NOT_FOUND,
        ERROR_CANNOT_DELETE_OWNER, ERROR_DEVICE_NOT_FOUND, ERROR_DUPLICATE_USER_EMAIL,
        ERROR_DUPLICATE_USER_PHONE, ERROR_USER_BRANCH_REQUIRED, ERROR_USER_EMAIL_REQUIRED,
        ERROR_USER_NOT_FOUND, ERROR_USER_PHONE_REQUIRED, SEED_WALK_IN_CUSTOMER_ID,
    },
    context::RequestContext,
    dto::{
        BranchRequest, BranchResponse, DevicePrinterRequest, DevicePrinterResponse, DeviceResponse,
        PageQuery, Paginated, PaginationMeta, UserListQuery, UserRequest, UserResponse,
    },
    errors::AppError,
    repositories::OrgRepository,
    security::hash_password,
    util::{now_utc, optional_pk_mobile, parse_optional_uuid, parse_uuid, trimmed},
};

const ALLOWED_ROLES: &[&str] = &["OWNER", "MANAGER", "CASHIER", "TECHNICIAN", "PARTNER"];
const ALLOWED_BRANCH_TYPES: &[&str] = &["STORE", "WAREHOUSE", "REPAIR", "PRODUCTION"];
const ALLOWED_PAPER_WIDTHS: &[&str] = &["MM_58", "MM_80", "A4"];

pub struct OrgService;

impl OrgService {
    pub async fn list_users(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        mut query: UserListQuery,
    ) -> Result<Paginated<UserResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = OrgRepository::list_users(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get_user(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        id: Uuid,
    ) -> Result<UserResponse, AppError> {
        OrgRepository::find_user(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_USER_NOT_FOUND))
    }

    pub async fn create_user(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        request: UserRequest,
    ) -> Result<UserResponse, AppError> {
        request.validate()?;
        let password = request
            .password
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| Config::get().default_staff_password.expose());
        let email = trimmed(&request.email)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::Validation(ERROR_USER_EMAIL_REQUIRED.into()))?;
        let phone = optional_pk_mobile(request.phone.as_deref())?
            .ok_or_else(|| AppError::Validation(ERROR_USER_PHONE_REQUIRED.into()))?;
        let role = normalize_role(&request.role)?;
        let default_branch_id =
            parse_optional_uuid(request.default_branch_id.as_deref(), "defaultBranchId")?
                .ok_or_else(|| AppError::Validation(ERROR_USER_BRANCH_REQUIRED.into()))?;
        ensure_branch(database, default_branch_id).await?;
        let id = Uuid::new_v4();
        let now = now_utc();
        let username = derive_username(database, request.username.trim(), &email).await?;
        OrgRepository::create_user(
            database,
            id,
            request.name.trim(),
            &username,
            &hash_password(password)?,
            Some(&phone),
            Some(&email),
            &role,
            Some(default_branch_id),
            request.is_active,
            now,
        )
        .await
        .map_err(map_user_unique_error)?;
        if let Some(permissions) = request.permissions.as_ref() {
            replace_permissions(database, id, permissions, now).await?;
        }
        OrgRepository::find_user(database, id)
            .await?
            .ok_or_else(|| AppError::internal("user missing after create"))
    }

    pub async fn update_user(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        id: Uuid,
        request: UserRequest,
    ) -> Result<UserResponse, AppError> {
        request.validate()?;
        let role = normalize_role(&request.role)?;
        let email = trimmed(&request.email)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::Validation(ERROR_USER_EMAIL_REQUIRED.into()))?;
        let phone = optional_pk_mobile(request.phone.as_deref())?
            .ok_or_else(|| AppError::Validation(ERROR_USER_PHONE_REQUIRED.into()))?;
        let default_branch_id =
            parse_optional_uuid(request.default_branch_id.as_deref(), "defaultBranchId")?
                .ok_or_else(|| AppError::Validation(ERROR_USER_BRANCH_REQUIRED.into()))?;
        ensure_branch(database, default_branch_id).await?;
        let password_hash = match request
            .password
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            Some(password) => Some(hash_password(password)?),
            None => None,
        };
        let now = now_utc();
        let username = if request.username.trim().is_empty() {
            derive_username(database, "", &email).await?
        } else {
            request.username.trim().to_owned()
        };
        let updated = OrgRepository::update_user(
            database,
            id,
            request.name.trim(),
            &username,
            password_hash.as_deref(),
            Some(&phone),
            Some(&email),
            &role,
            Some(default_branch_id),
            request.is_active,
            now,
        )
        .await
        .map_err(map_user_unique_error)?;
        if !updated {
            return Err(AppError::NotFound(ERROR_USER_NOT_FOUND));
        }
        if let Some(permissions) = request.permissions.as_ref() {
            replace_permissions(database, id, permissions, now).await?;
        }
        OrgRepository::find_user(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_USER_NOT_FOUND))
    }

    pub async fn delete_user(
        database: &DatabaseConnection,
        ctx: &RequestContext,
        id: Uuid,
    ) -> Result<(), AppError> {
        let existing = OrgRepository::find_user(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_USER_NOT_FOUND))?;
        if existing.role == "OWNER" {
            return Err(AppError::Validation(ERROR_CANNOT_DELETE_OWNER.into()));
        }
        let now = now_utc();
        let deleted = OrgRepository::soft_delete_user(database, id, Some(ctx.user_id), now).await?;
        if !deleted {
            return Err(AppError::NotFound(ERROR_USER_NOT_FOUND));
        }
        Ok(())
    }

    pub async fn list_branches(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        query: PageQuery,
    ) -> Result<Paginated<BranchResponse>, AppError> {
        let query = query.normalized();
        let (data, total) = OrgRepository::list_branches(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page, query.per_page),
        })
    }

    pub async fn get_branch(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        id: Uuid,
    ) -> Result<BranchResponse, AppError> {
        OrgRepository::find_branch(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_BRANCH_NOT_FOUND))
    }

    pub async fn create_branch(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        request: BranchRequest,
    ) -> Result<BranchResponse, AppError> {
        request.validate()?;
        let branch_type = normalize_branch_type(&request.branch_type)?;
        let id = Uuid::new_v4();
        let now = now_utc();
        if request.is_main {
            OrgRepository::clear_main_branch(database, None, now).await?;
        }
        OrgRepository::create_branch(
            database,
            id,
            request.name.trim(),
            request.code.trim(),
            &branch_type,
            trimmed(&request.phone).as_deref(),
            trimmed(&request.address).as_deref(),
            request.is_main,
            request.is_active,
            now,
        )
        .await?;
        upsert_settings(database, id, request.settings.as_ref(), now).await?;
        OrgRepository::find_branch(database, id)
            .await?
            .ok_or_else(|| AppError::internal("branch missing after create"))
    }

    pub async fn update_branch(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        id: Uuid,
        request: BranchRequest,
    ) -> Result<BranchResponse, AppError> {
        request.validate()?;
        let branch_type = normalize_branch_type(&request.branch_type)?;
        let now = now_utc();
        if request.is_main {
            OrgRepository::clear_main_branch(database, Some(id), now).await?;
        }
        let updated = OrgRepository::update_branch(
            database,
            id,
            request.name.trim(),
            request.code.trim(),
            &branch_type,
            trimmed(&request.phone).as_deref(),
            trimmed(&request.address).as_deref(),
            request.is_main,
            request.is_active,
            now,
        )
        .await?;
        if !updated {
            return Err(AppError::NotFound(ERROR_BRANCH_NOT_FOUND));
        }
        upsert_settings(database, id, request.settings.as_ref(), now).await?;
        OrgRepository::find_branch(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_BRANCH_NOT_FOUND))
    }

    pub async fn list_devices(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        query: PageQuery,
        branch_id: Option<&str>,
    ) -> Result<Paginated<DeviceResponse>, AppError> {
        let query = query.normalized();
        let branch_id = parse_optional_uuid(branch_id, "branchId")?;
        let (data, total) = OrgRepository::list_devices(database, &query, branch_id).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page, query.per_page),
        })
    }

    pub async fn get_device_printer(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        device_id: Uuid,
    ) -> Result<DevicePrinterResponse, AppError> {
        ensure_device(database, device_id).await?;
        OrgRepository::get_device_printer(database, device_id)
            .await?
            .ok_or_else(|| AppError::Validation("Device printer not found.".into()))
    }

    pub async fn upsert_device_printer(
        database: &DatabaseConnection,
        _ctx: &RequestContext,
        device_id: Uuid,
        request: DevicePrinterRequest,
    ) -> Result<DevicePrinterResponse, AppError> {
        request.validate()?;
        if !ALLOWED_PAPER_WIDTHS.contains(&request.paper_width.as_str()) {
            return Err(AppError::Validation(
                "paperWidth must be MM_58, MM_80, or A4.".into(),
            ));
        }
        if request.copies < 1 {
            return Err(AppError::Validation("copies must be at least 1.".into()));
        }
        let device = ensure_device(database, device_id).await?;
        let branch_id = parse_uuid(&device.branch_id, "branchId")?;
        let now = now_utc();
        let existing = OrgRepository::get_device_printer(database, device_id).await?;
        let printer_id = existing
            .as_ref()
            .and_then(|row| Uuid::parse_str(&row.id).ok())
            .unwrap_or_else(Uuid::new_v4);
        OrgRepository::upsert_device_printer(
            database,
            printer_id,
            device_id,
            branch_id,
            request.printer_name.trim(),
            &request.paper_width,
            request.font_size_pt,
            request.auto_print_after_sale,
            request.split_long_bill,
            request.copies,
            now,
        )
        .await?;
        OrgRepository::get_device_printer(database, device_id)
            .await?
            .ok_or_else(|| AppError::internal("device printer missing after upsert"))
    }
}

async fn ensure_branch(database: &DatabaseConnection, id: Uuid) -> Result<(), AppError> {
    OrgRepository::find_branch(database, id)
        .await?
        .ok_or(AppError::NotFound(ERROR_BRANCH_NOT_FOUND))?;
    Ok(())
}

async fn ensure_device(
    database: &DatabaseConnection,
    id: Uuid,
) -> Result<DeviceResponse, AppError> {
    OrgRepository::find_device(database, id)
        .await?
        .ok_or(AppError::NotFound(ERROR_DEVICE_NOT_FOUND))
}

async fn replace_permissions(
    database: &DatabaseConnection,
    user_id: Uuid,
    permissions: &[crate::backend::dto::UserPermissionInput],
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    let rows: Vec<(Uuid, String, bool)> = permissions
        .iter()
        .map(|permission| {
            (
                Uuid::new_v4(),
                permission.permission_key.trim().to_owned(),
                permission.is_allowed,
            )
        })
        .filter(|(_, key, _)| !key.is_empty())
        .collect();
    let refs: Vec<(Uuid, &str, bool)> = rows
        .iter()
        .map(|(id, key, allowed)| (*id, key.as_str(), *allowed))
        .collect();
    OrgRepository::replace_permissions(database, user_id, &refs, now).await
}

async fn upsert_settings(
    database: &DatabaseConnection,
    branch_id: Uuid,
    settings: Option<&crate::backend::dto::BranchSettingsInput>,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    let existing = OrgRepository::find_branch(database, branch_id)
        .await?
        .and_then(|branch| branch.settings);
    let allow_negative_stock = settings
        .and_then(|value| value.allow_negative_stock)
        .or_else(|| existing.as_ref().map(|value| value.allow_negative_stock))
        .unwrap_or(false);
    let require_confirmed = settings
        .and_then(|value| value.require_confirmed_cross_branch_transfer)
        .or_else(|| {
            existing
                .as_ref()
                .map(|value| value.require_confirmed_cross_branch_transfer)
        })
        .unwrap_or(true);
    let fifo_enabled = settings
        .and_then(|value| value.fifo_enabled)
        .or_else(|| existing.as_ref().map(|value| value.fifo_enabled))
        .unwrap_or(true);
    let walk_in = match settings.and_then(|value| value.default_walk_in_customer_id.as_deref()) {
        Some(value) => Some(parse_uuid(value, "defaultWalkInCustomerId")?),
        None => existing
            .as_ref()
            .and_then(|value| value.default_walk_in_customer_id.as_deref())
            .map(|value| parse_uuid(value, "defaultWalkInCustomerId"))
            .transpose()?
            .or_else(|| Uuid::parse_str(SEED_WALK_IN_CUSTOMER_ID).ok()),
    };
    let invoice_prefix = pick_prefix(
        settings.and_then(|value| value.invoice_prefix.as_deref()),
        existing.as_ref().map(|value| value.invoice_prefix.as_str()),
        DEFAULT_INVOICE_PREFIX,
    );
    let repair_prefix = pick_prefix(
        settings.and_then(|value| value.repair_prefix.as_deref()),
        existing.as_ref().map(|value| value.repair_prefix.as_str()),
        DEFAULT_REPAIR_PREFIX,
    );
    let production_prefix = pick_prefix(
        settings.and_then(|value| value.production_prefix.as_deref()),
        existing
            .as_ref()
            .map(|value| value.production_prefix.as_str()),
        DEFAULT_PRODUCTION_PREFIX,
    );
    let lot_prefix = pick_prefix(
        settings.and_then(|value| value.lot_prefix.as_deref()),
        existing.as_ref().map(|value| value.lot_prefix.as_str()),
        DEFAULT_LOT_PREFIX,
    );
    let sku_prefix = pick_prefix(
        settings.and_then(|value| value.sku_prefix.as_deref()),
        existing.as_ref().map(|value| value.sku_prefix.as_str()),
        DEFAULT_SKU_PREFIX,
    );
    let settings_id = existing
        .as_ref()
        .and_then(|value| Uuid::parse_str(&value.id).ok())
        .unwrap_or_else(Uuid::new_v4);
    OrgRepository::upsert_branch_settings(
        database,
        settings_id,
        branch_id,
        allow_negative_stock,
        require_confirmed,
        fifo_enabled,
        walk_in,
        &invoice_prefix,
        &repair_prefix,
        &production_prefix,
        &lot_prefix,
        &sku_prefix,
        now,
    )
    .await
}

fn pick_prefix(input: Option<&str>, existing: Option<&str>, default: &str) -> String {
    input
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or(existing)
        .unwrap_or(default)
        .to_owned()
}

fn normalize_role(role: &str) -> Result<String, AppError> {
    let role = role.trim().to_uppercase();
    if ALLOWED_ROLES.iter().any(|allowed| *allowed == role) {
        Ok(role)
    } else {
        Err(AppError::Validation("role is invalid.".into()))
    }
}

async fn derive_username(
    database: &DatabaseConnection,
    preferred: &str,
    email: &str,
) -> Result<String, AppError> {
    let trimmed = preferred.trim();
    let base = if !trimmed.is_empty() {
        sanitize_username(trimmed)
    } else {
        sanitize_username(email.split('@').next().unwrap_or("user"))
    };
    let base = if base.is_empty() {
        "user".to_owned()
    } else {
        base
    };
    for index in 0..100 {
        let candidate = if index == 0 {
            base.clone()
        } else {
            format!("{base}{index}")
        };
        if !OrgRepository::username_exists(database, &candidate).await? {
            return Ok(candidate);
        }
    }
    Err(AppError::Validation(
        "Could not generate a unique username.".into(),
    ))
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

fn map_user_unique_error(error: AppError) -> AppError {
    let message = error.to_string();
    if message.contains("ux_users_phone") || message.contains("users.phone") {
        AppError::conflict_coded(CODE_USER_PHONE_DUPLICATE, ERROR_DUPLICATE_USER_PHONE)
    } else if message.contains("ux_users_email") || message.contains("users.email") {
        AppError::conflict_coded(CODE_USER_EMAIL_DUPLICATE, ERROR_DUPLICATE_USER_EMAIL)
    } else if message.contains("UNIQUE constraint failed: users.username") {
        AppError::conflict_coded(CODE_USERNAME_DUPLICATE, "This username is already used.")
    } else {
        error
    }
}

fn normalize_branch_type(branch_type: &str) -> Result<String, AppError> {
    let branch_type = branch_type.trim().to_uppercase();
    if ALLOWED_BRANCH_TYPES
        .iter()
        .any(|allowed| *allowed == branch_type)
    {
        Ok(branch_type)
    } else {
        Err(AppError::Validation("type is invalid.".into()))
    }
}
