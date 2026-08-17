import re
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import Optional

from db import db, paginate
from security import get_current_admin, require_module, optional_customer
from helpers import new_id, now_iso, log_audit, applicable_schemes, compute_scheme

router = APIRouter(prefix="/api", tags=["catalog"])


def slugify(text):
    text = (text or "").lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s-]+", "-", text)
    return text.strip("-") or new_id()[:8]


async def unique_slug(collection, base, exclude_id=None):
    slug = base
    i = 2
    while True:
        q = {"slug": slug}
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        if not await collection.find_one(q):
            return slug
        slug = f"{base}-{i}"
        i += 1


# =============== CATEGORIES ===============
@router.get("/categories")
async def public_categories():
    cats = await db.categories.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(500)
    return cats


@router.get("/categories/{slug}")
async def public_category(slug: str):
    cat = await db.categories.find_one({"slug": slug, "active": True}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


@router.get("/admin/categories")
async def admin_categories(admin=Depends(require_module("categories"))):
    return await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(500)


@router.post("/admin/categories")
async def create_category(body: dict = Body(...), admin=Depends(require_module("categories"))):
    doc = {
        "id": new_id(),
        "name": body.get("name", "Untitled"),
        "parent_id": body.get("parent_id"),
        "slug": await unique_slug(db.categories, slugify(body.get("slug") or body.get("name"))),
        "description": body.get("description", ""),
        "image": body.get("image", ""),
        "active": body.get("active", True),
        "order": body.get("order", 0),
        "seo": body.get("seo", {}),
        "is_demo": body.get("is_demo", False),
        "created_at": now_iso(),
    }
    await db.categories.insert_one(dict(doc))
    await log_audit(db, admin, "create", "category", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return doc


@router.put("/admin/categories/{cid}")
async def update_category(cid: str, body: dict = Body(...), admin=Depends(require_module("categories"))):
    existing = await db.categories.find_one({"id": cid})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    body.pop("id", None)
    body.pop("_id", None)
    if body.get("slug"):
        body["slug"] = await unique_slug(db.categories, slugify(body["slug"]), exclude_id=cid)
    await db.categories.update_one({"id": cid}, {"$set": body})
    await log_audit(db, admin, "update", "category", cid)
    return await db.categories.find_one({"id": cid}, {"_id": 0})


@router.delete("/admin/categories/{cid}")
async def delete_category(cid: str, admin=Depends(require_module("categories"))):
    await db.categories.delete_one({"id": cid})
    await log_audit(db, admin, "delete", "category", cid)
    return {"deleted": True}


# =============== BRANDS ===============
@router.get("/brands")
async def public_brands():
    return await db.brands.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(500)


@router.get("/admin/brands")
async def admin_brands(admin=Depends(require_module("brands"))):
    return await db.brands.find({}, {"_id": 0}).sort("name", 1).to_list(500)


@router.post("/admin/brands")
async def create_brand(body: dict = Body(...), admin=Depends(require_module("brands"))):
    doc = {"id": new_id(), "name": body.get("name", "Brand"), "logo": body.get("logo", ""),
           "description": body.get("description", ""), "active": body.get("active", True),
           "is_demo": body.get("is_demo", False), "created_at": now_iso()}
    await db.brands.insert_one(dict(doc))
    await log_audit(db, admin, "create", "brand", doc["id"])
    doc.pop("_id", None)
    return doc


@router.put("/admin/brands/{bid}")
async def update_brand(bid: str, body: dict = Body(...), admin=Depends(require_module("brands"))):
    body.pop("id", None); body.pop("_id", None)
    await db.brands.update_one({"id": bid}, {"$set": body})
    await log_audit(db, admin, "update", "brand", bid)
    return await db.brands.find_one({"id": bid}, {"_id": 0})


@router.delete("/admin/brands/{bid}")
async def delete_brand(bid: str, admin=Depends(require_module("brands"))):
    await db.brands.delete_one({"id": bid})
    return {"deleted": True}


# =============== UNITS ===============
@router.get("/units")
async def public_units():
    return await db.units.find({}, {"_id": 0}).sort("name", 1).to_list(200)


@router.post("/admin/units")
async def create_unit(body: dict = Body(...), admin=Depends(require_module("units"))):
    doc = {"id": new_id(), "name": body.get("name"), "created_at": now_iso()}
    await db.units.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.delete("/admin/units/{uid}")
async def delete_unit(uid: str, admin=Depends(require_module("units"))):
    await db.units.delete_one({"id": uid})
    return {"deleted": True}


# =============== PRODUCTS ===============
def build_product(body, existing=None):
    base = existing or {}
    variants = body.get("variants", base.get("variants", []))
    for v in variants:
        if not v.get("id"):
            v["id"] = new_id()
    return {
        "name": body.get("name", base.get("name", "Product")),
        "brand_id": body.get("brand_id", base.get("brand_id")),
        "brand_name": body.get("brand_name", base.get("brand_name", "")),
        "product_code": body.get("product_code", base.get("product_code", "")),
        "sku": body.get("sku", base.get("sku", "")),
        "category_id": body.get("category_id", base.get("category_id")),
        "subcategory_id": body.get("subcategory_id", base.get("subcategory_id")),
        "image": body.get("image", base.get("image", "")),
        "images": body.get("images", base.get("images", [])),
        "short_description": body.get("short_description", base.get("short_description", "")),
        "full_description": body.get("full_description", base.get("full_description", "")),
        "composition": body.get("composition", base.get("composition", "")),
        "indications": body.get("indications", base.get("indications", "")),
        "dosage": body.get("dosage", base.get("dosage", "")),
        "benefits": body.get("benefits", base.get("benefits", "")),
        "precautions": body.get("precautions", base.get("precautions", "")),
        "storage": body.get("storage", base.get("storage", "")),
        "additional_info": body.get("additional_info", base.get("additional_info", "")),
        "badges": body.get("badges", base.get("badges", {})),
        "brochure_url": body.get("brochure_url", base.get("brochure_url", "")),
        "visual_aid_url": body.get("visual_aid_url", base.get("visual_aid_url", "")),
        "related_product_ids": body.get("related_product_ids", base.get("related_product_ids", [])),
        "variants": variants,
        "seo": body.get("seo", base.get("seo", {})),
        "active": body.get("active", base.get("active", True)),
        "order": body.get("order", base.get("order", 0)),
    }


async def enrich_products(products, customer_type=None):
    for p in products:
        for v in p.get("variants", []):
            schemes = await applicable_schemes(db, v["id"], p["id"], customer_type)
            v["active_schemes"] = [{"id": s["id"], "name": s.get("name"),
                                    "type": s.get("scheme_type"),
                                    "buy": s.get("buy_quantity"), "free": s.get("free_quantity"),
                                    "special_price": s.get("special_price"),
                                    "min": s.get("min_quantity")} for s in schemes]
    return products


@router.get("/products")
async def public_products(
    q: Optional[str] = None, category: Optional[str] = None, subcategory: Optional[str] = None,
    brand: Optional[str] = None, availability: Optional[str] = None, badge: Optional[str] = None,
    page: int = 1, limit: int = 12,
):
    query = {"active": True}
    if category:
        cat = await db.categories.find_one({"slug": category}) or {"id": category}
        query["category_id"] = cat["id"]
    if subcategory:
        sc = await db.categories.find_one({"slug": subcategory}) or {"id": subcategory}
        query["subcategory_id"] = sc["id"]
    if brand:
        query["brand_id"] = brand
    if badge:
        query[f"badges.{badge}"] = True
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"brand_name": rx}, {"product_code": rx},
                        {"sku": rx}, {"composition": rx}]
    res = await paginate(db.products, query, page, limit, sort_field="order", sort_dir=1)
    res["items"] = await enrich_products(res["items"])
    if availability:
        for p in res["items"]:
            p["variants"] = [v for v in p.get("variants", []) if v.get("stock_status") == availability]
    return res


@router.get("/search")
async def search(q: str = Query(...), limit: int = 8):
    rx = {"$regex": re.escape(q), "$options": "i"}
    query = {"active": True, "$or": [{"name": rx}, {"brand_name": rx}, {"product_code": rx},
                                     {"sku": rx}, {"composition": rx}]}
    items = await db.products.find(query, {"_id": 0}).limit(limit).to_list(limit)
    results = []
    for p in items:
        v0 = (p.get("variants") or [{}])[0]
        results.append({
            "id": p["id"], "name": p["name"], "slug": p.get("slug"),
            "brand_name": p.get("brand_name", ""), "image": p.get("image", ""),
            "pack_size": f"{v0.get('pack_size','')} {v0.get('unit','')}".strip(),
            "stock_status": v0.get("stock_status", "in_stock"),
        })
    return {"results": results}


@router.get("/products/{slug}")
async def public_product(slug: str, customer=Depends(optional_customer)):
    p = await db.products.find_one({"slug": slug, "active": True}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    ct = (customer or {}).get("category")
    await enrich_products([p], ct)
    related = []
    for rid in p.get("related_product_ids", []):
        rp = await db.products.find_one({"id": rid, "active": True}, {"_id": 0})
        if rp:
            related.append(rp)
    p["related"] = related
    return p


@router.get("/admin/products")
async def admin_products(q: Optional[str] = None, category: Optional[str] = None,
                         page: int = 1, limit: int = 20, admin=Depends(require_module("products"))):
    query = {}
    if category:
        query["category_id"] = category
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"product_code": rx}, {"sku": rx}]
    return await paginate(db.products, query, page, limit, sort_field="order", sort_dir=1)


@router.get("/admin/products/{pid}")
async def admin_product(pid: str, admin=Depends(require_module("products"))):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    return p


@router.post("/admin/products")
async def create_product(body: dict = Body(...), admin=Depends(require_module("products"))):
    doc = build_product(body)
    doc["id"] = new_id()
    doc["slug"] = await unique_slug(db.products, slugify(body.get("slug") or doc["name"]))
    doc["is_demo"] = body.get("is_demo", False)
    doc["created_at"] = now_iso()
    await db.products.insert_one(dict(doc))
    await log_audit(db, admin, "create", "product", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return doc


@router.put("/admin/products/{pid}")
async def update_product(pid: str, body: dict = Body(...), admin=Depends(require_module("products"))):
    existing = await db.products.find_one({"id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    doc = build_product(body, existing)
    if body.get("slug"):
        doc["slug"] = await unique_slug(db.products, slugify(body["slug"]), exclude_id=pid)
    await db.products.update_one({"id": pid}, {"$set": doc})
    await log_audit(db, admin, "update", "product", pid, {"name": doc["name"]})
    return await db.products.find_one({"id": pid}, {"_id": 0})


@router.delete("/admin/products/{pid}")
async def delete_product(pid: str, admin=Depends(require_module("products"))):
    await db.products.delete_one({"id": pid})
    await log_audit(db, admin, "delete", "product", pid)
    return {"deleted": True}


# =============== SCHEMES ===============
@router.get("/admin/schemes")
async def admin_schemes(admin=Depends(require_module("schemes"))):
    return await db.schemes.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/admin/schemes")
async def create_scheme(body: dict = Body(...), admin=Depends(require_module("schemes"))):
    doc = {
        "id": new_id(),
        "name": body.get("name", "Scheme"),
        "scheme_type": body.get("scheme_type", "free_qty"),
        "product_id": body.get("product_id"),
        "variant_id": body.get("variant_id"),
        "buy_quantity": body.get("buy_quantity"),
        "free_quantity": body.get("free_quantity"),
        "special_price": body.get("special_price"),
        "min_quantity": body.get("min_quantity"),
        "max_quantity": body.get("max_quantity"),
        "customer_type": body.get("customer_type", "all"),
        "start_date": body.get("start_date"),
        "end_date": body.get("end_date"),
        "active": body.get("active", True),
        "is_demo": body.get("is_demo", False),
        "created_at": now_iso(),
    }
    await db.schemes.insert_one(dict(doc))
    await log_audit(db, admin, "create", "scheme", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return doc


@router.put("/admin/schemes/{sid}")
async def update_scheme(sid: str, body: dict = Body(...), admin=Depends(require_module("schemes"))):
    body.pop("id", None); body.pop("_id", None)
    await db.schemes.update_one({"id": sid}, {"$set": body})
    await log_audit(db, admin, "update", "scheme", sid)
    return await db.schemes.find_one({"id": sid}, {"_id": 0})


@router.delete("/admin/schemes/{sid}")
async def delete_scheme(sid: str, admin=Depends(require_module("schemes"))):
    await db.schemes.delete_one({"id": sid})
    return {"deleted": True}
