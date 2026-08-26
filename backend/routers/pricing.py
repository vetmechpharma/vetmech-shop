from fastapi import APIRouter, Depends, Body, HTTPException
from db import db
from security import get_current_admin, require_module
from helpers import now_iso, new_id, log_audit

router = APIRouter(prefix="/api/admin/pricing", tags=["pricing"])

DEFAULT_SETTINGS = {
    "id": "pricing_engine",
    "enable_customer_pricing": True,
    "enable_category_pricing": True,
    "enable_customer_specific_pricing": True,
    "enable_last_confirmed_pricing": True,
    "enable_price_protection": True,
    "allow_customer_price_override": True,
    "require_approval": True,
    "enable_otp": True,
    "enable_password_login": True,
    "price_change_behavior": "keep_protected",  # keep_all | reset_all | keep_protected
}


async def ensure_settings():
    doc = await db.settings.find_one({"id": "pricing_engine"}, {"_id": 0})
    if not doc:
        await db.settings.update_one({"id": "pricing_engine"}, {"$set": DEFAULT_SETTINGS}, upsert=True)
        return dict(DEFAULT_SETTINGS)
    merged = {**DEFAULT_SETTINGS, **doc}
    return merged


@router.get("/settings")
async def get_settings(admin=Depends(get_current_admin)):
    return await ensure_settings()


@router.put("/settings")
async def update_settings(body: dict = Body(...), admin=Depends(require_module("customers"))):
    allowed = set(DEFAULT_SETTINGS.keys())
    clean = {k: v for k, v in body.items() if k in allowed}
    clean["id"] = "pricing_engine"
    clean["updated_at"] = now_iso()
    await db.settings.update_one({"id": "pricing_engine"}, {"$set": clean}, upsert=True)
    await log_audit(db, admin, "update", "pricing_settings", "pricing_engine")
    return await ensure_settings()


# =============== CATEGORY PRICING ===============
CATEGORIES = ["doctor", "agency", "medical_shop", "distributor", "farm", "other"]


async def _log_price_change(kind, admin, data):
    await db.pricing_audit.insert_one({
        "id": new_id(), "kind": kind, "at": now_iso(),
        "by": admin.get("name", "Admin"), "by_id": admin.get("id"), **data,
    })


@router.get("/product/{product_id}")
async def product_pricing(product_id: str, admin=Depends(require_module("customers"))):
    """Full category-price matrix for every variant of a product (admin-only)."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found")
    rows = await db.category_prices.find({"product_id": product_id}, {"_id": 0}).to_list(1000)
    by_variant = {}
    for r in rows:
        by_variant.setdefault(r["variant_id"], {})[r["category"]] = r.get("rate")
    variants = []
    for v in product.get("variants", []):
        variants.append({
            "variant_id": v["id"], "pack_size": v.get("pack_size"), "unit": v.get("unit"),
            "sku": v.get("sku"), "mrp": v.get("mrp"), "public_price": v.get("selling_price"),
            "category_prices": by_variant.get(v["id"], {}),
        })
    return {"product_id": product_id, "product_name": product["name"], "categories": CATEGORIES, "variants": variants}


@router.put("/product/{product_id}")
async def set_product_pricing(product_id: str, body: dict = Body(...), admin=Depends(require_module("customers"))):
    """body: {prices: [{variant_id, category, rate|null}]}. null/empty removes the override."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found")
    for row in body.get("prices", []):
        vid, cat = row.get("variant_id"), row.get("category")
        if not vid or cat not in CATEGORIES:
            continue
        rate = row.get("rate")
        existing = await db.category_prices.find_one({"variant_id": vid, "category": cat}, {"_id": 0})
        old_rate = existing.get("rate") if existing else None
        if rate in (None, ""):
            await db.category_prices.delete_one({"variant_id": vid, "category": cat})
        else:
            rate = float(rate)
            if rate < 0:
                raise HTTPException(400, "Rate cannot be negative")
            if existing:
                await db.category_prices.update_one({"variant_id": vid, "category": cat},
                                                    {"$set": {"rate": rate, "active": True, "updated_at": now_iso()}})
            else:
                await db.category_prices.insert_one({
                    "id": new_id(), "product_id": product_id, "variant_id": vid, "category": cat,
                    "rate": rate, "active": True, "created_at": now_iso(), "updated_at": now_iso()})
        if old_rate != rate:
            await _log_price_change("category_price", admin, {
                "product_id": product_id, "product_name": product["name"], "variant_id": vid,
                "category": cat, "old_rate": old_rate, "new_rate": rate})
    await log_audit(db, admin, "update", "category_pricing", product_id)
    return await product_pricing(product_id, admin)


# =============== CUSTOMER-SPECIFIC PRICING ===============
@router.get("/customer/{customer_id}")
async def customer_pricing(customer_id: str, admin=Depends(require_module("customers"))):
    cust = await db.customers.find_one({"id": customer_id}, {"_id": 0, "password_hash": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    rows = await db.customer_prices.find({"customer_id": customer_id, "active": True}, {"_id": 0}).to_list(1000)
    for r in rows:
        prod = await db.products.find_one({"id": r["product_id"]}, {"_id": 0, "name": 1, "variants": 1})
        r["product_name"] = prod["name"] if prod else "(deleted)"
        v = next((x for x in (prod or {}).get("variants", []) if x["id"] == r["variant_id"]), {})
        r["pack_size"] = v.get("pack_size", "")
        r["unit"] = v.get("unit", "")
        r["mrp"] = v.get("mrp")
        r["public_price"] = v.get("selling_price")
    return {"customer_id": customer_id, "customer_name": cust.get("name"),
            "category": cust.get("category"), "price_protected": cust.get("price_protected", False),
            "items": rows}


@router.post("/customer/{customer_id}/item")
async def upsert_customer_price(customer_id: str, body: dict = Body(...), admin=Depends(require_module("customers"))):
    vid = body.get("variant_id")
    product = await db.products.find_one({"variants.id": vid}, {"_id": 0})
    if not vid or not product:
        raise HTTPException(400, "Valid variant required")
    rate = body.get("rate")
    if rate not in (None, "") and float(rate) < 0:
        raise HTTPException(400, "Rate cannot be negative")
    doc = {
        "rate": float(rate) if rate not in (None, "") else None,
        "offer": body.get("offer") or None,
        "protected": bool(body.get("protected", False)),
        "source": body.get("source", "manual"),
        "active": True, "updated_at": now_iso(),
    }
    existing = await db.customer_prices.find_one({"customer_id": customer_id, "variant_id": vid}, {"_id": 0})
    if existing:
        await db.customer_prices.update_one({"customer_id": customer_id, "variant_id": vid}, {"$set": doc})
    else:
        doc.update({"id": new_id(), "customer_id": customer_id, "product_id": product["id"],
                    "variant_id": vid, "created_at": now_iso()})
        await db.customer_prices.insert_one(doc)
    await _log_price_change("customer_price", admin, {
        "customer_id": customer_id, "product_id": product["id"], "product_name": product["name"],
        "variant_id": vid, "old_rate": (existing or {}).get("rate"), "new_rate": doc["rate"],
        "source": doc["source"]})
    await log_audit(db, admin, "update", "customer_pricing", customer_id, {"variant": vid})
    return {"ok": True}


@router.delete("/customer/{customer_id}/item/{variant_id}")
async def delete_customer_price(customer_id: str, variant_id: str, admin=Depends(require_module("customers"))):
    await db.customer_prices.delete_one({"customer_id": customer_id, "variant_id": variant_id})
    await _log_price_change("customer_price_reset", admin, {"customer_id": customer_id, "variant_id": variant_id})
    return {"deleted": True}


@router.patch("/customer/{customer_id}/item/{variant_id}/protect")
async def protect_customer_price(customer_id: str, variant_id: str, body: dict = Body(...),
                                 admin=Depends(require_module("customers"))):
    await db.customer_prices.update_one({"customer_id": customer_id, "variant_id": variant_id},
                                        {"$set": {"protected": bool(body.get("protected", True)), "updated_at": now_iso()}})
    return {"ok": True}


@router.get("/customer/{customer_id}/history")
async def customer_price_history(customer_id: str, admin=Depends(require_module("customers"))):
    rows = await db.pricing_audit.find(
        {"customer_id": customer_id}, {"_id": 0}).sort("at", -1).to_list(200)
    return {"items": rows}


# =============== VARIANT OFFERS (schemes, managed inline with pricing) ===============
@router.get("/offers/{variant_id}")
async def variant_offers(variant_id: str, admin=Depends(require_module("customers"))):
    rows = await db.schemes.find({"variant_id": variant_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"items": rows}


@router.post("/offers")
async def create_offer(body: dict = Body(...), admin=Depends(require_module("customers"))):
    ct = body.get("customer_type", "all")
    if ct != "all" and ct not in CATEGORIES:
        raise HTTPException(400, "Invalid customer category")
    stype = body.get("scheme_type", "free_qty")
    buy, free = body.get("buy_quantity"), body.get("free_quantity")
    if stype == "free_qty" and (not buy or not free):
        raise HTTPException(400, "Buy and Free quantities required")
    if stype in ("special_price", "case_price") and body.get("special_price") is None:
        raise HTTPException(400, "Special price required")
    doc = {
        "id": new_id(), "name": body.get("name") or "Offer", "scheme_type": stype,
        "product_id": body.get("product_id"), "variant_id": body.get("variant_id"),
        "buy_quantity": buy, "free_quantity": free, "special_price": body.get("special_price"),
        "min_quantity": body.get("min_quantity") or buy, "max_quantity": body.get("max_quantity"),
        "customer_type": body.get("customer_type", "all"), "start_date": body.get("start_date"),
        "end_date": body.get("end_date"), "active": body.get("active", True),
        "created_at": now_iso(),
    }
    await db.schemes.insert_one(dict(doc))
    await log_audit(db, admin, "create", "offer", doc["id"], {"variant": doc["variant_id"]})
    doc.pop("_id", None)
    return doc


@router.delete("/offers/{sid}")
async def delete_offer(sid: str, admin=Depends(require_module("customers"))):
    res = await db.schemes.delete_one({"id": sid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Offer not found")
    return {"deleted": True}


# =============== CATEGORY PRICE CHANGE (master price change) ===============
@router.post("/category-change/preview")
async def category_change_preview(body: dict = Body(...), admin=Depends(require_module("customers"))):
    vid, category = body.get("variant_id"), body.get("category")
    new_rate = float(body.get("new_rate"))
    cps = await db.customer_prices.find({"variant_id": vid, "active": True}, {"_id": 0}).to_list(5000)
    affected = []
    for cp in cps:
        cust = await db.customers.find_one({"id": cp["customer_id"]}, {"_id": 0, "name": 1, "category": 1, "price_protected": 1})
        if not cust or cust.get("category") != category:
            continue
        affected.append({"customer_id": cp["customer_id"], "name": cust.get("name"),
                         "old_rate": cp.get("rate"), "new_rate": new_rate,
                         "protected": bool(cp.get("protected") or cust.get("price_protected"))})
    return {"category": category, "variant_id": vid, "new_rate": new_rate,
            "affected": affected, "count": len(affected)}


@router.post("/category-change/apply")
async def category_change_apply(body: dict = Body(...), admin=Depends(require_module("customers"))):
    vid, pid = body.get("variant_id"), body.get("product_id")
    category = body.get("category")
    new_rate = float(body.get("new_rate"))
    if new_rate < 0:
        raise HTTPException(400, "Rate cannot be negative")
    mode = body.get("mode", "keep_protected")  # keep_all | keep_protected | reset_all
    existing = await db.category_prices.find_one({"variant_id": vid, "category": category}, {"_id": 0})
    old_rate = existing.get("rate") if existing else None
    if existing:
        await db.category_prices.update_one({"variant_id": vid, "category": category},
                                            {"$set": {"rate": new_rate, "active": True, "updated_at": now_iso()}})
    else:
        await db.category_prices.insert_one({"id": new_id(), "product_id": pid, "variant_id": vid,
                                             "category": category, "rate": new_rate, "active": True,
                                             "created_at": now_iso(), "updated_at": now_iso()})
    removed = 0
    if mode != "keep_all":
        cps = await db.customer_prices.find({"variant_id": vid, "active": True}, {"_id": 0}).to_list(5000)
        for cp in cps:
            cust = await db.customers.find_one({"id": cp["customer_id"]}, {"_id": 0, "category": 1, "price_protected": 1})
            if not cust or cust.get("category") != category:
                continue
            protected = bool(cp.get("protected") or cust.get("price_protected"))
            if mode == "keep_protected" and protected:
                continue
            await db.customer_prices.delete_one({"id": cp["id"]})
            removed += 1
    await _log_price_change("category_price_change", admin, {
        "variant_id": vid, "product_id": pid, "category": category,
        "old_rate": old_rate, "new_rate": new_rate, "mode": mode, "customers_reset": removed})
    await log_audit(db, admin, "category_price_change", "category_pricing", vid, {"category": category, "mode": mode})
    return {"applied": True, "mode": mode, "customers_reset": removed, "old_rate": old_rate, "new_rate": new_rate}
