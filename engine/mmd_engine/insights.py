"""Context-specific valuation insights."""

from __future__ import annotations

from typing import Any

from mmd_engine.config import env
from mmd_engine.dealer_brief import (
    SellScenario,
    build_dealer_brief,
    default_deal_params,
)
from mmd_engine.gunbroker_fees import (
    LISTING_ADDONS_DEFAULT,
    MASTER_FFL_FEE_DEFAULT,
    gunbroker_sell_breakdown,
)
from mmd_engine.valuation_models import (
    ContextMode,
    FirearmQuery,
    PriceStats,
    TrendPoint,
    ValuationInsights,
)


def _float_env(name: str, default: float) -> float:
    raw = env(name, str(default))
    try:
        return float(raw)
    except ValueError:
        return default


def _fmt(n: float) -> str:
    return f"${n:,.0f}"


def _delta_label(cost: float, ref: float) -> str:
    d = ref - cost
    if d > 0:
        return f"{_fmt(d)} under"
    if d < 0:
        return f"{_fmt(abs(d))} over"
    return "same as"


def _resale_at_price(
    cost: float,
    sell_gross: float,
    *,
    listing_addons: float,
) -> dict[str, float | str]:
    gb = gunbroker_sell_breakdown(
        sell_gross,
        listing_addons=listing_addons,
        master_ffl_fee=MASTER_FFL_FEE_DEFAULT,
    )
    net_gb = gb["net_after_gunbroker"]
    local_profit = sell_gross - cost
    gb_profit = net_gb - cost
    return {
        "sell_gross": sell_gross,
        "local_net": sell_gross,
        "local_profit": local_profit,
        "local_margin_pct": (local_profit / cost * 100) if cost > 0 else 0.0,
        "gunbroker_net": net_gb,
        "gunbroker_profit": gb_profit,
        "gunbroker_margin_pct": (gb_profit / cost * 100) if cost > 0 else 0.0,
        **{k: v for k, v in gb.items() if isinstance(v, (int, float))},
    }


def compute_insights(
    *,
    context: ContextMode,
    query: FirearmQuery,
    sold_stats: PriceStats,
    sold_stats_sku: PriceStats,
    sold_label: str,
    asking_stats: PriceStats,
    wholesale_stats: PriceStats,
    estimate_stats: PriceStats | None = None,
    trends: list[TrendPoint] | None = None,
    my_cost: float | None,
    street_retail: float | None = None,
    reference_msrp: float | None = None,
    buyer_premium_pct: float | None = None,
    listing_addons: float | None = None,
    target_profit: float | None = None,
    min_margin_pct: float | None = None,
    transfer_fee: float | None = None,
    inbound_ship: float | None = None,
    sell_assumption: SellScenario | str | None = None,
) -> ValuationInsights:
    defaults = default_deal_params()
    sell_key: SellScenario | None = None
    if sell_assumption in ("p25", "median", "p75"):
        sell_key = sell_assumption  # type: ignore[assignment]
    default_premium = defaults["buyer_premium_pct"]
    premium_pct = buyer_premium_pct if buyer_premium_pct is not None else default_premium
    premium_pct = max(0.0, min(premium_pct, 100.0))
    premium_rate = premium_pct / 100.0
    target = target_profit if target_profit is not None else defaults["target_profit"]
    min_margin = min_margin_pct if min_margin_pct is not None else defaults["min_margin_pct"]
    min_resale_gap = _float_env("MMD_MIN_RESALE_GAP", 50.0)
    addons = listing_addons if listing_addons is not None else defaults["listing_addons"]
    addons = max(0.0, addons)
    transfer = transfer_fee if transfer_fee is not None else defaults["transfer_fee"]
    ship = inbound_ship if inbound_ship is not None else defaults["inbound_ship"]

    primary = sold_stats_sku if sold_stats_sku.count > 0 else sold_stats
    asking_low = asking_stats.low if asking_stats.count else 0.0
    vendor_sale = street_retail if street_retail and street_retail > 0 else 0.0
    wholesale_low = wholesale_stats.low if wholesale_stats.count else 0.0
    cost = my_cost if my_cost and my_cost > 0 else (wholesale_low or None)

    brief = build_dealer_brief(
        context=context,
        sold_stats=primary,
        sold_stats_all=sold_stats,
        sold_label=sold_label,
        asking_stats=asking_stats,
        trends=trends or [],
        my_cost=cost,
        buyer_premium_pct=premium_pct,
        listing_addons=addons,
        transfer_fee=transfer,
        inbound_ship=ship,
        target_profit=target,
        min_margin_pct=min_margin,
        sell_assumption=sell_key,
        street_retail=street_retail,
    )

    insights = ValuationInsights(
        context=context,
        my_cost=cost,
        lowest_wholesale=wholesale_low or None,
        retail_street_low=asking_low or None,
        sold_median_90d=primary.median or None,
        dealer_brief=brief,
        assumptions={
            "buyer_premium_pct": premium_pct,
            "target_profit": target,
            "min_margin_pct": min_margin,
            "transfer_fee": transfer,
            "inbound_ship": ship,
            "sold_window_days": 90,
            "sold_label": sold_label,
        },
    )

    ceilings = brief.get("ceilings") or {}
    max_hammer = ceilings.get("max_hammer")
    max_pay = ceilings.get("max_pay_all_in")
    sell_price = ceilings.get("sell_price") or 0.0
    sell_key = ceilings.get("sell_assumption", "median")

    if context == "auction_sniper":
        if max_hammer and float(max_hammer) > 0:
            hammer = float(max_hammer)
            all_in = hammer * (1.0 + premium_rate) + transfer + ship
            insights.max_bid = round(hammer, 2)
            insights.assumptions["all_in_at_max_bid"] = round(all_in, 2)
            insights.assumptions["sell_assumption"] = sell_key
            insights.headline = (
                f"{brief['verdict']}: max hammer {_fmt(hammer)} "
                f"(all-in {_fmt(all_in)} incl. {premium_pct:.0f}% premium) "
                f"sell on {str(sell_key).upper()} {_fmt(float(sell_price))} — {brief['verdict_reason']}"
            )
        else:
            insights.headline = brief.get("verdict_reason") or (
                "No sold comps in 90 days — run Valuate with correct manufacturer/model."
            )
        return insights

    if not cost:
        insights.headline = (
            f"{brief['verdict']}: enter dealer cost for profit math. "
            f"{brief['market'].get('sold_label', 'Sold')}: "
            f"{brief['market'].get('sold_count', 0)} comps, median "
            f"{_fmt(float(brief['market'].get('sold_median') or 0))}."
        )
        return insights

    acquisition_lines: list[str] = [
        f"Your all-in cost: {_fmt(cost)}",
    ]
    mkt = brief.get("market") or {}
    if mkt.get("sold_count", 0) > 0:
        acquisition_lines.append(
            f"{sold_label}: {_fmt(float(mkt['sold_low']))}–{_fmt(float(mkt['sold_high']))} "
            f"(median {_fmt(float(mkt['sold_median']))}, {mkt['sold_count']} comp"
            f"{'s' if mkt['sold_count'] != 1 else ''})"
        )
        acquisition_lines.append(
            f"vs median: {_delta_label(cost, float(mkt['sold_median']))} market"
        )
    elif sold_stats.count > 0:
        acquisition_lines.append(
            f"All matches (90d): median {_fmt(sold_stats.median)} "
            f"({sold_stats.count} comps) — no exact UPC/MPN match"
        )
    else:
        acquisition_lines.append("No sold comps in 90 days")

    if mkt.get("ask_vs_sold_label"):
        acquisition_lines.append(str(mkt["ask_vs_sold_label"]))
    if vendor_sale > 0:
        acquisition_lines.append(
            f"Vendor sale price: {_fmt(vendor_sale)} ({_delta_label(cost, vendor_sale)})"
        )
    if asking_low > 0:
        acquisition_lines.append(f"Lowest asking (live): {_fmt(asking_low)}")
    if reference_msrp and reference_msrp > 0:
        acquisition_lines.append(f"MSRP (reference only): {_fmt(reference_msrp)}")

    resale_lines: list[str] = []
    resale_ok: bool | None = None
    promo_ok: bool | None = None

    sell_at = primary.median if primary.count else 0.0
    if not sell_at and asking_low > 0:
        sell_at = asking_low

    if sell_at > 0:
        r = _resale_at_price(cost, sell_at, listing_addons=addons)
        insights.assumptions.update({f"resale_{k}": v for k, v in r.items()})
        local_p = float(r["local_profit"])
        gb_p = float(r["gunbroker_profit"])
        resale_lines.append(f"Sell at: {_fmt(sell_at)} ({sold_label})")
        resale_lines.append(
            f"Local/counter: net {_fmt(float(r['local_net']))} → profit {_fmt(local_p)} "
            f"({float(r['local_margin_pct']):.0f}%)"
        )
        resale_lines.append(
            f"GunBroker: net {_fmt(float(r['gunbroker_net']))} → profit {_fmt(gb_p)} "
            f"({float(r['gunbroker_margin_pct']):.0f}%) after FVF/listings"
        )
        resale_ok = local_p >= min_resale_gap or gb_p >= target
        insights.margin_dollars = round(gb_p, 2)
        insights.margin_pct = round(float(r["gunbroker_margin_pct"]), 1)

    for row in brief.get("profit_at_cost") or []:
        if row.get("scenario") == "Median":
            resale_lines.append(
                f"Median GB profit: {_fmt(float(row['profit']))} ({row['margin_pct']}%)"
            )
            break

    if max_pay and float(max_pay) > 0:
        acquisition_lines.append(f"Max pay (all-in): {_fmt(float(max_pay))}")

    if vendor_sale > 0:
        promo_ok = cost < vendor_sale
        gap = vendor_sale - cost
        if promo_ok:
            acquisition_lines.append(
                f"Promo: {_fmt(gap)} below their sale price — real discount"
            )
        elif gap == 0:
            acquisition_lines.append("Promo: same as their public sale — no extra dealer cut")
            promo_ok = False
        else:
            acquisition_lines.append(
                f"Promo: {_fmt(abs(gap))} above their sale price — not a deal"
            )
            promo_ok = False
    elif primary.count > 0:
        promo_ok = cost < primary.median

    insights.promo_ok = promo_ok
    insights.assumptions["resale_ok"] = resale_ok
    insights.assumptions["promo_ok"] = promo_ok
    insights.assumptions["acquisition_lines"] = acquisition_lines
    insights.assumptions["resale_lines"] = resale_lines

    insights.headline = f"{brief['verdict']}: {brief['verdict_reason']}"

    return insights
