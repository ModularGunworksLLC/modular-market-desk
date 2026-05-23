"""Context-specific valuation insights."""

from __future__ import annotations

from mmd_engine.config import env
from mmd_engine.gunbroker_fees import (
    LISTING_ADDONS_DEFAULT,
    MASTER_FFL_FEE_DEFAULT,
    gunbroker_sell_breakdown,
)
from mmd_engine.valuation_models import (
    ContextMode,
    FirearmQuery,
    PriceStats,
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


def _estimate_for_condition(
    estimate_stats: PriceStats | None,
    query: FirearmQuery,
) -> float:
    if not estimate_stats or estimate_stats.count <= 0:
        return 0.0
    if query.condition == "new":
        return 0.0
    return estimate_stats.median


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
    my_cost: float | None,
    street_retail: float | None = None,
    reference_msrp: float | None = None,
    buyer_premium_pct: float | None = None,
    listing_addons: float | None = None,
) -> ValuationInsights:
    default_premium = _float_env("MMD_BUYER_PREMIUM_PCT", _float_env("MMD_AUCTION_FEES_PCT", 18.0))
    premium_pct = buyer_premium_pct if buyer_premium_pct is not None else default_premium
    premium_pct = max(0.0, min(premium_pct, 100.0))
    premium_rate = premium_pct / 100.0
    target_profit = _float_env("MMD_TARGET_PROFIT", 75.0)
    min_margin_pct = _float_env("MMD_MIN_MARGIN_PCT", 15.0)
    min_resale_gap = _float_env("MMD_MIN_RESALE_GAP", 50.0)
    addons = (
        listing_addons
        if listing_addons is not None
        else _float_env("MMD_GUNBROKER_LISTING_ADDONS", LISTING_ADDONS_DEFAULT)
    )
    addons = max(0.0, addons)

    primary = sold_stats_sku if sold_stats_sku.count > 0 else sold_stats
    asking_low = asking_stats.low if asking_stats.count else 0.0
    vendor_sale = street_retail if street_retail and street_retail > 0 else 0.0
    wholesale_low = wholesale_stats.low if wholesale_stats.count else 0.0
    cost = my_cost if my_cost and my_cost > 0 else (wholesale_low or None)

    insights = ValuationInsights(
        context=context,
        my_cost=cost,
        lowest_wholesale=wholesale_low or None,
        retail_street_low=asking_low or None,
        sold_median_90d=primary.median or None,
        assumptions={
            "buyer_premium_pct": premium_pct,
            "target_profit": target_profit,
            "min_margin_pct": min_margin_pct,
            "sold_window_days": 90,
            "sold_label": sold_label,
        },
    )

    if context == "auction_sniper":
        p75 = sold_stats.p75 or sold_stats.median or primary.p75 or primary.median
        if p75 and p75 > 0:
            gb = gunbroker_sell_breakdown(
                p75,
                listing_addons=addons,
                master_ffl_fee=MASTER_FFL_FEE_DEFAULT,
            )
            net_sell = gb["net_after_gunbroker"]
            max_bid = max(0.0, (net_sell - target_profit) / (1.0 + premium_rate))
            all_in = max_bid * (1.0 + premium_rate)
            insights.max_bid = round(max_bid, 2)
            insights.assumptions.update(gb)
            insights.assumptions["buyer_premium_pct"] = premium_pct
            insights.assumptions["all_in_at_max_bid"] = round(all_in, 2)
            insights.headline = (
                f"Suggested max hammer {_fmt(max_bid)} "
                f"(all-in {_fmt(all_in)} at {premium_pct:.0f}% premium) "
                f"after GunBroker sell on P75 {_fmt(p75)}."
            )
        else:
            insights.headline = (
                "No sold comps in 90 days — check Sources. "
                "Try market auth for GunBroker/Gun.deals if blocked."
            )
        return insights

    if not cost:
        insights.headline = "Enter your dealer cost, then Valuate."
        return insights

    sell_at = primary.median if primary.count else 0.0
    if not sell_at and asking_low > 0:
        sell_at = asking_low

    acquisition_lines: list[str] = [
        f"Your cost: {_fmt(cost)}",
    ]
    if primary.count > 0:
        acquisition_lines.append(
            f"{sold_label}: {_fmt(primary.low)}–{_fmt(primary.high)} "
            f"(median {_fmt(primary.median)}, {primary.count} comp"
            f"{'s' if primary.count != 1 else ''})"
        )
        acquisition_lines.append(
            f"vs median: {_delta_label(cost, primary.median)} market"
        )
    elif sold_stats.count > 0:
        acquisition_lines.append(
            f"All matches (90d): median {_fmt(sold_stats.median)} "
            f"({sold_stats.count} comps) — no exact UPC/MPN match"
        )
    else:
        acquisition_lines.append("No sold comps in 90 days — check Sources below")

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

    if sell_at > 0:
        r = _resale_at_price(cost, sell_at, listing_addons=addons)
        insights.assumptions.update({f"resale_{k}": v for k, v in r.items()})
        local_p = r["local_profit"]
        gb_p = r["gunbroker_profit"]
        resale_lines.append(f"Sell at: {_fmt(sell_at)} ({sold_label})")
        resale_lines.append(
            f"Local/counter: net {_fmt(r['local_net'])} → profit {_fmt(local_p)} "
            f"({r['local_margin_pct']:.0f}%)"
        )
        resale_lines.append(
            f"GunBroker: net {_fmt(r['gunbroker_net'])} → profit {_fmt(gb_p)} "
            f"({r['gunbroker_margin_pct']:.0f}%) after FVF/listings"
        )
        resale_ok = local_p >= min_resale_gap or gb_p >= target_profit
        insights.margin_dollars = round(gb_p, 2)
        insights.margin_pct = round(float(r["gunbroker_margin_pct"]), 1)

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

    if primary.count > 0:
        gap_med = primary.median - cost
        resale_ok = gap_med >= min_resale_gap and (
            sell_at <= 0
            or float(insights.assumptions.get("resale_local_profit", gap_med)) >= min_resale_gap
        )

    insights.promo_ok = promo_ok
    insights.assumptions["resale_ok"] = resale_ok
    insights.assumptions["promo_ok"] = promo_ok
    insights.assumptions["acquisition_lines"] = acquisition_lines
    insights.assumptions["resale_lines"] = resale_lines

    verdicts: list[str] = []
    if promo_ok is True:
        verdicts.append("Vendor promo: good")
    elif promo_ok is False:
        verdicts.append("Vendor promo: weak")
    if resale_ok is True:
        verdicts.append("Resale room: OK")
    elif resale_ok is False and sell_at > 0:
        verdicts.append("Resale room: thin")

    if context == "vendor_deal":
        if sell_at > 0 and primary.count > 0:
            insights.headline = (
                f"You pay {_fmt(cost)} vs {sold_label} median {_fmt(primary.median)} "
                f"({_delta_label(cost, primary.median)}). "
                + (verdicts[0] if verdicts else "")
            )
        elif vendor_sale > 0:
            insights.headline = (
                f"You pay {_fmt(cost)} vs vendor sale {_fmt(vendor_sale)}. "
                + (verdicts[0] if verdicts else "")
            )
        else:
            insights.headline = "No sold comps matched — verify fields and Sources."

    elif context == "margin_spotter":
        if sell_at > 0 and resale_lines:
            gb_p = float(insights.assumptions.get("resale_gunbroker_profit", 0))
            local_p = float(insights.assumptions.get("resale_local_profit", 0))
            if gb_p >= target_profit and gb_p >= local_p * 0.5:
                v = f"GunBroker profit {_fmt(gb_p)}"
            elif local_p > 0:
                v = f"Local profit {_fmt(local_p)} (GunBroker {_fmt(gb_p)})"
            else:
                v = f"No profit at median — GunBroker loses {_fmt(abs(gb_p))}"
            insights.headline = f"{v} at {sold_label} {_fmt(sell_at)}."
        else:
            insights.headline = "Need sold comps for margin math — check Sources."

    return insights
