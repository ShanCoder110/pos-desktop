use sea_orm::DatabaseConnection;
use uuid::Uuid;
use validator::Validate;

use crate::backend::{
    constants::ERROR_UNIT_SYMBOL_REQUIRED,
    context::RequestContext,
    dto::{MasterRequest, MasterResponse, PageQuery, Paginated, PaginationMeta},
    errors::AppError,
    repositories::{MasterKind, MasterRepository},
    util::optional_pk_mobile,
};

pub struct MasterService;

impl MasterService {
    pub async fn list(
        database: &DatabaseConnection,
        kind: MasterKind,
        query: PageQuery,
    ) -> Result<Paginated<MasterResponse>, AppError> {
        let query = query.normalized();
        let (data, total) = MasterRepository::list(database, kind, &query).await?;
        Ok(Paginated {
            data,
            meta: PaginationMeta::new(total, query.page, query.per_page),
        })
    }

    pub async fn get(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
        not_found: &'static str,
    ) -> Result<MasterResponse, AppError> {
        MasterRepository::find(database, kind, id)
            .await?
            .ok_or(AppError::NotFound(not_found))
    }

    pub async fn create(
        database: &DatabaseConnection,
        kind: MasterKind,
        request: MasterRequest,
        context: Option<&RequestContext>,
    ) -> Result<MasterResponse, AppError> {
        request.validate()?;
        let mut request = request;
        if matches!(kind, MasterKind::Supplier | MasterKind::Customer) {
            request.phone = optional_pk_mobile(request.phone.as_deref())?;
        }
        Self::validate_kind(kind, &request)?;
        MasterRepository::create(database, kind, &request, context).await
    }

    pub async fn update(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
        request: MasterRequest,
        not_found: &'static str,
    ) -> Result<MasterResponse, AppError> {
        request.validate()?;
        let mut request = request;
        if matches!(kind, MasterKind::Supplier | MasterKind::Customer) {
            request.phone = optional_pk_mobile(request.phone.as_deref())?;
        }
        Self::validate_kind(kind, &request)?;
        MasterRepository::update(database, kind, id, &request)
            .await?
            .ok_or(AppError::NotFound(not_found))
    }

    pub async fn delete(
        database: &DatabaseConnection,
        kind: MasterKind,
        id: Uuid,
        not_found: &'static str,
        context: Option<&RequestContext>,
    ) -> Result<(), AppError> {
        if MasterRepository::soft_delete(database, kind, id, context.map(|ctx| ctx.user_id)).await?
        {
            Ok(())
        } else {
            Err(AppError::NotFound(not_found))
        }
    }

    fn validate_kind(kind: MasterKind, request: &MasterRequest) -> Result<(), AppError> {
        if matches!(kind, MasterKind::Unit)
            && request
                .symbol
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            return Err(AppError::Validation(ERROR_UNIT_SYMBOL_REQUIRED.into()));
        }
        Ok(())
    }
}
