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
        CompleteSaleRequest, DeleteResponse, HoldRequest, HoldResponse, InvoiceListQuery,
        InvoiceResponse, PageQuery, Paginated, VoidRequest,
    },
    errors::AppError,
    services::SalesService,
    AppState,
};

pub async fn complete_sale(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CompleteSaleRequest>,
) -> Result<(StatusCode, Json<InvoiceResponse>), AppError> {
    let _ = ctx.require_cash_session()?;
    let invoice = SalesService::complete(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(invoice)))
}

pub async fn list_invoices(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Query(query): Query<InvoiceListQuery>,
) -> Result<Json<Paginated<InvoiceResponse>>, AppError> {
    Ok(Json(SalesService::list(&state.db, query).await?))
}

pub async fn get_invoice(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<InvoiceResponse>, AppError> {
    Ok(Json(
        SalesService::get(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn void_invoice(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<VoidRequest>,
) -> Result<Json<InvoiceResponse>, AppError> {
    Ok(Json(
        SalesService::void(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

pub async fn list_holds(
    State(state): State<AppState>,
    ctx: RequestContext,
    Query(query): Query<PageQuery>,
) -> Result<Json<Paginated<HoldResponse>>, AppError> {
    Ok(Json(
        SalesService::list_holds(&state.db, &ctx, query).await?,
    ))
}

pub async fn get_hold(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<HoldResponse>, AppError> {
    Ok(Json(
        SalesService::get_hold(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_hold(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<HoldRequest>,
) -> Result<(StatusCode, Json<HoldResponse>), AppError> {
    let hold = SalesService::create_hold(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(hold)))
}

pub async fn update_hold(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<HoldRequest>,
) -> Result<Json<HoldResponse>, AppError> {
    Ok(Json(
        SalesService::update_hold(&state.db, parse_id(&id)?, request).await?,
    ))
}

pub async fn delete_hold(
    State(state): State<AppState>,
    _ctx: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<DeleteResponse>, AppError> {
    Ok(Json(
        SalesService::delete_hold(&state.db, parse_id(&id)?).await?,
    ))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
