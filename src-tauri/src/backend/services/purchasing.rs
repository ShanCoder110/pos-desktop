use sea_orm::{DatabaseConnection, TransactionTrait};
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::{
        DEFAULT_PO_PREFIX, DEFAULT_RECEIPT_PREFIX, ERROR_PO_NOT_FOUND,
        SEQUENCE_KIND_PURCHASE_ORDER, SEQUENCE_KIND_RECEIPT,
    },
    context::RequestContext,
    dto::{
        CreatePurchaseOrderRequest, Paginated, PaginationMeta, PurchaseOrderListQuery,
        PurchaseOrderResponse, ReceivePurchaseOrderRequest, SupplierLedgerEntryResponse,
        SupplierLedgerListQuery, SupplierPaymentRequest, SupplierPaymentResponse, UnlinkLotRequest,
    },
    errors::AppError,
    repositories::{PurchasingRepository, SequenceRepository},
    util::{money_value, quantity},
};

pub struct PurchasingService;

impl PurchasingService {
    pub async fn list(
        database: &DatabaseConnection,
        mut query: PurchaseOrderListQuery,
    ) -> Result<Paginated<PurchaseOrderResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = PurchasingRepository::list(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn get(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<PurchaseOrderResponse, AppError> {
        PurchasingRepository::find(database, id)
            .await?
            .ok_or(AppError::NotFound(ERROR_PO_NOT_FOUND))
    }

    pub async fn create(
        database: &DatabaseConnection,
        context: &RequestContext,
        mut request: CreatePurchaseOrderRequest,
    ) -> Result<PurchaseOrderResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
            item.unit_cost = money_value(item.unit_cost);
        }
        request.discount = money_value(request.discount);
        request.tax = money_value(request.tax);
        request.validate()?;
        let transaction = database.begin().await?;
        let order_number = SequenceRepository::next(
            &transaction,
            SEQUENCE_KIND_PURCHASE_ORDER,
            DEFAULT_PO_PREFIX,
        )
        .await?;
        let id = PurchasingRepository::create_draft(&transaction, context, &request, order_number)
            .await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn order(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<PurchaseOrderResponse, AppError> {
        let transaction = database.begin().await?;
        PurchasingRepository::mark_ordered(&transaction, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn receive(
        database: &DatabaseConnection,
        context: &RequestContext,
        id: Uuid,
        mut request: ReceivePurchaseOrderRequest,
    ) -> Result<PurchaseOrderResponse, AppError> {
        for item in &mut request.items {
            item.quantity = quantity(item.quantity);
        }
        request.validate()?;
        let transaction = database.begin().await?;
        let receipt_number =
            SequenceRepository::next(&transaction, SEQUENCE_KIND_RECEIPT, DEFAULT_RECEIPT_PREFIX)
                .await?;
        PurchasingRepository::receive(&transaction, context, id, &request, receipt_number).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn cancel(
        database: &DatabaseConnection,
        id: Uuid,
    ) -> Result<PurchaseOrderResponse, AppError> {
        let transaction = database.begin().await?;
        PurchasingRepository::cancel(&transaction, id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn unlink_lot(
        database: &DatabaseConnection,
        id: Uuid,
        request: UnlinkLotRequest,
    ) -> Result<PurchaseOrderResponse, AppError> {
        request.validate()?;
        let transaction = database.begin().await?;
        PurchasingRepository::unlink_lot(&transaction, id, &request.lot_id).await?;
        transaction.commit().await?;
        Self::get(database, id).await
    }

    pub async fn list_supplier_ledgers(
        database: &DatabaseConnection,
        mut query: SupplierLedgerListQuery,
    ) -> Result<Paginated<SupplierLedgerEntryResponse>, AppError> {
        query.page = query.page.normalized();
        let (data, total) = PurchasingRepository::list_supplier_ledgers(database, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page.page, query.page.per_page),
        })
    }

    pub async fn supplier_ledger(
        database: &DatabaseConnection,
        supplier_id: Uuid,
    ) -> Result<Vec<SupplierLedgerEntryResponse>, AppError> {
        PurchasingRepository::supplier_ledger(database, supplier_id).await
    }

    pub async fn supplier_payment(
        database: &DatabaseConnection,
        context: &RequestContext,
        supplier_id: Uuid,
        mut request: SupplierPaymentRequest,
    ) -> Result<SupplierPaymentResponse, AppError> {
        request.amount = money_value(request.amount);
        request.validate()?;
        let transaction = database.begin().await?;
        let response =
            PurchasingRepository::supplier_payment(&transaction, context, supplier_id, &request)
                .await?;
        transaction.commit().await?;
        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;
    use uuid::Uuid;

    use crate::backend::{
        constants::{SEED_BRANCH_ID, SEED_DEVICE_ID, SEED_USER_ID},
        context::RequestContext,
        db::connect_memory,
        dto::{
            CashSessionOpenRequest, CreateProductRequest, MasterRequest, ProductUnitInput,
            ReceiveLotRequest, SupplierPaymentRequest,
        },
        repositories::{LedgerParty, LedgerRepository, MasterKind, OrgRepository},
        services::{AuthService, LotService, MasterService, ProductService, PurchasingService},
    };

    async fn seed_owner(database: &sea_orm::DatabaseConnection) {
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

    /// QA-02 part 2 §6: by-id supplier ledger must include PURCHASE debits with running balance.
    /// purchase 1000 → pay 400 → purchase 250 ⇒ payable tip 850.
    #[tokio::test]
    async fn supplier_ledger_includes_purchases_running_payable() {
        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();

        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "SuppQA".into(),
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
        let supplier = MasterService::create(
            &database,
            MasterKind::Supplier,
            MasterRequest {
                name: "Payable Supplier".into(),
                symbol: None,
                phone: Some("03005554433".into()),
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
                name: "Supp Widget".into(),
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
                    price: Decimal::new(15, 0),
                    barcode: None,
                    factor_direction: None,
                    is_base: true,
                    is_default: true,
                }],
                opening_stock: None,
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");

        // Purchase 100 × 10 = 1000
        LotService::receive(
            &database,
            &context,
            ReceiveLotRequest {
                product_id: product.id.clone(),
                branch_id: Some(SEED_BRANCH_ID.into()),
                branch_allocations: vec![],
                supplier_id: Some(supplier.id.clone()),
                quantity: Decimal::new(100, 0),
                cost: Decimal::new(10, 0),
                received_date: "2026-10-17".into(),
                expiry_date: None,
                source_type: "PURCHASE".into(),
                min: None,
                wholesale: None,
                retail: None,
                damaged_quantity: Decimal::ZERO,
                paid_now: Decimal::ZERO,
                purchase_order_id: None,
            },
        )
        .await
        .expect("purchase 1000");

        let session = AuthService::open_cash_session(
            &database,
            &context,
            CashSessionOpenRequest {
                opening_float: Decimal::new(5000, 0),
            },
        )
        .await
        .expect("open cash session");
        let mut context = context;
        context.cash_session_id = Some(Uuid::parse_str(&session.id).unwrap());

        let sid = Uuid::parse_str(&supplier.id).unwrap();
        // Payment 400 → payable 600
        let pay = PurchasingService::supplier_payment(
            &database,
            &context,
            sid,
            SupplierPaymentRequest {
                amount: Decimal::new(400, 0),
                payment_method: "CASH".into(),
                reference_number: None,
                notes: Some("partial pay".into()),
                client_request_id: None,
            },
        )
        .await
        .expect("payment 400");
        assert_eq!(pay.balance_after, 600.0);

        // Purchase 25 × 10 = 250 → payable 850
        LotService::receive(
            &database,
            &context,
            ReceiveLotRequest {
                product_id: product.id.clone(),
                branch_id: Some(SEED_BRANCH_ID.into()),
                branch_allocations: vec![],
                supplier_id: Some(supplier.id.clone()),
                quantity: Decimal::new(25, 0),
                cost: Decimal::new(10, 0),
                received_date: "2026-10-17".into(),
                expiry_date: None,
                source_type: "PURCHASE".into(),
                min: None,
                wholesale: None,
                retail: None,
                damaged_quantity: Decimal::ZERO,
                paid_now: Decimal::ZERO,
                purchase_order_id: None,
            },
        )
        .await
        .expect("purchase 250");

        let ledger = PurchasingService::supplier_ledger(&database, sid)
            .await
            .expect("by-id ledger");
        let types: Vec<&str> = ledger.iter().map(|e| e.entry_type.as_str()).collect();
        assert!(
            types.contains(&"PURCHASE"),
            "by-id ledger must include PURCHASE, got {types:?}"
        );
        assert_eq!(types, vec!["PURCHASE", "PAYMENT_MADE", "PURCHASE"]);
        assert_eq!(ledger[0].debit, 1000.0);
        assert_eq!(ledger[0].balance_after, 1000.0);
        assert_eq!(ledger[1].credit, 400.0);
        assert_eq!(ledger[1].balance_after, 600.0);
        assert_eq!(ledger[2].debit, 250.0);
        assert_eq!(ledger[2].balance_after, 850.0);
        assert_eq!(
            LedgerRepository::current_balance(&database, LedgerParty::Supplier(sid))
                .await
                .unwrap(),
            Decimal::new(850, 0)
        );

        // Break tip, recompute repairs supplier rows too.
        use sea_orm::{ConnectionTrait, DbBackend, Statement};
        database
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE supplier_ledger_entries SET balance_after = 999 WHERE supplier_id = ?",
                [sid.into()],
            ))
            .await
            .expect("break");
        LedgerRepository::recompute_balances(&database)
            .await
            .expect("recompute");
        let repaired = PurchasingService::supplier_ledger(&database, sid)
            .await
            .expect("repaired ledger");
        assert_eq!(
            repaired.iter().map(|e| e.balance_after).collect::<Vec<_>>(),
            vec![1000.0, 600.0, 850.0]
        );
    }

    /// 3 Pack @ 10 pcs and Rs 80/pack → ordered_base 30; cost/base = 8 on receive math.
    #[tokio::test]
    async fn create_po_pack_unit_converts_qty_to_base() {
        use crate::backend::dto::{CreatePurchaseOrderRequest, PurchaseOrderItemInput};

        let database = connect_memory().await.expect("memory db");
        seed_owner(&database).await;
        let context = ctx();
        let category = MasterService::create(
            &database,
            MasterKind::Category,
            MasterRequest {
                name: "PoPackCat".into(),
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
        let supplier = MasterService::create(
            &database,
            MasterKind::Supplier,
            MasterRequest {
                name: "Pack Supplier".into(),
                symbol: None,
                phone: Some("03009998877".into()),
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
        let units = MasterService::list(&database, MasterKind::Unit, Default::default())
            .await
            .expect("units")
            .data;
        let pc = units
            .iter()
            .find(|u| u.symbol.as_deref() == Some("pc"))
            .expect("pc");
        let pk = units
            .iter()
            .find(|u| u.symbol.as_deref() == Some("pk"))
            .expect("pk");
        let product = ProductService::create(
            &database,
            &context,
            CreateProductRequest {
                urdu_name: None,
                name: "Pack Widget".into(),
                category_id: category.id,
                base_unit_id: pc.id.clone(),
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
                        unit_id: pc.id.clone(),
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
                    },
                    ProductUnitInput {
                        id: None,
                        unit_id: pk.id.clone(),
                        name: "Pack".into(),
                        contains: Decimal::new(10, 0),
                        cost: Decimal::new(80, 0),
                        min: Decimal::new(80, 0),
                        wholesale: Decimal::new(90, 0),
                        price: Decimal::new(100, 0),
                        barcode: None,
                        factor_direction: Some("multiply".into()),
                        is_base: false,
                        is_default: false,
                    },
                ],
                opening_stock: None,
                opening_stocks: vec![],
            },
        )
        .await
        .expect("product");
        let pack_unit = product
            .sell_units
            .iter()
            .find(|u| u.name == "Pack")
            .expect("pack sell unit");

        let po = PurchasingService::create(
            &database,
            &context,
            CreatePurchaseOrderRequest {
                supplier_id: supplier.id,
                order_date: None,
                expected_date: None,
                notes: None,
                items: vec![PurchaseOrderItemInput {
                    product_id: product.id,
                    unit_id: pack_unit.id.clone(),
                    quantity: Decimal::new(3, 0),
                    unit_cost: Decimal::new(80, 0),
                    notes: None,
                }],
                discount: Decimal::ZERO,
                tax: Decimal::ZERO,
            },
        )
        .await
        .expect("create PO");

        let item = po.items.first().expect("line");
        assert_eq!(item.ordered_quantity, 3.0);
        assert_eq!(item.ordered_base_quantity, 30.0);
        assert_eq!(item.expected_unit_cost, 80.0);
        // Cost per base implied by pack: 80 / 10 = 8
        assert!((item.expected_unit_cost / 10.0 - 8.0).abs() < 0.0001);
        assert_eq!(item.line_total, 240.0);
    }
}
