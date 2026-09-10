use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct RequestContext {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub branch_id: Uuid,
    pub device_id: Uuid,
    pub cash_session_id: Option<Uuid>,
    pub role: String,
    pub name: String,
    pub username: String,
}

impl RequestContext {
    pub fn require_cash_session(&self) -> Result<Uuid, crate::backend::errors::AppError> {
        self.cash_session_id.ok_or(crate::backend::errors::AppError::Forbidden(
            crate::backend::constants::ERROR_CASH_SESSION_REQUIRED,
        ))
    }
}
