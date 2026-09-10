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
        ClaimListQuery, ClaimResponse, CreateClaimRequest, CreateReturnRequest,
        CustomerLedgerResponse, CustomerPaymentRequest, CustomerPaymentResponse, Paginated,
        ReturnListQuery, ReturnResponse,
    },
    errors::AppError,
    services::CreditService,
    AppState,
};

pub async fn get_customer_ledger(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<CustomerLedgerResponse>, AppError> {
    Ok(Json(
        CreditService::customer_ledger(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_customer_payment(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<CustomerPaymentRequest>,
) -> Result<(StatusCode, Json<CustomerPaymentResponse>), AppError> {
    let payment =
        CreditService::customer_payment(&state.db, &ctx, parse_id(&id)?, request).await?;
    Ok((StatusCode::CREATED, Json(payment)))
}

pub async fn list_returns(
    State(state): State<AppState>,
    Query(query): Query<ReturnListQuery>,
) -> Result<Json<Paginated<ReturnResponse>>, AppError> {
    Ok(Json(CreditService::list_returns(&state.db, query).await?))
}

pub async fn get_return(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ReturnResponse>, AppError> {
    Ok(Json(
        CreditService::get_return(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_return(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateReturnRequest>,
) -> Result<(StatusCode, Json<ReturnResponse>), AppError> {
    let ret = CreditService::create_return(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(ret)))
}

pub async fn list_claims(
    State(state): State<AppState>,
    Query(query): Query<ClaimListQuery>,
) -> Result<Json<Paginated<ClaimResponse>>, AppError> {
    Ok(Json(CreditService::list_claims(&state.db, query).await?))
}

pub async fn get_claim(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ClaimResponse>, AppError> {
    Ok(Json(
        CreditService::get_claim(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_claim(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreateClaimRequest>,
) -> Result<(StatusCode, Json<ClaimResponse>), AppError> {
    let claim = CreditService::create_claim(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(claim)))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
