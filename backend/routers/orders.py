from fastapi import APIRouter, HTTPException, Depends, Body, Query, BackgroundTasks, Header
from pydantic import BaseModel
from typing import Optional, List

from db import db, paginate
from security import get_current_customer, optional_customer, require_module, get_current_admin
from helpers import (new_id, now_iso, next_order_number, log_audit, add_order_activity,
                     send_whatsapp, send_email, email_for)
from pricing_engine import price_line, get_pricing_settings

router = APIRouter(prefix="/api", tags=["orders"])

STATUS_FLOW = ["new", "confirmed", "processing", "ready_to_dispatch", "dispatched", "delivered"]
STATUS_LABELS = {
    "new": "New", "confirmed": "Confirmed", "processing": "Processing",
    "ready_to_dispatch": "Ready to Dispatch", "dispatched": "Dispatched",
    "delivered": "Delivered", "cancelled": "Cancelled", "on_hold": "On Hold",
}
STATUS_TEMPLATE_KEY = {
    "confirmed": "order_confirmed", "processing": "order_processing",
    "dispatched": "order_dispatched", "delivered": "order_delivered",
}


async def resolve_cart(items, customer=None):
    """items: [{variant_id, qty}] -> detailed line items priced for the given customer."""
    settings = await get_pricing_settings(db)
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
        pl = await price_line(db, product, variant, qty, customer, settings)
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
            "unit_price": pl["unit_price"],
            "price_source": pl["price_source"],
            "offer_source": pl["offer_source"],
            "gst_percent": variant.get("gst_percent", 0),
            "gst_inclusive": variant.get("gst_inclusive", True),
            "stock_status": variant.get("stock_status", "in_stock"),
            "qty": qty,
            "scheme_id": pl["scheme_id"],
            "scheme_label": pl["scheme_label"],
            "free_qty": pl["free_qty"],
            "dispatch_qty": qty + pl["free_qty"],
            "upsell": pl.get("upsell"),
            "case_suggestion": pl.get("case_suggestion"),
        })
    return lines


class CartItem(BaseModel):
    variant_id: str
    qty: int


class CartCalc(BaseModel):
    items: List[CartItem]


@router.post("/cart/calculate")
async def cart_calculate(body: CartCalc, customer=Depends(optional_customer)):
    lines = await resolve_cart([i.model_dump() for i in body.items], customer)
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
    lines = await resolve_cart([i.model_dump() for i in body.items], cust)
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
    if cust.get("email"):
        subj, ebody = await email_for(db, "order_received", {"name": cust["name"], "order": order_no, "items": prod_lines})
        await send_email(db, cust["email"], subj, ebody, kind="order_received")

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
    lines = await resolve_cart(items, customer)
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


@router.get("/admin/orders/{oid}/prev-pricing")
async def order_prev_pricing(oid: str, admin=Depends(require_module("orders"))):
    """Customer's previously-confirmed rate/offer per variant in this order (avoids pricing mismatch)."""
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Not found")
    cid = order.get("customer_id")
    prices = {}
    if cid:
        vids = [l.get("variant_id") for l in order.get("items", [])]
        docs = await db.customer_prices.find({"customer_id": cid, "variant_id": {"$in": vids}, "active": True}, {"_id": 0}).to_list(500)
        for d in docs:
            prices[d["variant_id"]] = {"rate": d.get("rate"), "offer": d.get("offer"), "source": d.get("source")}
    return {"customer_id": cid, "prices": prices}


@router.post("/admin/orders")
async def admin_create_order(body: dict = Body(...), admin=Depends(require_module("orders"))):
    cust = None
    if body.get("customer_id"):
        cust = await db.customers.find_one({"id": body["customer_id"]}, {"_id": 0})
    if not cust:
        cust = {
            "id": new_id(), "prefix": body.get("prefix", "Mr."), "name": body.get("name", "Customer"),
            "mobile": body.get("mobile", ""), "whatsapp": body.get("whatsapp") or body.get("mobile", ""),
            "company_name": body.get("company_name", ""), "category": body.get("category", "other"),
            "addresses": [], "default_address": body.get("address"), "active": True, "created_at": now_iso(),
        }
        if body.get("save_customer", True):
            await db.customers.insert_one(dict(cust)); cust.pop("_id", None)
    lines = await resolve_cart(body.get("items", []), cust)
    if not lines:
        raise HTTPException(status_code=400, detail="Add at least one product")
    order_no = await next_order_number(db)
    total_qty = sum(l["qty"] for l in lines)
    total_free = sum(l["free_qty"] for l in lines)
    addr = body.get("address") or cust.get("default_address") or {}
    order = {
        "id": new_id(), "order_number": order_no, "customer_id": cust["id"], "customer_name": cust["name"],
        "customer_mobile": cust["mobile"], "customer_whatsapp": cust.get("whatsapp", cust["mobile"]),
        "company_name": cust.get("company_name", ""), "customer_category": cust.get("category", "other"),
        "address": addr, "items": lines, "total_qty": total_qty, "total_free": total_free,
        "total_dispatch": total_qty + total_free, "status": body.get("status", "new"),
        "notes": body.get("notes", ""), "internal_notes": body.get("internal_notes", ""),
        "activity": [], "created_at": now_iso(), "updated_at": now_iso(),
    }
    add_order_activity(order, f"Order created by admin ({len(lines)} products, qty {total_qty})", admin["name"])
    await db.orders.insert_one(dict(order))
    await log_audit(db, admin, "create", "order", order["id"], {"number": order_no})
    order.pop("_id", None)
    return order


@router.delete("/admin/orders/{oid}")
async def delete_order(oid: str, admin=Depends(require_module("orders"))):
    res = await db.orders.delete_one({"id": oid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await log_audit(db, admin, "delete", "order", oid)
    return {"deleted": True}


@router.patch("/admin/orders/{oid}/status")
async def update_status(oid: str, body: dict = Body(...), admin=Depends(require_module("orders"))):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(status_code=404, detail="Not found")
    new_status = body.get("status")
    if new_status not in STATUS_LABELS:
        raise HTTPException(status_code=400, detail="Invalid status")
    add_order_activity(order, f"Status changed {STATUS_LABELS.get(order['status'])} → {STATUS_LABELS[new_status]}", admin["name"])
    set_fields = {"status": new_status, "updated_at": now_iso(), "activity": order["activity"]}
    if new_status == "delivered":
        set_fields["delivered_at"] = now_iso()
    await db.orders.update_one({"id": oid}, {"$set": set_fields})
    # WhatsApp status notification — uses editable Message Templates
    order["status"] = new_status
    tmpls = await get_templates()
    key = STATUS_TEMPLATE_KEY.get(new_status)
    if key and key in tmpls:
        msg = render_template(tmpls[key]["body"], order)
    else:
        msg = f"Update: Your VETMECH order {order['order_number']} is now {STATUS_LABELS[new_status].upper()}."
    await send_whatsapp(db, order.get("customer_whatsapp", order["customer_mobile"]), msg, kind=f"status_{new_status}")
    cust = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0, "email": 1})
    if cust and cust.get("email"):
        subj, ebody = await email_for(db, "order_status", {"name": order.get("customer_name", ""), "order": order["order_number"], "status_message": msg})
        await send_email(db, cust["email"], subj, ebody, kind=f"status_{new_status}")
    await log_audit(db, admin, "status_change", "order", oid, {"status": new_status})
    return await db.orders.find_one({"id": oid}, {"_id": 0})


async def build_priced_lines(items, customer):
    """Like resolve_cart but honors per-line admin overrides (rate / free_qty / offer)."""
    settings = await get_pricing_settings(db)
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
        override = it.get("rate")
        customer_offer = None
        if override not in (None, ""):
            unit_price = float(override)
            offer = it.get("offer") or None
            free_qty = int(it.get("free_qty") or 0)
            scheme_label = None
            if offer and offer.get("buy_quantity") and offer.get("free_quantity"):
                b, f = int(offer["buy_quantity"]), int(offer["free_quantity"])
                free_qty = (qty // b) * f if b > 0 else free_qty
                scheme_label = f"{b}+{f}"
                customer_offer = {"scheme_type": "free_qty", "buy_quantity": b, "free_quantity": f, "name": scheme_label}
            elif offer and offer.get("special_price"):
                unit_price = float(offer["special_price"])
                mq = int(offer.get("min_quantity") or qty)
                scheme_label = f"{mq} @ ₹{unit_price}"
                customer_offer = {"scheme_type": "special_price", "min_quantity": mq, "special_price": unit_price, "name": scheme_label}
            elif free_qty:
                scheme_label = f"+{free_qty} free"
            price_source = offer_source = "manual_admin"
        else:
            pl = await price_line(db, product, variant, qty, customer, settings)
            unit_price, free_qty, scheme_label = pl["unit_price"], pl["free_qty"], pl["scheme_label"]
            price_source, offer_source = pl["price_source"], pl["offer_source"]
        lines.append({
            "product_id": product["id"], "product_name": product["name"], "brand_name": product.get("brand_name", ""),
            "image": product.get("image", ""), "slug": product.get("slug"), "variant_id": vid,
            "pack_size": variant.get("pack_size", ""), "unit": variant.get("unit", ""),
            "units_per_case": variant.get("units_per_case") or 0, "sku": variant.get("sku", ""),
            "mrp": variant.get("mrp"), "selling_price": variant.get("selling_price"),
            "unit_price": unit_price, "price_source": price_source, "offer_source": offer_source,
            "gst_percent": variant.get("gst_percent", 0), "gst_inclusive": variant.get("gst_inclusive", True),
            "stock_status": "out_of_stock" if bool(it.get("out_of_stock")) else variant.get("stock_status", "in_stock"),
            "out_of_stock": bool(it.get("out_of_stock")), "qty": qty,
            "scheme_id": None, "scheme_label": scheme_label, "free_qty": free_qty, "dispatch_qty": qty + free_qty,
            "_customer_offer": customer_offer,
        })
    return lines


async def apply_last_confirmed(customer_id, lines, admin):
    """Save the confirmed order rate/offer as the customer's negotiated (last-confirmed) pricing."""
    for l in lines:
        doc = {"rate": l["unit_price"], "offer": l.get("_customer_offer"), "source": "last_confirmed",
               "active": True, "updated_at": now_iso()}
        existing = await db.customer_prices.find_one({"customer_id": customer_id, "variant_id": l["variant_id"]}, {"_id": 0})
        if existing:
            doc["protected"] = existing.get("protected", False)
            await db.customer_prices.update_one({"customer_id": customer_id, "variant_id": l["variant_id"]}, {"$set": doc})
        else:
            doc.update({"id": new_id(), "protected": False, "customer_id": customer_id,
                        "product_id": l["product_id"], "variant_id": l["variant_id"], "created_at": now_iso()})
            await db.customer_prices.insert_one(doc)
        await db.pricing_audit.insert_one({
            "id": new_id(), "kind": "last_confirmed", "at": now_iso(), "by": admin.get("name", "Admin"),
            "customer_id": customer_id, "product_id": l["product_id"], "product_name": l["product_name"],
            "variant_id": l["variant_id"], "new_rate": l["unit_price"], "source": "order_confirm"})


@router.put("/admin/orders/{oid}")
async def edit_order(oid: str, body: dict = Body(...), admin=Depends(require_module("orders"))):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(status_code=404, detail="Not found")
    updates = {"updated_at": now_iso()}
    if "items" in body:
        cust = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
        prev_oos = {l["variant_id"]: bool(l.get("out_of_stock") or l.get("stock_status") == "out_of_stock") for l in order.get("items", [])}
        requested_vids = [it.get("variant_id") for it in body["items"] if int(it.get("qty", 0)) > 0]
        lines = await build_priced_lines(body["items"], cust)
        resolved_vids = {l["variant_id"] for l in lines}
        missing = [v for v in requested_vids if v not in resolved_vids]
        if requested_vids and missing:
            raise HTTPException(status_code=400, detail=f"{len(missing)} item(s) could not be found in the catalog (they may have been changed or removed). Order was not modified.")
        if body.get("update_customer_pricing") and order.get("customer_id"):
            await apply_last_confirmed(order["customer_id"], lines, admin)
            add_order_activity(order, "Updated customer's negotiated pricing from this order", admin["name"])
        for l in lines:
            l.pop("_customer_offer", None)
        updates["items"] = lines
        updates["total_qty"] = sum(l["qty"] for l in lines)
        updates["total_free"] = sum(l["free_qty"] for l in lines)
        updates["total_dispatch"] = updates["total_qty"] + updates["total_free"]
        add_order_activity(order, "Admin edited order items & pricing", admin["name"])
        # Out-of-stock: single consolidated notification for ALL flagged items
        oos_lines = [l for l in lines if l.get("out_of_stock")]
        if oos_lines:
            add_order_activity(order, f"Marked {len(oos_lines)} item(s) out of stock: " + ", ".join(l["product_name"] for l in oos_lines), admin["name"])
            if body.get("notify_out_of_stock"):
                tmpls = await get_templates()
                items_text = ", ".join(f"{l['product_name']} ({l['pack_size']} {l['unit']})".strip() for l in oos_lines)
                msg = (tmpls["order_items_out_of_stock"]["body"]
                       .replace("{name}", order.get("customer_name", ""))
                       .replace("{order}", order.get("order_number", ""))
                       .replace("{items}", items_text))
                await send_whatsapp(db, order.get("customer_whatsapp") or order.get("customer_mobile"), msg, kind="items_out_of_stock")
                add_order_activity(order, f"Sent out-of-stock notification to customer ({len(oos_lines)} item(s) in one message)", admin["name"])
        # Back-in-stock: items previously OOS that are now available again
        restock_lines = [l for l in lines if prev_oos.get(l["variant_id"]) and not l.get("out_of_stock")]
        if restock_lines:
            add_order_activity(order, f"{len(restock_lines)} item(s) marked back in stock: " + ", ".join(l["product_name"] for l in restock_lines), admin["name"])
            if body.get("notify_restock"):
                tmpls = await get_templates()
                items_text = ", ".join(f"{l['product_name']} ({l['pack_size']} {l['unit']})".strip() for l in restock_lines)
                msg = (tmpls["order_items_back_in_stock"]["body"]
                       .replace("{name}", order.get("customer_name", ""))
                       .replace("{order}", order.get("order_number", ""))
                       .replace("{items}", items_text))
                await send_whatsapp(db, order.get("customer_whatsapp") or order.get("customer_mobile"), msg, kind="items_back_in_stock")
                add_order_activity(order, f"Sent back-in-stock notification to customer ({len(restock_lines)} item(s) in one message)", admin["name"])
    if "address" in body:
        updates["address"] = body["address"]
        add_order_activity(order, "Admin changed delivery address", admin["name"])
    if "internal_notes" in body:
        updates["internal_notes"] = body["internal_notes"]
    updates["activity"] = order["activity"]
    await db.orders.update_one({"id": oid}, {"$set": updates})
    await log_audit(db, admin, "edit", "order", oid)
    return await db.orders.find_one({"id": oid}, {"_id": 0})


# =============== REVIEW REMINDER CRON ===============
async def _run_review_reminders():
    import os
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    base = os.environ.get("APP_BASE_URL") or os.environ.get("SITE_URL") or ""
    orders = await db.orders.find({"status": "delivered", "review_reminder_sent": {"$ne": True}}, {"_id": 0}).to_list(500)
    for o in orders:
        da = o.get("delivered_at") or o.get("updated_at") or ""
        if da and da > cutoff:
            continue
        name = o.get("customer_name", "")
        first = (o.get("items") or [{}])[0]
        slug = first.get("slug")
        link = (f"{base}/products/{slug}" if slug else base).strip()
        msg = (f"Dear {name}, thank you for your recent VETMECH order {o.get('order_number','')}! "
               f"We'd love your feedback — please rate the products you received"
               + (f": {link}" if link else ".")).strip()
        await send_whatsapp(db, o.get("customer_whatsapp") or o.get("customer_mobile"), msg, kind="review_reminder")
        cust = await db.customers.find_one({"id": o.get("customer_id")}, {"_id": 0, "email": 1})
        if cust and cust.get("email"):
            await send_email(db, cust["email"], "How was your VETMECH order?", msg, kind="review_reminder")
        await db.orders.update_one({"id": o["id"]}, {"$set": {"review_reminder_sent": True}})


@router.post("/cron/review-reminders")
async def cron_review_reminders(background: BackgroundTasks, authorization: str = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    import os, hmac
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = (authorization or "").replace("Bearer ", "").strip()
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    background.add_task(_run_review_reminders)
    return {"accepted": True}


# =============== TRANSPORT MASTER ===============
@router.get("/admin/transports")
async def list_transports(admin=Depends(require_module("orders"))):
    return {"items": await db.transports.find({}, {"_id": 0}).sort("name", 1).to_list(500)}


@router.post("/admin/transports")
async def create_transport(body: dict = Body(...), admin=Depends(require_module("orders"))):
    doc = {"id": new_id(), "name": body.get("name", "").strip(), "contact": body.get("contact", ""),
           "address": body.get("address", ""), "active": body.get("active", True), "created_at": now_iso()}
    if not doc["name"]:
        raise HTTPException(400, "Transport name required")
    await db.transports.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/admin/transports/{tid}")
async def update_transport(tid: str, body: dict = Body(...), admin=Depends(require_module("orders"))):
    body.pop("id", None); body.pop("_id", None)
    await db.transports.update_one({"id": tid}, {"$set": body})
    return await db.transports.find_one({"id": tid}, {"_id": 0})


@router.delete("/admin/transports/{tid}")
async def delete_transport(tid: str, admin=Depends(require_module("orders"))):
    await db.transports.delete_one({"id": tid})
    return {"deleted": True}


# =============== MESSAGE TEMPLATES ===============
DEFAULT_TEMPLATES = {
    "order_received": {"label": "Order Received", "body": "Dear {name}, your VETMECH order {order} has been RECEIVED. Our team will confirm shortly. Thank you!"},
    "order_confirmed": {"label": "Order Confirmed", "body": "Dear {name}, your VETMECH order {order} is CONFIRMED and being processed."},
    "order_processing": {"label": "Order Processing", "body": "Dear {name}, your VETMECH order {order} is now being PROCESSED and will be dispatched soon."},
    "order_dispatched": {"label": "Order Dispatched", "body": "Dear {name}, your VETMECH order {order} has been DISPATCHED via {transport} ({cases} case(s), LR {lr}, freight {freight}). Thank you!"},
    "order_delivered": {"label": "Order Delivered", "body": "Dear {name}, your VETMECH order {order} has been DELIVERED. Thank you for choosing VETMECH!"},
    "order_items_out_of_stock": {"label": "Items Out of Stock", "body": "Dear {name}, regarding your VETMECH order {order}, the following item(s) are currently OUT OF STOCK: {items}. We will update you once they are available. The rest of your order will be processed."},
    "order_items_back_in_stock": {"label": "Items Back in Stock", "body": "Good news {name}! The following item(s) from your VETMECH order {order} are now BACK IN STOCK: {items}. We are processing them for dispatch. Thank you for your patience!"},
    "ticket_created": {"label": "Support Ticket Created", "body": "Dear {name}, your VETMECH support request {ticket} ({title}) has been registered. Our team will get back to you shortly."},
    "ticket_status": {"label": "Support Ticket Status", "body": "Update on your VETMECH support request {ticket}: status is now {status}."},
}
TEMPLATE_PLACEHOLDERS = ["{name}", "{order}", "{transport}", "{cases}", "{lr}", "{freight}", "{items}", "{ticket}", "{status}", "{title}"]


async def get_templates():
    doc = await db.settings.find_one({"id": "message_templates"}, {"_id": 0}) or {}
    tmpls = doc.get("templates", {})
    merged = {k: {**v, **tmpls.get(k, {})} for k, v in DEFAULT_TEMPLATES.items()}
    return merged


def render_template(body: str, order: dict) -> str:
    d = order.get("dispatch", {}) or {}
    ctx = {
        "name": order.get("customer_name", ""),
        "order": order.get("order_number", ""),
        "transport": d.get("transport", ""),
        "cases": d.get("cases", ""),
        "lr": d.get("lr_number", ""),
        "freight": ("Paid" if d.get("freight") == "paid" else "To Pay"),
    }
    out = body
    for k, v in ctx.items():
        out = out.replace("{" + k + "}", str(v))
    return out


@router.get("/admin/message-templates")
async def list_templates(admin=Depends(require_module("orders"))):
    return {"templates": await get_templates(), "placeholders": TEMPLATE_PLACEHOLDERS}


@router.put("/admin/message-templates")
async def save_templates(body: dict = Body(...), admin=Depends(require_module("orders"))):
    incoming = body.get("templates", {})
    clean = {}
    for k in DEFAULT_TEMPLATES:
        if k in incoming and isinstance(incoming[k], dict):
            clean[k] = {"label": DEFAULT_TEMPLATES[k]["label"], "body": incoming[k].get("body", DEFAULT_TEMPLATES[k]["body"])}
    await db.settings.update_one({"id": "message_templates"}, {"$set": {"id": "message_templates", "templates": clean, "updated_at": now_iso()}}, upsert=True)
    await log_audit(db, admin, "update", "message_templates", "message_templates")
    return {"templates": await get_templates(), "placeholders": TEMPLATE_PLACEHOLDERS}


# =============== DISPATCH REGISTER ===============
@router.get("/admin/dispatches")
async def dispatch_register(transport: Optional[str] = None, freight: Optional[str] = None,
                            date_from: Optional[str] = None, date_to: Optional[str] = None,
                            q: Optional[str] = None, admin=Depends(require_module("orders"))):
    query = {"dispatch": {"$exists": True, "$ne": None}}
    if transport:
        query["dispatch.transport"] = transport
    if freight:
        query["dispatch.freight"] = freight
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["dispatch.dispatch_date"] = rng
    if q:
        import re as _re
        rx = {"$regex": _re.escape(q), "$options": "i"}
        query["$or"] = [{"order_number": rx}, {"customer_name": rx}, {"dispatch.lr_number": rx}]
    orders = await db.orders.find(query, {"_id": 0}).sort("dispatch.dispatched_at", -1).to_list(2000)
    rows = []
    for o in orders:
        d = o.get("dispatch", {})
        rows.append({
            "id": o["id"], "order_number": o.get("order_number"), "customer_name": o.get("customer_name"),
            "company_name": o.get("company_name", ""), "customer_mobile": o.get("customer_mobile"),
            "city": (o.get("address") or {}).get("district", ""), "state": (o.get("address") or {}).get("state", ""),
            "cases": d.get("cases"), "transport": d.get("transport"), "freight": d.get("freight"),
            "lr_number": d.get("lr_number"), "invoice_number": d.get("invoice_number", ""),
            "invoice_value": d.get("invoice_value"), "invoice_date": d.get("invoice_date", ""),
            "dispatch_date": d.get("dispatch_date"),
            "dispatched_by": d.get("dispatched_by"), "total_dispatch": o.get("total_dispatch"),
            "status": o.get("status"),
        })
    transports = [t["name"] for t in await db.transports.find({}, {"_id": 0, "name": 1}).to_list(500)]
    return {"items": rows, "count": len(rows), "transports": transports}


# =============== DISPATCH ===============
@router.post("/admin/orders/{oid}/dispatch")
async def dispatch_order(oid: str, body: dict = Body(...), admin=Depends(require_module("orders"))):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Not found")
    cases = body.get("cases")
    transport = (body.get("transport") or "").strip()
    lr = (body.get("lr_number") or "").strip()
    already = order.get("status") == "dispatched" or bool(order.get("dispatch"))
    if not cases or int(cases) <= 0:
        raise HTTPException(400, "Number of cases is required")
    if not transport:
        raise HTTPException(400, "Transport is required")
    prev = order.get("dispatch") or {}
    dispatch = {
        "cases": int(cases), "transport": transport,
        "freight": body.get("freight", "to_pay"), "lr_number": lr,
        "invoice_number": (body.get("invoice_number") or prev.get("invoice_number") or "").strip(),
        "invoice_value": body.get("invoice_value") if body.get("invoice_value") not in (None, "") else prev.get("invoice_value"),
        "invoice_date": body.get("invoice_date") or prev.get("invoice_date") or "",
        "dispatch_date": body.get("dispatch_date") or prev.get("dispatch_date") or now_iso()[:10],
        "remarks": body.get("remarks", prev.get("remarks", "")),
        "dispatched_by": prev.get("dispatched_by") or admin.get("name", "Admin"),
        "dispatched_at": prev.get("dispatched_at") or now_iso(),
    }
    if already:
        add_order_activity(order, f"Updated dispatch details · LR {lr or '—'} · Invoice {dispatch['invoice_number'] or '—'}", admin["name"])
    else:
        add_order_activity(order, f"Dispatched via {transport} · {dispatch['cases']} case(s) · LR {lr or '—'} · Freight {dispatch['freight']}", admin["name"])
    await db.orders.update_one({"id": oid}, {"$set": {
        "status": "dispatched", "dispatch": dispatch, "updated_at": now_iso(), "activity": order["activity"]}})
    await log_audit(db, admin, "dispatch", "order", oid, {"transport": transport, "lr": lr})
    if body.get("notify"):
        cust = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
        order["dispatch"] = dispatch
        tmpls = await get_templates()
        msg = body.get("message") or render_template(tmpls["order_dispatched"]["body"], order)
        if cust:
            await send_whatsapp(db, cust.get("whatsapp") or cust.get("mobile"), msg, kind="order_dispatched")
    return await db.orders.find_one({"id": oid}, {"_id": 0})
