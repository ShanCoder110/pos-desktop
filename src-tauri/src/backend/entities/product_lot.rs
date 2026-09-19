use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "product_lots")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub product_id: Uuid,
    pub supplier_id: Option<Uuid>,
    pub goods_receipt_item_id: Option<Uuid>,
    pub production_job_id: Option<Uuid>,
    pub lot_number: String,
    pub source_type: String,
    pub original_base_quantity: Decimal,
    pub remaining_base_quantity: Decimal,
    pub damaged_base_quantity: Decimal,
    pub purchase_price_per_base: Decimal,
    pub received_date: Date,
    pub expiry_date: Option<Date>,
    pub created_by: Uuid,
    pub version: i32,
    pub deleted_at: Option<DateTimeUtc>,
    pub origin_device_id: Option<Uuid>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
