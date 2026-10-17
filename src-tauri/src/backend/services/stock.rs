use rust_decimal::Decimal;
use sea_orm::{DatabaseConnection, TransactionTrait};
use validator::Validate;

use crate::backend::{
    constants::{
        ERROR_STOCK_COUNT_DENIED, ERROR_STOCK_COUNT_REASON_REQUIRED,
        ERROR_STOCK_COUNT_SUPPLIER_REQUIRED,
    },
    context::RequestContext,
    dto::{
        Paginated, PaginationMeta, StockCountRequest, StockCountResponse, StockListQuery,
        StockMovementListQuery, StockMovementResponse, StockReconcileResponse, StockRow,
    },
    errors::AppError,
    repositories::{
        LedgerParty, LedgerRepository, StockCountApply, StockCountRepository, StockRepository,
    },
    util::{money_value, parse_optional_uuid, parse_uuid, quantity},
};

fn ensure_stock_count_permission(context: &RequestContext) -> Result<(), AppError> {
    if matches!(context.role.as_str(), "OWNER" | "MANAGER") {
        Ok(())
    } else {
        Err(AppError::Forbidden(ERROR_STOCK_COUNT_DENIED))
    }
}

pub struct StockService;

impl StockService {
    pub async fn list(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut query: StockListQuery,
    ) -> Result<Paginated<StockRow>, AppError> {
        query.page = query.page.normalized();
        let (data, total) =
            StockRepository::list(database, &query, Some(context.branch_id)).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn list_movements(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut query: StockMovementListQuery,
    ) -> Result<Paginated<StockMovementResponse>, AppError> {
        // Stock-count history filters ADJUSTMENT movements. Cashiers must not
        // load that feed (403); product lot history without the filter stays open.
        if query
            .movement_type
            .as_deref()
            .map(|value| value.eq_ignore_ascii_case("ADJUSTMENT"))
            .unwrap_or(false)
        {
            ensure_stock_count_permission(context)?;
        }
        query.page = query.page.normalized();
        let (data, total) =
            StockRepository::list_movements(database, &query, Some(context.branch_id)).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn count(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: StockCountRequest,
    ) -> Result<StockCountResponse, AppError> {
        ensure_stock_count_permission(context)?;
        request.counted_quantity = quantity(request.counted_quantity);
        request.reason = request.reason.trim().to_owned();
        if request.reason.is_empty() || request.reason.len() > 200 {
            return Err(AppError::Validation(
                ERROR_STOCK_COUNT_REASON_REQUIRED.into(),
            ));
        }
        request.validate()?;

        let product_id = parse_uuid(&request.product_id, "productId")?;
        let branch_id = match request.branch_id.as_deref() {
            Some(value) => parse_uuid(value, "branchId")?,
            None => context.branch_id,
        };
        let product_unit_id = parse_uuid(&request.product_unit_id, "productUnitId")?;

        let supplier_ledger = if request.adjust_supplier_payable {
            let supplier_id = parse_optional_uuid(request.supplier_id.as_deref(), "supplierId")?
                .ok_or_else(|| AppError::Validation(ERROR_STOCK_COUNT_SUPPLIER_REQUIRED.into()))?;
            let amount = request
                .supplier_amount
                .ok_or_else(|| AppError::Validation(ERROR_STOCK_COUNT_SUPPLIER_REQUIRED.into()))?;
            Some((supplier_id, money_value(amount)))
        } else {
            None
        };

        let transaction = database.begin().await?;
        let mut response = StockCountRepository::apply(
            &transaction,
            context,
            StockCountApply {
                product_id,
                branch_id,
                product_unit_id,
                counted_displayed: request.counted_quantity,
                reason: request.reason.clone(),
            },
        )
        .await?;

        if let Some((supplier_id, amount)) = supplier_ledger {
            if amount != Decimal::ZERO {
                LedgerRepository::post_adjustment(
                    &transaction,
                    LedgerParty::Supplier(supplier_id),
                    branch_id,
                    amount,
                    Some(&request.reason),
                    chrono::Utc::now(),
                    context.user_id,
                )
                .await?;
                response.supplier_ledger_posted = true;
            }
        }

        transaction.commit().await?;
        Ok(response)
    }

    pub async fn reconcile(
        database: &DatabaseConnection,
        context: &RequestContext,
    ) -> Result<StockReconcileResponse, AppError> {
        ensure_stock_count_permission(context)?;
        StockCountRepository::reconcile(database).await
    }
}

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;
    use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement};
    use uuid::Uuid;

    use crate::backend::{
        constants::{SEED_BRANCH_ID, SEED_DEVICE_ID, SEED_USER_ID},
        context::RequestContext,
        db::connect_memory,
        dto::{
            CreateProductRequest, MasterRequest, OpeningStockInput, ProductUnitInput,
            StockCountRequest, StockMovementListQuery,
        },
        errors::AppError,
        repositories::{MasterKind, OrgRepository, StockCountRepository},
        services::{MasterService, ProductService, StockService},
    };

    async fn seed_owner(database: &DatabaseConnection) {
        OrgRepository::create_user(
            database,
            Uuid::parse_str(SEED_USER_ID).unwrap(),
            "Owner",
            "owner",
            "test-password-hash",
            None,
            None,
            "OWNER",
            Some(Uuid::parse_str(SEED_BRANCH_ID).unwrap()),
            None,
            true,
            chrono::Utc::now(),
        )
        .await
        .expect("seed owner");
    }

    fn ctx(role: &str) -> RequestContext {
        RequestContext {
            session_id: Uuid::new_v4(),
            user_id: Uuid::parse_str(SEED_USER_ID).unwrap(),
            branch_id: Uuid::parse_str(SEED_BRANCH_ID).unwrap(),
            device_id: Uuid::parse_str(SEED_DEVICE_ID).unwrap(),
            cash_session_id: None,
            role: role.into(),
            name: "Owner".into(),
            username: "owner".into(),
        }
    }

    async fn product_stock(database: &DatabaseConnection, product_id: &str) -> f64 {
        #[derive(Debug, FromQueryResult)]
        struct Row {
            stock: f64,
        }
        let pid = Uuid::parse_str(product_id).unwrap();
        Row::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT CAST(COALESCE((SELECT SUM(bl.remaining_base_quantity)
              FROM branch_lots bl
              JOIN product_lots pl ON pl.id = bl.product_lot_id
              WHERE pl.product_id = ? AND pl.deleted_at IS NULL), 0) AS REAL) AS stock",
            [pid.into()],
        ))
        .one(database)
        .await
        .expect("stock query")
        .map(|row| row.stock)
        .unwrap_or(0.0)
    }

    async fn lot_remaining_sum(database: &DatabaseConnection, product_id: &str) -> f64 {
        #[derive(Debug, FromQueryResult)]
        struct Row {
            qty: f64,
        }
        let pid = Uuid::parse_str(product_id).unwrap();
        Row::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT CAST(COALESCE(SUM(remaining_base_quantity), 0) AS REAL) AS qty
             FROM product_lots WHERE product_id = ? AND deleted_at IS NULL",
            [pid.into()],
        ))
        .one(database)
        .await
        .expect("lot sum")
        .map(|row| row.qty)
        .unwrap_or(0.0)
    }

    async fn movement_count(database: &DatabaseConnection, product_id: &str) -> i64 {
        #[derive(Debug, FromQueryResult)]
        struct Row {
            count: i64,
        }
        let pid = Uuid::parse_str(product_id).unwrap();
        Row::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM stock_movements WHERE product_id = ? AND type = 'ADJUSTMENT' AND reference_type = 'StockAdjustment'",
            [pid.into()],
        ))
        .one(database)
        .await
        .expect("movements")
        .map(|row| row.count)
        .unwrap_or(0)
    }

    async fn make_category(database: &DatabaseConnection) -> String {
        MasterService::create(
            database,
            MasterKind::Category,
            MasterRequest {
                name: format!("StockCat-{}", Uuid::new_v4()),
                symbol: None,
                phone: None,
                email: None,
                address: None,
                city_id: None,
                notes: None,
                is_active: true,
                precision: None,
                is_walk_in: false,
                in_credit_book: None,
                previous_balance: None,
            },
            None,
        )
        .await
        .expect("category")
        .id
    }

    async fn unit_id(database: &DatabaseConnection, symbol: &str) -> String {
        MasterService::list(database, MasterKind::Unit, Default::default())
            .await
            .expect("units")
            .data
            .into_iter()
            .find(|u| u.symbol.as_deref() == Some(symbol))
            .unwrap_or_else(|| panic!("missing unit {symbol}"))
            .id
    }

    /// (a) stock 100 pieces → count 94: diff -6, movement, stock/lots/branch_lots = 94
    #[tokio::test]
    async fn stock_count_down_in_pieces() {
        let database = connect_memory().await.expect("db");
        seed_owner(&database).await;
        let context = ctx("OWNER");
        let category_id = make_category(&database).await;
        let pc = unit_id(&database, "pc").await;

        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                name: "Count Down Widget".into(),
                category_id,
                base_unit_id: pc.clone(),
                created_by: None,
                sku: None,
                barcode: None,
                is_manufactured: false,
                track_lots: true,
                track_expiry: false,
                minimum_stock: Decimal::ZERO,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                sell_units: vec![ProductUnitInput {
                    id: None,
                    unit_id: pc,
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(10, 0),
                    min: Decimal::new(10, 0),
                    wholesale: Decimal::new(12, 0),
                    price: Decimal::new(20, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(100, 0),
                    cost: Decimal::new(10, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");
        let unit_id = product.sell_units[0].id.clone();
        assert!((product_stock(&database, &product.id).await - 100.0).abs() < 0.01);

        let result = StockService::count(
            &database,
            &context,
            StockCountRequest {
                product_id: product.id.clone(),
                branch_id: Some(SEED_BRANCH_ID.into()),
                product_unit_id: unit_id,
                counted_quantity: Decimal::new(94, 0),
                reason: "Shelf count short".into(),
                adjust_supplier_payable: false,
                supplier_id: None,
                supplier_amount: None,
            },
        )
        .await
        .expect("count 94");

        assert!((result.old_quantity - 100.0).abs() < 0.01);
        assert!((result.new_quantity - 94.0).abs() < 0.01);
        assert!((result.difference - (-6.0)).abs() < 0.01);
        assert!(!result.movement_ids.is_empty());
        assert!((product_stock(&database, &product.id).await - 94.0).abs() < 0.01);
        assert!((lot_remaining_sum(&database, &product.id).await - 94.0).abs() < 0.01);
        assert!(movement_count(&database, &product.id).await >= 1);
    }

    /// (b) boxes of 12: count 5 boxes → 60 base
    #[tokio::test]
    async fn stock_count_in_boxes_of_twelve() {
        let database = connect_memory().await.expect("db");
        seed_owner(&database).await;
        let context = ctx("OWNER");
        let category_id = make_category(&database).await;
        let pc = unit_id(&database, "pc").await;
        let box_unit = unit_id(&database, "box").await;

        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                name: "Count Box Widget".into(),
                category_id,
                base_unit_id: pc.clone(),
                created_by: None,
                sku: None,
                barcode: None,
                is_manufactured: false,
                track_lots: true,
                track_expiry: false,
                minimum_stock: Decimal::ZERO,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                sell_units: vec![
                    ProductUnitInput {
                        id: None,
                        unit_id: pc,
                        name: "Piece".into(),
                        contains: Decimal::ONE,
                        cost: Decimal::new(5, 0),
                        min: Decimal::new(5, 0),
                        wholesale: Decimal::new(6, 0),
                        price: Decimal::new(8, 0),
                        barcode: None,
                        factor_direction: None,
                        is_base: true,
                        is_default: true,
                    },
                    ProductUnitInput {
                        id: None,
                        unit_id: box_unit,
                        name: "Box".into(),
                        contains: Decimal::new(12, 0),
                        cost: Decimal::new(60, 0),
                        min: Decimal::new(60, 0),
                        wholesale: Decimal::new(70, 0),
                        price: Decimal::new(90, 0),
                        barcode: None,
                        factor_direction: None,
                        is_base: false,
                        is_default: false,
                    },
                ],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(100, 0),
                    cost: Decimal::new(5, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");
        let box_sell = product
            .sell_units
            .iter()
            .find(|u| u.name == "Box")
            .expect("box unit")
            .id
            .clone();

        let result = StockService::count(
            &database,
            &context,
            StockCountRequest {
                product_id: product.id.clone(),
                branch_id: None,
                product_unit_id: box_sell,
                counted_quantity: Decimal::new(5, 0),
                reason: "Five boxes on shelf".into(),
                adjust_supplier_payable: false,
                supplier_id: None,
                supplier_amount: None,
            },
        )
        .await
        .expect("count 5 boxes");

        assert!((result.new_quantity - 60.0).abs() < 0.01);
        assert!((result.difference - (-40.0)).abs() < 0.01);
        assert!((product_stock(&database, &product.id).await - 60.0).abs() < 0.01);
    }

    /// (c) up within cap, then beyond → adjustment lot
    #[tokio::test]
    async fn stock_count_up_within_and_beyond_cap() {
        let database = connect_memory().await.expect("db");
        seed_owner(&database).await;
        let context = ctx("OWNER");
        let category_id = make_category(&database).await;
        let pc = unit_id(&database, "pc").await;

        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                name: "Count Up Widget".into(),
                category_id,
                base_unit_id: pc.clone(),
                created_by: None,
                sku: None,
                barcode: None,
                is_manufactured: false,
                track_lots: true,
                track_expiry: false,
                minimum_stock: Decimal::ZERO,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                sell_units: vec![ProductUnitInput {
                    id: None,
                    unit_id: pc,
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(10, 0),
                    min: Decimal::new(10, 0),
                    wholesale: Decimal::new(12, 0),
                    price: Decimal::new(20, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(100, 0),
                    cost: Decimal::new(10, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");
        let unit_id = product.sell_units[0].id.clone();

        // Create room within cap: count down to 90 (max still 100).
        StockService::count(
            &database,
            &context,
            StockCountRequest {
                product_id: product.id.clone(),
                branch_id: None,
                product_unit_id: unit_id.clone(),
                counted_quantity: Decimal::new(90, 0),
                reason: "Prep room in lot".into(),
                adjust_supplier_payable: false,
                supplier_id: None,
                supplier_amount: None,
            },
        )
        .await
        .expect("down to 90");

        let within = StockService::count(
            &database,
            &context,
            StockCountRequest {
                product_id: product.id.clone(),
                branch_id: None,
                product_unit_id: unit_id.clone(),
                counted_quantity: Decimal::new(100, 0),
                reason: "Fill to cap".into(),
                adjust_supplier_payable: false,
                supplier_id: None,
                supplier_amount: None,
            },
        )
        .await
        .expect("up to 100 within cap");
        assert!(within.created_adjustment_lot_id.is_none());
        assert!((within.new_quantity - 100.0).abs() < 0.01);

        let beyond = StockService::count(
            &database,
            &context,
            StockCountRequest {
                product_id: product.id.clone(),
                branch_id: None,
                product_unit_id: unit_id,
                counted_quantity: Decimal::new(110, 0),
                reason: "Found extra stock".into(),
                adjust_supplier_payable: false,
                supplier_id: None,
                supplier_amount: None,
            },
        )
        .await
        .expect("up to 110 beyond cap");
        assert!(
            beyond.created_adjustment_lot_id.is_some(),
            "overflow must create ADJUSTMENT lot"
        );
        assert!((beyond.new_quantity - 110.0).abs() < 0.01);
        assert!((product_stock(&database, &product.id).await - 110.0).abs() < 0.01);
    }

    /// (d) cashier → 403
    #[tokio::test]
    async fn stock_count_cashier_forbidden() {
        let database = connect_memory().await.expect("db");
        seed_owner(&database).await;
        let owner = ctx("OWNER");
        let category_id = make_category(&database).await;
        let pc = unit_id(&database, "pc").await;
        let product = ProductService::create(
            &database,
            &owner,
            CreateProductRequest {
                name: "Cashier Count Widget".into(),
                category_id,
                base_unit_id: pc.clone(),
                created_by: None,
                sku: None,
                barcode: None,
                is_manufactured: false,
                track_lots: true,
                track_expiry: false,
                minimum_stock: Decimal::ZERO,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                sell_units: vec![ProductUnitInput {
                    id: None,
                    unit_id: pc,
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(1, 0),
                    min: Decimal::new(1, 0),
                    wholesale: Decimal::new(1, 0),
                    price: Decimal::new(2, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(10, 0),
                    cost: Decimal::new(1, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");

        let forbidden = StockService::count(
            &database,
            &ctx("CASHIER"),
            StockCountRequest {
                product_id: product.id,
                branch_id: None,
                product_unit_id: product.sell_units[0].id.clone(),
                counted_quantity: Decimal::new(8, 0),
                reason: "cashier attempt".into(),
                adjust_supplier_payable: false,
                supplier_id: None,
                supplier_amount: None,
            },
        )
        .await;
        assert!(
            matches!(forbidden, Err(AppError::Forbidden(_))),
            "cashier must get 403, got {forbidden:?}"
        );
    }

    #[tokio::test]
    async fn stock_count_rejects_over_max_base_units() {
        let database = connect_memory().await.expect("db");
        seed_owner(&database).await;
        let owner = ctx("OWNER");
        let category_id = make_category(&database).await;
        let pc = unit_id(&database, "pc").await;
        let product = ProductService::create(
            &database,
            &owner,
            CreateProductRequest {
                name: "Max Count Widget".into(),
                category_id,
                base_unit_id: pc.clone(),
                created_by: None,
                sku: None,
                barcode: None,
                is_manufactured: false,
                track_lots: true,
                track_expiry: false,
                minimum_stock: Decimal::ZERO,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                sell_units: vec![ProductUnitInput {
                    id: None,
                    unit_id: pc,
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(1, 0),
                    min: Decimal::new(1, 0),
                    wholesale: Decimal::new(1, 0),
                    price: Decimal::new(2, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(10, 0),
                    cost: Decimal::new(1, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");

        let err = StockService::count(
            &database,
            &owner,
            StockCountRequest {
                product_id: product.id,
                branch_id: None,
                product_unit_id: product.sell_units[0].id.clone(),
                counted_quantity: Decimal::from(1_000_001),
                reason: "too many".into(),
                adjust_supplier_payable: false,
                supplier_id: None,
                supplier_amount: None,
            },
        )
        .await
        .expect_err("over max must 422");
        assert!(
            matches!(err, AppError::Validation(_)),
            "expected validation, got {err:?}"
        );
    }

    #[tokio::test]
    async fn stock_count_adjustment_history_cashier_forbidden() {
        let database = connect_memory().await.expect("db");
        seed_owner(&database).await;
        let err = StockService::list_movements(
            &database,
            &ctx("CASHIER"),
            StockMovementListQuery {
                page: Default::default(),
                product_id: None,
                branch_id: None,
                movement_type: Some("ADJUSTMENT".into()),
            },
        )
        .await
        .expect_err("cashier adjustment history must 403");
        assert!(
            matches!(err, AppError::Forbidden(_)),
            "expected forbidden, got {err:?}"
        );
    }

    /// (e) reconcile repairs seeded 293 vs 242 mismatch
    #[tokio::test]
    async fn stock_reconcile_repairs_seeded_mismatch() {
        let database = connect_memory().await.expect("db");
        seed_owner(&database).await;
        let context = ctx("OWNER");
        let category_id = make_category(&database).await;
        let pc = unit_id(&database, "pc").await;
        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                name: "Reconcile Widget".into(),
                category_id,
                base_unit_id: pc.clone(),
                created_by: None,
                sku: None,
                barcode: None,
                is_manufactured: false,
                track_lots: true,
                track_expiry: false,
                minimum_stock: Decimal::ZERO,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                sell_units: vec![ProductUnitInput {
                    id: None,
                    unit_id: pc,
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(1, 0),
                    min: Decimal::new(1, 0),
                    wholesale: Decimal::new(1, 0),
                    price: Decimal::new(2, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(293, 0),
                    cost: Decimal::new(1, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");

        // Seed QA-style mismatch: lot remaining 293, branch_lots 242 (no sales deleted).
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE branch_lots SET remaining_base_quantity = 242
                 WHERE product_lot_id IN (SELECT id FROM product_lots WHERE product_id = ?)",
                [Uuid::parse_str(&product.id).unwrap().into()],
            ))
            .await
            .expect("seed mismatch");
        assert!((product_stock(&database, &product.id).await - 242.0).abs() < 0.01);
        assert!((lot_remaining_sum(&database, &product.id).await - 293.0).abs() < 0.01);

        let report = StockCountRepository::reconcile(&database)
            .await
            .expect("reconcile");
        assert!(report.mismatched_before >= 1);
        assert!(!report.fixes.is_empty());
        assert!((product_stock(&database, &product.id).await - 293.0).abs() < 0.01);
        assert!((lot_remaining_sum(&database, &product.id).await - 293.0).abs() < 0.01);
        // Sales history untouched — opening ADJUSTMENT movement still present.
        #[derive(Debug, FromQueryResult)]
        struct C {
            count: i64,
        }
        let hist = C::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM stock_movements WHERE product_id = ?",
            [Uuid::parse_str(&product.id).unwrap().into()],
        ))
        .one(&database)
        .await
        .expect("hist")
        .map(|r| r.count)
        .unwrap_or(0);
        assert!(hist >= 1, "must not delete sales/movement history");
    }
}
