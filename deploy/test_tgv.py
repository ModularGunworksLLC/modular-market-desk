from mmd_engine.adapters.truegunvalue import TrueGunValueAdapter
from mmd_engine.valuation_models import FirearmQuery

q = FirearmQuery(
    category="handgun",
    manufacturer="Glock",
    model="30",
    variant="Gen 5",
    caliber="45 ACP",
)
rows = TrueGunValueAdapter().fetch(q)
print("rows", len(rows))
sold = [r for r in rows if r.price_type == "sold"]
print("sold", len(sold))
if rows:
    print("first", rows[0].title[:60], rows[0].price)
