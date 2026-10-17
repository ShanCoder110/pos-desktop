use rust_decimal::Decimal;

use crate::backend::util::quantity;

pub const FACTOR_MULTIPLY: &str = "multiply";
pub const FACTOR_DIVIDE: &str = "divide";

/// `factor` is the number stored on the unit. `divide` means that many of this unit fit in 1 stock unit.
pub fn to_base_qty(displayed: Decimal, factor: Decimal, direction: &str) -> Decimal {
    let factor = if factor.is_zero() {
        Decimal::ONE
    } else {
        factor
    };
    let raw = if direction == FACTOR_DIVIDE {
        displayed / factor
    } else {
        displayed * factor
    };
    quantity(raw)
}

pub fn format_qty(value: Decimal) -> String {
    let mut text = quantity(value).normalize().to_string();
    if text.contains('.') {
        while text.ends_with('0') {
            text.pop();
        }
        if text.ends_with('.') {
            text.pop();
        }
    }
    if text.is_empty() {
        "0".to_owned()
    } else {
        text
    }
}

pub struct RequestedLine<'a> {
    pub displayed: Decimal,
    pub unit_name: &'a str,
    pub base_qty: Decimal,
}

const STOCK_EPSILON: Decimal = Decimal::from_parts(1, 0, 0, false, 6);

pub fn stock_conflict(
    product_name: &str,
    base_unit: &str,
    other_unit: Option<(&str, Decimal, &str)>,
    available_base: Decimal,
    lines: &[RequestedLine<'_>],
) -> Option<String> {
    let requested: Decimal = lines.iter().map(|line| line.base_qty).sum();
    if requested <= available_base + STOCK_EPSILON {
        return None;
    }
    let requested_parts = lines
        .iter()
        .map(|line| format!("{} {}", format_qty(line.displayed), line.unit_name))
        .collect::<Vec<_>>()
        .join(" + ");
    let available_other = other_label(other_unit, available_base);
    let requested_other = other_label(other_unit, requested);
    Some(format!(
        "Insufficient stock for {product_name}: requested {requested_parts} ({requested_base} {base_unit}{requested_other}), available {available_base_text} {base_unit}{available_other}",
        requested_base = format_qty(requested),
        available_base_text = format_qty(available_base),
    ))
}

fn other_label(other_unit: Option<(&str, Decimal, &str)>, base_qty: Decimal) -> String {
    let Some((name, factor, direction)) = other_unit else {
        return String::new();
    };
    if name.is_empty() || factor.is_zero() {
        return String::new();
    }
    let displayed = if direction == FACTOR_DIVIDE {
        base_qty * factor
    } else {
        base_qty / factor
    };
    format!(" / {} {name}", format_qty(displayed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dec(text: &str) -> Decimal {
        text.parse().unwrap()
    }

    #[test]
    fn gaz_converts_by_dividing() {
        let gaz = dec("90");
        assert_eq!(to_base_qty(dec("1"), gaz, FACTOR_DIVIDE), dec("0.011111"));
        assert_eq!(to_base_qty(dec("90"), gaz, FACTOR_DIVIDE), dec("1"));
        assert_eq!(to_base_qty(dec("450"), gaz, FACTOR_DIVIDE), dec("5"));
        assert_eq!(to_base_qty(dec("451"), gaz, FACTOR_DIVIDE), dec("5.011111"));
        assert_eq!(
            to_base_qty(dec("1"), Decimal::ONE, FACTOR_MULTIPLY)
                + to_base_qty(dec("45"), gaz, FACTOR_DIVIDE),
            dec("1.5")
        );
    }

    #[test]
    fn bigger_unit_multiplies() {
        assert_eq!(to_base_qty(dec("2"), dec("12"), FACTOR_MULTIPLY), dec("24"));
    }

    #[test]
    fn rejects_451_gaz_against_5_roll_and_accepts_450() {
        let gaz = Some(("Gaz", dec("90"), FACTOR_DIVIDE));
        let ok = stock_conflict(
            "QA Test Roll",
            "Roll",
            gaz,
            dec("5"),
            &[RequestedLine {
                displayed: dec("450"),
                unit_name: "Gaz",
                base_qty: dec("5"),
            }],
        );
        assert!(ok.is_none());
        let message = stock_conflict(
            "QA Test Roll",
            "Roll",
            gaz,
            dec("5"),
            &[RequestedLine {
                displayed: dec("451"),
                unit_name: "Gaz",
                base_qty: dec("5.011111"),
            }],
        )
        .unwrap();
        assert!(message.contains("QA Test Roll"));
        assert!(message.contains("451 Gaz"));
        assert!(message.contains("5.011111 Roll"));
        assert!(
            message.contains("450.99999 Gaz")
                || message.contains("451 Gaz")
                || message.contains("Gaz")
        );
        assert!(message.contains("5 Roll"));
    }
}
