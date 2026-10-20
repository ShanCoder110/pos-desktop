use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{
        DEFAULT_BARCODE_PREFIX, DEFAULT_LOT_PREFIX, DEFAULT_SKU_PREFIX, ERROR_BASE_UNIT_CONVERSION,
        ERROR_INVALID_EXPIRY_DATE, ERROR_INVALID_PRODUCT_UNITS, ERROR_INVALID_RECEIVED_DATE,
        ERROR_PRODUCT_NOT_FOUND, ERROR_PRODUCT_NO_DUPLICATE, ERROR_PRODUCT_NO_INVALID,
        ERROR_SEARCH_TOO_SHORT, ERROR_SKU_DUPLICATE, ERROR_SKU_EDIT_DENIED, ERROR_SKU_INVALID,
        LOT_SOURCE_OPENING, MAX_PAGE_SIZE, MIN_SEARCH_LENGTH, PRODUCT_TYPE_MANUFACTURED,
        PRODUCT_TYPE_STANDARD, REFERENCE_PRODUCT_OPENING, SEQUENCE_KIND_LOT,
        SEQUENCE_KIND_PRODUCT_BARCODE, SEQUENCE_KIND_PRODUCT_SKU, SKU_MAX_LEN,
        STOCK_MOVEMENT_ADJUSTMENT,
    },
    context::RequestContext,
    dto::{
        CreateProductRequest, DeleteResponse, MasterRequest, OpeningStockInput, PageQuery,
        Paginated, PaginationMeta, ProductImportCatalog, ProductImportErrorRow,
        ProductImportResult, ProductListQuery, ProductResponse, ProductUnitInput,
        UpdateProductRequest,
    },
    entities::{product, product_lot, product_unit},
    errors::AppError,
    repositories::{MasterKind, ProductRepository, SequenceRepository},
    services::MasterService,
    util::{
        capitalize_name, money_value, parse_date, parse_optional_uuid, parse_uuid, quantity,
        trimmed,
    },
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
        // Digit-only queries are product IDs (1, 2, …) — allow a single digit.
        let min_len = if query.chars().all(|c| c.is_ascii_digit()) {
            1
        } else {
            MIN_SEARCH_LENGTH
        };
        if query.chars().count() < min_len {
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
        let mut products = ProductRepository::list(database, &list_query)
            .await
            .map(|result| result.0)?;
        annotate_matched_units(&mut products, query);
        Ok(products)
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
        // Validate raw input before normalize rewrites base contains to 1.
        request.validate()?;
        validate_sell_unit_factors(&request.sell_units)?;
        normalize_create(&mut request);
        validate_sell_units(&request.base_unit_id, &request.sell_units)?;
        let category_id = parse_uuid(&request.category_id, "categoryId")?;
        let base_unit_id = parse_uuid(&request.base_unit_id, "baseUnitId")?;
        let created_by = context.user_id;
        let transaction = database.begin().await?;
        let now = chrono::Utc::now();
        let product_id = Uuid::new_v4();
        let product_no = resolve_create_product_no(&transaction, request.product_no).await?;
        let sku = resolve_create_sku(&transaction, request.sku.as_deref()).await?;
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
                name: Set(capitalize_name(&request.name)),
                urdu_name: Set(trimmed(&request.urdu_name)),
                product_no: Set(Some(product_no)),
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
        units.sort_by_key(|left| std::cmp::Reverse(left.contains));
        for (sort_order, unit) in units.into_iter().enumerate() {
            ProductRepository::insert_unit(
                &transaction,
                unit_active_model(product_id, unit, sort_order as i32, now)?,
            )
            .await?;
        }

        let opening_stocks = if !request.opening_stocks.is_empty() {
            request.opening_stocks.clone()
        } else {
            request.opening_stock.clone().into_iter().collect()
        };
        for opening in opening_stocks {
            insert_opening_stock(&transaction, context, product_id, created_by, &opening, now)
                .await?;
        }

        transaction.commit().await?;
        Self::get(database, product_id, Some(context.branch_id)).await
    }

    /// Bulk import from Settings catalog JSON (categories by name, units by symbol).
    pub async fn import_catalog(
        database: &DatabaseConnection,
        context: &RequestContext,
        catalog: ProductImportCatalog,
    ) -> Result<ProductImportResult, AppError> {
        let mut unit_by_symbol = load_unit_symbols(database).await?;
        let mut category_by_name = load_category_names(database).await?;
        let mut categories_created = 0u32;
        let mut created = 0u32;
        let mut skipped = 0u32;
        let mut errors = Vec::new();

        for cat in &catalog.categories {
            let name = cat.name.trim();
            if name.is_empty() {
                continue;
            }
            let key = name.to_ascii_lowercase();
            if category_by_name.contains_key(&key) {
                continue;
            }
            match MasterService::create(
                database,
                MasterKind::Category,
                category_request(name, cat.name_urdu.as_deref()),
                Some(context),
            )
            .await
            {
                Ok(row) => {
                    category_by_name.insert(key, row.id);
                    categories_created += 1;
                }
                Err(error) => {
                    errors.push(ProductImportErrorRow {
                        index: 0,
                        name: name.to_owned(),
                        sku: None,
                        message: format!("category: {}", error_message(&error)),
                    });
                }
            }
        }

        for (index, item) in catalog.products.iter().enumerate() {
            if let Err(message) = item.validate() {
                errors.push(ProductImportErrorRow {
                    index,
                    name: item.name.clone(),
                    sku: item.sku.clone(),
                    message: format!("validation: {message}"),
                });
                continue;
            }

            let category_name = item.category.trim();
            let category_key = category_name.to_ascii_lowercase();
            if !category_by_name.contains_key(&category_key) {
                match MasterService::create(
                    database,
                    MasterKind::Category,
                    category_request(category_name, None),
                    Some(context),
                )
                .await
                {
                    Ok(row) => {
                        category_by_name.insert(category_key.clone(), row.id);
                        categories_created += 1;
                    }
                    Err(error) => {
                        errors.push(ProductImportErrorRow {
                            index,
                            name: item.name.clone(),
                            sku: item.sku.clone(),
                            message: format!(
                                "category '{category_name}': {}",
                                error_message(&error)
                            ),
                        });
                        continue;
                    }
                }
            }

            let category_id = category_by_name
                .get(&category_key)
                .cloned()
                .unwrap_or_default();

            if let Some(product_no) = item.product_no.filter(|n| *n > 0) {
                if ProductRepository::product_no_taken(database, product_no, None).await? {
                    skipped += 1;
                    continue;
                }
            }
            if let Some(sku) = trimmed(&item.sku) {
                if ProductRepository::sku_taken(database, &sku, None).await? {
                    skipped += 1;
                    continue;
                }
            }

            let mut sell_units = Vec::new();
            let mut base_unit_id = String::new();
            let mut unit_ok = true;
            for unit in &item.sell_units {
                let symbol = unit.symbol.trim().to_ascii_lowercase();
                let Some(unit_id) = unit_by_symbol.get(&symbol).cloned() else {
                    errors.push(ProductImportErrorRow {
                        index,
                        name: item.name.clone(),
                        sku: item.sku.clone(),
                        message: format!("unknown unit symbol '{symbol}' (seed units first)"),
                    });
                    unit_ok = false;
                    break;
                };
                if unit.is_base {
                    base_unit_id = unit_id.clone();
                }
                let (cost, min, wholesale, price) =
                    normalize_price_ladder(unit.cost, unit.min, unit.wholesale, unit.price);
                sell_units.push(ProductUnitInput {
                    id: None,
                    unit_id,
                    name: unit.name.trim().to_owned(),
                    contains: unit.contains,
                    cost,
                    min,
                    wholesale,
                    price,
                    barcode: unit.barcode.clone(),
                    factor_direction: unit.factor_direction.clone(),
                    is_base: unit.is_base,
                    is_default: unit.is_default,
                });
            }
            if !unit_ok {
                continue;
            }
            if base_unit_id.is_empty() && !sell_units.is_empty() {
                let needs_default = !sell_units.iter().any(|unit| unit.is_default);
                sell_units[0].is_base = true;
                if needs_default {
                    sell_units[0].is_default = true;
                }
                base_unit_id = sell_units[0].unit_id.clone();
            }

            let request = CreateProductRequest {
                name: capitalize_name(&item.name),
                urdu_name: item.urdu_name.clone(),
                category_id,
                base_unit_id,
                created_by: None,
                product_no: item.product_no.filter(|n| *n > 0),
                sku: item.sku.clone(),
                barcode: item.barcode.clone(),
                is_manufactured: false,
                track_lots: true,
                track_expiry: false,
                minimum_stock: item.minimum_stock.unwrap_or(Decimal::ZERO),
                warranty_qty: item.warranty_qty,
                warranty_unit: item.warranty_unit.as_deref().map(normalize_warranty_unit),
                warranty_note: None,
                sell_units,
                opening_stock: None,
                opening_stocks: vec![],
            };

            match Self::create(database, context, request).await {
                Ok(_) => created += 1,
                Err(error) => {
                    let message = error_message(&error);
                    let lower = message.to_ascii_lowercase();
                    if lower.contains("sku")
                        || lower.contains("product id")
                        || lower.contains("product_no")
                    {
                        skipped += 1;
                    } else {
                        errors.push(ProductImportErrorRow {
                            index,
                            name: item.name.clone(),
                            sku: item
                                .product_no
                                .map(|n| n.to_string())
                                .or_else(|| item.sku.clone()),
                            message,
                        });
                    }
                }
            }
        }

        let _ = &mut unit_by_symbol;

        Ok(ProductImportResult {
            created,
            skipped,
            categories_created,
            errors,
        })
    }

    pub async fn update(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: UpdateProductRequest,
    ) -> Result<ProductResponse, AppError> {
        if let Some(units) = &request.sell_units {
            validate_sell_unit_factors(units)?;
        }
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
        let mut base_unit_id = model.base_unit_id;
        if let Some(sell_units) = &mut request.sell_units {
            ensure_one_stock_unit(&base_unit_id.to_string(), sell_units);
            validate_sell_units(&base_unit_id.to_string(), sell_units)?;
            if let Some(stock) = sell_units.iter().find(|unit| unit.is_base) {
                // Inventory base stays the canonical unit (conversion = 1).
                // UI preferred unit is is_default and must not rescale lots/prices.
                base_unit_id = parse_uuid(&stock.unit_id, "sellUnits.unitId")?;
            }
        }

        // Omit / blank / same SKU → leave unchanged. Real change → owner/manager only.
        let next_sku = match request
            .sku
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            None => None,
            Some(raw) => {
                let sku = normalize_custom_sku(raw)?;
                if sku.eq_ignore_ascii_case(model.sku.as_str()) {
                    None
                } else {
                    let role = context.role.trim().to_uppercase();
                    if role != "OWNER" && role != "MANAGER" {
                        return Err(AppError::Forbidden(ERROR_SKU_EDIT_DENIED));
                    }
                    if ProductRepository::sku_taken(database, &sku, Some(id)).await? {
                        return Err(AppError::Validation(ERROR_SKU_DUPLICATE.into()));
                    }
                    Some(sku)
                }
            }
        };

        let transaction = database.begin().await?;
        let now = chrono::Utc::now();
        let mut active: product::ActiveModel = model.into();
        active.base_unit_id = Set(base_unit_id);
        if let Some(name) = request.name {
            active.name = Set(capitalize_name(&name));
        }
        if let Some(urdu_name) = request.urdu_name {
            active.urdu_name = Set(trimmed(&Some(urdu_name)));
        }
        if let Some(category_id) = request.category_id {
            active.category_id = Set(parse_uuid(&category_id, "categoryId")?);
        }
        if let Some(sku) = next_sku {
            active.sku = Set(sku);
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
            let previous = ProductRepository::list_units(&transaction, id).await?;
            if let Some(new_stock) = sell_units.iter().find(|unit| unit.is_base) {
                let new_unit_id = parse_uuid(&new_stock.unit_id, "sellUnits.unitId")?;
                if let Some(old) = previous
                    .iter()
                    .find(|row| row.unit_id == new_unit_id && !row.is_base)
                {
                    let per_new = crate::backend::qty::to_base_qty(
                        Decimal::ONE,
                        old.conversion_to_base,
                        &old.factor_direction,
                    );
                    if per_new > Decimal::ZERO && per_new != Decimal::ONE {
                        ProductRepository::rescale_inventory_for_base_change(
                            &transaction,
                            id,
                            per_new,
                        )
                        .await?;
                    }
                }
            }
            let mut units = sell_units;
            units.sort_by_key(|left| std::cmp::Reverse(left.is_base));
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

async fn insert_opening_stock(
    transaction: &sea_orm::DatabaseTransaction,
    context: &RequestContext,
    product_id: Uuid,
    created_by: Uuid,
    opening: &OpeningStockInput,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), AppError> {
    use sea_orm::{DbBackend, FromQueryResult, Statement};

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
    #[derive(Debug, FromQueryResult)]
    struct BaseSellPrices {
        minimum_price: Decimal,
        wholesale_price: Decimal,
        retail_price: Decimal,
    }
    let sell = BaseSellPrices::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT minimum_price, wholesale_price, retail_price FROM product_units WHERE product_id = ? AND is_base = 1 AND deleted_at IS NULL LIMIT 1",
        [product_id.into()],
    ))
    .one(transaction)
    .await?
    .unwrap_or(BaseSellPrices {
        minimum_price: Decimal::ZERO,
        wholesale_price: Decimal::ZERO,
        retail_price: Decimal::ZERO,
    });
    let lot_id = Uuid::new_v4();
    let lot_number =
        SequenceRepository::next(transaction, SEQUENCE_KIND_LOT, DEFAULT_LOT_PREFIX).await?;
    ProductRepository::insert_lot(
        transaction,
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
            minimum_price: Set(sell.minimum_price),
            wholesale_price: Set(sell.wholesale_price),
            retail_price: Set(sell.retail_price),
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
        transaction,
        "INSERT INTO branch_lots (id, branch_id, product_lot_id, allocated_base_quantity, remaining_base_quantity, reserved_base_quantity, damaged_base_quantity, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
        vec![
            Uuid::new_v4().into(),
            branch_id.into(),
            lot_id.into(),
            opening.quantity.into(),
            opening.quantity.into(),
            now.into(),
        ],
    )
    .await?;
    ProductRepository::raw_insert(
        transaction,
        "INSERT INTO stock_movements (id, branch_id, product_id, product_lot_id, type, displayed_quantity, displayed_unit_name, base_quantity_delta, unit_cost, total_cost, reference_type, reference_id, occurred_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            Uuid::new_v4().into(),
            branch_id.into(),
            product_id.into(),
            lot_id.into(),
            STOCK_MOVEMENT_ADJUSTMENT.into(),
            opening.quantity.into(),
            "base".into(),
            opening.quantity.into(),
            opening.cost.into(),
            (opening.cost * opening.quantity).into(),
            REFERENCE_PRODUCT_OPENING.into(),
            product_id.into(),
            now.into(),
            created_by.into(),
            now.into(),
        ],
    )
    .await?;
    Ok(())
}

fn factor_direction(unit: &ProductUnitInput) -> Result<String, AppError> {
    match unit
        .factor_direction
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        None => Ok(crate::backend::qty::FACTOR_MULTIPLY.to_owned()),
        Some(crate::backend::qty::FACTOR_MULTIPLY) | Some(crate::backend::qty::FACTOR_DIVIDE) => {
            Ok(unit.factor_direction.as_deref().unwrap().trim().to_owned())
        }
        Some(_) => Err(AppError::Validation(
            "factorDirection must be multiply or divide.".into(),
        )),
    }
}

fn unit_active_model(
    product_id: Uuid,
    unit: ProductUnitInput,
    sort_order: i32,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<product_unit::ActiveModel, AppError> {
    Ok(product_unit::ActiveModel {
        id: Set(
            parse_optional_uuid(unit.id.as_deref(), "sellUnits.id")?.unwrap_or_else(Uuid::new_v4)
        ),
        product_id: Set(product_id),
        unit_id: Set(parse_uuid(&unit.unit_id, "sellUnits.unitId")?),
        display_name: Set(unit.name.trim().to_owned()),
        conversion_to_base: Set(unit.contains),
        factor_direction: Set(factor_direction(&unit)?),
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

fn ensure_one_stock_unit(base_unit_id: &str, units: &mut [ProductUnitInput]) {
    if units.is_empty() {
        return;
    }
    let marked: Vec<usize> = units
        .iter()
        .enumerate()
        .filter(|(_, unit)| unit.is_base)
        .map(|(index, _)| index)
        .collect();
    let idx = if marked.len() == 1 {
        marked[0]
    } else {
        units
            .iter()
            .position(|unit| unit.unit_id == base_unit_id)
            .or_else(|| units.iter().position(|unit| unit.contains == Decimal::ONE))
            .unwrap_or(0)
    };
    let default_idx = units.iter().position(|unit| unit.is_default).unwrap_or(idx);
    for (index, unit) in units.iter_mut().enumerate() {
        unit.is_base = index == idx;
        unit.is_default = index == default_idx;
        if unit.is_base {
            unit.contains = Decimal::ONE;
        }
    }
}

fn validate_sell_unit_factors(units: &[ProductUnitInput]) -> Result<(), AppError> {
    for unit in units {
        if unit.contains <= Decimal::ZERO {
            return Err(AppError::Validation(
                "Unit conversion (contains) must be greater than zero.".into(),
            ));
        }
    }
    Ok(())
}

fn validate_sell_units(_base_unit_id: &str, units: &[ProductUnitInput]) -> Result<(), AppError> {
    let base_count = units.iter().filter(|unit| unit.is_base).count();
    if units.is_empty() || base_count != 1 {
        return Err(AppError::Validation(ERROR_INVALID_PRODUCT_UNITS.into()));
    }
    let base = units
        .iter()
        .find(|unit| unit.is_base)
        .expect("validated base");
    if base.contains != Decimal::ONE {
        return Err(AppError::Validation(ERROR_BASE_UNIT_CONVERSION.into()));
    }
    validate_sell_unit_factors(units)?;
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
    ensure_one_stock_unit(&request.base_unit_id, &mut request.sell_units);
    if let Some(stock) = request.sell_units.iter().find(|unit| unit.is_base) {
        request.base_unit_id = stock.unit_id.clone();
    }
    if let Some(opening) = &mut request.opening_stock {
        opening.quantity = quantity(opening.quantity);
        opening.cost = money_value(opening.cost);
    }
    for opening in &mut request.opening_stocks {
        opening.quantity = quantity(opening.quantity);
        opening.cost = money_value(opening.cost);
    }
}

/// Allowed: letters, digits, `-`, `_`, `.`, `/`. Max [`SKU_MAX_LEN`]. Trimmed.
fn normalize_custom_sku(raw: &str) -> Result<String, AppError> {
    let sku = raw.trim();
    if sku.is_empty() {
        return Err(AppError::Validation(ERROR_SKU_INVALID.into()));
    }
    if sku.chars().count() > SKU_MAX_LEN {
        return Err(AppError::Validation(ERROR_SKU_INVALID.into()));
    }
    if !sku
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'))
    {
        return Err(AppError::Validation(ERROR_SKU_INVALID.into()));
    }
    Ok(sku.to_owned())
}

fn normalize_warranty_unit(raw: &str) -> String {
    match raw.trim().to_ascii_uppercase().as_str() {
        "DAY" | "DAYS" => "DAYS".to_owned(),
        "MONTH" | "MONTHS" => "MONTHS".to_owned(),
        other => other.to_owned(),
    }
}

async fn resolve_create_product_no(
    transaction: &sea_orm::DatabaseTransaction,
    requested: Option<i32>,
) -> Result<i32, AppError> {
    if let Some(product_no) = requested {
        if product_no < 1 {
            return Err(AppError::Validation(ERROR_PRODUCT_NO_INVALID.into()));
        }
        if ProductRepository::product_no_taken(transaction, product_no, None).await? {
            return Err(AppError::Validation(ERROR_PRODUCT_NO_DUPLICATE.into()));
        }
        return Ok(product_no);
    }
    ProductRepository::next_product_no(transaction).await
}

async fn resolve_create_sku(
    transaction: &sea_orm::DatabaseTransaction,
    requested: Option<&str>,
) -> Result<String, AppError> {
    if let Some(raw) = requested.map(str::trim).filter(|s| !s.is_empty()) {
        let sku = normalize_custom_sku(raw)?;
        if ProductRepository::sku_taken(transaction, &sku, None).await? {
            return Err(AppError::Validation(ERROR_SKU_DUPLICATE.into()));
        }
        return Ok(sku);
    }
    // Auto P-#### — skip any value already taken by a custom SKU.
    for _ in 0..10_000 {
        let candidate =
            SequenceRepository::next(transaction, SEQUENCE_KIND_PRODUCT_SKU, DEFAULT_SKU_PREFIX)
                .await?;
        if !ProductRepository::sku_taken(transaction, &candidate, None).await? {
            return Ok(candidate);
        }
    }
    Err(AppError::Internal(
        "Could not allocate a unique product SKU.".into(),
    ))
}

/// Exact product barcode → default unit (no matched_unit_id).
/// Exact sell-unit barcode → that unit id for POS preselection.
fn annotate_matched_units(products: &mut [ProductResponse], query: &str) {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return;
    }
    for product in products.iter_mut() {
        if !product.barcode.is_empty() && product.barcode.to_lowercase() == needle {
            product.matched_unit_id = None;
            continue;
        }
        product.matched_unit_id = product
            .sell_units
            .iter()
            .find(|unit| !unit.barcode.is_empty() && unit.barcode.to_lowercase() == needle)
            .map(|unit| unit.id.clone());
    }
}

fn category_request(name: &str, name_urdu: Option<&str>) -> MasterRequest {
    let urdu = name_urdu
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    MasterRequest {
        name: name.trim().to_owned(),
        symbol: None,
        phone: None,
        email: None,
        address: None,
        // Categories store Urdu label in `description` (mapped as notes on MasterRequest).
        notes: urdu,
        is_active: true,
        precision: None,
        is_walk_in: false,
        in_credit_book: None,
        previous_balance: None,
        city_id: None,
    }
}

fn error_message(error: &AppError) -> String {
    error.to_string()
}

fn normalize_price_ladder(
    cost: Decimal,
    min: Decimal,
    wholesale: Decimal,
    price: Decimal,
) -> (Decimal, Decimal, Decimal, Decimal) {
    let cost = money_value(cost.max(Decimal::ZERO));
    let min = money_value(min.max(cost));
    let wholesale = money_value(wholesale.max(min));
    let price = money_value(price.max(wholesale));
    (cost, min, wholesale, price)
}

async fn load_all_masters(
    database: &DatabaseConnection,
    kind: MasterKind,
) -> Result<Vec<crate::backend::dto::MasterResponse>, AppError> {
    let mut page = 1u64;
    let mut rows = Vec::new();
    loop {
        let batch = MasterService::list(
            database,
            kind,
            PageQuery {
                page,
                per_page: MAX_PAGE_SIZE,
                is_active: Some(true),
                ..Default::default()
            },
        )
        .await?;
        let done = !batch.meta.has_next_page;
        rows.extend(batch.data);
        if done {
            break;
        }
        page += 1;
    }
    Ok(rows)
}

async fn load_unit_symbols(
    database: &DatabaseConnection,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let mut map = std::collections::HashMap::new();
    for row in load_all_masters(database, MasterKind::Unit).await? {
        if let Some(symbol) = row.symbol {
            map.insert(symbol.trim().to_ascii_lowercase(), row.id);
        }
    }
    Ok(map)
}

async fn load_category_names(
    database: &DatabaseConnection,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let mut map = std::collections::HashMap::new();
    for row in load_all_masters(database, MasterKind::Category).await? {
        map.insert(row.name.trim().to_ascii_lowercase(), row.id);
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;
    use sea_orm::{Database, DatabaseConnection};
    use uuid::Uuid;

    use crate::backend::{
        constants::{SEED_BRANCH_ID, SEED_DEVICE_ID, SEED_USER_ID},
        context::RequestContext,
        db::connect_memory,
        dto::{MasterRequest, OpeningStockInput, ProductUnitInput},
        repositories::{MasterKind, OrgRepository},
        services::MasterService,
    };

    use super::*;

    async fn seed_test_owner(database: &DatabaseConnection) {
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
        .expect("seed test owner");
    }

    #[test]
    fn normalizes_money_and_quantity_at_the_service_boundary() {
        let mut request = CreateProductRequest {
            urdu_name: None,
            name: "Test".into(),
            category_id: Uuid::new_v4().to_string(),
            base_unit_id: Uuid::new_v4().to_string(),
            created_by: None,
            product_no: None,
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
                factor_direction: None,
                is_base: true,
                is_default: true,
            }],
            opening_stock: None,
            opening_stocks: vec![],
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
        seed_test_owner(&database).await;
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
        .expect("create category");
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("load seeded units")
            .data
            .into_iter()
            .find(|unit| unit.symbol.as_deref() == Some("pc"))
            .expect("seeded Piece unit");
        let request = CreateProductRequest {
            urdu_name: None,
            name: "Switch".into(),
            category_id: category.id,
            base_unit_id: unit.id.clone(),
            created_by: None,
            product_no: None,
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
                factor_direction: None,
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
            opening_stocks: vec![],
        };

        let product = ProductService::create(&database, &context, request)
            .await
            .expect("create product transaction");
        assert_eq!(product.name, "Switch");
        assert_eq!(product.sku, "CLIENT-SKU");
        assert_eq!(product.stock, 5.0);
        assert_eq!(product.cost, 10.0);
        assert_eq!(product.sell_units.len(), 1);
        let _ = Database::connect("sqlite::memory:").await;
    }

    #[tokio::test]
    async fn custom_sku_pmx002_stored_and_duplicate_rejected() {
        let database = connect_memory().await.expect("memory db");
        seed_test_owner(&database).await;
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
                name: "SkuQA".into(),
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
            .expect("piece");

        let base = |name: &str, sku: Option<&str>| CreateProductRequest {
            urdu_name: None,
            name: name.into(),
            category_id: category.id.clone(),
            base_unit_id: unit.id.clone(),
            created_by: None,
            product_no: None,
            sku: sku.map(str::to_owned),
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
                cost: Decimal::new(5, 0),
                min: Decimal::new(5, 0),
                wholesale: Decimal::new(8, 0),
                price: Decimal::new(10, 0),
                barcode: None,
                factor_direction: None,
                is_base: true,
                is_default: true,
            }],
            opening_stock: None,
            opening_stocks: vec![],
        };

        let created = ProductService::create(&database, &context, base("Matrix", Some("PMX-002")))
            .await
            .expect("create PMX-002");
        assert_eq!(created.sku, "PMX-002");

        let dup = ProductService::create(&database, &context, base("Dup", Some("pmx-002")))
            .await
            .expect_err("case-insensitive duplicate");
        assert!(
            matches!(dup, AppError::Validation(ref m) if m.contains("SKU") || m.contains("already")),
            "expected 422-style validation, got {dup:?}"
        );

        let auto = ProductService::create(&database, &context, base("Auto", None))
            .await
            .expect("blank sku auto-generates");
        assert!(
            auto.sku.starts_with("P-"),
            "expected auto P-#### got {}",
            auto.sku
        );

        // Edit without sku field keeps custom SKU.
        let kept = ProductService::update(
            &database,
            &context,
            Uuid::parse_str(&created.id).unwrap(),
            UpdateProductRequest {
                urdu_name: None,
                name: Some("Matrix Renamed".into()),
                category_id: None,
                sku: None,
                minimum_stock: None,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                is_active: None,
                sell_units: None,
            },
        )
        .await
        .expect("rename without sku");
        assert_eq!(kept.sku, "PMX-002");
        assert_eq!(kept.name, "Matrix Renamed");

        let cashier = RequestContext {
            role: "CASHIER".into(),
            ..context.clone()
        };
        let denied = ProductService::update(
            &database,
            &cashier,
            Uuid::parse_str(&created.id).unwrap(),
            UpdateProductRequest {
                urdu_name: None,
                name: None,
                category_id: None,
                sku: Some("PMX-009".into()),
                minimum_stock: None,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                is_active: None,
                sell_units: None,
            },
        )
        .await
        .expect_err("cashier cannot edit sku");
        assert!(matches!(denied, AppError::Forbidden(_)));
    }

    #[tokio::test]
    async fn rejects_sell_unit_contains_zero_before_normalize() {
        let database = connect_memory().await.expect("memory db");
        seed_test_owner(&database).await;
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
                name: "ZeroContains".into(),
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
        .expect("create category");
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("load seeded units")
            .data
            .into_iter()
            .find(|unit| unit.symbol.as_deref() == Some("pc"))
            .expect("seeded Piece unit");
        let request = CreateProductRequest {
            urdu_name: None,
            name: "ZeroContainsBranch".into(),
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
                contains: Decimal::ZERO,
                cost: Decimal::new(8, 0),
                min: Decimal::new(10, 0),
                wholesale: Decimal::new(12, 0),
                price: Decimal::new(15, 0),
                barcode: None,
                factor_direction: None,
                is_base: true,
                is_default: true,
            }],
            opening_stock: None,
            opening_stocks: vec![],
        };
        let err = ProductService::create(&database, &context, request)
            .await
            .expect_err("contains 0 must fail");
        let message = err.to_string().to_lowercase();
        assert!(
            message.contains("contains")
                || message.contains("positive")
                || message.contains("greater")
                || message.contains("validation"),
            "unexpected error: {message}"
        );
    }

    #[tokio::test]
    async fn allows_create_with_zero_opening_stock() {
        let database = connect_memory().await.expect("memory db");
        seed_test_owner(&database).await;
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
                name: "ZeroStock".into(),
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
        .expect("create category");
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("load seeded units")
            .data
            .into_iter()
            .find(|unit| unit.symbol.as_deref() == Some("pc"))
            .expect("seeded Piece unit");
        let request = CreateProductRequest {
            urdu_name: None,
            name: "ZeroStockProduct".into(),
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
                cost: Decimal::new(8, 0),
                min: Decimal::new(10, 0),
                wholesale: Decimal::new(12, 0),
                price: Decimal::new(15, 0),
                barcode: None,
                factor_direction: None,
                is_base: true,
                is_default: true,
            }],
            opening_stock: None,
            opening_stocks: vec![],
        };
        let product = ProductService::create(&database, &context, request)
            .await
            .expect("create with zero opening stock");
        assert_eq!(product.stock, 0.0);
        assert_eq!(product.name, "ZeroStockProduct");
    }

    #[tokio::test]
    async fn updates_product_units_in_place_without_unique_violation() {
        let database = connect_memory().await.expect("memory db");
        seed_test_owner(&database).await;
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
        .expect("create category");
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("load seeded units")
            .data
            .into_iter()
            .find(|unit| unit.symbol.as_deref() == Some("pc"))
            .expect("seeded Piece unit");
        let created = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                urdu_name: None,
                name: "Cable".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
                sku: None,
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
                    unit_id: unit.id.clone(),
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(10, 0),
                    min: Decimal::new(12, 0),
                    wholesale: Decimal::new(14, 0),
                    price: Decimal::new(16, 0),
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
                    received_date: "2026-09-09".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("create product");
        let product_id = Uuid::parse_str(&created.id).expect("product id");
        let unit_row_id = created.sell_units[0].id.clone();

        let updated = ProductService::update(
            &database,
            &context,
            product_id,
            UpdateProductRequest {
                urdu_name: None,
                name: Some("Cable updated".into()),
                category_id: None,
                sku: None,
                minimum_stock: Some(Decimal::new(3, 0)),
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                is_active: None,
                sell_units: Some(vec![ProductUnitInput {
                    id: Some(unit_row_id.clone()),
                    unit_id: unit.id.clone(),
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(11, 0),
                    min: Decimal::new(13, 0),
                    wholesale: Decimal::new(15, 0),
                    price: Decimal::new(17, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }]),
            },
        )
        .await
        .expect("update product once");

        assert_eq!(updated.name, "Cable updated");
        assert_eq!(updated.sell_units.len(), 1);
        assert_eq!(updated.sell_units[0].id, unit_row_id);
        assert_eq!(updated.sell_units[0].cost, 11.0);

        let updated_again = ProductService::update(
            &database,
            &context,
            product_id,
            UpdateProductRequest {
                urdu_name: None,
                name: Some("Cable updated again".into()),
                category_id: None,
                sku: None,
                minimum_stock: None,
                warranty_qty: None,
                warranty_unit: None,
                warranty_note: None,
                is_active: None,
                sell_units: Some(vec![ProductUnitInput {
                    id: None,
                    unit_id: unit.id.clone(),
                    name: "Piece".into(),
                    contains: Decimal::ONE,
                    cost: Decimal::new(12, 0),
                    min: Decimal::new(14, 0),
                    wholesale: Decimal::new(16, 0),
                    price: Decimal::new(18, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }]),
            },
        )
        .await
        .expect("update product twice");

        assert_eq!(updated_again.name, "Cable updated again");
        assert_eq!(updated_again.sell_units.len(), 1);
        assert_eq!(updated_again.sell_units[0].id, unit_row_id);
        assert_eq!(updated_again.sell_units[0].cost, 12.0);
    }

    #[tokio::test]
    async fn search_matches_unit_barcodes_and_annotates_matched_unit() {
        let database = connect_memory().await.expect("memory db");
        seed_test_owner(&database).await;
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
                name: "BarcodeQA".into(),
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
        .expect("create category");
        let units = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("load seeded units")
            .data;
        let piece_master = units
            .iter()
            .find(|unit| unit.symbol.as_deref() == Some("pc"))
            .expect("seeded Piece unit");
        let pack_master = units
            .iter()
            .find(|unit| unit.symbol.as_deref() == Some("pk"))
            .expect("seeded Pack unit");

        const PIECE_BARCODE: &str = "6281000000001";
        const PACK_BARCODE: &str = "6281000000012";

        let created = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                urdu_name: None,
                name: "QA Barcode Widget".into(),
                category_id: category.id,
                base_unit_id: piece_master.id.clone(),
                created_by: None,
                product_no: None,
                sku: None,
                barcode: Some(PIECE_BARCODE.into()),
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
                        unit_id: piece_master.id.clone(),
                        name: "Piece".into(),
                        contains: Decimal::ONE,
                        cost: Decimal::new(8, 0),
                        min: Decimal::new(10, 0),
                        wholesale: Decimal::new(12, 0),
                        price: Decimal::new(15, 0),
                        barcode: Some(PIECE_BARCODE.into()),
                        factor_direction: None,
                        is_base: true,
                        is_default: true,
                    },
                    ProductUnitInput {
                        id: None,
                        unit_id: pack_master.id.clone(),
                        name: "Pack".into(),
                        contains: Decimal::new(10, 0),
                        cost: Decimal::new(80, 0),
                        min: Decimal::new(100, 0),
                        wholesale: Decimal::new(114, 0),
                        price: Decimal::new(140, 0),
                        barcode: Some(PACK_BARCODE.into()),
                        factor_direction: Some("multiply".into()),
                        is_base: false,
                        is_default: false,
                    },
                ],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(100, 0),
                    cost: Decimal::new(8, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("create product with piece/pack barcodes");

        let piece_unit = created
            .sell_units
            .iter()
            .find(|unit| unit.is_base)
            .expect("piece unit");
        let pack_unit = created
            .sell_units
            .iter()
            .find(|unit| unit.name == "Pack")
            .expect("pack unit");

        let by_piece = ProductService::search(&database, PIECE_BARCODE, Some(context.branch_id))
            .await
            .expect("search piece barcode");
        assert_eq!(by_piece.len(), 1);
        assert_eq!(by_piece[0].id, created.id);
        // Product barcode matches → default unit (no matched_unit_id).
        assert_eq!(by_piece[0].matched_unit_id, None);
        assert!(
            by_piece[0]
                .sell_units
                .iter()
                .any(|unit| unit.id == piece_unit.id && unit.is_default),
            "piece remains the default sale unit"
        );

        let by_pack = ProductService::search(&database, PACK_BARCODE, Some(context.branch_id))
            .await
            .expect("search pack barcode");
        assert_eq!(by_pack.len(), 1);
        assert_eq!(by_pack[0].id, created.id);
        assert_eq!(
            by_pack[0].matched_unit_id.as_deref(),
            Some(pack_unit.id.as_str())
        );

        let unknown = ProductService::search(&database, "6281999999999", Some(context.branch_id))
            .await
            .expect("search unknown barcode");
        assert!(unknown.is_empty());
    }

    #[tokio::test]
    async fn search_matches_pmx001_sku_case_and_hyphen_insensitive() {
        let database = connect_memory().await.expect("memory db");
        seed_test_owner(&database).await;
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
                name: "PmxCat".into(),
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
        let created = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                urdu_name: None,
                name: "Pricing Matrix Multi-Unit".into(),
                category_id: category.id,
                base_unit_id: unit.id.clone(),
                created_by: None,
                product_no: None,
                sku: Some("PMX-001".into()),
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
                    cost: Decimal::new(8, 0),
                    min: Decimal::new(10, 0),
                    wholesale: Decimal::new(12, 0),
                    price: Decimal::new(15, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: Some(OpeningStockInput {
                    branch_id: SEED_BRANCH_ID.into(),
                    supplier_id: None,
                    quantity: Decimal::new(50, 0),
                    cost: Decimal::new(8, 0),
                    received_date: "2026-10-17".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .expect("create product for PMX search");
        // Create ignores client SKU (auto P-####); set PMX-001 explicitly for lookup tests.
        let pmx_id = Uuid::parse_str(&created.id).expect("product id");
        let hex_id = pmx_id
            .as_bytes()
            .iter()
            .map(|b| format!("{b:02X}"))
            .collect::<String>();
        sea_orm::ConnectionTrait::execute_unprepared(
            &database,
            &format!("UPDATE products SET sku = 'PMX-001' WHERE id = x'{hex_id}'"),
        )
        .await
        .expect("set PMX-001 sku");

        for needle in ["PMX-001", "pmx", "pmx001", "PMX001"] {
            let hits = ProductService::search(&database, needle, Some(context.branch_id))
                .await
                .unwrap_or_else(|_| panic!("search {needle}"));
            assert!(
                hits.iter()
                    .any(|p| p.id == created.id && p.sku == "PMX-001"),
                "expected PMX-001 in results for {needle:?}, got {:?}",
                hits.iter().map(|p| p.sku.as_str()).collect::<Vec<_>>()
            );
        }
    }

    #[tokio::test]
    async fn import_catalog_creates_categories_then_products_with_product_id() {
        let database = connect_memory().await.expect("memory db");
        seed_test_owner(&database).await;
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

        // Matches imports/products-catalog.json shape (productId alias, categories first).
        let catalog: ProductImportCatalog = serde_json::from_str(
            r#"{
              "categories": [
                { "name": "Resistor", "nameUrdu": "ریزسٹر" },
                { "name": "Battery", "nameUrdu": "بیٹری" }
              ],
              "products": [
                {
                  "productId": 1,
                  "name": ".22 Ohm 2w",
                  "urduName": ".22 Ohm 2w",
                  "category": "Resistor",
                  "minimumStock": 0,
                  "sellUnits": [{
                    "symbol": "pc",
                    "name": "Piece",
                    "contains": 1,
                    "factorDirection": "multiply",
                    "isBase": true,
                    "isDefault": true,
                    "cost": 4.1,
                    "min": 4.5,
                    "wholesale": 5,
                    "price": 10
                  }]
                },
                {
                  "productId": 2,
                  "name": "Battery 12v7A Volta",
                  "urduName": "بیٹری 12v7A Volta",
                  "category": "Battery",
                  "minimumStock": 0,
                  "warrantyQty": 12,
                  "warrantyUnit": "MONTH",
                  "sellUnits": [{
                    "symbol": "pc",
                    "name": "Piece",
                    "contains": 1,
                    "factorDirection": "multiply",
                    "isBase": true,
                    "isDefault": true,
                    "cost": 1000,
                    "min": 1100,
                    "wholesale": 1200,
                    "price": 1500
                  }]
                }
              ]
            }"#,
        )
        .expect("catalog json");

        let result = ProductService::import_catalog(&database, &context, catalog)
            .await
            .expect("import");
        assert_eq!(result.categories_created, 2);
        assert_eq!(result.created, 2);
        assert_eq!(result.skipped, 0);
        assert!(
            result.errors.is_empty(),
            "unexpected import errors: {:?}",
            result.errors
        );

        let by_id = ProductService::search(&database, "1", Some(context.branch_id))
            .await
            .expect("search productId 1");
        assert!(
            by_id
                .iter()
                .any(|p| p.product_no == 1 && p.category == "Resistor"),
            "expected productNo=1 under Resistor, got {:?}",
            by_id
                .iter()
                .map(|p| (p.product_no, p.name.as_str(), p.category.as_str()))
                .collect::<Vec<_>>()
        );

        let by_name = ProductService::search(&database, "Volta", Some(context.branch_id))
            .await
            .expect("search Volta");
        let volta = by_name
            .iter()
            .find(|p| p.product_no == 2)
            .expect("productNo 2");
        assert_eq!(volta.category, "Battery");
        assert_eq!(volta.warranty_unit.to_ascii_lowercase(), "months");

        // Re-import same productIds should skip, not duplicate.
        let catalog_again: ProductImportCatalog = serde_json::from_str(
            r#"{
              "categories": [{ "name": "Resistor", "nameUrdu": "ریزسٹر" }],
              "products": [{
                "productId": 1,
                "name": ".22 Ohm 2w",
                "category": "Resistor",
                "sellUnits": [{
                  "symbol": "pc", "name": "Piece", "contains": 1,
                  "isBase": true, "isDefault": true,
                  "cost": 4.1, "min": 4.5, "wholesale": 5, "price": 10
                }]
              }]
            }"#,
        )
        .expect("catalog again");
        let again = ProductService::import_catalog(&database, &context, catalog_again)
            .await
            .expect("re-import");
        assert_eq!(again.created, 0);
        assert_eq!(again.skipped, 1);
        assert_eq!(again.categories_created, 0);
    }

    #[test]
    fn real_catalog_json_deserializes_product_id_alias() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../imports/products-catalog.json");
        if !path.exists() {
            return; // local dump may be gitignored
        }
        let raw = std::fs::read_to_string(&path).expect("read catalog");
        let catalog: ProductImportCatalog =
            serde_json::from_str(&raw).expect("deserialize products-catalog.json");
        assert!(
            !catalog.categories.is_empty(),
            "catalog must include categories[]"
        );
        assert!(
            !catalog.products.is_empty(),
            "catalog must include products[]"
        );
        assert_eq!(catalog.products[0].product_no, Some(1));
        assert!(
            catalog
                .products
                .iter()
                .all(|p| p.product_no.is_some_and(|n| n > 0)),
            "every product needs productId"
        );
        let names: std::collections::HashSet<_> = catalog
            .categories
            .iter()
            .map(|c| c.name.to_ascii_lowercase())
            .collect();
        for product in &catalog.products {
            assert!(
                names.contains(&product.category.to_ascii_lowercase()),
                "product {:?} category {:?} missing from categories[]",
                product.name,
                product.category
            );
        }
    }
}
