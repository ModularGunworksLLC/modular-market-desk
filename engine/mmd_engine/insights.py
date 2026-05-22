"""Context-specific valuation insights."""

from __future__ import annotations

from mmd_engine.config import env
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


def compute_insights(
    *,
    context: ContextMode,
    query: FirearmQuery,
    sold_stats: PriceStats,
    asking_stats: PriceStats,
    wholesale_stats: PriceStats,
    my_cost: float | None,
) -> ValuationInsights:
    fees_pct = _float_env("MMD_AUCTION_FEES_PCT", 13.0) / 100.0
    target_profit = _float_env("MMD_TARGET_PROFIT", 75.0)
    retail_low = asking_stats.low if asking_stats.count else 0.0
    wholesale_low = wholesale_stats.low if wholesale_stats.count else 0.0
    cost = my_cost if my_cost and my_cost > 0 else (wholesale_low or None)

    insights = ValuationInsights(
        context=context,
        my_cost=cost,
        lowest_wholesale=wholesale_low or None,
        retail_street_low=retail_low or None,
        sold_median_90d=sold_stats.median or None,
        assumptions={
            "auction_fees_pct": fees_pct * 100,
            "target_profit": target_profit,
            "sold_window_days": 90,
        },
    )

    if context == "auction_sniper":
        p75 = sold_stats.p75 or sold_stats.median
        if p75 and p75 > 0:
            max_bid = max(0.0, p75 * (1.0 - fees_pct) - target_profit)
            insights.max_bid = round(max_bid, 2)
            insights.headline = (
                f"Suggested max bid ${max_bid:,.0f} based on 90d sold P75 ${p75:,.0f} "
                f"({fees_pct * 100:.0f}% fees, ${target_profit:,.0f} target profit)."
            )
        else:
            insights.headline = "Not enough sold comps in the last 90 days to suggest a max bid."

    elif context == "vendor_deal":
        if cost and retail_low:
            promo_ok = cost < retail_low and (not wholesale_low or cost <= wholesale_low + 0.01)
            insights.promo_ok = promo_ok
            if promo_ok:
                insights.headline = (
                    f"Promo looks legitimate: your cost ${cost:,.0f} is below retail street "
                    f"low ${retail_low:,.0f}."
                )
            else:
                insights.headline = (
                    f"Warning: your cost ${cost:,.0f} is NOT below retail street low "
                    f"${retail_low:,.0f} — verify this promo."
                )
        elif cost:
            insights.headline = f"Your cost ${cost:,.0f}; no retail street comps found to validate."
        else:
            insights.headline = "Enter your cost or import wholesale CSV to validate this vendor deal."

    elif context == "margin_spotter":
        if cost and retail_low:
            spread = retail_low - cost
            margin_pct = (spread / cost) * 100 if cost > 0 else 0.0
            insights.margin_dollars = round(spread, 2)
            insights.margin_pct = round(margin_pct, 1)
            insights.headline = (
                f"Street low ${retail_low:,.0f} minus your cost ${cost:,.0f} = "
                f"${spread:,.0f} margin ({margin_pct:.1f}%)."
            )
        else:
            insights.headline = "Add your cost and ensure retail comps exist to compute margin spread."

    return insights
