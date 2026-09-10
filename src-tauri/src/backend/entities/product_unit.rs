use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "product_units")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub product_id: Uuid,
    pub unit_id: Uuid,
    pub display_name: String,
    pub conversion_to_base: Decimal,
    pub cost_reference: Option<Decimal>,
    pub minimum_price: Decimal,
    pub wholesale_price: Decimal,
    pub retail_price: Decimal,
    pub barcode: Option<String>,
    pub is_base: bool,
    pub is_default_sale_unit: bool,
    pub sort_order: i32,
    pub is_active: bool,
    pub version: i32,
    pub deleted_at: Option<DateTimeUtc>,
    pub origin_device_id: Option<Uuid>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
