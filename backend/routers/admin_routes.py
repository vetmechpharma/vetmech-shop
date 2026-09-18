from fastapi import APIRouter, HTTPException, Depends, Body, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from collections import Counter

from db import db, paginate
from security import (require_module, get_current_admin, hash_password,
                      ROLE_MODULES, ROLE_LABELS, customer_status_label, resolved_status)
from helpers import new_id, now_iso, log_audit, normalize_mobile, send_whatsapp, send_email

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
    pending_customers = await db.customers.count_documents({"status": "pending"})
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
        "pending_customers": pending_customers,
        "new_customers": new_customers,
        "repeat_customers": repeat_customers,
        "top_products": top_products,
        "top_customers": top_customers,
        "category_performance": category_performance,
        "trend": trend,
    }


# =============== CUSTOMERS ===============
@router.get("/customers")
async def list_customers(category: Optional[str] = None, status: Optional[str] = None,
                         q: Optional[str] = None,
                         page: int = 1, limit: int = 20, admin=Depends(require_module("customers"))):
    query = {}
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    if q:
        import re
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"mobile": rx}, {"company_name": rx}, {"email": rx}]
    res = await paginate(db.customers, query, page, limit)
    for c in res["items"]:
        c.pop("password_hash", None)
        c["status"] = resolved_status(c)
        c["status_label"] = customer_status_label(c["status"])
        c["order_count"] = await db.orders.count_documents({"customer_id": c["id"]})
    return res


@router.get("/customers-pending-count")
async def pending_count(admin=Depends(require_module("customers"))):
    return {"count": await db.customers.count_documents({"status": "pending"})}


@router.get("/customers/{cid}")
async def get_customer(cid: str, admin=Depends(require_module("customers"))):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0, "password_hash": 0})
    if not cust:
        raise HTTPException(status_code=404, detail="Not found")
    cust["status"] = resolved_status(cust)
    cust["status_label"] = customer_status_label(cust["status"])
    orders = await db.orders.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    cust["orders"] = orders
    prod_counter = Counter()
    for o in orders:
        for l in o.get("items", []):
            prod_counter[l["product_name"]] += l.get("qty", 0)
    cust["frequent_products"] = [{"name": n, "qty": q} for n, q in prod_counter.most_common(5)]
    return cust


@router.post("/customers")
async def create_customer(body: dict = Body(...), admin=Depends(require_module("customers"))):
    mobile = normalize_mobile(body.get("mobile", ""))
    if len(mobile) != 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number")
    dup = await db.customers.find_one({"$or": [{"normalized_mobile": mobile}, {"mobile": {"$regex": mobile + "$"}}]})
    if dup:
        raise HTTPException(status_code=409, detail="A customer already exists with this mobile number.")
    doc = {
        "id": new_id(), "prefix": body.get("prefix", "Mr."), "name": (body.get("name") or "Customer").strip(),
        "mobile": mobile, "normalized_mobile": mobile,
        "whatsapp": normalize_mobile(body.get("whatsapp")) or mobile,
        "email": (body.get("email") or "").lower().strip(), "company_name": body.get("company_name", ""),
        "address": body.get("address", ""), "pincode": body.get("pincode", ""),
        "district": body.get("district", ""), "state": body.get("state", ""),
        "category": body.get("category", "other"), "status": body.get("status", "active"),
        "active": True, "price_protected": bool(body.get("price_protected", False)),
        "addresses": [], "created_at": now_iso(), "source": "admin_created",
    }
    if body.get("password"):
        doc["password_hash"] = hash_password(body["password"])
    await db.customers.insert_one(dict(doc))
    await log_audit(db, admin, "create", "customer", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None); doc.pop("password_hash", None)
    return doc


@router.put("/customers/{cid}")
async def update_customer(cid: str, body: dict = Body(...), admin=Depends(require_module("customers"))):
    for k in ("id", "_id", "orders", "password_hash", "status_label", "frequent_products", "order_count"):
        body.pop(k, None)
    if body.get("mobile"):
        nm = normalize_mobile(body["mobile"])
        body["normalized_mobile"] = nm
        dup = await db.customers.find_one({"id": {"$ne": cid},
                                           "$or": [{"normalized_mobile": nm}, {"mobile": {"$regex": nm + "$"}}]})
        if dup:
            raise HTTPException(status_code=409, detail="Another customer already uses this mobile number.")
    await db.customers.update_one({"id": cid}, {"$set": body})
    await log_audit(db, admin, "update", "customer", cid)
    return await db.customers.find_one({"id": cid}, {"_id": 0, "password_hash": 0})


async def _set_status(cid, status, admin, notify=None):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not cust:
        raise HTTPException(status_code=404, detail="Not found")
    await db.customers.update_one({"id": cid}, {"$set": {"status": status, "active": status == "active"}})
    await log_audit(db, admin, "status_change", "customer", cid, {"status": status})
    if notify and cust.get("whatsapp"):
        await send_whatsapp(db, cust.get("whatsapp") or cust.get("mobile"), notify, kind=f"customer_{status}")
    out = await db.customers.find_one({"id": cid}, {"_id": 0, "password_hash": 0})
    out["status_label"] = customer_status_label(status)
    return out


@router.post("/customers/{cid}/approve")
async def approve_customer(cid: str, admin=Depends(require_module("customers"))):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0})
    msg = (f"Dear {cust.get('name','Customer')}, your VETMECH account has been APPROVED. "
           f"You can now log in to view your special pricing.") if cust else None
    return await _set_status(cid, "active", admin, notify=msg)


@router.post("/customers/{cid}/reject")
async def reject_customer(cid: str, admin=Depends(require_module("customers"))):
    return await _set_status(cid, "rejected", admin)


@router.post("/customers/{cid}/suspend")
async def suspend_customer(cid: str, admin=Depends(require_module("customers"))):
    return await _set_status(cid, "suspended", admin)


@router.post("/customers/{cid}/reactivate")
async def reactivate_customer(cid: str, admin=Depends(require_module("customers"))):
    return await _set_status(cid, "active", admin)


@router.delete("/customers/{cid}")
async def delete_customer(cid: str, hard: bool = False, admin=Depends(require_module("customers"))):
    if hard:
        res = await db.customers.delete_one({"id": cid})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        await log_audit(db, admin, "delete", "customer", cid)
        return {"deleted": True}
    return await _set_status(cid, "deleted", admin)


@router.post("/customers/{cid}/reset-password")
async def reset_customer_password(cid: str, body: dict = Body(...), admin=Depends(require_module("customers"))):
    pwd = body.get("password")
    if not pwd or len(pwd) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    res = await db.customers.update_one({"id": cid}, {"$set": {"password_hash": hash_password(pwd)}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await log_audit(db, admin, "reset_password", "customer", cid)
    return {"ok": True}


@router.post("/customers/{cid}/change-category")
async def change_category(cid: str, body: dict = Body(...), admin=Depends(require_module("customers"))):
    cat = body.get("category")
    if not cat:
        raise HTTPException(status_code=400, detail="Category required")
    cust = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not cust:
        raise HTTPException(status_code=404, detail="Not found")
    await db.customers.update_one({"id": cid}, {"$set": {"category": cat}})
    await log_audit(db, admin, "change_category", "customer", cid,
                    {"from": cust.get("category"), "to": cat})
    return await db.customers.find_one({"id": cid}, {"_id": 0, "password_hash": 0})


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


# =============== CUSTOMER REPORTS ===============
@router.get("/reports/customers")
async def customer_reports(date_from: Optional[str] = None, date_to: Optional[str] = None,
                           customer_type: Optional[str] = None, days: int = 90,
                           admin=Depends(require_module("reports"))):
    oq = {}
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        oq["created_at"] = rng
    orders = await db.orders.find(oq, {"_id": 0, "customer_id": 1, "customer_name": 1, "customer_mobile": 1,
                                       "customer_category": 1, "company_name": 1, "created_at": 1,
                                       "items": 1, "address": 1}).to_list(100000)
    customers = await db.customers.find({}, {"_id": 0}).to_list(100000)
    now = datetime.now(timezone.utc)

    def oval(o):
        return sum((i.get("unit_price") or 0) * (i.get("qty") or 0) for i in o.get("items", []))

    def dsince(iso):
        try:
            return (now - datetime.fromisoformat(str(iso).replace("Z", "+00:00"))).days
        except Exception:
            return None

    agg, geo = {}, {"state": {}, "district": {}, "taluk": {}}
    for o in orders:
        cid = o.get("customer_id") or o.get("customer_mobile")
        if not cid:
            continue
        val, ca = oval(o), o.get("created_at")
        a = agg.get(cid)
        if not a:
            a = agg[cid] = {"customer_id": o.get("customer_id"), "name": o.get("customer_name"),
                            "mobile": o.get("customer_mobile"), "category": o.get("customer_category"),
                            "company": o.get("company_name") or "", "orders": 0, "revenue": 0.0,
                            "first": None, "last": None}
        a["orders"] += 1
        a["revenue"] += val
        if ca:
            if not a["first"] or ca < a["first"]:
                a["first"] = ca
            if not a["last"] or ca > a["last"]:
                a["last"] = ca
        addr = o.get("address") or {}
        for lvl, key in (("state", addr.get("state")), ("district", addr.get("district")),
                         ("taluk", addr.get("taluk") or addr.get("line3"))):
            if key:
                g = geo[lvl].get(key)
                if not g:
                    g = geo[lvl][key] = {"customers": set(), "orders": 0, "revenue": 0.0}
                g["customers"].add(cid)
                g["orders"] += 1
                g["revenue"] += val

    rows = [r for r in agg.values() if (not customer_type or r["category"] == customer_type)]
    for r in rows:
        r["revenue"] = round(r["revenue"], 2)
        r["aov"] = round(r["revenue"] / r["orders"], 2) if r["orders"] else 0
        r["recency_days"] = dsince(r["last"]) if r["last"] else None
        r["repeat"] = r["orders"] > 1
        fd, ld = dsince(r["first"]), r["recency_days"]
        span = (fd - ld) if (fd is not None and ld is not None) else 0
        r["frequency_per_month"] = round(r["orders"] / max(span / 30.0, 1), 2)

    ctf = [c for c in customers if (not customer_type or c.get("category") == customer_type)]

    def is_active(c):
        st = c.get("status") or ("active" if c.get("active", True) else "suspended")
        return st == "active"

    last_by = {r["customer_id"]: r for r in rows if r["customer_id"]}

    def clight(c):
        lr = last_by.get(c["id"])
        return {"customer_id": c["id"], "name": c.get("name"), "mobile": c.get("mobile"),
                "category": c.get("category"), "company": c.get("company_name") or "",
                "orders": lr["orders"] if lr else 0, "revenue": lr["revenue"] if lr else 0,
                "recency_days": lr["recency_days"] if lr else None, "last_order": lr["last"] if lr else None}

    active = [clight(c) for c in ctf if is_active(c)]
    inactive = [clight(c) for c in ctf if not is_active(c)]
    no_recent = [clight(c) for c in ctf if (last_by.get(c["id"]) is None or (last_by[c["id"]]["recency_days"] or 999999) > days)]

    def geo_list(d):
        return sorted([{"name": k, "customers": len(v["customers"]), "orders": v["orders"],
                        "revenue": round(v["revenue"], 2)} for k, v in d.items()], key=lambda x: -x["revenue"])

    total_orders = len(orders)
    total_revenue = round(sum(r["revenue"] for r in rows), 2)
    ncust = len(rows) or 1
    summary = {
        "total_customers": len(ctf), "customers_with_orders": len(rows),
        "active_customers": len(active), "inactive_customers": len(inactive),
        "total_orders": total_orders, "total_revenue": total_revenue,
        "aov": round(total_revenue / total_orders, 2) if total_orders else 0,
        "avg_frequency": round(total_orders / ncust, 2),
        "clv": round(total_revenue / ncust, 2),
        "repeat_customers": sum(1 for r in rows if r["repeat"]),
        "first_time_customers": sum(1 for r in rows if r["orders"] == 1),
        "no_orders_days": days, "no_orders_count": len(no_recent),
    }
    by_rev = sorted(rows, key=lambda x: -x["revenue"])
    return {
        "summary": summary, "customers": by_rev, "top_customers": by_rev[:10],
        "repeat_customers": [r for r in by_rev if r["repeat"]],
        "first_time_customers": [r for r in by_rev if r["orders"] == 1],
        "active_customers": active, "inactive_customers": inactive,
        "no_recent": sorted(no_recent, key=lambda x: (x["recency_days"] or 0), reverse=True),
        "geo_state": geo_list(geo["state"]), "geo_district": geo_list(geo["district"]), "geo_taluk": geo_list(geo["taluk"]),
    }
