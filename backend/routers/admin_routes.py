from fastapi import APIRouter, HTTPException, Depends, Body, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from collections import Counter

from db import db, paginate
from security import (require_module, get_current_admin, hash_password,
                      ROLE_MODULES, ROLE_LABELS)
from helpers import new_id, now_iso, log_audit

router = APIRouter(prefix="/api/admin", tags=["admin"])


# =============== DASHBOARD ===============
@router.get("/dashboard")
async def dashboard(admin=Depends(get_current_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    by_status = Counter(o["status"] for o in all_orders)
    today_orders = [o for o in all_orders if o["created_at"][:10] == today]

    # sales value (internal) using unit_price * qty
    def order_value(o):
        return sum((l.get("unit_price") or 0) * l.get("qty", 0) for l in o.get("items", []))
    sales_value = sum(order_value(o) for o in all_orders)

    # top products
    prod_counter = Counter()
    for o in all_orders:
        for l in o.get("items", []):
            prod_counter[l["product_name"]] += l.get("qty", 0)
    top_products = [{"name": n, "qty": q} for n, q in prod_counter.most_common(5)]

    # top customers
    cust_counter = Counter()
    for o in all_orders:
        cust_counter[o.get("customer_name", "?")] += 1
    top_customers = [{"name": n, "orders": c} for n, c in cust_counter.most_common(5)]

    # category performance
    cats = await db.categories.find({}, {"_id": 0}).to_list(200)
    catmap = {c["id"]: c["name"] for c in cats}
    cat_counter = Counter()
    for o in all_orders:
        for l in o.get("items", []):
            p = await db.products.find_one({"id": l["product_id"]}, {"_id": 0, "category_id": 1})
            if p:
                cat_counter[catmap.get(p.get("category_id"), "Other")] += l.get("qty", 0)
    category_performance = [{"name": n, "qty": q} for n, q in cat_counter.most_common()]

    total_customers = await db.customers.count_documents({})
    thirty_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    new_customers = await db.customers.count_documents({"created_at": {"$gte": thirty_ago}})
    repeat_customers = sum(1 for n, c in cust_counter.items() if c > 1)

    # 7-day trend
    trend = []
    for i in range(6, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
        cnt = sum(1 for o in all_orders if o["created_at"][:10] == d)
        trend.append({"date": d[5:], "orders": cnt})

    return {
        "status_counts": {
            "new": by_status.get("new", 0), "confirmed": by_status.get("confirmed", 0),
            "processing": by_status.get("processing", 0),
            "ready_to_dispatch": by_status.get("ready_to_dispatch", 0),
            "dispatched": by_status.get("dispatched", 0),
            "delivered": by_status.get("delivered", 0),
            "cancelled": by_status.get("cancelled", 0),
        },
        "today_orders": len(today_orders),
        "total_orders": len(all_orders),
        "sales_value": round(sales_value, 2),
        "total_customers": total_customers,
        "new_customers": new_customers,
        "repeat_customers": repeat_customers,
        "top_products": top_products,
        "top_customers": top_customers,
        "category_performance": category_performance,
        "trend": trend,
    }


# =============== CUSTOMERS ===============
@router.get("/customers")
async def list_customers(category: Optional[str] = None, q: Optional[str] = None,
                         page: int = 1, limit: int = 20, admin=Depends(require_module("customers"))):
    query = {}
    if category:
        query["category"] = category
    if q:
        import re
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"mobile": rx}, {"company_name": rx}]
    res = await paginate(db.customers, query, page, limit)
    for c in res["items"]:
        c["order_count"] = await db.orders.count_documents({"customer_id": c["id"]})
    return res


@router.get("/customers/{cid}")
async def get_customer(cid: str, admin=Depends(require_module("customers"))):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not cust:
        raise HTTPException(status_code=404, detail="Not found")
    orders = await db.orders.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    cust["orders"] = orders
    prod_counter = Counter()
    for o in orders:
        for l in o.get("items", []):
            prod_counter[l["product_name"]] += l.get("qty", 0)
    cust["frequent_products"] = [{"name": n, "qty": q} for n, q in prod_counter.most_common(5)]
    return cust


@router.put("/customers/{cid}")
async def update_customer(cid: str, body: dict = Body(...), admin=Depends(require_module("customers"))):
    body.pop("id", None); body.pop("_id", None); body.pop("orders", None)
    await db.customers.update_one({"id": cid}, {"$set": body})
    await log_audit(db, admin, "update", "customer", cid)
    return await db.customers.find_one({"id": cid}, {"_id": 0})


# =============== ADMIN USERS ===============
@router.get("/roles")
async def roles(admin=Depends(get_current_admin)):
    return [{"value": k, "label": ROLE_LABELS[k], "modules": v} for k, v in ROLE_MODULES.items()]


@router.get("/users")
async def list_admins(admin=Depends(require_module("*"))):
    users = await db.admin_users.find({}, {"_id": 0, "password_hash": 0}).to_list(200)
    return users


@router.post("/users")
async def create_admin(body: dict = Body(...), admin=Depends(require_module("*"))):
    email = body.get("email", "").lower().strip()
    if await db.admin_users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {"id": new_id(), "name": body.get("name", ""), "email": email,
           "password_hash": hash_password(body.get("password", "changeme123")),
           "role": body.get("role", "order_manager"),
           "permissions": body.get("permissions"),
           "active": body.get("active", True), "created_at": now_iso()}
    await db.admin_users.insert_one(dict(doc))
    await log_audit(db, admin, "create", "admin_user", doc["id"], {"email": email})
    doc.pop("_id", None); doc.pop("password_hash", None)
    return doc


@router.put("/users/{uid}")
async def update_admin(uid: str, body: dict = Body(...), admin=Depends(require_module("*"))):
    body.pop("id", None); body.pop("_id", None)
    if body.get("password"):
        body["password_hash"] = hash_password(body.pop("password"))
    else:
        body.pop("password", None)
    if body.get("email"):
        body["email"] = body["email"].lower().strip()
    await db.admin_users.update_one({"id": uid}, {"$set": body})
    await log_audit(db, admin, "update", "admin_user", uid)
    u = await db.admin_users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return u


@router.delete("/users/{uid}")
async def delete_admin(uid: str, admin=Depends(require_module("*"))):
    target = await db.admin_users.find_one({"id": uid})
    if target and target.get("role") == "super_admin":
        cnt = await db.admin_users.count_documents({"role": "super_admin"})
        if cnt <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last Super Admin")
    await db.admin_users.delete_one({"id": uid})
    return {"deleted": True}


# =============== AUDIT LOGS ===============
@router.get("/audit-logs")
async def audit_logs(page: int = 1, limit: int = 30, admin=Depends(require_module("*"))):
    return await paginate(db.audit_logs, {}, page, limit)


# =============== NOTIFICATION LOGS ===============
@router.get("/notifications")
async def notifications(channel: Optional[str] = None, page: int = 1, limit: int = 30,
                        admin=Depends(get_current_admin)):
    query = {}
    if channel:
        query["channel"] = channel
    return await paginate(db.notification_logs, query, page, limit)


# =============== REPORTS ===============
@router.get("/reports/summary")
async def reports_summary(admin=Depends(require_module("reports"))):
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    total_value = sum(sum((l.get("unit_price") or 0) * l.get("qty", 0) for l in o.get("items", [])) for o in orders)
    reorder_counter = Counter()
    for o in orders:
        for l in o.get("items", []):
            reorder_counter[l["product_name"]] += 1
    return {
        "total_orders": len(orders),
        "total_value": round(total_value, 2),
        "most_reordered": [{"name": n, "count": c} for n, c in reorder_counter.most_common(10)],
    }
