"""
GunBroker sell-side fees (standard firearms) for net proceeds estimates.

Source: GunBroker Final Value Fee tiers for firearms/ammo — 6% on first $400,
4% on amount over $400 (up to $15,000), plus $5 master FFL transfer fee per item
when selling as a licensed FFL. Listing upgrades are user-configurable (default $10).
"""

from __future__ import annotations

from typing import Any

# Final Value Fee tiers (sale price / hammer at which the item sold)
FVF_RATE_FIRST_TIER = 0.06
FVF_FIRST_TIER_CAP = 400.0
FVF_RATE_OVER_400 = 0.04
FVF_MAX_SALE_PRICE = 15_000.0

# Licensed FFL selling & transferring a standard firearm
MASTER_FFL_FEE_DEFAULT = 5.0

# Typical optional listing upgrades for faster sale
LISTING_ADDONS_DEFAULT = 10.0


def final_value_fee(sale_price: float) -> float:
    """Tiered GunBroker Final Value Fee on the sale price."""
    price = max(0.0, min(float(sale_price), FVF_MAX_SALE_PRICE))
    tier1_base = min(price, FVF_FIRST_TIER_CAP)
    tier2_base = max(0.0, price - FVF_FIRST_TIER_CAP)
    return tier1_base * FVF_RATE_FIRST_TIER + tier2_base * FVF_RATE_OVER_400


def gunbroker_sell_breakdown(
    gross_sale: float,
    *,
    listing_addons: float = LISTING_ADDONS_DEFAULT,
    master_ffl_fee: float = MASTER_FFL_FEE_DEFAULT,
) -> dict[str, Any]:
    """Net proceeds after GunBroker FVF, master FFL fee, and listing add-ons."""
    gross = max(0.0, float(gross_sale))
    fvf = final_value_fee(gross)
    listing_addons = max(0.0, float(listing_addons))
    master_ffl_fee = max(0.0, float(master_ffl_fee))
    net = gross - fvf - master_ffl_fee - listing_addons
    return {
        "sell_platform": "gunbroker",
        "gross_sale": round(gross, 2),
        "final_value_fee": round(fvf, 2),
        "final_value_fee_tiers": (
            f"{FVF_RATE_FIRST_TIER * 100:.0f}% on first ${FVF_FIRST_TIER_CAP:,.0f}, "
            f"{FVF_RATE_OVER_400 * 100:.0f}% above ${FVF_FIRST_TIER_CAP:,.0f} "
            f"(up to ${FVF_MAX_SALE_PRICE:,.0f})"
        ),
        "master_ffl_fee": round(master_ffl_fee, 2),
        "listing_addons": round(listing_addons, 2),
        "net_after_gunbroker": round(net, 2),
    }


def net_sell_via_gunbroker(
    gross_sale: float,
    *,
    listing_addons: float = LISTING_ADDONS_DEFAULT,
    master_ffl_fee: float = MASTER_FFL_FEE_DEFAULT,
) -> float:
    return float(
        gunbroker_sell_breakdown(
            gross_sale,
            listing_addons=listing_addons,
            master_ffl_fee=master_ffl_fee,
        )["net_after_gunbroker"]
    )
