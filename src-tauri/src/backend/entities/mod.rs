#[allow(dead_code)]
pub mod customer;
pub mod product;
#[allow(dead_code)]
pub mod product_category;
pub mod product_lot;
pub mod product_unit;
#[allow(dead_code)]
pub mod supplier;
#[allow(dead_code)]
pub mod unit;

pub use product::Entity as Product;
pub use product_unit::Entity as ProductUnit;
