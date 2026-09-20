use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::backend::{
    constants::{
        ERROR_CATEGORY_NOT_FOUND, ERROR_CITY_NOT_FOUND, ERROR_CUSTOMER_NOT_FOUND, ERROR_INVALID_ID,
        ERROR_SUPPLIER_NOT_FOUND, ERROR_UNIT_NOT_FOUND,
    },
    context::RequestContext,
    dto::{DeleteResponse, MasterRequest, MasterResponse, PageQuery, Paginated},
    errors::AppError,
    repositories::MasterKind,
    services::MasterService,
    AppState,
};

macro_rules! master_handlers {
    ($list:ident, $get:ident, $create:ident, $update:ident, $delete:ident, $kind:expr, $not_found:expr) => {
        pub async fn $list(
            State(state): State<AppState>,
            _ctx: RequestContext,
            Query(query): Query<PageQuery>,
        ) -> Result<Json<Paginated<MasterResponse>>, AppError> {
            Ok(Json(MasterService::list(&state.db, $kind, query).await?))
        }

        pub async fn $get(
            State(state): State<AppState>,
            _ctx: RequestContext,
            Path(id): Path<String>,
        ) -> Result<Json<MasterResponse>, AppError> {
            Ok(Json(
                MasterService::get(&state.db, $kind, parse_id(&id)?, $not_found).await?,
            ))
        }

        pub async fn $create(
            State(state): State<AppState>,
            ctx: RequestContext,
            Json(request): Json<MasterRequest>,
        ) -> Result<(StatusCode, Json<MasterResponse>), AppError> {
            let row = MasterService::create(&state.db, $kind, request, Some(&ctx)).await?;
            Ok((StatusCode::CREATED, Json(row)))
        }

        pub async fn $update(
            State(state): State<AppState>,
            _ctx: RequestContext,
            Path(id): Path<String>,
            Json(request): Json<MasterRequest>,
        ) -> Result<Json<MasterResponse>, AppError> {
            Ok(Json(
                MasterService::update(&state.db, $kind, parse_id(&id)?, request, $not_found)
                    .await?,
            ))
        }

        pub async fn $delete(
            State(state): State<AppState>,
            ctx: RequestContext,
            Path(id): Path<String>,
        ) -> Result<Json<DeleteResponse>, AppError> {
            let id = parse_id(&id)?;
            MasterService::delete(&state.db, $kind, id, $not_found, Some(&ctx)).await?;
            Ok(Json(DeleteResponse {
                id: id.to_string(),
                deleted: true,
            }))
        }
    };
}

master_handlers!(
    list_categories,
    get_category,
    create_category,
    update_category,
    delete_category,
    MasterKind::Category,
    ERROR_CATEGORY_NOT_FOUND
);
master_handlers!(
    list_cities,
    get_city,
    create_city,
    update_city,
    delete_city,
    MasterKind::City,
    ERROR_CITY_NOT_FOUND
);
master_handlers!(
    list_units,
    get_unit,
    create_unit,
    update_unit,
    delete_unit,
    MasterKind::Unit,
    ERROR_UNIT_NOT_FOUND
);
master_handlers!(
    list_suppliers,
    get_supplier,
    create_supplier,
    update_supplier,
    delete_supplier,
    MasterKind::Supplier,
    ERROR_SUPPLIER_NOT_FOUND
);
master_handlers!(
    list_customers,
    get_customer,
    create_customer,
    update_customer,
    delete_customer,
    MasterKind::Customer,
    ERROR_CUSTOMER_NOT_FOUND
);

fn parse_id(value: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(value).map_err(|_| AppError::Validation(ERROR_INVALID_ID.into()))
}
