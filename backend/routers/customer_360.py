"""Read-only, customer-scoped history. Financial totals come from the ledger."""
from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from urllib.parse import quote as encode
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from db import db
from security import require_module, ROLE_MODULES, resolved_status, customer_status_label
from pending_items import list_pending_items
from routers.ledger import statement

router = APIRouter(prefix="/api/admin/customers", tags=["customer-360"])
PROFILE_FIELDS = ("id", "prefix", "name", "company_name", "mobile", "whatsapp", "email", "category", "address", "district", "state", "pincode", "created_at", "source", "price_protected")
ADDRESS_FIELDS = ("label", "name", "line1", "line2", "city", "district", "state", "pincode", "mobile")


def permitted(admin, module):
    allowed = admin.get("permissions") or ROLE_MODULES.get(admin.get("role"), [])
    return admin.get("role") == "super_admin" or "*" in allowed or module in allowed


def money(value):
    return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def india_date(value):
    value = str(value or "")
    if len(value) == 10:
        return value
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).astimezone(ZoneInfo("Asia/Kolkata")).date().isoformat()
    except ValueError:
        return ""


def sorted_rows(rows):
    def key(row):
        try:
            parsed = datetime.fromisoformat(str(row.get("at") or "").replace("Z", "+00:00"))
            stamp = parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).timestamp()
        except ValueError:
            stamp = 0
        return stamp, row["id"]
    return sorted(rows, key=key, reverse=True)


def record(rid, kind, at, title, detail="", status="", amount=None, href="", actor=""):
    return {"id": str(rid), "kind": kind, "at": at or "", "date": india_date(at), "title": title,
            "detail": str(detail or ""), "status": status or "", "amount_paise": amount, "href": href, "actor": actor or ""}


@router.get("/{cid}/360")
async def customer_360(cid: str, section: Literal["timeline", "orders", "pending", "quotations"] = "timeline",
                       kind: Literal["all", "customer", "order", "invoice", "payment", "opening", "pending", "quotation"] = "all",
                       q: str = Query("", max_length=150), date_from: date | None = None, date_to: date | None = None,
                       page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100), admin=Depends(require_module("customers"))):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "The start date must be before the end date")
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer:
        raise HTTPException(404, "Customer not found")
    permissions = {"orders": permitted(admin, "orders"), "pending": permitted(admin, "orders"),
                   "quotations": permitted(admin, "quotations"), "ledger": True, "timeline": True}
    if not permissions[section]:
        raise HTTPException(403, "You do not have permission for this history section")
    profile = {key: customer[key] for key in PROFILE_FIELDS if key in customer}
    profile["status"] = resolved_status(customer)
    profile["status_label"] = customer_status_label(profile["status"])
    profile["addresses"] = [{key: address[key] for key in ADDRESS_FIELDS if key in address}
                            for address in customer.get("addresses", []) if isinstance(address, dict)]
    profile["default_address"] = {key: customer.get("default_address", {})[key] for key in ADDRESS_FIELDS if key in (customer.get("default_address") or {})}
    ledger = await statement(cid, 1, 5)
    orders, timeline, products = [], [], Counter()
    totals = {"orders": 0, "active_orders": 0, "cancelled_orders": 0, "ordered_value_paise": 0, "last_order_at": None}
    if customer.get("created_at"):
        timeline.append(record("customer-created", "customer", customer["created_at"], "Customer account created", customer.get("source", "")))
    async for order in db.orders.find({"customer_id": cid}, {"_id": 0}):
        oid, number = order["id"], order.get("order_number", order["id"])
        order_link = "/admin/orders?order_id=" + encode(oid, safe="") if permissions["orders"] else "/admin/ledger?customer_id=" + encode(cid, safe="")
        if permissions["orders"]:
            cancelled = order.get("status") == "cancelled"
            totals["orders"] += 1
            totals["cancelled_orders"] += int(cancelled)
            totals["active_orders"] += int(order.get("status") not in {"cancelled", "delivered", "closed"})
            if not cancelled:
                totals["ordered_value_paise"] += money(order.get("sales_value"))
                for line in order.get("items", []):
                    products[(line.get("product_name", "Product"), str(line.get("pack_size", "")), line.get("unit", ""))] += int(line.get("qty", 0))
            if order.get("created_at") and (not totals["last_order_at"] or order["created_at"] > totals["last_order_at"]):
                totals["last_order_at"] = order["created_at"]
            detail = ", ".join(f"{line.get('product_name', 'Product')} × {line.get('qty', 0)}" for line in order.get("items", []))
            row = record("order:" + oid, "order", order.get("created_at"), number, detail, order.get("status"), money(order.get("sales_value")), order_link)
            orders.append(row)
            timeline.append({**row, "title": "Order created · " + number})
            for index, event in enumerate(order.get("activity", [])):
                timeline.append(record(f"order:{oid}:activity:{index}", "order", event.get("at"), event.get("text") or "Order updated", number, "", None, order_link, event.get("actor")))
        for invoice in [*order.get("voided_invoices", []), *([order["invoice"]] if order.get("invoice") else [])]:
            title = "Invoice " + invoice.get("invoice_number", "")
            timeline.append(record("invoice:" + invoice["id"], "invoice", invoice.get("created_at") or invoice.get("invoice_date"), title + " posted", number, "posted", invoice.get("amount_paise"), order_link))
            if invoice.get("status") == "voided":
                timeline.append(record("invoice:" + invoice["id"] + ":void", "invoice", invoice.get("voided_at"), title + " voided", invoice.get("reason", ""), "voided", invoice.get("amount_paise"), order_link))
    ledger_link = "/admin/ledger?customer_id=" + encode(cid, safe="")
    async for entry in db.ledger_entries.find({"customer_id": cid}, {"_id": 0}):
        is_payment = entry.get("entry_type") == "payment"
        detail = " · ".join(str(entry.get(key) or "") for key in (["mode", "transaction_id", "notes"] if is_payment else ["direction", "notes"]) if entry.get(key))
        timeline.append(record("ledger:" + entry["id"], "payment" if is_payment else "opening", entry.get("updated_at") or entry.get("created_at") or entry.get("transaction_date"),
                               "Payment recorded" if is_payment else "Opening balance (current)", detail, entry.get("status"), entry.get("amount_paise"), ledger_link))
    pending = await list_pending_items(db, cid, history=True) if permissions["pending"] else []
    pending_records = []
    for row in pending:
        detail = f"{row.get('pack_size', '')} {row.get('unit', '')} · Requested {row['requested_qty']} · Remaining {row['remaining_qty']} · {row['order_number']}"
        link = "/admin/orders?order_id=" + encode(row["order_id"], safe="")
        pending_records.append(record("pending:" + row["id"], "pending", row.get("created_at"), row["product_name"], detail, row["state"], None, link))
        timeline.append(record("pending:" + row["id"], "pending", row.get("created_at"), "Missed item · " + row["product_name"], detail, row["state"], None, link))
        if row.get("available_at"):
            timeline.append(record("pending:" + row["id"] + ":available", "pending", row["available_at"], "Stock received · " + row["product_name"], row.get("availability_notice_status", "") + " notification", "available", None, link))
        if row.get("resolved_at"):
            timeline.append(record("pending:" + row["id"] + ":resolved", "pending", row["resolved_at"], "Missed item resolved · " + row["product_name"], row.get("resolution", ""), "resolved", None, link))
    quotations = []
    if permissions["quotations"]:
        async for quote in db.quotations.find({"customer_id": cid}, {"_id": 0}):
            link = "/admin/quotations/" + encode(quote["id"], safe="")
            number = quote.get("number", quote["id"])
            quotations.append(record("quotation:" + quote["id"], "quotation", quote.get("created_at"), number, quote.get("subject", ""), quote.get("status"), money(quote.get("grand_total")), link))
            timeline.append(record("quotation:" + quote["id"], "quotation", quote.get("created_at"), "Quotation created · " + number, "", quote.get("status"), money(quote.get("grand_total")), link))
            for index, event in enumerate(quote.get("history", [])):
                timeline.append(record(f"quotation:{quote['id']}:{index}", "quotation", event.get("at"), event.get("action") or "Quotation updated", number, "", None, link, event.get("user")))
    # Only this customer's account/ledger audit events. Never expose arbitrary audit metadata or messages/OTP logs.
    async for event in db.audit_logs.find({"entity_id": cid, "entity": {"$in": ["customer", "customer_ledger"]}}, {"_id": 0}):
        ledger_event = event.get("entity") == "customer_ledger"
        action = str(event.get("action") or "updated").replace("_", " ")
        meta = event.get("meta") or {}
        detail = " · ".join(str(meta[key]) for key in ["status", "category", "reason"] if meta.get(key))
        kind_value = "opening" if "opening" in action else "payment" if ledger_event else "customer"
        timeline.append(record("audit:" + event.get("id", str(event.get("created_at"))), kind_value, event.get("created_at"), action.capitalize(), detail, "", meta.get("amount_paise") if "opening" in action else None, ledger_link if ledger_event else "", event.get("actor_name")))
    counts = {"timeline": len(timeline), "orders": len(orders) if permissions["orders"] else None,
              "pending": len(pending_records) if permissions["pending"] else None, "quotations": len(quotations) if permissions["quotations"] else None}
    rows = {"timeline": timeline, "orders": orders, "pending": pending_records, "quotations": quotations}[section]
    rows = [row for row in rows if (section != "timeline" or kind == "all" or row["kind"] == kind)
            and (not (date_from or date_to) or bool(row["date"])) and (not date_from or row["date"] >= date_from.isoformat()) and (not date_to or row["date"] <= date_to.isoformat())
            and (not q or q.casefold() in " ".join(str(row.get(key, "")) for key in ["title", "detail", "status", "actor"]).casefold())]
    rows = sorted_rows(rows)
    active_pending = [row for row in pending if row["state"] in {"waiting", "available"}]
    return {"customer": profile, "permissions": permissions, "counts": counts,
            "summary": {**(totals if permissions["orders"] else {}), "ledger": ledger["summary"],
                        "pending_items": len(active_pending) if permissions["pending"] else None,
                        "pending_qty": sum(row["remaining_qty"] for row in active_pending) if permissions["pending"] else None},
            "frequent_products": [{"name": name, "pack_size": pack, "unit": unit, "qty": qty} for (name, pack, unit), qty in products.most_common(6)],
            "section": section, "items": rows[(page-1)*limit:page*limit], "total": len(rows), "page": page, "limit": limit, "pages": (len(rows)+limit-1)//limit}
