use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{
        DEFAULT_BARCODE_PREFIX, DEFAULT_LOT_PREFIX, DEFAULT_SKU_PREFIX, ERROR_BASE_UNIT_CONVERSION,
        ERROR_INVALID_EXPIRY_DATE, ERROR_INVALID_PRODUCT_UNITS, ERROR_INVALID_RECEIVED_DATE,
        ERROR_PRODUCT_NOT_FOUND, ERROR_SEARCH_TOO_SHORT, LOT_SOURCE_OPENING, MAX_PAGE_SIZE,
        MIN_SEARCH_LENGTH, PRODUCT_TYPE_MANUFACTURED, PRODUCT_TYPE_STANDARD,
        REFERENCE_PRODUCT_OPENING, SEQUENCE_KIND_LOT, SEQUENCE_KIND_PRODUCT_BARCODE,
        SEQUENCE_KIND_PRODUCT_SKU, STOCK_MOVEMENT_ADJUSTMENT,
    },
    context::RequestContext,
    dto::{
        CreateProductRequest, DeleteResponse, Paginated, PaginationMeta, ProductListQuery,
        ProductResponse, ProductUnitInput, UpdateProductRequest,
    },
    entities::{product, product_lot, product_unit},
    errors::AppError,
    repositories::{ProductRepository, SequenceRepository},
    util::{money_value, parse_date, parse_optional_uuid, parse_uuid, quantity, trimmed},
};

pub struct ProductService;

impl ProductService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: ProductListQuery,
    ) -> Result<Paginated<ProductResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = ProductRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn search(
        database: &DatabaseConnection,
        query: &str,
        branch_id: Option<Uuid>,
    ) -> Result<Vec<ProductResponse>, AppError> {
        let query = query.trim();
        if query.len() < MIN_SEARCH_LENGTH {
            return Err(AppError::Validation(ERROR_SEARCH_TOO_SHORT.into()));
        }
        let mut list_query = ProductListQuery {
            page: crate::backend::dto::PageQuery {
                search: Some(query.to_owned()),
                per_page: MAX_PAGE_SIZE,
                sort_by: Some("name".to_owned()),
                sort_direction: Some(crate::backend::dto::SortDirection::Asc),
                ..Default::default()
            },
            ..Default::default()
        };
        if let Some(branch_id) = branch_id {
            list_query.branch_id = Some(branch_id.to_string());
        }
        ProductRepository::list(database, &list_query)
            .await
            .map(|result| result.0)
    }

    pub async fn get(
        database: &DatabaseConnection,
        id: Uuid,
        branch_id: Option<Uuid>,
    ) -> Result<ProductResponse, AppError> {
        ProductRepository::find(database, id, branch_id)
            .await?
            .ok_or(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND))
    }

    pub async fn create(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateProductRequest,
    ) -> Result<ProductResponse, AppError> {
        normalize_create(&mut request);
        request.validate()?;
        validate_sell_units(&request.base_unit_id, &request.sell_units)?;
        let category_id = parse_uuid(&request.category_id, "categoryId")?;
        let base_unit_id = parse_uuid(&request.base_unit_id, "baseUnitId")?;
        let created_by = context.user_id;
        let transaction = database.begin().await?;
        let now = chrono::Utc::now();
        let product_id = Uuid::new_v4();
        let sku =
            SequenceRepository::next(&transaction, SEQUENCE_KIND_PRODUCT_SKU, DEFAULT_SKU_PREFIX)
                .await?;
        let barcode = if let Some(scanned) = trimmed(&request.barcode) {
            scanned
        } else {
            SequenceRepository::next(
                &transaction,
                SEQUENCE_KIND_PRODUCT_BARCODE,
                DEFAULT_BARCODE_PREFIX,
            )
            .await?
        };
        ProductRepository::insert_product(
            &transaction,
            product::ActiveModel {
                id: Set(product_id),
                category_id: Set(category_id),
                base_unit_id: Set(base_unit_id),
                name: Set(request.name.trim().to_owned()),
                sku: Set(sku),
                barcode: Set(barcode),
                product_type: Set(if request.is_manufactured {
                    PRODUCT_TYPE_MANUFACTURED.to_owned()
                } else {
                    PRODUCT_TYPE_STANDARD.to_owned()
                }),
                track_lots: Set(request.track_lots),
                track_expiry: Set(request.track_expiry),
                minimum_stock: Set(request.minimum_stock),
                warranty_duration: Set(request.warranty_qty),
                warranty_unit: Set(request
                    .warranty_unit
                    .as_ref()
                    .map(|value| value.to_uppercase())),
                warranty_note: Set(request.warranty_note.clone()),
                is_active: Set(true),
                created_by: Set(created_by),
                version: Set(1),
                deleted_at: Set(None),
                origin_device_id: Set(Some(context.device_id)),
                created_at: Set(now),
                updated_at: Set(now),
            },
        )
        .await?;

        let mut units = request.sell_units.clone();
        units.sort_by(|left, right| right.contains.cmp(&left.contains));
        for (sort_order, unit) in units.into_iter().enumerate() {
            ProductRepository::insert_unit(
                &transaction,
                unit_active_model(product_id, unit, sort_order as i32, now)?,
            )
            .await?;
        }

        if let Some(opening) = request.opening_stock {
            let branch_id = parse_uuid(&opening.branch_id, "openingStock.branchId")?;
            let supplier_id = opening
                .supplier_id
                .as_deref()
                .map(|value| parse_uuid(value, "openingStock.supplierId"))
                .transpose()?;
            let received_date = parse_date(&opening.received_date, ERROR_INVALID_RECEIVED_DATE)?;
            let expiry_date = opening
                .expiry_date
                .as_deref()
                .map(|value| parse_date(value, ERROR_INVALID_EXPIRY_DATE))
                .transpose()?;
            let lot_id = Uuid::new_v4();
            let lot_number =
                SequenceRepository::next(&transaction, SEQUENCE_KIND_LOT, DEFAULT_LOT_PREFIX)
                    .await?;
            ProductRepository::insert_lot(
                &transaction,
                product_lot::ActiveModel {
                    id: Set(lot_id),
                    product_id: Set(product_id),
                    supplier_id: Set(supplier_id),
                    goods_receipt_item_id: Set(None),
                    production_job_id: Set(None),
                    lot_number: Set(lot_number),
                    source_type: Set(LOT_SOURCE_OPENING.to_owned()),
                    original_base_quantity: Set(opening.quantity),
                    remaining_base_quantity: Set(opening.quantity),
                    damaged_base_quantity: Set(Decimal::ZERO),
                    purchase_price_per_base: Set(opening.cost),
                    received_date: Set(received_date),
                    expiry_date: Set(expiry_date),
                    created_by: Set(created_by),
                    version: Set(1),
                    deleted_at: Set(None),
                    origin_device_id: Set(Some(context.device_id)),
                    created_at: Set(now),
                    updated_at: Set(now),
                },
            )
            .await?;
            ProductRepository::raw_insert(
                &transaction,
                "INSERT INTO branch_lots (id, branch_id, product_lot_id, allocated_base_quantity, remaining_base_quantity, reserved_base_quantity, damaged_base_quantity, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
                vec![Uuid::new_v4().into(), branch_id.into(), lot_id.into(), opening.quantity.into(), opening.quantity.into(), now.into()],
            )
            .await?;
            ProductRepository::raw_insert(
                &transaction,
                "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![Uuid::new_v4().into(), branch_id.into(), product_id.into(), lot_id.into(), STOCK_MOVEMENT_ADJUSTMENT.into(), opening.quantity.into(), "base".into(), opening.quantity.into(), opening.cost.into(), (opening.cost * opening.quantity).into(), REFERENCE_PRODUCT_OPENING.into(), product_id.into(), now.into(), created_by.into(), now.into()],
            )
            .await?;
        }

        transaction.commit().await?;
        Self::get(database, product_id, Some(context.branch_id)).await
    }

    pub async fn update(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: UpdateProductRequest,
    ) -> Result<ProductResponse, AppError> {
        if let Some(units) = &mut request.sell_units {
            for unit in units.iter_mut() {
                unit.contains = quantity(unit.contains);
                unit.cost = money_value(unit.cost);
                unit.min = money_value(unit.min);
                unit.wholesale = money_value(unit.wholesale);
                unit.price = money_value(unit.price);
            }
        }
        if let Some(minimum_stock) = request.minimum_stock.as_mut() {
            *minimum_stock = quantity(*minimum_stock);
        }
        request.validate()?;
        let Some(model) = ProductRepository::model(database, id).await? else {
            return Err(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND));
        };
        let base_unit_id = model.base_unit_id;
        if let Some(sell_units) = &request.sell_units {
            validate_sell_units(&base_unit_id.to_string(), sell_units)?;
        }

        let transaction = database.begin().await?;
        let now = chrono::Utc::now();
        let mut active: product::ActiveModel = model.into();
        if let Some(name) = request.name {
            active.name = Set(name.trim().to_owned());
        }
        if let Some(category_id) = request.category_id {
            active.category_id = Set(parse_uuid(&category_id, "categoryId")?);
        }
        if let Some(minimum_stock) = request.minimum_stock {
            active.minimum_stock = Set(minimum_stock);
        }
        if let Some(value) = request.warranty_qty {
            active.warranty_duration = Set(Some(value));
        }
        if let Some(value) = request.warranty_unit {
            active.warranty_unit = Set(Some(value.to_uppercase()));
        }
        if let Some(value) = request.warranty_note {
            active.warranty_note = Set(Some(value));
        }
        if let Some(value) = request.is_active {
            active.is_active = Set(value);
        }
        active.version = Set(active.version.take().unwrap_or(1) + 1);
        active.updated_at = Set(now);
        active.update(&transaction).await?;

        if let Some(sell_units) = request.sell_units {
            let mut units = sell_units;
            units.sort_by(|left, right| right.contains.cmp(&left.contains));
            let models = units
                .into_iter()
                .enumerate()
                .map(|(sort_order, unit)| unit_active_model(id, unit, sort_order as i32, now))
                .collect::<Result<Vec<_>, _>>()?;
            ProductRepository::replace_units(&transaction, id, models).await?;
        }

        transaction.commit().await?;
        Self::get(database, id, Some(context.branch_id)).await
    }

    pub async fn delete(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<DeleteResponse, AppError> {
        if !ProductRepository::soft_delete(database, id).await? {
            return Err(AppError::NotFound(ERROR_PRODUCT_NOT_FOUND));
        }
        Ok(DeleteResponse {
            id: id.to_string(),
            deleted: true,
        })
    }
}

fn unit_active_model(
    product_id: Uuid,
    unit: ProductUnitInput,
    sort_order: i32,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<product_unit::ActiveModel, AppError> {
    Ok(product_unit::ActiveModel {
        id: Set(parse_optional_uuid(unit.id.as_deref(), "sellUnits.id")?
            .unwrap_or_else(Uuid::new_v4)),
        product_id: Set(product_id),
        unit_id: Set(parse_uuid(&unit.unit_id, "sellUnits.unitId")?),
        display_name: Set(unit.name.trim().to_owned()),
        conversion_to_base: Set(unit.contains),
        cost_reference: Set(Some(unit.cost)),
        minimum_price: Set(unit.min),
        wholesale_price: Set(unit.wholesale),
        retail_price: Set(unit.price),
        barcode: Set(trimmed(&unit.barcode)),
        is_base: Set(unit.is_base),
        is_default_sale_unit: Set(unit.is_default),
        sort_order: Set(sort_order),
        is_active: Set(true),
        version: Set(1),
        deleted_at: Set(None),
        origin_device_id: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    })
}

fn validate_sell_units(base_unit_id: &str, units: &[ProductUnitInput]) -> Result<(), AppError> {
    let base_count = units.iter().filter(|unit| unit.is_base).count();
    if units.is_empty() || base_count != 1 {
        return Err(AppError::Validation(ERROR_INVALID_PRODUCT_UNITS.into()));
    }
    let base = units
        .iter()
        .find(|unit| unit.is_base)
        .expect("validated base");
    if base.contains != Decimal::ONE || base.unit_id != base_unit_id {
        return Err(AppError::Validation(ERROR_BASE_UNIT_CONVERSION.into()));
    }
    Ok(())
}

fn normalize_create(request: &mut CreateProductRequest) {
    request.minimum_stock = quantity(request.minimum_stock);
    for unit in &mut request.sell_units {
        unit.contains = quantity(unit.contains);
        unit.cost = money_value(unit.cost);
        unit.min = money_value(unit.min);
        unit.wholesale = money_value(unit.wholesale);
        unit.price = money_value(unit.price);
    }
    if let Some(opening) = &mut request.opening_stock {
        opening.quantity = quantity(opening.quantity);
        opening.cost = money_value(opening.cost);
    }
}

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;
    use sea_orm::Database;
    use uuid::Uuid;

    use crate::backend::{
        constants::{SEED_BRANCH_ID, SEED_DEVICE_ID, SEED_USER_ID},
        context::RequestContext,
        db::connect_memory,
        dto::{MasterRequest, OpeningStockInput, ProductUnitInput},
        repositories::MasterKind,
        services::MasterService,
    };

    use super::*;

    #[test]
    fn normalizes_money_and_quantity_at_the_service_boundary() {
        let mut request = CreateProductRequest {
            name: "Test".into(),
            category_id: Uuid::new_v4().to_string(),
            base_unit_id: Uuid::new_v4().to_string(),
            created_by: None,
            sku: None,
            barcode: None,
            is_manufactured: false,
            track_lots: true,
            track_expiry: false,
            minimum_stock: Decimal::new(1_234_567_891, 9),
            warranty_qty: None,
            warranty_unit: None,
            warranty_note: None,
            sell_units: vec![ProductUnitInput {
                id: None,
                unit_id: Uuid::new_v4().to_string(),
                name: "Piece".into(),
                contains: Decimal::ONE,
                cost: Decimal::new(1_005, 3),
                min: Decimal::ZERO,
                wholesale: Decimal::ZERO,
                price: Decimal::ZERO,
                barcode: None,
                is_base: true,
                is_default: true,
            }],
            opening_stock: None,
        };
        normalize_create(&mut request);
        assert_eq!(
            request.minimum_stock.scale(),
            crate::backend::constants::QUANTITY_DECIMAL_PLACES
        );
        assert_eq!(request.sell_units[0].cost, Decimal::new(101, 2));
    }

    #[tokio::test]
    async fn creates_product_units_and_opening_stock_atomically() {
        let database = connect_memory().await.expect("memory db");
        let context = RequestContext {
            session_id: Uuid::new_v4(),
            user_id: Uuid::parse_str(SEED_USER_ID).unwrap(),
            branch_id: Uuid::parse_str(SEED_BRANCH_ID).unwrap(),
            device_id: Uuid::parse_str(SEED_DEVICE_ID).unwrap(),
            cash_session_id: None,
            role: "OWNER".into(),
            name: "Owner".into(),
            username: "owner".into(),
        };
        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "Electrical".into(),
                symbol: None,
                phone: None,
                email: None,
                address: None,
                notes: None,
                is_active: true,
                precision: None,
                credit_limit: None,
                payment_terms_days: None,
                is_walk_in: false,
            },
        )
        .await
        .expect("create category");
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("load seeded units")
            .data
            .into_iter()
            .find(|unit| unit.symbol.as_deref() == Some("pc"))
            .expect("seeded Piece unit");
        let request = CreateProductRequest {
            name: "Switch".into(),
            category_id: category.id,
            base_unit_id: unit.id.clone(),
            created_by: None,
            sku: Some("CLIENT-SKU".into()),
            barcode: None,
            is_manufactured: false,
            track_lots: true,
            track_expiry: false,
            minimum_stock: Decimal::new(2, 0),
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
                price: Decimal::new(16, 0),
                barcode: None,
                is_base: true,
                is_default: true,
            }],
            opening_stock: Some(OpeningStockInput {
                branch_id: SEED_BRANCH_ID.into(),
                supplier_id: None,
                quantity: Decimal::new(5, 0),
                cost: Decimal::new(10, 0),
                received_date: "2026-09-09".into(),
                expiry_date: None,
            }),
        };

        let product = ProductService::create(&database, &context, request)
            .await
            .expect("create product transaction");
        assert_eq!(product.name, "Switch");
        assert!(product.sku.starts_with("P-"));
        assert_ne!(product.sku, "CLIENT-SKU");
        assert_eq!(product.stock, 5.0);
        assert_eq!(product.cost, 10.0);
        assert_eq!(product.sell_units.len(), 1);
        let _ = Database::connect("sqlite::memory:").await;
    }
}
