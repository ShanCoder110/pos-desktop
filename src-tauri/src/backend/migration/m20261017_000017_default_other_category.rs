use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Same UUID as the historical text insert (`20000000-0000-4000-8000-000000000001`),
/// stored as a 16-byte BLOB so fresh installs never create TEXT(36) ids.
const OTHER_CATEGORY_ID_BLOB: &str = "X'20000000000040008000000000000001'";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(&format!(
                "INSERT OR IGNORE INTO product_categories (id, name, description, is_active, version, created_at, updated_at) VALUES ({OTHER_CATEGORY_ID_BLOB}, 'Other', 'Products without a selected category', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
            ))
            .await?;
        // Older installations received a larger seed list. Hide only unused legacy seeds;
        // units already referenced by products remain available so historical data stays valid.
        manager
            .get_connection()
            .execute_unprepared(
                "UPDATE units SET is_active = 0, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id IN (X'10000000000040008000000000000006', X'10000000000040008000000000000007', X'1000000000004000800000000000000A', X'1000000000004000800000000000000B', X'1000000000004000800000000000000C', X'1000000000004000800000000000000D', X'1000000000004000800000000000000E', X'1000000000004000800000000000000F', X'10000000000040008000000000000010') AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM products WHERE products.base_unit_id = units.id) AND NOT EXISTS (SELECT 1 FROM product_units WHERE product_units.unit_id = units.id)",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(&format!(
                "DELETE FROM product_categories WHERE id = {OTHER_CATEGORY_ID_BLOB} AND NOT EXISTS (SELECT 1 FROM products WHERE category_id = {OTHER_CATEGORY_ID_BLOB})"
            ))
            .await?;
        Ok(())
    }
}
