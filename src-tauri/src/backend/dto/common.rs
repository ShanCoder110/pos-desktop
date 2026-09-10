use serde::{Deserialize, Serialize};

use crate::backend::constants::{DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE};

#[derive(Clone, Debug, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PageQuery {
    pub page: u64,
    #[serde(alias = "per_page")]
    pub per_page: u64,
    pub search: Option<String>,
    #[serde(alias = "is_active")]
    pub is_active: Option<bool>,
    #[serde(alias = "sort_by")]
    pub sort_by: Option<String>,
    #[serde(alias = "sort_direction")]
    pub sort_direction: Option<SortDirection>,
}

impl Default for PageQuery {
    fn default() -> Self {
        Self {
            page: DEFAULT_PAGE,
            per_page: DEFAULT_PAGE_SIZE,
            search: None,
            is_active: None,
            sort_by: None,
            sort_direction: None,
        }
    }
}

impl PageQuery {
    pub fn normalized(mut self) -> Self {
        self.page = self.page.max(DEFAULT_PAGE);
        self.per_page = self.per_page.clamp(1, MAX_PAGE_SIZE);
        self.search = self.search.and_then(|value| {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_owned())
        });
        self
    }

    pub fn offset(&self) -> u64 {
        (self.page - 1) * self.per_page
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    #[default]
    Desc,
}

impl SortDirection {
    pub const fn sql(self) -> &'static str {
        match self {
            Self::Asc => "ASC",
            Self::Desc => "DESC",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginationMeta {
    pub total_items: u64,
    pub total_pages: u64,
    pub current_page: u64,
    pub per_page: u64,
    pub has_next_page: bool,
    pub has_previous_page: bool,
}

impl PaginationMeta {
    pub fn new(total_items: u64, page: u64, per_page: u64) -> Self {
        let total_pages = total_items.div_ceil(per_page).max(1);
        Self {
            total_items,
            total_pages,
            current_page: page,
            per_page,
            has_next_page: page < total_pages,
            has_previous_page: page > 1,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Paginated<T> {
    pub data: Vec<T>,
    pub meta: PaginationMeta,
}

#[derive(Clone, Debug, Serialize)]
pub struct DeleteResponse {
    pub id: String,
    pub deleted: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_uses_twenty_default_and_hundred_cap() {
        let default = PageQuery::default().normalized();
        assert_eq!(default.page, 1);
        assert_eq!(default.per_page, 20);

        let capped = PageQuery {
            page: 0,
            per_page: 500,
            ..Default::default()
        }
        .normalized();
        assert_eq!(capped.page, 1);
        assert_eq!(capped.per_page, 100);
    }

    #[test]
    fn pagination_metadata_is_consistent() {
        let meta = PaginationMeta::new(41, 2, 20);
        assert_eq!(meta.total_pages, 3);
        assert!(meta.has_next_page);
        assert!(meta.has_previous_page);
    }
}
