use rust_decimal::{prelude::ToPrimitive, Decimal};
use sea_orm::{
    ActiveModelTrait, ActiveValue, ActiveValue::Set, ColumnTrait, ConnectionTrait,
    DatabaseConnection, DatabaseTransaction, DbBackend, EntityTrait, FromQueryResult, QueryFilter,
    Statement,
};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::backend::{
    dto::{ProductBranchStockResponse, ProductListQuery, ProductResponse, ProductSellUnitResponse},
    entities::{product, product_lot, product_unit, unit, Product, ProductUnit, Unit},
    errors::AppError,
    util::parse_uuid,
};

#[derive(Clone, Debug, FromQueryResult)]
struct ProductProjection {
    id: Uuid,
    category_id: Uuid,
    base_unit_id: Uuid,
    name: String,
    urdu_name: Option<String>,
    product_no: Option<i32>,
    sku: String,
    barcode: String,
    product_type: String,
    minimum_stock: Decimal,
    warranty_duration: Option<i32>,
    warranty_unit: Option<String>,
    warranty_note: Option<String>,
    is_active: bool,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    category: String,
    unit_symbol: String,
    stock: Decimal,
    damaged: Decimal,
    current_cost: Decimal,
    supplier_id: Option<Uuid>,
    claims: i64,
}

#[derive(Debug, FromQueryResult)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromQueryResult)]
struct BranchStockRow {
    product_id: Uuid,
    branch_id: Uuid,
    branch_name: String,
    quantity: Decimal,
}

pub struct ProductRepository;

impl ProductRepository {
    pub async fn list(
        database: &DatabaseConnection,
        query: &ProductListQuery,
    ) -> Result<(Vec<ProductResponse>, u64), AppError> {
        let branch_id = query
            .branch_id
            .as_deref()
            .map(|value| parse_uuid(value, "branchId"))
            .transpose()?;
        let (conditions, mut values) = build_conditions(query, None, branch_id)?;
        let count_sql = format!(
            "SELECT COUNT(*) AS count FROM products p JOIN product_categories c ON c.id = p.category_id JOIN units u ON u.id = p.base_unit_id WHERE {conditions}"
        );
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            count_sql,
            values.clone(),
        ))
        .one(database)
        .await?
        .map(|row| std::cmp::max(row.count, 0) as u64)
        .unwrap_or(0);

        let sort = match query.page.sort_by.as_deref() {
            Some("name") => "p.name",
            Some("productNo") | Some("product_no") => "p.product_no",
            Some("sku") => "p.sku",
            Some("stock") => "stock",
            Some("cost") => "current_cost",
            _ => "p.created_at",
        };
        let direction = query.page.sort_direction.unwrap_or_default().sql();
        // When searching: names/IDs that start with the query rank above substring hits.
        let (order_sql, mut order_values) = if let Some(search) = query
            .page
            .search
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let q = search.to_lowercase();
            let prefix = format!("{q}%");
            (
                "CASE \
                        WHEN lower(p.name) = ? THEN 0 \
                        WHEN CAST(p.product_no AS TEXT) = ? THEN 0 \
                        WHEN lower(p.name) LIKE ? THEN 1 \
                        WHEN lower(COALESCE(p.urdu_name, '')) LIKE ? THEN 1 \
                        WHEN lower(p.sku) LIKE ? THEN 2 \
                        WHEN lower(p.barcode) LIKE ? THEN 2 \
                        ELSE 3 \
                     END ASC, p.name ASC, p.id ASC"
                    .to_owned(),
                vec![
                    q.clone().into(),
                    q.into(),
                    prefix.clone().into(),
                    prefix.clone().into(),
                    prefix.clone().into(),
                    prefix.into(),
                ],
            )
        } else {
            (format!("{sort} {direction}, p.id ASC"), Vec::new())
        };
        let (projection, mut projection_values) = projection_sql(branch_id);
        let sql = format!("{projection} WHERE {conditions} ORDER BY {order_sql} LIMIT ? OFFSET ?");
        projection_values.append(&mut values);
        projection_values.append(&mut order_values);
        projection_values.push((query.page.per_page as i64).into());
        projection_values.push((query.page.offset() as i64).into());
        let rows = ProductProjection::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            projection_values,
        ))
        .all(database)
        .await?;

        Ok((hydrate(database, rows).await?, count))
    }

    pub async fn search(
        database: &DatabaseConnection,
        search: &str,
        limit: u64,
    ) -> Result<Vec<ProductResponse>, AppError> {
        let query = ProductListQuery {
            page: crate::backend::dto::PageQuery {
                search: Some(search.to_owned()),
                per_page: limit,
                sort_by: Some("name".to_owned()),
                sort_direction: Some(crate::backend::dto::SortDirection::Asc),
                ..Default::default()
            },
            ..Default::default()
        };
        Self::list(database, &query).await.map(|result| result.0)
    }

    pub async fn find(
        database: &DatabaseConnection,
        id: Uuid,
        branch_id: Option<Uuid>,
    ) -> Result<Option<ProductResponse>, AppError> {
        let mut query = ProductListQuery::default();
        if let Some(branch_id) = branch_id {
            query.branch_id = Some(branch_id.to_string());
        }
        let (conditions, mut values) = build_conditions(&query, Some(id), branch_id)?;
        let (projection, mut projection_values) = projection_sql(branch_id);
        let sql = format!("{projection} WHERE {conditions} LIMIT 1");
        projection_values.append(&mut values);
        let rows = ProductProjection::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            projection_values,
        ))
        .all(database)
        .await?;
        Ok(hydrate(database, rows).await?.into_iter().next())
    }

    pub async fn insert_product(
        transaction: &DatabaseTransaction,
        model: product::ActiveModel,
    ) -> Result<product::Model, AppError> {
        Ok(model.insert(transaction).await?)
    }

    pub async fn insert_unit(
        transaction: &DatabaseTransaction,
        model: product_unit::ActiveModel,
    ) -> Result<product_unit::Model, AppError> {
        Ok(model.insert(transaction).await?)
    }

    pub async fn insert_lot(
        transaction: &DatabaseTransaction,
        model: product_lot::ActiveModel,
    ) -> Result<product_lot::Model, AppError> {
        Ok(model.insert(transaction).await?)
    }

    pub async fn raw_insert(
        transaction: &DatabaseTransaction,
        sql: &'static str,
        values: Vec<sea_orm::Value>,
    ) -> Result<(), AppError> {
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                sql,
                values,
            ))
            .await?;
        Ok(())
    }

    pub async fn update_product(
        database: &impl ConnectionTrait,
        model: product::ActiveModel,
    ) -> Result<product::Model, AppError> {
        Ok(model.update(database).await?)
    }

    pub async fn model(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<Option<product::Model>, AppError> {
        Ok(Product::find_by_id(id)
            .filter(product::Column::DeletedAt.is_null())
            .one(database)
            .await?)
    }

    /// Case-insensitive SKU collision check (active products only).
    pub async fn sku_taken<C: ConnectionTrait>(
        database: &C,
        sku: &str,
        exclude_id: Option<Uuid>,
    ) -> Result<bool, AppError> {
        let sql = if exclude_id.is_some() {
            "SELECT COUNT(*) AS count FROM products
             WHERE deleted_at IS NULL AND lower(sku) = lower(?) AND id != ?"
        } else {
            "SELECT COUNT(*) AS count FROM products
             WHERE deleted_at IS NULL AND lower(sku) = lower(?)"
        };
        let mut values: Vec<sea_orm::Value> = vec![sku.into()];
        if let Some(id) = exclude_id {
            values.push(id.into());
        }
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            values,
        ))
        .one(database)
        .await?
        .map(|row| row.count)
        .unwrap_or(0);
        Ok(count > 0)
    }

    pub async fn product_no_taken<C: ConnectionTrait>(
        database: &C,
        product_no: i32,
        exclude_id: Option<Uuid>,
    ) -> Result<bool, AppError> {
        let sql = if exclude_id.is_some() {
            "SELECT COUNT(*) AS count FROM products
             WHERE deleted_at IS NULL AND product_no = ? AND id != ?"
        } else {
            "SELECT COUNT(*) AS count FROM products
             WHERE deleted_at IS NULL AND product_no = ?"
        };
        let mut values: Vec<sea_orm::Value> = vec![product_no.into()];
        if let Some(id) = exclude_id {
            values.push(id.into());
        }
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            sql,
            values,
        ))
        .one(database)
        .await?
        .map(|row| row.count)
        .unwrap_or(0);
        Ok(count > 0)
    }

    /// Next shop search ID (max active product_no + 1, starting at 1).
    pub async fn next_product_no<C: ConnectionTrait>(database: &C) -> Result<i32, AppError> {
        #[derive(Debug, FromQueryResult)]
        struct MaxRow {
            max_no: Option<i32>,
        }
        let row = MaxRow::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT MAX(product_no) AS max_no FROM products WHERE deleted_at IS NULL",
            Vec::<sea_orm::Value>::new(),
        ))
        .one(database)
        .await?;
        Ok(row
            .and_then(|r| r.max_no)
            .unwrap_or(0)
            .saturating_add(1)
            .max(1))
    }

    pub async fn soft_delete(database: &DatabaseConnection, id: Uuid) -> Result<bool, AppError> {
        let Some(model) = Self::model(database, id).await? else {
            return Ok(false);
        };
        let mut active: product::ActiveModel = model.into();
        active.is_active = Set(false);
        active.deleted_at = Set(Some(chrono::Utc::now()));
        active.version = Set(active.version.take().unwrap_or(1) + 1);
        active.updated_at = Set(chrono::Utc::now());
        active.update(database).await?;
        Ok(true)
    }

    pub async fn list_units(
        database: &impl ConnectionTrait,
        product_id: Uuid,
    ) -> Result<Vec<product_unit::Model>, AppError> {
        Ok(ProductUnit::find()
            .filter(product_unit::Column::ProductId.eq(product_id))
            .filter(product_unit::Column::DeletedAt.is_null())
            .all(database)
            .await?)
    }

    /// When the inventory base unit changes, rescale open lot qty/cost so physical stock is preserved.
    /// `factor` = how many **old** base units equal 1 **new** base unit (e.g. 12 when Piece → Dozen).
    pub async fn rescale_inventory_for_base_change(
        transaction: &DatabaseTransaction,
        product_id: Uuid,
        factor: Decimal,
    ) -> Result<(), AppError> {
        if factor <= Decimal::ZERO || factor == Decimal::ONE {
            return Ok(());
        }
        let now = chrono::Utc::now();
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE product_lots SET original_base_quantity = original_base_quantity / ?, remaining_base_quantity = remaining_base_quantity / ?, damaged_base_quantity = damaged_base_quantity / ?, purchase_price_per_base = purchase_price_per_base * ?, version = version + 1, updated_at = ? WHERE product_id = ? AND deleted_at IS NULL",
                [
                    factor.into(),
                    factor.into(),
                    factor.into(),
                    factor.into(),
                    now.into(),
                    product_id.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE branch_lots SET allocated_base_quantity = allocated_base_quantity / ?, remaining_base_quantity = remaining_base_quantity / ?, reserved_base_quantity = reserved_base_quantity / ?, damaged_base_quantity = damaged_base_quantity / ?, updated_at = ? WHERE product_lot_id IN (SELECT id FROM product_lots WHERE product_id = ? AND deleted_at IS NULL)",
                [
                    factor.into(),
                    factor.into(),
                    factor.into(),
                    factor.into(),
                    now.into(),
                    product_id.into(),
                ],
            ))
            .await?;
        Ok(())
    }

    pub async fn replace_units(
        transaction: &DatabaseTransaction,
        product_id: Uuid,
        units: Vec<product_unit::ActiveModel>,
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now();
        // Clear stock-unit flags first. The real flag is set after every row is written.
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE product_units SET is_base = 0, is_default_sale_unit = 0, updated_at = ? WHERE product_id = ?",
                [now.into(), product_id.into()],
            ))
            .await?;
        let existing = ProductUnit::find()
            .filter(product_unit::Column::ProductId.eq(product_id))
            .all(transaction)
            .await?;
        let mut kept_ids = HashSet::new();
        let mut base_id = None;
        let mut default_id = None;

        for mut incoming in units {
            let want_base = active_value(&incoming.is_base).unwrap_or(false);
            let want_default = active_value(&incoming.is_default_sale_unit).unwrap_or(false);
            incoming.is_base = Set(false);
            incoming.is_default_sale_unit = Set(false);
            let incoming_id = active_value(&incoming.id);
            let incoming_unit_id = active_value(&incoming.unit_id);
            let incoming_conversion = active_value(&incoming.conversion_to_base);
            let matched = incoming_id
                .and_then(|id| existing.iter().find(|row| row.id == id))
                .or_else(|| {
                    existing.iter().find(|row| {
                        Some(row.unit_id) == incoming_unit_id
                            && Some(row.conversion_to_base) == incoming_conversion
                    })
                });

            let id = if let Some(row) = matched {
                merge_unit(row, incoming, now).update(transaction).await?;
                kept_ids.insert(row.id);
                row.id
            } else {
                let model = incoming.insert(transaction).await?;
                kept_ids.insert(model.id);
                model.id
            };
            if want_base {
                base_id = Some(id);
            }
            if want_default {
                default_id = Some(id);
            }
        }
        if let Some(id) = base_id {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE product_units SET is_base = 1 WHERE id = ?",
                    [id.into()],
                ))
                .await?;
        }
        if let Some(id) = default_id {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE product_units SET is_default_sale_unit = 1 WHERE id = ?",
                    [id.into()],
                ))
                .await?;
        }

        for row in existing.iter() {
            if row.deleted_at.is_none() && !kept_ids.contains(&row.id) {
                let mut active: product_unit::ActiveModel = row.clone().into();
                active.deleted_at = Set(Some(now));
                active.is_active = Set(false);
                active.version = Set(row.version + 1);
                active.updated_at = Set(now);
                active.update(transaction).await?;
            }
        }
        Ok(())
    }
}

fn active_value<T: Clone>(value: &ActiveValue<T>) -> Option<T>
where
    sea_orm::Value: From<T>,
{
    match value {
        ActiveValue::Set(v) | ActiveValue::Unchanged(v) => Some(v.clone()),
        ActiveValue::NotSet => None,
    }
}

fn merge_unit(
    existing: &product_unit::Model,
    incoming: product_unit::ActiveModel,
    now: chrono::DateTime<chrono::Utc>,
) -> product_unit::ActiveModel {
    product_unit::ActiveModel {
        id: Set(existing.id),
        product_id: Set(existing.product_id),
        unit_id: incoming.unit_id,
        display_name: incoming.display_name,
        conversion_to_base: incoming.conversion_to_base,
        factor_direction: incoming.factor_direction,
        cost_reference: incoming.cost_reference,
        minimum_price: incoming.minimum_price,
        wholesale_price: incoming.wholesale_price,
        retail_price: incoming.retail_price,
        barcode: incoming.barcode,
        is_base: incoming.is_base,
        is_default_sale_unit: incoming.is_default_sale_unit,
        sort_order: incoming.sort_order,
        is_active: Set(true),
        version: Set(existing.version + 1),
        deleted_at: Set(None),
        origin_device_id: Set(existing.origin_device_id),
        created_at: Set(existing.created_at),
        updated_at: Set(now),
    }
}

fn projection_sql(branch_id: Option<Uuid>) -> (String, Vec<sea_orm::Value>) {
    let (stock_expr, damaged_expr, mut values) = if let Some(branch_id) = branch_id {
        (
            "CAST(COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE pl.product_id = p.id AND pl.deleted_at IS NULL AND bl.branch_id = ?), 0) AS REAL)".to_owned(),
            "CAST(COALESCE((SELECT SUM(bl.damaged_base_quantity) FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE pl.product_id = p.id AND pl.deleted_at IS NULL AND bl.branch_id = ?), 0) AS REAL)".to_owned(),
            vec![branch_id.into(), branch_id.into()],
        )
    } else {
        (
            "CAST(COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE pl.product_id = p.id AND pl.deleted_at IS NULL), 0) AS REAL)".to_owned(),
            "CAST(COALESCE((SELECT SUM(bl.damaged_base_quantity) FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE pl.product_id = p.id AND pl.deleted_at IS NULL), 0) AS REAL)".to_owned(),
            Vec::new(),
        )
    };
    let sql = format!(
        "SELECT p.id, p.category_id, p.base_unit_id, p.name, p.urdu_name, p.product_no, p.sku, p.barcode, p.product_type, p.minimum_stock, p.warranty_duration, p.warranty_unit, p.warranty_note, p.is_active, p.created_at, p.updated_at, c.name AS category, u.symbol AS unit_symbol, {stock_expr} AS stock, {damaged_expr} AS damaged, CAST(COALESCE((SELECT pl.purchase_price_per_base FROM product_lots pl WHERE pl.product_id = p.id AND pl.deleted_at IS NULL AND pl.remaining_base_quantity > 0 ORDER BY pl.received_date ASC, pl.created_at ASC LIMIT 1), (SELECT pl.purchase_price_per_base FROM product_lots pl WHERE pl.product_id = p.id AND pl.deleted_at IS NULL ORDER BY pl.received_date DESC, pl.created_at DESC LIMIT 1), 0) AS REAL) AS current_cost, (SELECT pl.supplier_id FROM product_lots pl WHERE pl.product_id = p.id AND pl.deleted_at IS NULL AND pl.remaining_base_quantity > 0 ORDER BY pl.received_date ASC, pl.created_at ASC LIMIT 1) AS supplier_id, COALESCE((SELECT COUNT(*) FROM warranty_claim_items wci WHERE wci.product_id = p.id), 0) AS claims FROM products p JOIN product_categories c ON c.id = p.category_id JOIN units u ON u.id = p.base_unit_id"
    );
    let _ = &mut values;
    (sql, values)
}

fn build_conditions(
    query: &ProductListQuery,
    id: Option<Uuid>,
    branch_id: Option<Uuid>,
) -> Result<(String, Vec<sea_orm::Value>), AppError> {
    let mut parts = vec!["p.deleted_at IS NULL".to_owned()];
    let mut values = Vec::new();
    if let Some(id) = id {
        parts.push("p.id = ?".to_owned());
        values.push(id.into());
    }
    if let Some(active) = query.page.is_active {
        parts.push("p.is_active = ?".to_owned());
        values.push(active.into());
    }
    if let Some(search) = &query.page.search {
        // Case-insensitive partial match on name/sku/barcode/category/unit barcodes + product_no.
        // Also match hyphen/space-stripped SKU/barcode so "pmx001" hits "PMX-001".
        parts.push(
            "(lower(p.name) LIKE ? OR lower(COALESCE(p.urdu_name, '')) LIKE ? OR CAST(p.product_no AS TEXT) LIKE ? OR lower(p.sku) LIKE ? OR lower(p.barcode) LIKE ? OR lower(c.name) LIKE ? OR EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND pu.deleted_at IS NULL AND lower(COALESCE(pu.barcode, '')) LIKE ?) OR replace(replace(lower(p.sku), '-', ''), ' ', '') LIKE ? OR replace(replace(lower(COALESCE(p.barcode, '')), '-', ''), ' ', '') LIKE ? OR EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND pu.deleted_at IS NULL AND replace(replace(lower(COALESCE(pu.barcode, '')), '-', ''), ' ', '') LIKE ?))"
                .to_owned(),
        );
        let needle = format!("%{}%", search.to_lowercase());
        let compact = format!(
            "%{}%",
            search
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .flat_map(|c| c.to_lowercase())
                .collect::<String>()
        );
        values.extend([
            needle.clone().into(),
            needle.clone().into(),
            needle.clone().into(), // product_no
            needle.clone().into(),
            needle.clone().into(),
            needle.clone().into(),
            needle.into(),
            compact.clone().into(),
            compact.clone().into(),
            compact.into(),
        ]);
    }
    crate::backend::util::push_in_uuids(
        &mut parts,
        &mut values,
        "p.category_id",
        query.category_id.as_deref(),
        "categoryId",
    )?;
    crate::backend::util::push_in_strings(
        &mut parts,
        &mut values,
        "p.product_type",
        query.product_type.as_deref(),
        true,
    );
    if query.in_stock == Some(true) {
        parts.push(stock_compare(branch_id, &mut values, "> 0"));
    }
    if query.low_stock == Some(true) {
        parts.push(stock_compare(branch_id, &mut values, "< p.minimum_stock"));
    }
    if let Some(min_price) = query.min_price {
        parts.push("EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND pu.is_base = 1 AND pu.retail_price >= ? AND pu.deleted_at IS NULL)".to_owned());
        values.push(min_price.into());
    }
    if let Some(max_price) = query.max_price {
        parts.push("EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND pu.is_base = 1 AND pu.retail_price <= ? AND pu.deleted_at IS NULL)".to_owned());
        values.push(max_price.into());
    }
    Ok((parts.join(" AND "), values))
}

fn stock_compare(branch_id: Option<Uuid>, values: &mut Vec<sea_orm::Value>, op: &str) -> String {
    if let Some(branch_id) = branch_id {
        values.push(branch_id.into());
        format!(
            "COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE pl.product_id = p.id AND pl.deleted_at IS NULL AND bl.branch_id = ?), 0) {op}"
        )
    } else {
        format!(
            "COALESCE((SELECT SUM(bl.remaining_base_quantity) FROM branch_lots bl JOIN product_lots pl ON pl.id = bl.product_lot_id WHERE pl.product_id = p.id AND pl.deleted_at IS NULL), 0) {op}"
        )
    }
}

async fn load_branch_stocks(
    database: &DatabaseConnection,
    product_ids: &[Uuid],
) -> Result<HashMap<Uuid, Vec<ProductBranchStockResponse>>, AppError> {
    if product_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = product_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT pl.product_id, bl.branch_id, b.name AS branch_name, CAST(SUM(bl.remaining_base_quantity) AS REAL) AS quantity FROM branch_lots bl INNER JOIN product_lots pl ON pl.id = bl.product_lot_id AND pl.deleted_at IS NULL INNER JOIN branches b ON b.id = bl.branch_id AND b.deleted_at IS NULL WHERE pl.product_id IN ({placeholders}) GROUP BY pl.product_id, bl.branch_id, b.name HAVING quantity > 0 ORDER BY b.name"
    );
    let values: Vec<sea_orm::Value> = product_ids.iter().map(|id| (*id).into()).collect();
    let rows = BranchStockRow::find_by_statement(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        sql,
        values,
    ))
    .all(database)
    .await?;
    let mut map: HashMap<Uuid, Vec<ProductBranchStockResponse>> = HashMap::new();
    for row in rows {
        map.entry(row.product_id)
            .or_default()
            .push(ProductBranchStockResponse {
                branch_id: row.branch_id.to_string(),
                branch_name: row.branch_name,
                quantity: decimal(row.quantity),
            });
    }
    Ok(map)
}

async fn hydrate(
    database: &DatabaseConnection,
    rows: Vec<ProductProjection>,
) -> Result<Vec<ProductResponse>, AppError> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }
    let ids: Vec<Uuid> = rows.iter().map(|row| row.id).collect();
    let branch_stocks = load_branch_stocks(database, &ids).await?;
    let unit_models = ProductUnit::find()
        .filter(product_unit::Column::ProductId.is_in(ids.clone()))
        .filter(product_unit::Column::DeletedAt.is_null())
        .all(database)
        .await?;
    let master_ids: Vec<Uuid> = unit_models.iter().map(|unit| unit.unit_id).collect();
    let master_symbols: HashMap<Uuid, String> = Unit::find()
        .filter(unit::Column::Id.is_in(master_ids))
        .all(database)
        .await?
        .into_iter()
        .map(|unit| (unit.id, unit.symbol))
        .collect();
    let mut units_by_product: HashMap<Uuid, Vec<product_unit::Model>> = HashMap::new();
    for unit in unit_models {
        units_by_product
            .entry(unit.product_id)
            .or_default()
            .push(unit);
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let mut units = units_by_product.remove(&row.id).unwrap_or_default();
            units.sort_by_key(|left| left.sort_order);
            let base = units
                .iter()
                .find(|unit| unit.is_base)
                .or_else(|| units.first());
            let first_bigger = units.iter().find(|unit| {
                unit.conversion_to_base > Decimal::ONE
                    && unit.factor_direction != crate::backend::qty::FACTOR_DIVIDE
            });
            let cost = if row.current_cost > Decimal::ZERO {
                row.current_cost
            } else {
                base.and_then(|unit| unit.cost_reference)
                    .unwrap_or(row.current_cost)
            };
            let min = base.map(|unit| unit.minimum_price).unwrap_or_default();
            let wholesale = base.map(|unit| unit.wholesale_price).unwrap_or_default();
            let retail = base.map(|unit| unit.retail_price).unwrap_or_default();
            let pack_qty = first_bigger.map(|unit| decimal(unit.conversion_to_base));
            let pack_price = first_bigger
                .map(|unit| decimal(unit.retail_price))
                .unwrap_or_default();
            let warranty_qty = row.warranty_duration.unwrap_or(0);
            let warranty_unit = row
                .warranty_unit
                .clone()
                .unwrap_or_else(|| "MONTHS".into())
                .to_lowercase();
            let warranty_days = if warranty_unit == "months" {
                warranty_qty * 30
            } else {
                warranty_qty
            };
            let sell_units: Vec<ProductSellUnitResponse> = units
                .into_iter()
                .map(|unit| {
                    let symbol = master_symbols
                        .get(&unit.unit_id)
                        .cloned()
                        .unwrap_or_else(|| unit.display_name.clone());
                    ProductSellUnitResponse {
                        id: unit.id.to_string(),
                        name: unit.display_name,
                        symbol,
                        contains: decimal(unit.conversion_to_base),
                        cost: decimal(unit.cost_reference.unwrap_or_else(|| {
                            row.current_cost
                                * crate::backend::qty::to_base_qty(
                                    Decimal::ONE,
                                    unit.conversion_to_base,
                                    &unit.factor_direction,
                                )
                        })),
                        min: decimal(unit.minimum_price),
                        wholesale: decimal(unit.wholesale_price),
                        price: decimal(unit.retail_price),
                        barcode: unit.barcode.unwrap_or_default(),
                        is_base: unit.is_base,
                        is_default: unit.is_default_sale_unit,
                        factor_direction: unit.factor_direction,
                    }
                })
                .collect();
            let is_linear = is_linear_unit(&row.unit_symbol)
                || sell_units
                    .iter()
                    .any(|unit| is_linear_unit(&unit.symbol) || is_linear_name(&unit.name));
            let branch_stock = branch_stocks.get(&row.id).cloned().unwrap_or_default();
            let total_stock = if branch_stock.is_empty() {
                decimal(row.stock)
            } else {
                branch_stock.iter().map(|entry| entry.quantity).sum()
            };
            ProductResponse {
                id: row.id.to_string(),
                name: row.name,
                urdu_name: row.urdu_name.unwrap_or_default(),
                product_no: row.product_no.unwrap_or(0),
                sku: row.sku,
                barcode: row.barcode,
                category: row.category,
                category_id: row.category_id.to_string(),
                unit: row.unit_symbol,
                base_unit_id: row.base_unit_id.to_string(),
                supplier_id: row.supplier_id.map(|value| value.to_string()),
                minimum_stock: decimal(row.minimum_stock),
                is_linear,
                is_manufactured: row.product_type == "MANUFACTURED",
                pack_qty,
                pack_price,
                cost: decimal(cost),
                min: decimal(min),
                wholesale: decimal(wholesale),
                retail: decimal(retail),
                warranty_enabled: warranty_qty > 0,
                warranty_qty,
                warranty_unit,
                warranty_days,
                warranty_note: row.warranty_note.unwrap_or_default(),
                claims: row.claims,
                damaged: decimal(row.damaged),
                stock: decimal(row.stock),
                total_stock,
                branch_stock,
                components: Vec::new(),
                sell_units,
                matched_unit_id: None,
                is_active: row.is_active,
                created_at: row.created_at.to_rfc3339(),
                updated_at: row.updated_at.to_rfc3339(),
            }
        })
        .collect())
}

fn is_linear_unit(symbol: &str) -> bool {
    matches!(symbol.trim().to_lowercase().as_str(), "m" | "gaz" | "ft")
}

fn is_linear_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("meter")
        || lower.contains("gaz")
        || lower.split_whitespace().any(|part| part == "m")
}

fn decimal(value: Decimal) -> f64 {
    value.to_f64().unwrap_or_default()
}
