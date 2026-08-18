from fastapi import APIRouter, HTTPException, Depends, Body, Query
from pydantic import BaseModel
from typing import Optional, List

from db import db, paginate
from security import get_current_customer, optional_customer, require_module, get_current_admin
from helpers import (new_id, now_iso, next_order_number, log_audit, add_order_activity,
                     applicable_schemes, compute_scheme, send_whatsapp, send_email)

router = APIRouter(prefix="/api", tags=["orders"])

STATUS_FLOW = ["new", "confirmed", "processing", "ready_to_dispatch", "dispatched", "delivered"]
STATUS_LABELS = {
    "new": "New", "confirmed": "Confirmed", "processing": "Processing",
    "ready_to_dispatch": "Ready to Dispatch", "dispatched": "Dispatched",
    "delivered": "Delivered", "cancelled": "Cancelled",
}


async def resolve_cart(items, customer_type=None):
    """items: [{variant_id, qty}] -> detailed line items with scheme calc."""
    lines = []
    for it in items:
        vid = it.get("variant_id")
        qty = int(it.get("qty", 0))
        if qty <= 0:
            continue
        product = await db.products.find_one({"variants.id": vid}, {"_id": 0})
        if not product:
            continue
        variant = next((v for v in product.get("variants", []) if v["id"] == vid), None)
        if not variant:
            continue
        schemes = await applicable_schemes(db, vid, product["id"], customer_type)
        sc = compute_scheme(qty, schemes)
        unit_price = sc["special_price"] if sc["special_price"] is not None else variant.get("selling_price")
        free_qty = sc["free_qty"]
        lines.append({
            "product_id": product["id"],
            "product_name": product["name"],
            "brand_name": product.get("brand_name", ""),
            "image": product.get("image", ""),
            "slug": product.get("slug"),
            "variant_id": vid,
            "pack_size": variant.get("pack_size", ""),
            "unit": variant.get("unit", ""),
            "units_per_case": variant.get("units_per_case") or 0,
            "sku": variant.get("sku", ""),
            "mrp": variant.get("mrp"),
            "selling_price": variant.get("selling_price"),
            "unit_price": unit_price,
            "gst_percent": variant.get("gst_percent", 0),
            "gst_inclusive": variant.get("gst_inclusive", True),
            "stock_status": variant.get("stock_status", "in_stock"),
            "qty": qty,
            "scheme_id": sc["scheme_id"],
            "scheme_label": sc["scheme_label"],
            "free_qty": free_qty,
            "dispatch_qty": qty + free_qty,
        })
    return lines


class CartItem(BaseModel):
    variant_id: str
    qty: int


class CartCalc(BaseModel):
    items: List[CartItem]


@router.post("/cart/calculate")
async def cart_calculate(body: CartCalc, customer=Depends(optional_customer)):
    ct = (customer or {}).get("category")
    lines = await resolve_cart([i.model_dump() for i in body.items], ct)
    total_qty = sum(l["qty"] for l in lines)
    total_free = sum(l["free_qty"] for l in lines)
    return {"items": lines, "total_qty": total_qty, "total_free": total_free,
            "total_dispatch": total_qty + total_free, "line_count": len(lines)}


class Address(BaseModel):
    line1: str
    line2: Optional[str] = ""
    line3: Optional[str] = ""
    pincode: str
    state: str
    district: str


class CheckoutBody(BaseModel):
    items: List[CartItem]
    # customer profile (for first-time registration)
    prefix: Optional[str] = "Mr."
    name: Optional[str] = None
    mobile: str
    whatsapp: Optional[str] = None
    company_name: Optional[str] = ""
    category: Optional[str] = "other"
    address: Address
    save_address: Optional[bool] = True
    notes: Optional[str] = ""


async def get_or_create_customer(body: CheckoutBody):
    mobile = body.mobile.strip()
    otp = await db.otps.find_one({"mobile": mobile})
    if not otp or not otp.get("verified"):
        raise HTTPException(status_code=403, detail="Mobile number not verified via OTP")
    cust = await db.customers.find_one({"mobile": mobile})
    addr = body.address.model_dump()
    addr["id"] = new_id()
    if cust:
        update = {}
        if body.save_address:
            addresses = cust.get("addresses", [])
            addresses.insert(0, addr)
            update["addresses"] = addresses[:10]
            update["default_address"] = addr
        if update:
            await db.customers.update_one({"id": cust["id"]}, {"$set": update})
            cust.update(update)
        return cust, addr
    doc = {
        "id": new_id(),
        "prefix": body.prefix or "Mr.",
        "name": body.name or "Customer",
        "mobile": mobile,
        "whatsapp": body.whatsapp or mobile,
        "company_name": body.company_name or "",
        "category": body.category or "other",
        "addresses": [addr],
        "default_address": addr,
        "active": True,
        "created_at": now_iso(),
    }
    await db.customers.insert_one(dict(doc))
    await send_email(db, "admin", "New Customer Registration",
                     f"New customer {doc['name']} ({mobile}) registered.", kind="customer_registration")
    doc.pop("_id", None)
    return doc, addr


@router.post("/orders")
async def create_order(body: CheckoutBody):
    cust, addr = await get_or_create_customer(body)
    lines = await resolve_cart([i.model_dump() for i in body.items], cust.get("category"))
    if not lines:
        raise HTTPException(status_code=400, detail="Cart is empty")
    order_no = await next_order_number(db)
    total_qty = sum(l["qty"] for l in lines)
    total_free = sum(l["free_qty"] for l in lines)
    order = {
        "id": new_id(),
        "order_number": order_no,
        "customer_id": cust["id"],
        "customer_name": cust["name"],
        "customer_mobile": cust["mobile"],
        "customer_whatsapp": cust.get("whatsapp", cust["mobile"]),
        "company_name": cust.get("company_name", ""),
        "customer_category": cust.get("category", "other"),
        "address": addr,
        "items": lines,
        "total_qty": total_qty,
        "total_free": total_free,
        "total_dispatch": total_qty + total_free,
        "status": "new",
        "notes": body.notes or "",
        "internal_notes": "",
        "activity": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    add_order_activity(order, f"Order created ({len(lines)} products, qty {total_qty})", cust["name"])
    await db.orders.insert_one(dict(order))

    # Notifications
    prod_lines = "\n".join([f"- {l['product_name']} {l['pack_size']} {l['unit']} — {l['qty']}"
                            + (f" + {l['free_qty']} FREE" if l['free_qty'] else "") for l in lines])
    cust_msg = (f"Dear {cust['name']}, your VETMECH order {order_no} has been RECEIVED.\n\n{prod_lines}\n\n"
                f"Our team will confirm shortly. Thank you!")
    await send_whatsapp(db, cust.get("whatsapp", cust["mobile"]), cust_msg, kind="order_received")

    settings = await db.settings.find_one({"id": "whatsapp"}, {"_id": 0}) or {}
    admin_numbers = settings.get("admin_numbers", [])
    admin_msg = (f"NEW ORDER {order_no}\nCustomer: {cust['name']} ({cust.get('company_name','')})\n"
                 f"Products: {len(lines)}\nOrdered Qty: {total_qty}\nFree Qty: {total_free}\nStatus: NEW")
    for num in admin_numbers:
        await send_whatsapp(db, num, admin_msg, kind="admin_new_order")
    await send_email(db, "admin", f"New Order {order_no}", admin_msg, kind="new_order")

    order.pop("_id", None)
    return order


@router.get("/orders/mine")
async def my_orders(customer=Depends(get_current_customer)):
    orders = await db.orders.find({"customer_id": customer["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return orders


@router.get("/orders/last")
async def last_order(customer=Depends(get_current_customer)):
    order = await db.orders.find_one({"customer_id": customer["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    return order or {}


@router.get("/orders/{oid}")
async def get_order(oid: str, customer=Depends(get_current_customer)):
    order = await db.orders.find_one({"id": oid, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/orders/{oid}/reorder")
async def reorder(oid: str, customer=Depends(get_current_customer)):
    order = await db.orders.find_one({"id": oid, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    items = [{"variant_id": l["variant_id"], "qty": l["qty"]} for l in order.get("items", [])]
    lines = await resolve_cart(items, customer.get("category"))
    return {"items": lines}


# =============== ADMIN ORDERS ===============
@router.get("/admin/orders")
async def admin_orders(status: Optional[str] = None, q: Optional[str] = None,
                       customer_category: Optional[str] = None,
                       date_from: Optional[str] = None, date_to: Optional[str] = None,
                       page: int = 1, limit: int = 20, admin=Depends(require_module("orders"))):
    query = {}
    if status:
        query["status"] = status
    if customer_category:
        query["customer_category"] = customer_category
    if q:
        import re as _re
        rx = {"$regex": _re.escape(q), "$options": "i"}
        query["$or"] = [{"order_number": rx}, {"customer_name": rx}, {"customer_mobile": rx}]
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        query["created_at"] = rng
    return await paginate(db.orders, query, page, limit)


@router.get("/admin/orders/{oid}")
async def admin_order(oid: str, admin=Depends(require_module("orders"))):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Not found")
    return order


@router.patch("/admin/orders/{oid}/status")
async def update_status(oid: str, body: dict = Body(...), admin=Depends(require_module("orders"))):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(status_code=404, detail="Not found")
    new_status = body.get("status")
    if new_status not in STATUS_LABELS:
        raise HTTPException(status_code=400, detail="Invalid status")
    add_order_activity(order, f"Status changed {STATUS_LABELS.get(order['status'])} → {STATUS_LABELS[new_status]}", admin["name"])
    await db.orders.update_one({"id": oid}, {"$set": {"status": new_status, "updated_at": now_iso(), "activity": order["activity"]}})
    # WhatsApp status notification
    tmpls = (await db.settings.find_one({"id": "whatsapp"}, {"_id": 0}) or {}).get("status_templates", {})
    default = f"Update: Your VETMECH order {order['order_number']} is now {STATUS_LABELS[new_status].upper()}."
    msg = tmpls.get(new_status, default).replace("{order}", order["order_number"]).replace("{name}", order["customer_name"])
    await send_whatsapp(db, order.get("customer_whatsapp", order["customer_mobile"]), msg, kind=f"status_{new_status}")
    await log_audit(db, admin, "status_change", "order", oid, {"status": new_status})
    return await db.orders.find_one({"id": oid}, {"_id": 0})


@router.put("/admin/orders/{oid}")
async def edit_order(oid: str, body: dict = Body(...), admin=Depends(require_module("orders"))):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(status_code=404, detail="Not found")
    updates = {"updated_at": now_iso()}
    if "items" in body:
        items = [{"variant_id": i["variant_id"], "qty": i["qty"]} for i in body["items"]]
        lines = await resolve_cart(items, order.get("customer_category"))
        updates["items"] = lines
        updates["total_qty"] = sum(l["qty"] for l in lines)
        updates["total_free"] = sum(l["free_qty"] for l in lines)
        updates["total_dispatch"] = updates["total_qty"] + updates["total_free"]
        add_order_activity(order, "Admin edited order items", admin["name"])
    if "address" in body:
        updates["address"] = body["address"]
        add_order_activity(order, "Admin changed delivery address", admin["name"])
    if "internal_notes" in body:
        updates["internal_notes"] = body["internal_notes"]
    updates["activity"] = order["activity"]
    await db.orders.update_one({"id": oid}, {"$set": updates})
    await log_audit(db, admin, "edit", "order", oid)
    return await db.orders.find_one({"id": oid}, {"_id": 0})
