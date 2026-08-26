"""Central pricing resolution engine (user-wise pricing).

Priority (rate): customer-specific (manual / last_confirmed) -> category -> public -> mrp
Priority (offer): customer-specific offer -> category offer -> public offer (no auto-stacking)
Security: only the applicable price for the given customer is ever computed here.
"""
from helpers import applicable_schemes, compute_scheme


def is_active_customer(c):
    if not c:
        return False
    st = c.get("status") or ("active" if c.get("active", True) else "suspended")
    return st == "active"


async def get_pricing_settings(db):
    return await db.settings.find_one({"id": "pricing_engine"}, {"_id": 0}) or {}


def _scheme_from_custom(offer):
    """Normalize a stored customer-specific offer into a scheme-shaped dict."""
    return {
        "id": "custom", "name": offer.get("name") or "Special Offer",
        "scheme_type": offer.get("scheme_type", "free_qty"),
        "buy_quantity": offer.get("buy_quantity"), "free_quantity": offer.get("free_quantity"),
        "special_price": offer.get("special_price"), "min_quantity": offer.get("min_quantity"),
        "max_quantity": offer.get("max_quantity"), "active": True,
    }


def pick_offer_schemes(schemes, category):
    """Honor category > public priority; never stack."""
    if category:
        cat_specific = [s for s in schemes if s.get("customer_type") and s.get("customer_type") != "all"
                        and s.get("customer_type") == category]
        if cat_specific:
            return cat_specific
    return [s for s in schemes if not s.get("customer_type") or s.get("customer_type") == "all"]


def scheme_desc(s):
    return {"id": s.get("id"), "name": s.get("name"), "type": s.get("scheme_type"),
            "buy": s.get("buy_quantity"), "free": s.get("free_quantity"),
            "special_price": s.get("special_price"), "min": s.get("min_quantity")}


async def resolve_pricing(db, product, variant, customer, settings=None):
    """Return the applicable base rate + offer descriptor for a customer (or guest)."""
    settings = settings if settings is not None else await get_pricing_settings(db)
    mrp = variant.get("mrp")
    public = variant.get("selling_price")
    result = {"mrp": mrp, "public_price": public, "rate": public, "source": "public",
              "offer_source": "public", "category": None, "custom_offer": None}

    if not is_active_customer(customer) or not settings.get("enable_customer_pricing", True):
        return result

    cat = customer.get("category")
    result["category"] = cat

    cp = None
    if settings.get("enable_customer_specific_pricing", True):
        cp = await db.customer_prices.find_one(
            {"customer_id": customer["id"], "variant_id": variant["id"], "active": True}, {"_id": 0})
    if cp and cp.get("rate") is not None:
        result["rate"] = cp["rate"]
        result["source"] = cp.get("source") or "customer_specific"
        if cp.get("offer"):
            result["custom_offer"] = cp["offer"]
            result["offer_source"] = "customer"
        return result

    if settings.get("enable_category_pricing", True) and cat:
        catp = await db.category_prices.find_one(
            {"variant_id": variant["id"], "category": cat, "active": True}, {"_id": 0})
        if catp and catp.get("rate") is not None:
            result["rate"] = catp["rate"]
            result["source"] = "category"

    return result


def compute_upsell(qty, offer_schemes, current_free):
    """Smallest add that reaches a higher free-qty tier (best-value nudge)."""
    best = None
    for s in offer_schemes:
        if s.get("scheme_type") not in (None, "free_qty"):
            continue
        b = s.get("buy_quantity") or 0
        f = s.get("free_quantity") or 0
        if b <= 0 or f <= 0:
            continue
        thr = ((qty // b) + 1) * b
        maxq = s.get("max_quantity") or 0
        if maxq and thr > maxq:
            continue
        free_at = (thr // b) * f
        if free_at > current_free:
            add = thr - qty
            cand = {"add": add, "target_qty": thr, "free_qty": free_at, "label": f"{b}+{f}"}
            if best is None or add < best["add"] or (add == best["add"] and free_at > best["free_qty"]):
                best = cand
    if best:
        best["message"] = (f"Add {best['add']} more to reach {best['target_qty']} "
                           f"and get {best['free_qty']} free ({best['label']})")
    return best


async def price_line(db, product, variant, qty, customer, settings=None):
    """Full priced line for cart/order: unit price, free qty, offer + source labels + upsell nudges."""
    settings = settings if settings is not None else await get_pricing_settings(db)
    pr = await resolve_pricing(db, product, variant, customer, settings)
    if pr["custom_offer"]:
        offer_schemes = [_scheme_from_custom(pr["custom_offer"])]
        offer_source = "customer"
    else:
        ct = pr["category"] if is_active_customer(customer) else None
        schemes = await applicable_schemes(db, variant["id"], product["id"], ct)
        offer_schemes = pick_offer_schemes(schemes, ct)
        offer_source = "category" if (ct and any(
            s.get("customer_type") == ct for s in offer_schemes)) else "public"
    sc = compute_scheme(qty, offer_schemes)
    unit_price = sc["special_price"] if sc["special_price"] is not None else pr["rate"]
    upsell = compute_upsell(qty, offer_schemes, sc["free_qty"])

    # Case offer nudge: a full case may be cheaper per unit than the current effective rate
    case_suggestion = None
    upc = variant.get("units_per_case") or 0
    case_schemes = [s for s in offer_schemes if s.get("scheme_type") == "case_price" and s.get("special_price") is not None]
    if upc and case_schemes and qty < upc:
        cs = min(case_schemes, key=lambda s: s["special_price"])
        denom = qty + sc["free_qty"]
        eff_now = (unit_price * qty / denom) if denom else unit_price
        if cs["special_price"] < eff_now:
            case_suggestion = {"case_qty": upc, "case_price": cs["special_price"],
                               "message": f"Order a full case ({upc}) at ₹{cs['special_price']}/unit for the best rate"}

    return {
        "unit_price": unit_price, "free_qty": sc["free_qty"],
        "scheme_id": sc["scheme_id"], "scheme_label": sc["scheme_label"],
        "mrp": pr["mrp"], "public_price": pr["public_price"],
        "price_source": pr["source"], "offer_source": offer_source,
        "upsell": upsell, "case_suggestion": case_suggestion,
    }
