use std::path::PathBuf;

use axum::{
    http::{HeaderValue, Method, StatusCode},
    routing::{get, post},
    Json, Router,
};
use sea_orm::DatabaseConnection;
use serde_json::{json, Value};
use tauri::AppHandle;
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::info;

use super::{
    config::Config,
    constants::{
        ALLOWED_API_ORIGINS, API_PREFIX, AUTH_LOGIN_ROUTE, AUTH_LOGOUT_ROUTE, AUTH_ME_ROUTE,
        AUTH_REFRESH_ROUTE, AUTH_SETUP_ROUTE, AUTH_STATUS_ROUTE, BRANCHES_ROUTE,
        BRANCH_BY_ID_ROUTE, CASH_SESSIONS_CURRENT_ROUTE, CASH_SESSIONS_OPEN_ROUTE,
        CASH_SESSION_CLOSE_ROUTE, CATEGORIES_ROUTE, CATEGORY_BY_ID_ROUTE, CITIES_ROUTE,
        CITY_BY_ID_ROUTE, CLAIMS_ROUTE, CLAIM_BY_ID_ROUTE, CUSTOMERS_ROUTE,
        CUSTOMER_ADJUST_BALANCE_ROUTE, CUSTOMER_BY_ID_ROUTE, CUSTOMER_LEDGERS_ROUTE,
        CUSTOMER_LEDGER_ROUTE, CUSTOMER_PAYMENTS_ROUTE, DEVICES_ROUTE, DEVICE_PRINTER_ROUTE,
        EXPENSES_ROUTE, EXPENSE_CATEGORIES_ROUTE, HEALTH_ROUTE, INVOICES_ROUTE,
        INVOICE_BY_ID_ROUTE, INVOICE_VOID_ROUTE, LOG_TARGET, LOTS_RECEIVE_ROUTE, LOTS_ROUTE,
        LOT_BY_ID_ROUTE, PRODUCTION_BY_ID_ROUTE, PRODUCTION_COMPLETE_ROUTE, PRODUCTION_ROUTE,
        PRODUCTION_START_ROUTE, PRODUCTS_ROUTE, PRODUCT_BY_ID_ROUTE, PRODUCT_SEARCH_ROUTE,
        PURCHASE_ORDERS_ROUTE, PURCHASE_ORDER_BY_ID_ROUTE, PURCHASE_ORDER_CANCEL_ROUTE,
        PURCHASE_ORDER_ORDER_ROUTE, PURCHASE_ORDER_RECEIVE_ROUTE, PURCHASE_ORDER_UNLINK_LOT_ROUTE,
        REPAIRS_ROUTE, REPAIR_BY_ID_ROUTE, REPAIR_COMPLETE_ROUTE, REPAIR_DELIVER_ROUTE,
        REPAIR_START_ROUTE, REPORTS_ANALYTICS_ROUTE, REPORTS_DASHBOARD_ROUTE, RETURNS_ROUTE,
        RETURN_BY_ID_ROUTE, SALES_COMPLETE_ROUTE, SALES_HOLDS_ROUTE, SALES_HOLD_BY_ID_ROUTE,
        SETTINGS_LOCALIZATION_ROUTE, SETTINGS_PROFILE_ROUTE, SETTINGS_RECEIPT_ROUTE,
        STAFF_LEDGERS_ROUTE, STOCK_MOVEMENTS_ROUTE, STOCK_ROUTE, SUPPLIERS_ROUTE,
        SUPPLIER_ADJUST_BALANCE_ROUTE, SUPPLIER_BY_ID_ROUTE, SUPPLIER_LEDGERS_ROUTE,
        SUPPLIER_LEDGER_ROUTE, SUPPLIER_PAYMENTS_ROUTE, SYNC_STATUS_ROUTE, TRANSACTIONS_ROUTE,
        TRANSFERS_ROUTE, TRANSFER_BY_ID_ROUTE, TRANSFER_RECEIVE_ROUTE, TRANSFER_SEND_ROUTE,
        TRASH_PURGE_ROUTE, TRASH_RESTORE_ROUTE, TRASH_ROUTE, UNITS_ROUTE, UNIT_BY_ID_ROUTE,
        USERS_ROUTE, USER_BY_ID_ROUTE, USER_LEDGER_ROUTE, USER_PAYOUTS_ROUTE,
    },
    db,
    errors::AppError,
    handlers, AppState,
};

pub async fn start(app: AppHandle) -> Result<(), AppError> {
    serve(db::connect(&app).await?).await
}

pub async fn start_at(path: PathBuf) -> Result<(), AppError> {
    serve(db::connect_path(path).await?).await
}

async fn serve(database: DatabaseConnection) -> Result<(), AppError> {
    let config = Config::load().map_err(AppError::internal)?;
    let host = config.api_host.clone();
    let port = config.api_port;
    let state = AppState {
        db: database,
        config: std::sync::Arc::new(config.clone()),
    };
    let api = Router::new()
        .route(HEALTH_ROUTE, get(health))
        // Auth / till
        .route(AUTH_STATUS_ROUTE, get(handlers::auth_status))
        .route(AUTH_SETUP_ROUTE, post(handlers::setup))
        .route(AUTH_REFRESH_ROUTE, post(handlers::refresh))
        .route(AUTH_LOGIN_ROUTE, post(handlers::login))
        .route(AUTH_LOGOUT_ROUTE, post(handlers::logout))
        .route(AUTH_ME_ROUTE, get(handlers::me))
        .route(CASH_SESSIONS_OPEN_ROUTE, post(handlers::open_cash_session))
        .route(
            CASH_SESSIONS_CURRENT_ROUTE,
            get(handlers::current_cash_session),
        )
        .route(CASH_SESSION_CLOSE_ROUTE, post(handlers::close_cash_session))
        // Org
        .route(
            USERS_ROUTE,
            get(handlers::list_users).post(handlers::create_user),
        )
        .route(
            USER_BY_ID_ROUTE,
            get(handlers::get_user)
                .put(handlers::update_user)
                .delete(handlers::delete_user),
        )
        .route(STAFF_LEDGERS_ROUTE, get(handlers::list_staff_ledgers))
        .route(USER_LEDGER_ROUTE, get(handlers::get_user_ledger))
        .route(USER_PAYOUTS_ROUTE, post(handlers::create_staff_payout))
        .route(
            BRANCHES_ROUTE,
            get(handlers::list_branches).post(handlers::create_branch),
        )
        .route(
            BRANCH_BY_ID_ROUTE,
            get(handlers::get_branch).put(handlers::update_branch),
        )
        .route(DEVICES_ROUTE, get(handlers::list_devices))
        .route(
            DEVICE_PRINTER_ROUTE,
            get(handlers::get_device_printer).put(handlers::upsert_device_printer),
        )
        // Catalog
        .route(PRODUCT_SEARCH_ROUTE, get(handlers::search_products))
        .route(
            PRODUCTS_ROUTE,
            get(handlers::list_products).post(handlers::create_product),
        )
        .route(
            PRODUCT_BY_ID_ROUTE,
            get(handlers::get_product)
                .put(handlers::update_product)
                .delete(handlers::delete_product),
        )
        .route(
            CATEGORIES_ROUTE,
            get(handlers::list_categories).post(handlers::create_category),
        )
        .route(
            CATEGORY_BY_ID_ROUTE,
            get(handlers::get_category)
                .put(handlers::update_category)
                .delete(handlers::delete_category),
        )
        .route(
            CITIES_ROUTE,
            get(handlers::list_cities).post(handlers::create_city),
        )
        .route(
            CITY_BY_ID_ROUTE,
            get(handlers::get_city)
                .put(handlers::update_city)
                .delete(handlers::delete_city),
        )
        .route(
            UNITS_ROUTE,
            get(handlers::list_units).post(handlers::create_unit),
        )
        .route(
            UNIT_BY_ID_ROUTE,
            get(handlers::get_unit)
                .put(handlers::update_unit)
                .delete(handlers::delete_unit),
        )
        .route(
            SUPPLIERS_ROUTE,
            get(handlers::list_suppliers).post(handlers::create_supplier),
        )
        .route(
            SUPPLIER_BY_ID_ROUTE,
            get(handlers::get_supplier)
                .put(handlers::update_supplier)
                .delete(handlers::delete_supplier),
        )
        .route(SUPPLIER_LEDGERS_ROUTE, get(handlers::list_supplier_ledgers))
        .route(SUPPLIER_LEDGER_ROUTE, get(handlers::get_supplier_ledger))
        .route(
            SUPPLIER_PAYMENTS_ROUTE,
            post(handlers::create_supplier_payment),
        )
        .route(
            SUPPLIER_ADJUST_BALANCE_ROUTE,
            post(handlers::adjust_supplier_balance),
        )
        .route(
            CUSTOMERS_ROUTE,
            get(handlers::list_customers).post(handlers::create_customer),
        )
        .route(
            CUSTOMER_BY_ID_ROUTE,
            get(handlers::get_customer)
                .put(handlers::update_customer)
                .delete(handlers::delete_customer),
        )
        .route(CUSTOMER_LEDGERS_ROUTE, get(handlers::list_customer_ledgers))
        .route(CUSTOMER_LEDGER_ROUTE, get(handlers::get_customer_ledger))
        .route(
            CUSTOMER_PAYMENTS_ROUTE,
            post(handlers::create_customer_payment),
        )
        .route(
            CUSTOMER_ADJUST_BALANCE_ROUTE,
            post(handlers::adjust_customer_balance),
        )
        .route(TRASH_ROUTE, get(handlers::list_trash))
        .route(TRASH_RESTORE_ROUTE, post(handlers::restore_trash))
        .route(TRASH_PURGE_ROUTE, post(handlers::purge_trash))
        // Lots / stock
        .route(LOTS_RECEIVE_ROUTE, post(handlers::receive_lot))
        .route(LOTS_ROUTE, get(handlers::list_lots))
        .route(
            LOT_BY_ID_ROUTE,
            get(handlers::get_lot).put(handlers::update_lot),
        )
        .route(STOCK_ROUTE, get(handlers::list_stock))
        .route(STOCK_MOVEMENTS_ROUTE, get(handlers::list_stock_movements))
        // Purchasing
        .route(
            PURCHASE_ORDERS_ROUTE,
            get(handlers::list_purchase_orders).post(handlers::create_purchase_order),
        )
        .route(
            PURCHASE_ORDER_BY_ID_ROUTE,
            get(handlers::get_purchase_order),
        )
        .route(
            PURCHASE_ORDER_ORDER_ROUTE,
            post(handlers::order_purchase_order),
        )
        .route(
            PURCHASE_ORDER_RECEIVE_ROUTE,
            post(handlers::receive_purchase_order),
        )
        .route(
            PURCHASE_ORDER_CANCEL_ROUTE,
            post(handlers::cancel_purchase_order),
        )
        .route(
            PURCHASE_ORDER_UNLINK_LOT_ROUTE,
            post(handlers::unlink_purchase_order_lot),
        )
        // Sales
        .route(SALES_COMPLETE_ROUTE, post(handlers::complete_sale))
        .route(
            SALES_HOLDS_ROUTE,
            get(handlers::list_holds).post(handlers::create_hold),
        )
        .route(
            SALES_HOLD_BY_ID_ROUTE,
            get(handlers::get_hold)
                .put(handlers::update_hold)
                .delete(handlers::delete_hold),
        )
        .route(INVOICES_ROUTE, get(handlers::list_invoices))
        .route(INVOICE_BY_ID_ROUTE, get(handlers::get_invoice))
        .route(INVOICE_VOID_ROUTE, post(handlers::void_invoice))
        // Returns / claims
        .route(
            RETURNS_ROUTE,
            get(handlers::list_returns).post(handlers::create_return),
        )
        .route(RETURN_BY_ID_ROUTE, get(handlers::get_return))
        .route(
            CLAIMS_ROUTE,
            get(handlers::list_claims).post(handlers::create_claim),
        )
        .route(CLAIM_BY_ID_ROUTE, get(handlers::get_claim))
        // Transfers
        .route(
            TRANSFERS_ROUTE,
            get(handlers::list_transfers).post(handlers::create_transfer),
        )
        .route(TRANSFER_BY_ID_ROUTE, get(handlers::get_transfer))
        .route(TRANSFER_SEND_ROUTE, post(handlers::send_transfer))
        .route(TRANSFER_RECEIVE_ROUTE, post(handlers::receive_transfer))
        // Production / repair
        .route(
            PRODUCTION_ROUTE,
            get(handlers::list_production).post(handlers::create_production),
        )
        .route(PRODUCTION_BY_ID_ROUTE, get(handlers::get_production))
        .route(PRODUCTION_START_ROUTE, post(handlers::start_production))
        .route(
            PRODUCTION_COMPLETE_ROUTE,
            post(handlers::complete_production),
        )
        .route(
            REPAIRS_ROUTE,
            get(handlers::list_repairs).post(handlers::create_repair),
        )
        .route(REPAIR_BY_ID_ROUTE, get(handlers::get_repair))
        .route(REPAIR_START_ROUTE, post(handlers::start_repair))
        .route(REPAIR_COMPLETE_ROUTE, post(handlers::complete_repair))
        .route(REPAIR_DELIVER_ROUTE, post(handlers::deliver_repair))
        // Finance / reports / settings
        .route(
            EXPENSE_CATEGORIES_ROUTE,
            get(handlers::list_expense_categories).post(handlers::create_expense_category),
        )
        .route(
            EXPENSES_ROUTE,
            get(handlers::list_expenses).post(handlers::create_expense),
        )
        .route(TRANSACTIONS_ROUTE, get(handlers::list_transactions))
        .route(REPORTS_DASHBOARD_ROUTE, get(handlers::reports_dashboard))
        .route(REPORTS_ANALYTICS_ROUTE, get(handlers::reports_analytics))
        .route(
            SETTINGS_LOCALIZATION_ROUTE,
            get(handlers::get_localization).put(handlers::update_localization),
        )
        .route(
            SETTINGS_RECEIPT_ROUTE,
            get(handlers::get_receipt_settings).put(handlers::update_receipt_settings),
        )
        .route(
            SETTINGS_PROFILE_ROUTE,
            get(handlers::get_profile_settings).put(handlers::update_profile_settings),
        )
        .route(SYNC_STATUS_ROUTE, get(handlers::sync_status))
        .with_state(state);

    let router = Router::new()
        .nest(API_PREFIX, api)
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(
                    ALLOWED_API_ORIGINS
                        .into_iter()
                        .map(HeaderValue::from_static),
                ))
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http());
    let listener = tokio::net::TcpListener::bind((host.as_str(), port))
        .await
        .map_err(AppError::internal)?;
    info!(target: LOG_TARGET, host = %host, port, "backend API listening");
    axum::serve(listener, router)
        .await
        .map_err(AppError::internal)
}

async fn health() -> (StatusCode, Json<Value>) {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}
