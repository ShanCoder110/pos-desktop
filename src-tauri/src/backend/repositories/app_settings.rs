use crate::backend::{context::RequestContext, errors::AppError};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use serde_json::Value;

pub struct AppSettingsRepository;
impl AppSettingsRepository {
    pub async fn get(
        db: &DatabaseConnection,
        ctx: &RequestContext,
    ) -> Result<Option<Value>, AppError> {
        let row = db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT settings_json FROM app_settings WHERE branch_id = ? AND device_id = ?",
                [ctx.branch_id.into(), ctx.device_id.into()],
            ))
            .await?;
        match row {
            Some(row) => {
                let json: String = row.try_get("", "settings_json")?;
                Ok(Some(
                    serde_json::from_str(&json).map_err(AppError::internal)?,
                ))
            }
            None => Ok(None),
        }
    }
    pub async fn put(
        db: &DatabaseConnection,
        ctx: &RequestContext,
        settings: Value,
    ) -> Result<Value, AppError> {
        let object = settings
            .as_object()
            .ok_or_else(|| AppError::Validation("Settings must be an object".into()))?;
        if object
            .values()
            .any(|value| value.is_object() || value.is_array())
        {
            return Err(AppError::Validation(
                "Settings values must be text, numbers, or switches".into(),
            ));
        }
        let json = serde_json::to_string(&settings).map_err(AppError::internal)?;
        if json.len() > 1_500_000 {
            return Err(AppError::Validation(
                "Settings are too large. Use a smaller logo.".into(),
            ));
        }
        db.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "INSERT INTO app_settings (branch_id, device_id, settings_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(branch_id, device_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at",
            [ctx.branch_id.into(), ctx.device_id.into(), json.into(), chrono::Utc::now().to_rfc3339().into()])).await?;
        Ok(settings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{
        constants::{SEED_BRANCH_ID, SEED_DEVICE_ID},
        db::connect_memory,
    };
    use uuid::Uuid;

    #[tokio::test]
    async fn app_settings_roundtrip_update_validation_and_scope() {
        let db = connect_memory().await.unwrap();
        let ctx = RequestContext {
            session_id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            branch_id: Uuid::parse_str(SEED_BRANCH_ID).unwrap(),
            device_id: Uuid::parse_str(SEED_DEVICE_ID).unwrap(),
            cash_session_id: None,
            role: "OWNER".into(),
            name: "Test".into(),
            username: "test".into(),
        };
        assert!(AppSettingsRepository::get(&db, &ctx)
            .await
            .unwrap()
            .is_none());
        let settings = serde_json::json!({
            "receiptFooterBold": true, "receiptTopMarginMm": 0,
            "receiptBottomMarginMm": 0, "receiptFontFamily": "arial",
            "receiptLogoDataUrl": "data:image/png;base64,test", "clearInvoiceAfterPrint": false,
            "receiptTotalsPt": 18, "futureSetting": "preserved"
        });
        AppSettingsRepository::put(&db, &ctx, settings.clone())
            .await
            .unwrap();
        assert_eq!(
            AppSettingsRepository::get(&db, &ctx).await.unwrap(),
            Some(settings.clone())
        );
        let mut other = ctx.clone();
        other.device_id = Uuid::new_v4();
        assert!(AppSettingsRepository::get(&db, &other)
            .await
            .unwrap()
            .is_none());
        other = ctx.clone();
        other.branch_id = Uuid::new_v4();
        assert!(AppSettingsRepository::get(&db, &other)
            .await
            .unwrap()
            .is_none());
        assert!(
            AppSettingsRepository::put(&db, &ctx, serde_json::json!([1, 2]))
                .await
                .is_err()
        );
        assert!(
            AppSettingsRepository::put(&db, &ctx, serde_json::json!({"click": {"target":1}}))
                .await
                .is_err()
        );
        assert_eq!(
            AppSettingsRepository::get(&db, &ctx).await.unwrap(),
            Some(settings.clone())
        );
        let mut updated = settings.clone();
        updated["receiptFooterBold"] = serde_json::json!(false);
        AppSettingsRepository::put(&db, &ctx, updated.clone())
            .await
            .unwrap();
        assert_eq!(
            AppSettingsRepository::get(&db, &ctx).await.unwrap(),
            Some(updated)
        );
    }
}
