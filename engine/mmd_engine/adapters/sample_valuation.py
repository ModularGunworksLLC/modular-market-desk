"""Sample listings for offline dev and demo."""

from __future__ import annotations

from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.models import utc_now_iso
from mmd_engine.util import slug_id
from mmd_engine.valuation_models import FirearmQuery, MarketListing


class SampleValuationAdapter(ValuationAdapter):
    name = "sample"

    def fetch(self, query: FirearmQuery) -> list[MarketListing]:
        now = utc_now_iso()
        mfr = query.manufacturer or "Glock"
        model = query.model or "G19"
        caliber = query.caliber or "9mm"
        title_base = f"{mfr} {model} {query.variant} {caliber}".strip()
        key = slug_id(mfr, model, caliber)

        return [
            MarketListing(
                id=f"{key}-sold-1",
                source="sample-gunbroker",
                title=f"{title_base} Gen5 4in",
                price=525.0,
                price_type="sold",
                condition="used",
                date=now,
                scraped_at=now,
            ),
            MarketListing(
                id=f"{key}-sold-2",
                source="sample-gunbroker",
                title=f"{title_base} Gen5 MOS",
                price=579.0,
                price_type="sold",
                condition="used",
                date=now,
                scraped_at=now,
            ),
            MarketListing(
                id=f"{key}-sold-3",
                source="sample-gunbroker",
                title=f"{title_base} new in box",
                price=649.0,
                price_type="sold",
                condition="new",
                date=now,
                scraped_at=now,
            ),
            MarketListing(
                id=f"{key}-ask-1",
                source="sample-retail",
                title=f"{title_base} — GrabAGun",
                price=549.0,
                price_type="asking",
                condition="new",
                url="https://example.com/retail",
                scraped_at=now,
            ),
            MarketListing(
                id=f"{key}-ask-2",
                source="sample-retail",
                title=f"{title_base} — PSA",
                price=519.0,
                price_type="asking",
                condition="new",
                url="https://example.com/psa",
                scraped_at=now,
            ),
            MarketListing(
                id=f"{key}-est-1",
                source="sample-tgv",
                title=f"{title_base} TGV estimate used",
                price=540.0,
                price_type="estimate",
                condition="used",
                scraped_at=now,
            ),
            MarketListing(
                id=f"{key}-wh-1",
                source="sample-lipseys",
                title=f"{title_base} wholesale",
                price=449.0,
                price_type="wholesale",
                condition="new",
                scraped_at=now,
            ),
        ]
