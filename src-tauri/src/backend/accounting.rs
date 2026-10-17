//! Shared accounting formulas for POS profit, hold/realized, expenses, and shrinkage.
//!
//! These are the source of truth for Step 27 (QA form01 accounting audit).
//! Frontend `creditProfitUtils` and SQL `profit_on_hold` must stay equivalent.

use rust_decimal::Decimal;

fn money(v: Decimal) -> Decimal {
    // Match backend money_value rounding to 2 dp for assertions in tests.
    v.round_dp(2)
}

/// Line gross profit after line discount and a proportional share of bill discount.
///
/// `revenue_after_line = unit_price * qty - line_discount`
/// `bill_share = bill_discount * revenue_after_line / subtotal` (0 when subtotal is 0)
/// `gross = revenue_after_line - bill_share - fifo_cost`
pub fn line_gross_profit(
    unit_price: Decimal,
    qty: Decimal,
    line_discount: Decimal,
    fifo_cost: Decimal,
    bill_discount: Decimal,
    subtotal: Decimal,
) -> Decimal {
    let revenue = unit_price * qty - line_discount;
    let bill_share = if subtotal > Decimal::ZERO && bill_discount > Decimal::ZERO {
        bill_discount * revenue / subtotal
    } else {
        Decimal::ZERO
    };
    money(revenue - bill_share - fifo_cost)
}

/// Profit still on open credit: gross × credit / total (capped).
pub fn profit_on_hold(gross: Decimal, credit: Decimal, total: Decimal) -> Decimal {
    if gross <= Decimal::ZERO || credit <= Decimal::ZERO || total <= Decimal::ZERO {
        return Decimal::ZERO;
    }
    let ratio = (credit / total).min(Decimal::ONE).max(Decimal::ZERO);
    money(gross * ratio)
}

/// Realized (cash) profit: gross × paid / total (capped, cash only).
pub fn profit_realized(gross: Decimal, paid: Decimal, total: Decimal) -> Decimal {
    if gross <= Decimal::ZERO || paid <= Decimal::ZERO || total <= Decimal::ZERO {
        return Decimal::ZERO;
    }
    let ratio = (paid / total).min(Decimal::ONE);
    money(gross * ratio)
}

/// After a proportional return of `returned_share` of original value (0..=1),
/// remaining gross attributable to books.
pub fn remaining_gross_after_return(gross: Decimal, returned_share: Decimal) -> Decimal {
    let keep = (Decimal::ONE - returned_share)
        .min(Decimal::ONE)
        .max(Decimal::ZERO);
    money(gross * keep)
}

/// Net profit = realized (cash) gross − expenses. Expenses never change gross.
pub fn net_profit_after_expenses(realized_gross: Decimal, expenses: Decimal) -> Decimal {
    money(realized_gross - expenses)
}

/// Stock-count shrinkage cost (loss line). Not COGS of sales.
pub fn shrinkage_loss(shrunk_base_qty: Decimal, cost_per_base: Decimal) -> Decimal {
    money(shrunk_base_qty * cost_per_base)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(v: i64) -> Decimal {
        Decimal::new(v, 0)
    }

    #[test]
    fn f1_line_gross_with_line_and_bill_discount() {
        // A: 10 @ 20 = 200, fifo 80; B: 5 @ 30 = 150, fifo 50; bill disc 35 on subtotal 350
        let subtotal = d(350);
        let bill = d(35);
        let gp_a = line_gross_profit(d(20), d(10), d(0), d(80), bill, subtotal);
        let gp_b = line_gross_profit(d(30), d(5), d(0), d(50), bill, subtotal);
        assert_eq!(gp_a, d(100)); // 200 - 20 - 80
        assert_eq!(gp_b, d(85)); // 150 - 15 - 50
        assert_eq!(gp_a + gp_b, d(185)); // (350-35) - 130
    }

    #[test]
    fn f1_line_discount_before_bill_share() {
        // 10 @ 20 = 200 − line disc 20 = 180; fifo 80; no bill disc → GP 100
        let gp = line_gross_profit(d(20), d(10), d(20), d(80), d(0), d(180));
        assert_eq!(gp, d(100));
    }

    #[test]
    fn f2_profit_hold_equals_gross_times_credit_over_total() {
        // Sale 200, GP 100, full credit → hold 100
        assert_eq!(profit_on_hold(d(100), d(200), d(200)), d(100));
        // Pay 50 of 200 → credit 150 → hold 75
        assert_eq!(profit_on_hold(d(100), d(150), d(200)), d(75));
        // Paid in full → hold 0
        assert_eq!(profit_on_hold(d(100), d(0), d(200)), d(0));
    }

    #[test]
    fn f3_realized_cash_only_capped() {
        assert_eq!(profit_realized(d(100), d(50), d(200)), d(25));
        assert_eq!(profit_realized(d(100), d(200), d(200)), d(100));
        // Overpay still capped at gross
        assert_eq!(profit_realized(d(100), d(250), d(200)), d(100));
        // No cash → 0 (never treat unpaid credit as realized)
        assert_eq!(profit_realized(d(100), d(0), d(200)), d(0));
    }

    #[test]
    fn f4_return_reverses_proportionally() {
        // Half returned → remaining gross 50 of 100
        assert_eq!(
            remaining_gross_after_return(d(100), Decimal::new(5, 1)),
            d(50)
        );
        // Full return → 0
        assert_eq!(remaining_gross_after_return(d(100), d(1)), d(0));
    }

    #[test]
    fn f5_void_zeros_hold_and_realized() {
        // CANCELLED invoices contribute 0 — modeled as gross forced to 0
        assert_eq!(profit_on_hold(d(0), d(200), d(200)), d(0));
        assert_eq!(profit_realized(d(0), d(50), d(200)), d(0));
    }

    #[test]
    fn f6_expenses_reduce_net_not_gross() {
        let gross = d(100);
        let expenses = d(30);
        assert_eq!(net_profit_after_expenses(gross, expenses), d(70));
        // Gross unchanged by expenses (caller keeps gross separate)
        assert_eq!(gross, d(100));
    }

    #[test]
    fn f7_shrinkage_is_loss_not_cogs() {
        // 5 base @ cost 8 → loss 40 (same numbers as QA-06 lot shrink)
        assert_eq!(shrinkage_loss(d(5), d(8)), d(40));
    }

    #[test]
    fn hold_plus_realized_equals_remaining_gross() {
        let gross = d(100);
        let total = d(200);
        let paid = d(50);
        let credit = d(150);
        let hold = profit_on_hold(gross, credit, total);
        let realized = profit_realized(gross, paid, total);
        assert_eq!(hold + realized, d(100));
    }

    /// FORM-01 Step 27 fixture scenario (hand numbers locked in accounting-audit.md).
    ///
    /// Cust A — credit 10 @ 20, FIFO 10 → rev 200, GP 100; full credit → hold 100.
    /// Cust B — cash 5 @ 20, FIFO 10 → rev 100, GP 50; paid in full → realized 50.
    /// Split  — 10 @ 20, FIFO 10 → rev 200, GP 100; pay 80 → hold 60 / realized 40.
    /// Partial payment on A: pay 50 of 200 → hold 75 / realized 25.
    /// Return half of B → remaining GP 25 (share 0.5).
    /// Void of split → hold 0 / realized 0.
    /// Expense 30 → net = realized_cash − 30 (gross unchanged).
    /// Shrinkage 5 @ 8 → loss 40 (not COGS of sales).
    #[test]
    fn fixture_scenario_expected_totals() {
        let gp_a = line_gross_profit(d(20), d(10), d(0), d(100), d(0), d(200));
        let gp_b = line_gross_profit(d(20), d(5), d(0), d(50), d(0), d(100));
        let gp_split = line_gross_profit(d(20), d(10), d(0), d(100), d(0), d(200));
        assert_eq!(gp_a, d(100));
        assert_eq!(gp_b, d(50));
        assert_eq!(gp_split, d(100));

        // After A partial pay 50:
        assert_eq!(profit_on_hold(gp_a, d(150), d(200)), d(75));
        assert_eq!(profit_realized(gp_a, d(50), d(200)), d(25));

        // B cash full, then half return:
        assert_eq!(profit_realized(gp_b, d(100), d(100)), d(50));
        let gp_b_after_return = remaining_gross_after_return(gp_b, Decimal::new(5, 1));
        assert_eq!(gp_b_after_return, d(25));

        // Split pay 80 of 200:
        assert_eq!(profit_on_hold(gp_split, d(120), d(200)), d(60));
        assert_eq!(profit_realized(gp_split, d(80), d(200)), d(40));

        // Void zeros:
        assert_eq!(profit_on_hold(d(0), d(120), d(200)), d(0));
        assert_eq!(profit_realized(d(0), d(80), d(200)), d(0));

        // Dashboard-ish after A partial + B cash (pre-return) + expense 30, void split:
        // realized cash = 25 (A) + 50 (B) = 75; net = 75 − 30 = 45
        let realized = d(25) + d(50);
        assert_eq!(net_profit_after_expenses(realized, d(30)), d(45));
        assert_eq!(shrinkage_loss(d(5), d(8)), d(40));
    }
}
