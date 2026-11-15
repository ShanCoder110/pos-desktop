use sea_orm_migration::prelude::*;
#[derive(DeriveMigrationName)]
pub struct Migration;
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.get_connection().execute_unprepared(
            "CREATE TABLE app_settings (branch_id BLOB NOT NULL REFERENCES branches(id), device_id BLOB NOT NULL REFERENCES devices(id), settings_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(branch_id, device_id))"
        ).await?;
        Ok(())
    }
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE app_settings")
            .await?;
        Ok(())
    }
}
