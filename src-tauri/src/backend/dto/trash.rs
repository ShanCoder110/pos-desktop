use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItemResponse {
    pub id: String,
    pub name: String,
    pub deleted_at: String,
    pub deleted_by: Option<String>,
}
