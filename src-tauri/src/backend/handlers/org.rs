use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::backend::{
    constants::ERROR_INVALID_ID,
    context::RequestContext,
    dto::{
        BranchRequest, BranchResponse, DevicePrinterRequest, DevicePrinterResponse, DeviceResponse,
        PageQuery, Paginated, UserListQuery, UserRequest, UserResponse,
    },
    errors::AppError,
    services::OrgService,
    AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceListQuery {
    #[serde(flatten)]
    pub page: PageQuery,
    pub branch_id: Option<String>,
}

pub async fn list_users(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<UserListQuery>,
) -> Result<Json<Paginated<UserResponse>>, AppError> {
    Ok(Json(OrgService::list_users(&state.db, &ctx, query).await?))
}

pub async fn get_user(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<UserResponse>, AppError> {
    Ok(Json(
        OrgService::get_user(&state.db, &ctx, parse_id(&id)?).await?,
    ))
}

pub async fn create_user(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<UserRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    let user = OrgService::create_user(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(user)))
}

pub async fn update_user(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<UserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    Ok(Json(
        OrgService::update_user(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

pub async fn delete_user(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    OrgService::delete_user(&state.db, &ctx, parse_id(&id)?).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_branches(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<PageQuery>,
) -> Result<Json<Paginated<BranchResponse>>, AppError> {
    Ok(Json(
        OrgService::list_branches(&state.db, &ctx, query).await?,
    ))
}

pub async fn get_branch(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<BranchResponse>, AppError> {
    Ok(Json(
        OrgService::get_branch(&state.db, &ctx, parse_id(&id)?).await?,
    ))
}

pub async fn create_branch(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<BranchRequest>,
) -> Result<(StatusCode, Json<BranchResponse>), AppError> {
    let branch = OrgService::create_branch(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(branch)))
}

pub async fn update_branch(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<BranchRequest>,
) -> Result<Json<BranchResponse>, AppError> {
    Ok(Json(
        OrgService::update_branch(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

pub async fn list_devices(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<DeviceListQuery>,
) -> Result<Json<Paginated<DeviceResponse>>, AppError> {
    Ok(Json(
        OrgService::list_devices(&state.db, &ctx, query.page, query.branch_id.as_deref()).await?,
    ))
}

pub async fn get_device_printer(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<DevicePrinterResponse>, AppError> {
    Ok(Json(
        OrgService::get_device_printer(&state.db, &ctx, parse_id(&id)?).await?,
    ))
}

pub async fn upsert_device_printer(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<DevicePrinterRequest>,
) -> Result<Json<DevicePrinterResponse>, AppError> {
    Ok(Json(
        OrgService::upsert_device_printer(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
