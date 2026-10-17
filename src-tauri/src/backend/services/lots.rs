use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{
        DEFAULT_LOT_PREFIX, ERROR_LOT_EDIT_DENIED, ERROR_LOT_NOT_FOUND, SEQUENCE_KIND_LOT,
    },
    context::RequestContext,
    dto::{
        LotListQuery, LotResponse, Paginated, PaginationMeta, ReceiveLotRequest, UpdateLotRequest,
    },
    errors::AppError,
    repositories::{LotRepository, SequenceRepository},
    util::{money_value, parse_uuid, quantity},
};

fn ensure_lot_edit_permission(context: &RequestContext) -> Result<(), AppError> {
    if matches!(context.role.as_str(), "OWNER" | "MANAGER") {
        Ok(())
    } else {
        Err(AppError::Forbidden(ERROR_LOT_EDIT_DENIED))
    }
}

pub struct LotService;

impl LotService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: LotListQuery,
    ) -> Result<Paginated<LotResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = LotRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(database: &DatabaseConnection, id: Uuid) -> Result<LotResponse, AppError> {
        LotRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_LOT_NOT_FOUND))
    }

    pub async fn receive(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: ReceiveLotRequest,
    ) -> Result<LotResponse, AppError> {
        request.quantity = quantity(request.quantity);
        request.cost = money_value(request.cost);
        if let Some(min) = request.min.as_mut() {
            *min = money_value(*min);
        }
        if let Some(wholesale) = request.wholesale.as_mut() {
            *wholesale = money_value(*wholesale);
        }
        if let Some(retail) = request.retail.as_mut() {
            *retail = money_value(*retail);
        }
        request.damaged_quantity = quantity(request.damaged_quantity);
        request.paid_now = money_value(request.paid_now);
        request.validate()?;
        let allocations = if !request.branch_allocations.is_empty() {
            request
                .branch_allocations
                .iter()
                .map(|row| {
                    Ok((
                        parse_uuid(&row.branch_id, "branchAllocation.branchId")?,
                        quantity(row.quantity),
                    ))
                })
                .collect::<Result<Vec<_>, AppError>>()?
        } else {
            let branch_id = match &request.branch_id {
                Some(value) => parse_uuid(value, "branchId")?,
                None => context.branch_id,
            };
            vec![(branch_id, request.quantity)]
        };
        let transaction = database.begin().await?;
        let lot_number =
            SequenceRepository::next(&transaction, SEQUENCE_KIND_LOT, DEFAULT_LOT_PREFIX).await?;
        let lot_id =
            LotRepository::receive(&transaction, context, &request, allocations, lot_number)
                .await?;
        transaction.commit().await?;
        Self::get(database, lot_id).await
    }

    pub async fn update(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: UpdateLotRequest,
    ) -> Result<LotResponse, AppError> {
        ensure_lot_edit_permission(context)?;
        if let Some(original) = request.original_quantity.as_mut() {
            *original = quantity(*original);
        }
        if let Some(remaining) = request.remaining_quantity.as_mut() {
            *remaining = quantity(*remaining);
        }
        if let Some(damaged) = request.damaged_quantity.as_mut() {
            *damaged = quantity(*damaged);
        }
        if let Some(cost) = request.cost.as_mut() {
            *cost = money_value(*cost);
        }
        if let Some(min) = request.min.as_mut() {
            *min = money_value(*min);
        }
        if let Some(wholesale) = request.wholesale.as_mut() {
            *wholesale = money_value(*wholesale);
        }
        if let Some(retail) = request.retail.as_mut() {
            *retail = money_value(*retail);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let lot_id = LotRepository::update(&transaction, context, id, &request).await?;
        transaction.commit().await?;
        Self::get(database, lot_id).await
    }
}

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;
    use sea_orm::{DatabaseConnection, DbBackend, FromQueryResult, Statement};
    use uuid::Uuid;

    use crate::backend::{
        constants::{SEED_BRANCH_ID, SEED_DEVICE_ID, SEED_USER_ID},
        context::RequestContext,
        db::connect_memory,
        dto::{
            CashSessionOpenRequest, CompleteSaleRequest, CreateProductRequest, LotListQuery,
            MasterRequest, OpeningStockInput, ProductUnitInput, SaleItemInput, UpdateLotRequest,
        },
        errors::AppError,
        repositories::{MasterKind, OrgRepository},
        services::{AuthService, LotService, MasterService, ProductService, SalesService},
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

    /// Lot of 100, sell 30 → remaining 100 rejected (422); remaining 60 allowed and stock syncs.
    /// Cashier edit → 403.
    #[tokio::test]
    async fn lot_remaining_cannot_erase_sold_and_syncs_stock() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let mut context = ctx("OWNER");

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "LotQA".into(),
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
        .expect("category");
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("units")
            .data
            .into_iter()
            .find(|u| u.symbol.as_deref() == Some("pc"))
            .expect("pc");
        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                name: "Lot Remaining Widget".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
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
                    unit_id: unit.id.clone(),
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

        let customer = MasterService::create(
            &database,
            MasterKind::Customer,
            MasterRequest {
                name: "Lot Sale Cust".into(),
                symbol: None,
                phone: Some("03009998877".into()),
                email: None,
                address: None,
                city_id: None,
                notes: None,
                is_active: true,
                precision: None,
                is_walk_in: false,
                in_credit_book: Some(true),
                previous_balance: None,
            },
            Some(&context),
        )
        .await
        .expect("customer");

        let lots = LotService::list(
            &database,
            LotListQuery {
                product_id: Some(product.id.clone()),
                ..Default::default()
            },
        )
        .await
        .expect("list lots");
        assert_eq!(lots.data.len(), 1);
        let lot = &lots.data[0];
        assert_eq!(lot.original_base_quantity, 100.0);
        assert_eq!(lot.remaining_base_quantity, 100.0);
        let lot_id = Uuid::parse_str(&lot.id).unwrap();

        let session = AuthService::open_cash_session(
            &database,
            &context,
            CashSessionOpenRequest {
                opening_float: Decimal::ZERO,
            },
        )
        .await
        .expect("open cash");
        context.cash_session_id = Some(Uuid::parse_str(&session.id).unwrap());

        SalesService::complete(
            &database,
            &context,
            CompleteSaleRequest {
                client_request_id: "lot-sell-30".into(),
                customer_id: Some(customer.id.clone()),
                items: vec![SaleItemInput {
                    product_id: product.id.clone(),
                    product_unit_id: unit_id,
                    quantity: Decimal::new(30, 0),
                    unit_price: Decimal::new(20, 0),
                    price_mode: "RETAIL".into(),
                    sold_below_minimum: false,
                    authorized_by: None,
                    discount: Decimal::ZERO,
                    tax: Decimal::ZERO,
                }],
                payments: vec![],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
                notes: None,
            },
        )
        .await
        .expect("sell 30");
        assert!((product_stock(&database, &product.id).await - 70.0).abs() < 0.01);

        let reject = LotService::update(
            &database,
            &context,
            lot_id,
            UpdateLotRequest {
                supplier_id: None,
                original_quantity: None,
                remaining_quantity: Some(Decimal::new(100, 0)),
                damaged_quantity: None,
                cost: None,
                min: None,
                wholesale: None,
                retail: None,
                branch_allocations: vec![],
            },
        )
        .await;
        match reject {
            Err(AppError::Validation(message)) => {
                assert!(
                    message.contains("Remaining cannot exceed")
                        || message.contains("Maximum remaining")
                        || message.contains("stock count")
                        || message.contains("locked"),
                    "unexpected message: {message}"
                );
            }
            other => panic!("expected 422 validation, got {other:?}"),
        }
        // Stock unchanged after rejected edit (no 293 vs 242 style mismatch).
        assert!((product_stock(&database, &product.id).await - 70.0).abs() < 0.01);

        // Step 10: raw Left edits are locked — use stock count instead.
        let locked = LotService::update(
            &database,
            &context,
            lot_id,
            UpdateLotRequest {
                supplier_id: None,
                original_quantity: None,
                remaining_quantity: Some(Decimal::new(60, 0)),
                damaged_quantity: None,
                cost: None,
                min: None,
                wholesale: None,
                retail: None,
                branch_allocations: vec![],
            },
        )
        .await;
        match locked {
            Err(AppError::Validation(message)) => {
                assert!(
                    message.contains("stock count") || message.contains("locked"),
                    "unexpected lock message: {message}"
                );
            }
            other => panic!("expected remaining locked validation, got {other:?}"),
        }
        assert!((product_stock(&database, &product.id).await - 70.0).abs() < 0.01);

        let cashier = ctx("CASHIER");
        let forbidden = LotService::update(
            &database,
            &cashier,
            lot_id,
            UpdateLotRequest {
                supplier_id: None,
                original_quantity: None,
                remaining_quantity: Some(Decimal::new(55, 0)),
                damaged_quantity: None,
                cost: None,
                min: None,
                wholesale: None,
                retail: None,
                branch_allocations: vec![],
            },
        )
        .await;
        assert!(
            matches!(forbidden, Err(AppError::Forbidden(_))),
            "cashier must get 403, got {forbidden:?}"
        );
    }
}
