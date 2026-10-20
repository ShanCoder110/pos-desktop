use sea_orm::DatabaseConnection;
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::ERROR_UNIT_SYMBOL_REQUIRED,
    context::RequestContext,
    dto::{MasterRequest, MasterResponse, PageQuery, Paginated, PaginationMeta},
    errors::AppError,
    repositories::{MasterKind, MasterRepository},
    util::{capitalize_name, optional_pk_mobile},
};

pub struct MasterService;

impl MasterService {
    pub async fn list(
        database: &DatabaseConnection,
        kind: MasterKind,
        query: PageQuery,
    ) -> Result<Paginated<MasterResponse>, AppError> {
        let query = query.normalized();
        let (data, total) = MasterRepository::list(database, kind, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page, query.per_page),
        })
    }

    pub async fn get(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
        not_found: &'static str,
    ) -> Result<MasterResponse, AppError> {
        MasterRepository::find(database, kind, id)
            .await?
            .ok_or(AppError::NotFound(not_found))
    }

    pub async fn create(
        database: &DatabaseConnection,
        kind: MasterKind,
        request: MasterRequest,
        context: Option<&RequestContext>,
    ) -> Result<MasterResponse, AppError> {
        request.validate()?;
        let mut request = request;
        if matches!(kind, MasterKind::Supplier) {
            request.name = capitalize_name(&request.name);
        }
        if matches!(kind, MasterKind::Supplier | MasterKind::Customer) {
            request.phone = optional_pk_mobile(request.phone.as_deref())?;
        }
        Self::validate_kind(kind, &request)?;
        MasterRepository::create(database, kind, &request, context).await
    }

    pub async fn update(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
        request: MasterRequest,
        not_found: &'static str,
    ) -> Result<MasterResponse, AppError> {
        request.validate()?;
        let mut request = request;
        if matches!(kind, MasterKind::Supplier) {
            request.name = capitalize_name(&request.name);
        }
        if matches!(kind, MasterKind::Supplier | MasterKind::Customer) {
            request.phone = optional_pk_mobile(request.phone.as_deref())?;
        }
        Self::validate_kind(kind, &request)?;
        MasterRepository::update(database, kind, id, &request)
            .await?
            .ok_or(AppError::NotFound(not_found))
    }

    pub async fn delete(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
        not_found: &'static str,
        context: Option<&RequestContext>,
    ) -> Result<(), AppError> {
        if matches!(kind, MasterKind::Customer) {
            if let Some(message) = MasterRepository::customer_history_message(database, id).await? {
                return Err(AppError::Conflict(message));
            }
        }
        if MasterRepository::soft_delete(database, kind, id, context.map(|ctx| ctx.user_id)).await?
        {
            Ok(())
        } else {
            Err(AppError::NotFound(not_found))
        }
    }

    fn validate_kind(kind: MasterKind, request: &MasterRequest) -> Result<(), AppError> {
        if matches!(kind, MasterKind::Unit)
            && request
                .symbol
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            return Err(AppError::Validation(ERROR_UNIT_SYMBOL_REQUIRED.into()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;
    use sea_orm::{DatabaseConnection, DbBackend, FromQueryResult, Statement};
    use uuid::Uuid;

    use super::*;
    use crate::backend::{
        constants::{ERROR_CATEGORY_OTHER_PROTECTED, SEED_BRANCH_ID, SEED_DEVICE_ID, SEED_USER_ID},
        context::RequestContext,
        db::connect_memory,
        dto::{CreateProductRequest, OpeningStockInput, ProductUnitInput},
        repositories::OrgRepository,
        services::ProductService,
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

    fn ctx() -> RequestContext {
        RequestContext {
            session_id: Uuid::new_v4(),
            user_id: Uuid::parse_str(SEED_USER_ID).unwrap(),
            branch_id: Uuid::parse_str(SEED_BRANCH_ID).unwrap(),
            device_id: Uuid::parse_str(SEED_DEVICE_ID).unwrap(),
            cash_session_id: None,
            role: "OWNER".into(),
            name: "Owner".into(),
            username: "owner".into(),
        }
    }

    #[tokio::test]
    async fn deleting_category_keeps_products_and_moves_them_to_other() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "Wire".into(),
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
                urdu_name: None,
                name: "Copper Wire".into(),
                category_id: category.id.clone(),
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    unit_id: unit.id,
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(10, 0),
                    min: Decimal::new(12, 0),
                    wholesale: Decimal::new(14, 0),
                    price: Decimal::new(20, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(5, 0),
                    cost: Decimal::new(10, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");

        MasterService::delete(
            &database,
            MasterKind::Category,
            Uuid::parse_str(&category.id).unwrap(),
            "Category not found.",
            Some(&context),
        )
        .await
        .expect("delete category");

        let refreshed = ProductService::get(
            &database,
            Uuid::parse_str(&product.id).unwrap(),
            Some(Uuid::parse_str(SEED_BRANCH_ID).unwrap()),
        )
        .await
        .expect("product still exists");
        assert_eq!(refreshed.category.to_lowercase(), "other");
        assert_ne!(refreshed.category_id, category.id);

        #[derive(Debug, FromQueryResult)]
        struct CountRow {
            count: i64,
        }
        let still_there = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM products WHERE id = ? AND deleted_at IS NULL",
            [Uuid::parse_str(&product.id).unwrap().into()],
        ))
        .one(&database)
        .await
        .expect("count")
        .map(|r| r.count)
        .unwrap_or(0);
        assert_eq!(still_there, 1);
    }

    #[tokio::test]
    async fn deleting_supplier_does_not_delete_products() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let supplier = MasterService::create(
            &database,
            MasterKind::Supplier,
            MasterRequest {
                name: "Ali Traders".into(),
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
            Some(&context),
        )
        .await
        .expect("supplier");
        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "Parts".into(),
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
                urdu_name: None,
                name: "Bolt".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
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
                    unit_id: unit.id,
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(5, 0),
                    min: Decimal::new(6, 0),
                    wholesale: Decimal::new(7, 0),
                    price: Decimal::new(10, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: Some(supplier.id.clone()),
                    quantity: Decimal::new(8, 0),
                    cost: Decimal::new(5, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");

        MasterService::delete(
            &database,
            MasterKind::Supplier,
            Uuid::parse_str(&supplier.id).unwrap(),
            "Supplier not found.",
            Some(&context),
        )
        .await
        .expect("delete supplier");

        ProductService::get(
            &database,
            Uuid::parse_str(&product.id).unwrap(),
            Some(Uuid::parse_str(SEED_BRANCH_ID).unwrap()),
        )
        .await
        .expect("product still exists after supplier delete");
    }

    #[tokio::test]
    async fn cannot_delete_other_category() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let other = MasterService::list(&database, MasterKind::Category, Default::default())
            .await
            .expect("list")
            .data
            .into_iter()
            .find(|c| c.name.eq_ignore_ascii_case("other"));
        let other = match other {
            Some(row) => row,
            None => MasterService::create(
                &database,
                MasterKind::Category,
                MasterRequest {
                    name: "Other".into(),
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
            .expect("create other"),
        };
        let err = MasterService::delete(
            &database,
            MasterKind::Category,
            Uuid::parse_str(&other.id).unwrap(),
            "Category not found.",
            None,
        )
        .await;
        match err {
            Err(AppError::Validation(message)) => {
                assert!(
                    message.contains(ERROR_CATEGORY_OTHER_PROTECTED)
                        || message.to_lowercase().contains("other"),
                    "unexpected: {message}"
                );
            }
            other => panic!("expected validation, got {other:?}"),
        }
    }
}
