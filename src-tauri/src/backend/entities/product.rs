use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "products")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub category_id: Uuid,
    pub base_unit_id: Uuid,
    pub name: String,
    pub sku: String,
    pub barcode: String,
    pub product_type: String,
    pub track_lots: bool,
    pub track_expiry: bool,
    pub minimum_stock: Decimal,
    pub warranty_duration: Option<i32>,
    pub warranty_unit: Option<String>,
    pub warranty_note: Option<String>,
    pub is_active: bool,
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
