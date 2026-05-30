"""Structured dealer deal-desk output from market stats and cost assumptions."""

from __future__ import annotations

from typing import Any, Literal

from mmd_engine.config import env
from mmd_engine.gunbroker_fees import (
    LISTING_ADDONS_DEFAULT,
    MASTER_FFL_FEE_DEFAULT,
    gunbroker_sell_breakdown,
)
from mmd_engine.valuation_models import (
    ContextMode,
    PriceStats,
    TrendPoint,
)

SellScenario = Literal["p25", "median", "p75"]
Confidence = Literal["high", "medium", "low"]
Verdict = Literal["GO", "MARGINAL", "NO-GO"]


def _float_env(name: str, default: float) -> float:
    raw = env(name, str(default))
    try:
        return float(raw)
    except ValueError:
        return default


def _scenario_price(stats: PriceStats, scenario: SellScenario) -> float:
    if stats.count <= 0:
        return 0.0
    if scenario == "p25":
        return stats.p25 or stats.median
    if scenario == "p75":
        return stats.p75 or stats.median
    return stats.median


def _trend_label(trends: list[TrendPoint]) -> str:
    if len(trends) < 2:
        return "unknown"
    recent = trends[-3:]
    if len(recent) < 2:
        return "unknown"
    first_avg = recent[0].avg_price
    last_avg = recent[-1].avg_price
    if first_avg <= 0:
        return "unknown"
    change_pct = (last_avg - first_avg) / first_avg * 100
    if change_pct > 3:
        return "rising"
    if change_pct < -3:
        return "falling"
    return "stable"


def _confidence(
    sold: PriceStats,
    asking: PriceStats,
    *,
    ask_vs_sold_gap: float | None,
) -> Confidence:
    n = sold.count
    if n >= 15:
        base: Confidence = "high"
    elif n >= 5:
        base = "medium"
    else:
        base = "low"

    if n < 3:
        return "low"

    spread = 0.0
    if sold.median > 0 and sold.p75 > 0 and sold.p25 > 0:
        spread = (sold.p75 - sold.p25) / sold.median
    if spread > 0.35 and base == "high":
        base = "medium"

    if ask_vs_sold_gap is not None and sold.median > 0:
        if ask_vs_sold_gap > sold.median * 0.08 and base == "high":
            base = "medium"
        if ask_vs_sold_gap > sold.median * 0.15:
            base = "low"

    return base


def max_pay_all_in(
    net_sell: float,
    *,
    target_profit: float,
    min_margin_pct: float,
) -> float:
    """Maximum all-in acquisition cost to hit profit and margin floors."""
    if net_sell <= 0:
        return 0.0
    by_profit = net_sell - target_profit
    margin_rate = max(0.0, min_margin_pct) / 100.0
    if margin_rate >= 1.0:
        by_margin = 0.0
    else:
        by_margin = net_sell / (1.0 + margin_rate)
    return max(0.0, min(by_profit, by_margin))


def hammer_from_all_in(all_in: float, premium_rate: float) -> float:
    if all_in <= 0:
        return 0.0
    if premium_rate <= -1:
        return all_in
    return all_in / (1.0 + premium_rate)


def build_dealer_brief(
    *,
    context: ContextMode,
    sold_stats: PriceStats,
    sold_stats_all: PriceStats,
    sold_label: str,
    asking_stats: PriceStats,
    trends: list[TrendPoint],
    my_cost: float | None,
    buyer_premium_pct: float,
    listing_addons: float,
    transfer_fee: float,
    inbound_ship: float,
    target_profit: float,
    min_margin_pct: float,
    sell_assumption: SellScenario | None = None,
    street_retail: float | None = None,
) -> dict[str, Any]:
    addons = max(0.0, listing_addons)
    transfer = max(0.0, transfer_fee)
    ship = max(0.0, inbound_ship)
    premium_rate = max(0.0, min(buyer_premium_pct, 100.0)) / 100.0

    primary = sold_stats if sold_stats.count > 0 else sold_stats_all
    ask_med = asking_stats.median if asking_stats.count else 0.0
    ask_vs_sold: float | None = None
    ask_vs_sold_label = ""
    if ask_med > 0 and primary.median > 0:
        ask_vs_sold = round(ask_med - primary.median, 2)
        if ask_vs_sold > 0:
            ask_vs_sold_label = f"Asking median {_fmt(ask_med)} is {_fmt(ask_vs_sold)} above sold median"
        elif ask_vs_sold < 0:
            ask_vs_sold_label = f"Asking median {_fmt(ask_med)} is {_fmt(abs(ask_vs_sold))} below sold median"
        else:
            ask_vs_sold_label = "Asking median matches sold median"

    conf = _confidence(primary, asking_stats, ask_vs_sold_gap=ask_vs_sold)
    trend = _trend_label(trends)

    if context == "auction_sniper":
        default_sell: SellScenario = "p75"
    elif context == "margin_spotter":
        default_sell = "median"
    else:
        default_sell = "median"
    sell_key = sell_assumption or default_sell
    sell_price = _scenario_price(primary, sell_key)

    gb_rows: list[dict[str, Any]] = []
    for label, key in (("P25", "p25"), ("Median", "median"), ("P75", "p75")):
        gross = _scenario_price(primary, key)  # type: ignore[arg-type]
        if gross <= 0:
            continue
        gb = gunbroker_sell_breakdown(
            gross,
            listing_addons=addons,
            master_ffl_fee=MASTER_FFL_FEE_DEFAULT,
        )
        gb_rows.append(
            {
                "scenario": label,
                "sell_gross": gb["gross_sale"],
                "final_value_fee": gb["final_value_fee"],
                "master_ffl_fee": gb["master_ffl_fee"],
                "listing_addons": gb["listing_addons"],
                "net_proceeds": gb["net_after_gunbroker"],
            }
        )

    cost = my_cost if my_cost and my_cost > 0 else None
    profit_rows: list[dict[str, Any]] = []
    if cost:
        for label, key in (("P25", "p25"), ("Median", "median"), ("P75", "p75")):
            gross = _scenario_price(primary, key)  # type: ignore[arg-type]
            if gross <= 0:
                continue
            gb = gunbroker_sell_breakdown(
                gross,
                listing_addons=addons,
                master_ffl_fee=MASTER_FFL_FEE_DEFAULT,
            )
            net = float(gb["net_after_gunbroker"])
            profit = net - cost
            profit_rows.append(
                {
                    "scenario": label,
                    "sell_gross": gross,
                    "gb_net": net,
                    "profit": round(profit, 2),
                    "margin_pct": round((profit / cost * 100) if cost > 0 else 0.0, 1),
                }
            )

    net_at_assumption = 0.0
    if sell_price > 0:
        net_at_assumption = float(
            gunbroker_sell_breakdown(
                sell_price,
                listing_addons=addons,
                master_ffl_fee=MASTER_FFL_FEE_DEFAULT,
            )["net_after_gunbroker"]
        )

    max_pay = max_pay_all_in(
        net_at_assumption,
        target_profit=target_profit,
        min_margin_pct=min_margin_pct,
    )
    max_pay_p25 = 0.0
    max_pay_p75 = 0.0
    p25_gross = _scenario_price(primary, "p25")
    p75_gross = _scenario_price(primary, "p75")
    if p25_gross > 0:
        net_p25 = float(
            gunbroker_sell_breakdown(p25_gross, listing_addons=addons)["net_after_gunbroker"]
        )
        max_pay_p25 = max_pay_all_in(
            net_p25, target_profit=target_profit, min_margin_pct=min_margin_pct
        )
    if p75_gross > 0:
        net_p75 = float(
            gunbroker_sell_breakdown(p75_gross, listing_addons=addons)["net_after_gunbroker"]
        )
        max_pay_p75 = max_pay_all_in(
            net_p75, target_profit=target_profit, min_margin_pct=min_margin_pct
        )

    break_even = max(0.0, net_at_assumption) if net_at_assumption > 0 else 0.0
    max_hammer = hammer_from_all_in(max_pay, premium_rate) if context == "auction_sniper" else None

    all_in_extra = transfer + ship
    all_in_at_max: dict[str, Any] = {
        "mode": "auction" if context == "auction_sniper" else "cash",
        "buyer_premium_pct": buyer_premium_pct,
        "transfer_fee": round(transfer, 2),
        "inbound_ship": round(ship, 2),
        "fixed_fees": round(all_in_extra, 2),
    }
    if cost:
        if context == "auction_sniper":
            hammer_est = hammer_from_all_in(max(cost - all_in_extra, 0), premium_rate)
            premium_amt = cost - all_in_extra - hammer_est if hammer_est > 0 else 0.0
            all_in_at_max.update(
                {
                    "invoice_or_hammer": round(hammer_est, 2),
                    "buyer_premium_amt": round(max(0.0, premium_amt), 2),
                    "all_in_total": round(cost, 2),
                }
            )
        else:
            all_in_at_max.update(
                {
                    "invoice_or_hammer": round(cost, 2),
                    "buyer_premium_amt": 0.0,
                    "all_in_total": round(cost + all_in_extra, 2),
                }
            )
    elif max_pay > 0:
        if context == "auction_sniper":
            hammer = hammer_from_all_in(max_pay, premium_rate)
            premium_amt = max_pay - hammer
            all_in_at_max.update(
                {
                    "invoice_or_hammer": round(hammer, 2),
                    "buyer_premium_amt": round(premium_amt, 2),
                    "all_in_total": round(max_pay + all_in_extra, 2),
                }
            )
        else:
            all_in_at_max.update(
                {
                    "invoice_or_hammer": round(max_pay, 2),
                    "buyer_premium_amt": 0.0,
                    "all_in_total": round(max_pay + all_in_extra, 2),
                }
            )

    red_flags: list[str] = []
    if primary.count < 5:
        red_flags.append(f"Thin comps ({primary.count} sold in 90d)")
    if primary.count == 0:
        red_flags.append("No sold comps in 90 days")
    if ask_vs_sold is not None and ask_vs_sold > 0 and primary.median > 0:
        if ask_vs_sold > primary.median * 0.1:
            red_flags.append("Asking well above recent sold clears")
    if conf == "low":
        red_flags.append("Low confidence — verify gun identity (UPC/MPN)")
    if sell_price > 0 and cost and cost > net_at_assumption:
        red_flags.append("Your cost exceeds GB net at assumed sell price")

    verdict, verdict_reason = _verdict(
        context=context,
        cost=cost,
        max_pay=max_pay,
        max_hammer=max_hammer,
        profit_rows=profit_rows,
        target_profit=target_profit,
        min_margin_pct=min_margin_pct,
        primary=primary,
        street_retail=street_retail,
        conf=conf,
    )

    monthly_volume = sum(t.count for t in trends[-3:]) if trends else 0

    return {
        "confidence": conf,
        "verdict": verdict,
        "verdict_reason": verdict_reason,
        "red_flags": red_flags,
        "market": {
            "sold_label": sold_label,
            "sold_count": primary.count,
            "sold_count_all": sold_stats_all.count,
            "sold_low": primary.low,
            "sold_p25": primary.p25,
            "sold_median": primary.median,
            "sold_p75": primary.p75,
            "sold_high": primary.high,
            "asking_count": asking_stats.count,
            "asking_low": asking_stats.low,
            "asking_median": ask_med,
            "ask_vs_sold_gap": ask_vs_sold,
            "ask_vs_sold_label": ask_vs_sold_label,
            "trend": trend,
            "monthly_volume_90d": monthly_volume,
        },
        "gb_net_table": gb_rows,
        "profit_at_cost": profit_rows,
        "all_in": all_in_at_max,
        "ceilings": {
            "sell_assumption": sell_key,
            "sell_price": round(sell_price, 2),
            "sell_assumption_label": sell_key.upper(),
            "break_even_all_in": round(break_even, 2),
            "max_pay_all_in": round(max_pay, 2),
            "max_hammer": round(max_hammer, 2) if max_hammer is not None else None,
            "conservative_max_pay_all_in": round(max_pay_p25, 2),
            "aggressive_max_pay_all_in": round(max_pay_p75, 2),
            "target_profit": target_profit,
            "min_margin_pct": min_margin_pct,
        },
    }


def _fmt(n: float) -> str:
    return f"${n:,.0f}"


def _verdict(
    *,
    context: ContextMode,
    cost: float | None,
    max_pay: float,
    max_hammer: float | None,
    profit_rows: list[dict[str, Any]],
    target_profit: float,
    min_margin_pct: float,
    primary: PriceStats,
    street_retail: float | None,
    conf: Confidence,
) -> tuple[Verdict, str]:
    if primary.count == 0:
        return "NO-GO", "No sold comps to price against."

    med_row = next((r for r in profit_rows if r["scenario"] == "Median"), None)

    if context == "auction_sniper":
        if max_hammer is not None and max_hammer > 0:
            if conf == "low":
                return "MARGINAL", f"Max hammer ~{_fmt(max_hammer)} but comps are thin — bid conservatively."
            return "GO", f"Max hammer ~{_fmt(max_hammer)} at assumed sell with ${_fmt(target_profit)} target profit."
        return "NO-GO", "Cannot compute max hammer without sold price band."

    if not cost:
        return "MARGINAL", "Enter your cost for a buy/sell verdict."

    if med_row:
        profit = float(med_row["profit"])
        margin = float(med_row["margin_pct"])
        if profit >= target_profit and margin >= min_margin_pct:
            if conf == "low":
                return "MARGINAL", f"GB profit {_fmt(profit)} at median but comps are thin."
            return "GO", f"GB profit {_fmt(profit)} ({margin:.0f}% margin) at median sell."
        if profit > 0:
            return "MARGINAL", f"Positive but thin: {_fmt(profit)} profit ({margin:.0f}% margin) vs ${_fmt(target_profit)} target."
        return "NO-GO", f"Loses {_fmt(abs(profit))} at median sell on GunBroker."

    if context == "vendor_deal" and street_retail and street_retail > 0 and cost:
        if cost < street_retail:
            return "GO", f"Your cost {_fmt(cost)} is below vendor sale {_fmt(street_retail)}."
        return "NO-GO", f"Cost {_fmt(cost)} is not below vendor sale {_fmt(street_retail)}."

    if max_pay > 0 and cost <= max_pay:
        return "GO", f"Cost {_fmt(cost)} is within max pay {_fmt(max_pay)}."

    return "MARGINAL", "Review profit table and comp confidence."


def default_deal_params() -> dict[str, float]:
    return {
        "target_profit": _float_env("MMD_TARGET_PROFIT", 75.0),
        "min_margin_pct": _float_env("MMD_MIN_MARGIN_PCT", 15.0),
        "transfer_fee": _float_env("MMD_TRANSFER_FEE", 0.0),
        "inbound_ship": _float_env("MMD_INBOUND_SHIP", 0.0),
        "listing_addons": _float_env("MMD_GUNBROKER_LISTING_ADDONS", LISTING_ADDONS_DEFAULT),
        "buyer_premium_pct": _float_env(
            "MMD_BUYER_PREMIUM_PCT", _float_env("MMD_AUCTION_FEES_PCT", 18.0)
        ),
    }
