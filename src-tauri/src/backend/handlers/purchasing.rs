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
        CreatePurchaseOrderRequest, Paginated, PurchaseOrderListQuery, PurchaseOrderResponse,
        ReceivePurchaseOrderRequest, SupplierLedgerEntryResponse, SupplierLedgerListQuery,
        SupplierPaymentRequest, SupplierPaymentResponse, UnlinkLotRequest,
    },
    errors::AppError,
    services::PurchasingService,
    AppState,
};

pub async fn list_purchase_orders(
    State(state): State<AppState>,
    Query(query): Query<PurchaseOrderListQuery>,
) -> Result<Json<Paginated<PurchaseOrderResponse>>, AppError> {
    Ok(Json(PurchasingService::list(&state.db, query).await?))
}

pub async fn get_purchase_order(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<PurchaseOrderResponse>, AppError> {
    Ok(Json(
        PurchasingService::get(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_purchase_order(
    State(state): State<AppState>,
    ctx: RequestContext,
    Json(request): Json<CreatePurchaseOrderRequest>,
) -> Result<(StatusCode, Json<PurchaseOrderResponse>), AppError> {
    let po = PurchasingService::create(&state.db, &ctx, request).await?;
    Ok((StatusCode::CREATED, Json(po)))
}

pub async fn order_purchase_order(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<PurchaseOrderResponse>, AppError> {
    Ok(Json(
        PurchasingService::order(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn receive_purchase_order(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<ReceivePurchaseOrderRequest>,
) -> Result<Json<PurchaseOrderResponse>, AppError> {
    Ok(Json(
        PurchasingService::receive(&state.db, &ctx, parse_id(&id)?, request).await?,
    ))
}

pub async fn cancel_purchase_order(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<PurchaseOrderResponse>, AppError> {
    Ok(Json(
        PurchasingService::cancel(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn unlink_purchase_order_lot(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<UnlinkLotRequest>,
) -> Result<Json<PurchaseOrderResponse>, AppError> {
    Ok(Json(
        PurchasingService::unlink_lot(&state.db, parse_id(&id)?, request).await?,
    ))
}

pub async fn list_supplier_ledgers(
    State(state): State<AppState>,
    Query(query): Query<SupplierLedgerListQuery>,
) -> Result<Json<Paginated<SupplierLedgerEntryResponse>>, AppError> {
    Ok(Json(
        PurchasingService::list_supplier_ledgers(&state.db, query).await?,
    ))
}

pub async fn get_supplier_ledger(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<SupplierLedgerEntryResponse>>, AppError> {
    Ok(Json(
        PurchasingService::supplier_ledger(&state.db, parse_id(&id)?).await?,
    ))
}

pub async fn create_supplier_payment(
    State(state): State<AppState>,
    ctx: RequestContext,
    Path(id): Path<String>,
    Json(request): Json<SupplierPaymentRequest>,
) -> Result<(StatusCode, Json<SupplierPaymentResponse>), AppError> {
    let payment =
        PurchasingService::supplier_payment(&state.db, &ctx, parse_id(&id)?, request).await?;
    Ok((StatusCode::CREATED, Json(payment)))
}

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
