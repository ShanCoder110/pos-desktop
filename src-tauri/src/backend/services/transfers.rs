use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{DEFAULT_TRANSFER_PREFIX, ERROR_TRANSFER_NOT_FOUND, SEQUENCE_KIND_TRANSFER},
    context::RequestContext,
    dto::{CreateTransferRequest, Paginated, PaginationMeta, TransferListQuery, TransferResponse},
    errors::AppError,
    repositories::{OrgRepository, SequenceRepository, TransferRepository},
    util::{parse_uuid, quantity},
};

pub struct TransferService;

const REPAIR_TRANSFER_PREFIX: &str = "DUKAN_REPAIR_SHOP:";

impl TransferService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: TransferListQuery,
    ) -> Result<Paginated<TransferResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = TransferRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<TransferResponse, AppError> {
        TransferRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_TRANSFER_NOT_FOUND))
    }

    pub async fn create(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateTransferRequest,
    ) -> Result<TransferResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let number = SequenceRepository::next(
            &transaction,
            SEQUENCE_KIND_TRANSFER,
            DEFAULT_TRANSFER_PREFIX,
        )
        .await?;
        let id = TransferRepository::create(&transaction, context, &request, number).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn send(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
    ) -> Result<TransferResponse, AppError> {
        let transaction = database.begin().await?;
        TransferRepository::send(&transaction, context, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn receive(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
    ) -> Result<TransferResponse, AppError> {
        let transaction = database.begin().await?;
        TransferRepository::receive(&transaction, context, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn delete_permanent(database: &DatabaseConnection, id: Uuid) -> Result<(), AppError> {
        let transaction = database.begin().await?;
        TransferRepository::delete_permanent(&transaction, id).await?;
        transaction.commit().await?;
        Ok(())
    }

    /// Commit a one-click stock transfer only after stock reaches the destination.
    pub async fn create_received(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateTransferRequest,
    ) -> Result<TransferResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let id = create_and_receive(&transaction, context, &request).await?;
        let response = TransferRepository::find(&transaction, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_TRANSFER_NOT_FOUND))?;
        transaction.commit().await?;
        Ok(response)
    }

    /// Create, send, and receive a repair-stock transfer in one database transaction.
    pub async fn create_received_repair(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreateTransferRequest,
    ) -> Result<TransferResponse, AppError> {
        validate_repair_request(&mut request)?;
        validate_repair_branch(database, &request).await?;
        let transaction = database.begin().await?;
        let id = create_and_receive(&transaction, context, &request).await?;
        let response = TransferRepository::find(&transaction, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_TRANSFER_NOT_FOUND))?;
        transaction.commit().await?;
        Ok(response)
    }

    /// Replace a received repair transfer atomically; any failure restores the original record.
    pub async fn replace_received_repair(
        database: &DatabaseConnection,
        context: &RequestContext,
        old_id: Uuid,
        mut request: CreateTransferRequest,
    ) -> Result<TransferResponse, AppError> {
        validate_repair_request(&mut request)?;
        validate_repair_branch(database, &request).await?;
        let transaction = database.begin().await?;
        let previous = TransferRepository::find(&transaction, old_id)
            .await?
            .ok_or(AppError::NotFound(ERROR_TRANSFER_NOT_FOUND))?;
        if previous.status != "RECEIVED"
            || !previous
                .notes
                .as_deref()
                .unwrap_or_default()
                .starts_with(REPAIR_TRANSFER_PREFIX)
            || previous.from_branch_id != request.from_branch_id
            || previous.to_branch_id != request.to_branch_id
        {
            return Err(AppError::Conflict(
                "Only a received repair transfer can be replaced in the same branches.".into(),
            ));
        }
        TransferRepository::delete_permanent(&transaction, old_id).await?;
        let id = create_and_receive(&transaction, context, &request).await?;
        let response = TransferRepository::find(&transaction, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_TRANSFER_NOT_FOUND))?;
        transaction.commit().await?;
        Ok(response)
    }
}

fn validate_repair_request(request: &mut CreateTransferRequest) -> Result<(), AppError> {
    let notes = request.notes.as_deref().unwrap_or_default();
    let Some(metadata) = notes.strip_prefix(REPAIR_TRANSFER_PREFIX) else {
        return Err(AppError::Validation(
            "Repair transfer metadata is required.".into(),
        ));
    };
    let metadata: serde_json::Value =
        serde_json::from_str(metadata.split('\n').next().unwrap_or_default())
            .map_err(|_| AppError::Validation("Repair transfer metadata is invalid.".into()))?;
    let lines = metadata.get("lines").and_then(serde_json::Value::as_array);
    if metadata.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || lines.is_none_or(Vec::is_empty)
        || lines.is_some_and(|rows| {
            rows.iter().any(|row| {
                row.get("productId")
                    .and_then(serde_json::Value::as_str)
                    .is_none_or(str::is_empty)
                    || row
                        .get("unitId")
                        .and_then(serde_json::Value::as_str)
                        .is_none_or(str::is_empty)
                    || row
                        .get("quantity")
                        .and_then(serde_json::Value::as_f64)
                        .is_none_or(|value| !value.is_finite() || value <= 0.0)
            })
        })
    {
        return Err(AppError::Validation(
            "Repair transfer metadata must contain product lines.".into(),
        ));
    }
    for item in &mut request.items {
        item.quantity = quantity(item.quantity);
    }
    request.validate()?;
    Ok(())
}

async fn validate_repair_branch(
    database: &DatabaseConnection,
    request: &CreateTransferRequest,
) -> Result<(), AppError> {
    let id = parse_uuid(&request.to_branch_id, "toBranchId")?;
    let branch = OrgRepository::find_branch(database, id)
        .await?
        .ok_or(AppError::Validation("Repair shop does not exist.".into()))?;
    if branch.branch_type != "REPAIR" || !branch.is_active {
        return Err(AppError::Validation(
            "Destination must be an active repair shop.".into(),
        ));
    }
    Ok(())
}

async fn create_and_receive(
    transaction: &sea_orm::DatabaseTransaction,
    context: &RequestContext,
    request: &CreateTransferRequest,
) -> Result<Uuid, AppError> {
    let number =
        SequenceRepository::next(transaction, SEQUENCE_KIND_TRANSFER, DEFAULT_TRANSFER_PREFIX)
            .await?;
    let id = TransferRepository::create(transaction, context, request, number).await?;
    TransferRepository::send(transaction, context, id).await?;
    TransferRepository::receive(transaction, context, id).await?;
    Ok(id)
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
            BranchRequest, CreateProductRequest, CreateTransferRequest, LotListQuery,
            MasterRequest, OpeningStockInput, ProductUnitInput, TransferItemInput,
        },
        repositories::{MasterKind, OrgRepository},
        services::{LotService, MasterService, OrgService, ProductService, TransferService},
    };

    fn context() -> RequestContext {
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
        .unwrap();
    }

    async fn branch_qty(database: &DatabaseConnection, branch_id: &str, lot_id: &str) -> f64 {
        #[derive(Debug, FromQueryResult)]
        struct Qty {
            quantity: f64,
        }
        Qty::find_by_statement(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT CAST(COALESCE(SUM(remaining_base_quantity), 0) AS REAL) AS quantity FROM branch_lots WHERE branch_id = ? AND product_lot_id = ?",
            [
                Uuid::parse_str(branch_id).unwrap().into(),
                Uuid::parse_str(lot_id).unwrap().into(),
            ],
        ))
        .one(database)
        .await
        .unwrap()
        .unwrap()
        .quantity
    }

    #[tokio::test]
    async fn repair_replacement_rolls_back_original_if_new_stock_cannot_be_sent() {
        let database = connect_memory().await.unwrap();
        seed_owner(&database).await;
        let ctx = context();
        let repair = OrgService::create_branch(
            &database,
            &ctx,
            BranchRequest {
                name: "Repair test".into(),
                code: None,
                branch_type: "REPAIR".into(),
                phone: None,
                address: None,
                is_main: false,
                is_active: true,
                settings: None,
            },
        )
        .await
        .unwrap();
        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "Repair test parts".into(),
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
        .unwrap();
        let unit = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .unwrap()
            .data
            .into_iter()
            .find(|row| row.symbol.as_deref() == Some("pc"))
            .unwrap();
        let product = ProductService::create(
            &database,
            &ctx,
            CreateProductRequest {
                urdu_name: None,
                name: "Repair test lamp".into(),
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
                    quantity: Decimal::new(10, 0),
                    cost: Decimal::new(10, 0),
                    received_date: "2026-10-01".into(),
                    expiry_date: None,
                }),
                opening_stocks: vec![],
            },
        )
        .await
        .unwrap();
        let lot = LotService::list(
            &database,
            LotListQuery {
                product_id: Some(product.id.clone()),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .data
        .remove(0);
        let draft = |qty: i64| {
            CreateTransferRequest {
            from_branch_id: SEED_BRANCH_ID.into(),
            to_branch_id: repair.id.clone(),
            notes: Some(format!(
                "DUKAN_REPAIR_SHOP:{{\"version\":1,\"lines\":[{{\"productId\":\"{}\",\"unitId\":\"{}\",\"quantity\":{qty}}}]}}",
                product.id, product.sell_units[0].id
            )),
            items: vec![TransferItemInput {
                product_id: product.id.clone(),
                product_lot_id: lot.id.clone(),
                quantity: Decimal::new(qty, 0),
            }],
        }
        };
        let mut invalid_metadata = draft(1);
        invalid_metadata.notes = Some("DUKAN_REPAIR_SHOP:{\"version\":1,\"lines\":[]}".into());
        assert!(
            TransferService::create_received_repair(&database, &ctx, invalid_metadata)
                .await
                .is_err()
        );
        let mut wrong_destination = draft(1);
        wrong_destination.to_branch_id = Uuid::new_v4().to_string();
        assert!(
            TransferService::create_received_repair(&database, &ctx, wrong_destination)
                .await
                .is_err()
        );
        let mut generic_failed = draft(11);
        generic_failed.notes = None;
        assert!(
            TransferService::create_received(&database, &ctx, generic_failed)
                .await
                .is_err()
        );
        assert!(
            TransferService::create_received_repair(&database, &ctx, draft(11))
                .await
                .is_err()
        );
        assert!(TransferService::list(&database, Default::default())
            .await
            .unwrap()
            .data
            .is_empty());
        assert_eq!(branch_qty(&database, SEED_BRANCH_ID, &lot.id).await, 10.0);
        let original = TransferService::create_received_repair(&database, &ctx, draft(3))
            .await
            .unwrap();
        assert_eq!(original.status, "RECEIVED");
        assert_eq!(branch_qty(&database, SEED_BRANCH_ID, &lot.id).await, 7.0);
        assert_eq!(branch_qty(&database, &repair.id, &lot.id).await, 3.0);

        let failed = TransferService::replace_received_repair(
            &database,
            &ctx,
            Uuid::parse_str(&original.id).unwrap(),
            draft(11),
        )
        .await;
        assert!(failed.is_err());
        assert!(
            TransferService::get(&database, Uuid::parse_str(&original.id).unwrap())
                .await
                .is_ok()
        );
        assert_eq!(branch_qty(&database, SEED_BRANCH_ID, &lot.id).await, 7.0);
        assert_eq!(branch_qty(&database, &repair.id, &lot.id).await, 3.0);

        let replacement = TransferService::replace_received_repair(
            &database,
            &ctx,
            Uuid::parse_str(&original.id).unwrap(),
            draft(4),
        )
        .await
        .unwrap();
        assert_eq!(replacement.status, "RECEIVED");
        assert!(
            TransferService::get(&database, Uuid::parse_str(&original.id).unwrap())
                .await
                .is_err()
        );
        assert_eq!(branch_qty(&database, SEED_BRANCH_ID, &lot.id).await, 6.0);
        assert_eq!(branch_qty(&database, &repair.id, &lot.id).await, 4.0);

        let mut generic_draft = draft(2);
        generic_draft.notes = None;
        let generic = TransferService::create_received(&database, &ctx, generic_draft)
            .await
            .unwrap();
        assert_eq!(generic.status, "RECEIVED");
        assert_eq!(branch_qty(&database, SEED_BRANCH_ID, &lot.id).await, 4.0);
        assert_eq!(branch_qty(&database, &repair.id, &lot.id).await, 6.0);
    }
}
