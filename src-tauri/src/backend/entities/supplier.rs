use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "suppliers")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub name: String,
    pub phone: String,
    pub email: String,
    pub address: String,
    pub tax_number: Option<String>,
    pub payment_terms_days: Option<i32>,
    pub credit_limit: Option<Decimal>,
    pub notes: String,
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
