use sea_orm::DatabaseConnection;
use uuid::Uuid;

use crate::backend::{
    constants::PERMISSION_TRASH_PERMANENT_DELETE,
    context::RequestContext,
    dto::TrashItemResponse,
    errors::AppError,
    repositories::{AuthRepository, TrashRepository},
};

pub struct TrashService;

impl TrashService {
    pub async fn list(
        database: &DatabaseConnection,
        entity: &str,
    ) -> Result<Vec<TrashItemResponse>, AppError> {
        let rows = TrashRepository::list(database, entity).await?;
        Ok(rows
            .into_iter()
            .map(|(id, name, deleted_at, deleted_by)| TrashItemResponse {
                id: id.to_string(),
                name,
                deleted_at,
                deleted_by: deleted_by.map(|value| value.to_string()),
            })
            .collect())
    }

    pub async fn restore(
        database: &DatabaseConnection,
        entity: &str,
        id: Uuid,
    ) -> Result<(), AppError> {
        if TrashRepository::restore(database, entity, id).await? {
            Ok(())
        } else {
            Err(AppError::NotFound("Record not in trash.".into()))
        }
    }

    pub async fn purge(
        database: &DatabaseConnection,
        ctx: &RequestContext,
        entity: &str,
        id: Uuid,
    ) -> Result<(), AppError> {
        let permissions = AuthRepository::list_permissions(database, ctx.user_id).await?;
        let allowed = permissions
            .iter()
            .any(|row| row.permission_key == PERMISSION_TRASH_PERMANENT_DELETE && row.is_allowed);
        if !allowed && ctx.role != "OWNER" {
            return Err(AppError::Forbidden(
                crate::backend::constants::ERROR_TRASH_PURGE_DENIED,
            ));
        }
        if TrashRepository::purge(database, entity, id).await? {
            Ok(())
        } else {
            Err(AppError::NotFound("Record not in trash.".into()))
        }
    }
}
