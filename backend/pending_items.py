"""Order-specific missed-item demand. Never writes catalogue availability or inventory."""
from collections import defaultdict
from fastapi import HTTPException
from helpers import new_id, now_iso


def prepare_pending_items(order, lines):
    previous = [dict(row) for row in order.get("pending_items", [])]
    active = {row["variant_id"]: row for row in previous if row["state"] in {"waiting", "available"}}
    flagged = {line["variant_id"]: line for line in lines if line.get("out_of_stock")}
    for vid, row in active.items():
        if vid not in flagged:
            row.update(state="resolved", resolved_at=now_iso(), resolution="Removed from the order's unavailable items")
    for vid, line in flagged.items():
        row = active.get(vid)
        if not row:
            row = {"id": new_id(), "variant_id": vid, "state": "waiting", "created_at": now_iso(), "availability_notice_status": "not_sent"}
            previous.append(row)
        row.update({key: line.get(key, "") for key in ["product_id", "product_name", "pack_size", "unit", "image", "slug"]})
        row["requested_qty"] = int(line["qty"])
    return previous


async def backfill_pending_items(database):
    async for order in database.orders.find({"pending_items": {"$exists": False}, "items.out_of_stock": True}):
        await database.orders.update_one({"id": order["id"], "pending_items": {"$exists": False}}, {
            "$set": {"pending_items": prepare_pending_items(order, order.get("items", []))}})


async def list_pending_items(database, customer_id=None, history=False):
    query = {"pending_items.0": {"$exists": True}}
    if not history:
        query["status"] = {"$ne": "cancelled"}
    linked_query = {"pending_reorders.0": {"$exists": True}, "status": {"$ne": "cancelled"}}
    if customer_id:
        query["customer_id"] = linked_query["customer_id"] = customer_id
    allocated = defaultdict(int)
    async for order in database.orders.find(linked_query):
        budgets = defaultdict(int)
        for line in order.get("items", []):
            budgets[line.get("variant_id")] += int(line.get("qty", 0))
        for link in order.get("pending_reorders", []):
            qty = min(int(link["qty"]), budgets[link["variant_id"]])
            allocated[link["pending_id"]] += qty
            budgets[link["variant_id"]] -= qty
    rows = []
    async for order in database.orders.find(query):
        for entry in order.get("pending_items", []):
            remaining = max(0, entry["requested_qty"] - allocated[entry["id"]])
            state = "cancelled" if order.get("status") == "cancelled" else "reordered" if remaining == 0 and entry["state"] != "resolved" else entry["state"]
            if not history and state not in {"waiting", "available"}:
                continue
            rows.append({**entry, "state": state, "remaining_qty": remaining, "order_id": order["id"],
                         "order_number": order.get("order_number", ""), "customer_id": order.get("customer_id"),
                         "customer_name": order.get("customer_name", ""), "customer_mobile": order.get("customer_mobile", "")})
    if not rows:
        return rows
    vids = list({row["variant_id"] for row in rows})
    available = {}
    async for product in database.products.find({"active": True, "variants.id": {"$in": vids}}, {"_id": 0}):
        for variant in product.get("variants", []):
            available[variant["id"]] = {"product_id": product["id"], "slug": product.get("slug", ""),
                                         "min_order_qty": variant.get("min_order_qty") or 1}
    for row in rows:
        row["can_reorder"] = row["variant_id"] in available
        row.update(available.get(row["variant_id"], {}))
    return sorted(rows, key=lambda row: (row.get("created_at", ""), row["id"]), reverse=True)


async def pending_reorder_links(database, customer_id, ids, lines):
    if not ids:
        return []
    if len(ids) > 100 or len(ids) != len(set(ids)):
        raise HTTPException(400, "Select each missed item only once (maximum 100)")
    rows = {row["id"]: row for row in await list_pending_items(database, customer_id)}
    if any(pid not in rows for pid in ids):
        raise HTTPException(409, "A selected missed item is no longer pending for your account. Refresh checkout and try again.")
    budgets = defaultdict(int)
    for line in lines:
        budgets[line["variant_id"]] += int(line["qty"])
    result = []
    for pid in ids:
        row = rows[pid]
        qty = min(row["remaining_qty"], budgets[row["variant_id"]])
        if qty <= 0:
            raise HTTPException(400, "A selected missed item is missing from the cart")
        budgets[row["variant_id"]] -= qty
        result.append({"pending_id": pid, "variant_id": row["variant_id"], "qty": qty})
    return result


def message_items(rows):
    grouped = {}
    for row in rows:
        vid = row["variant_id"]
        if vid not in grouped:
            grouped[vid] = {**row, "qty": 0}
        grouped[vid]["qty"] += int(row.get("remaining_qty", row.get("requested_qty", row.get("qty", 0))))
    return "\n".join(f"• {row['product_name']} ({str(row.get('pack_size', ''))} {row.get('unit', '')}) — Qty {row['qty']}".replace(" )", ")") for row in grouped.values())
