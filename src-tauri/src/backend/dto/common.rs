use serde::{de, Deserialize, Deserializer, Serialize};
use std::fmt;

use crate::backend::constants::{DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE};

fn deserialize_query_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    struct Visitor;

    impl<'de> de::Visitor<'de> for Visitor {
        type Value = u64;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("an unsigned integer")
        }

        fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E> {
            Ok(value)
        }

        fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            if value < 0 {
                return Err(E::custom("expected a non-negative integer"));
            }
            Ok(value as u64)
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            value
                .parse::<u64>()
                .map_err(|_| E::custom(format!("invalid unsigned integer: {value}")))
        }
    }

    deserializer.deserialize_any(Visitor)
}

fn deserialize_query_option_bool<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: Deserializer<'de>,
{
    struct Visitor;

    impl<'de> de::Visitor<'de> for Visitor {
        type Value = Option<bool>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a boolean")
        }

        fn visit_none<E>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E> {
            Ok(Some(value))
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            match value {
                "true" | "1" | "on" | "yes" => Ok(Some(true)),
                "false" | "0" | "off" | "no" => Ok(Some(false)),
                _ => Err(E::custom(format!("invalid boolean: {value}"))),
            }
        }
    }

    deserializer.deserialize_any(Visitor)
}

#[derive(Clone, Debug, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PageQuery {
    #[serde(default, deserialize_with = "deserialize_query_u64")]
    pub page: u64,
    #[serde(
        default,
        alias = "per_page",
        deserialize_with = "deserialize_query_u64"
    )]
    pub per_page: u64,
    pub search: Option<String>,
    #[serde(
        default,
        alias = "is_active",
        deserialize_with = "deserialize_query_option_bool"
    )]
    pub is_active: Option<bool>,
    #[serde(alias = "sort_by")]
    pub sort_by: Option<String>,
    #[serde(alias = "sort_direction")]
    pub sort_direction: Option<SortDirection>,
    pub name: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub balance: Option<String>,
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
            name: None,
            phone: None,
            email: None,
            address: None,
            notes: None,
            balance: None,
        }
    }
}

fn trim_query(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    })
}

impl PageQuery {
    pub fn normalized(mut self) -> Self {
        self.page = self.page.max(DEFAULT_PAGE);
        self.per_page = self.per_page.clamp(1, MAX_PAGE_SIZE);
        self.search = trim_query(self.search);
        self.name = trim_query(self.name);
        self.phone = trim_query(self.phone);
        self.email = trim_query(self.email);
        self.address = trim_query(self.address);
        self.notes = trim_query(self.notes);
        self.balance = trim_query(self.balance);
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
