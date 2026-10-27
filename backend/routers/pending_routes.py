import asyncio
import hashlib
import json
from collections import defaultdict
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pymongo.errors import DuplicateKeyError
from db import db
from helpers import now_iso, log_audit, send_whatsapp
from security import get_current_customer, require_module
from pending_items import list_pending_items, message_items

router = APIRouter(prefix="/api", tags=["pending-order-items"])


async def send_out_of_stock_notice(order):
    from routers.orders import get_templates
    rows = [row for row in await list_pending_items(db, order.get("customer_id")) if row["order_id"] == order["id"] and row["state"] == "waiting"]
    if not rows:
        return {"status": "not_needed", "items": 0}
    fingerprint = hashlib.sha256(json.dumps(sorted((row["id"], row["remaining_qty"]) for row in rows)).encode()).hexdigest()
    claimed = await db.orders.update_one({"id": order["id"], "$or": [
        {"pending_oos_notice.fingerprint": {"$ne": fingerprint}}, {"pending_oos_notice.status": "failed"}]}, {"$set": {
            "pending_oos_notice": {"fingerprint": fingerprint, "status": "sending", "at": now_iso()}}})
    if not claimed.matched_count:
        return {"status": "already_recorded", "items": len(rows)}
    template = (await get_templates())["order_items_out_of_stock"]["body"]
    if "{items}" not in template:
        template += "\n{items}"
    message = template.replace("{name}", order.get("customer_name", "Customer")).replace("{order}", order.get("order_number", "")).replace("{items}", message_items(rows))
    try:
        result = await send_whatsapp(db, order.get("customer_whatsapp") or order.get("customer_mobile"), message, kind="items_out_of_stock")
    except Exception:
        result = {"status": "failed"}
    status = result.get("status", "failed")
    if status not in {"sent", "simulated"}:
        status = "failed"
    await db.orders.update_one({"id": order["id"], "pending_oos_notice.fingerprint": fingerprint}, {"$set": {
        "pending_oos_notice.status": status, "pending_oos_notice.notification_id": result.get("id"), "pending_oos_notice.at": now_iso()}})
    return {"status": status, "items": len(rows)}


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_ids: list[str] = Field(default_factory=list, max_length=500)
    variant_ids: list[str] = Field(default_factory=list, max_length=25)

    @model_validator(mode="after")
    def choose_one(self):
        if bool(self.item_ids) == bool(self.variant_ids):
            raise ValueError("Select pending items or product variants")
        return self


class NotifySelection(Selection):
    request_id: UUID


async def selected_rows(body):
    rows = await list_pending_items(db)
    chosen = set(body.item_ids or body.variant_ids)
    rows = [row for row in rows if (row["id"] if body.item_ids else row["variant_id"]) in chosen
            and row.get("availability_notice_status") not in {"sent", "simulated", "sending"}]
    if len(rows) > 500:
        raise HTTPException(400, "Select a smaller batch (up to 500 pending items)")
    return rows


async def message_groups(rows):
    from routers.orders import get_templates
    template = (await get_templates())["order_items_back_in_stock"]["body"]
    if "{items}" not in template:
        template += "\n{items}"
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["customer_id"]].append(row)
    result = []
    for cid, items in grouped.items():
        customer = await db.customers.find_one({"id": cid}, {"_id": 0})
        if not customer or customer.get("status") in {"deleted", "rejected", "suspended"}:
            continue
        orders = ", ".join(dict.fromkeys(row["order_number"] for row in items))
        message = template.replace("{name}", customer.get("name", "Customer")).replace("{order}", orders).replace("{items}", message_items(items))
        result.append({"customer_id": cid, "customer_name": customer.get("name", ""),
                       "to": customer.get("whatsapp") or customer.get("mobile"), "message": message, "items": items})
    return result


@router.get("/pending-items/mine")
async def my_pending_items(customer=Depends(get_current_customer)):
    rows = await list_pending_items(db, customer["id"])
    return {"items": [{key: value for key, value in row.items() if key not in {"customer_mobile", "customer_name", "availability_batch_id"}} for row in rows], "total": len(rows)}


@router.get("/admin/pending-items")
async def admin_pending_items(state: Literal["waiting", "available", "all"] = "all", q: str = "", variant_id: str = "", customer_id: str = "",
                              page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), admin=Depends(require_module("orders"))):
    rows = await list_pending_items(db, customer_id or None)
    groups = {}
    for row in rows:
        group = groups.setdefault(row["variant_id"], {"variant_id": row["variant_id"], "product_name": row["product_name"], "pack_size": row.get("pack_size", ""), "unit": row.get("unit", ""), "waiting": 0, "available": 0, "requested_qty": 0, "customers": set()})
        group[row["state"]] += 1
        group["requested_qty"] += row["remaining_qty"]
        group["customers"].add(row["customer_id"])
    summary = {"waiting": sum(row["state"] == "waiting" for row in rows), "available": sum(row["state"] == "available" for row in rows), "customers": len({row["customer_id"] for row in rows})}
    rows = [row for row in rows if (state == "all" or row["state"] == state) and (not variant_id or row["variant_id"] == variant_id)
            and (not q or q.casefold() in " ".join(str(row.get(key, "")) for key in ["customer_name", "customer_mobile", "order_number", "product_name", "pack_size"]).casefold())]
    return {"items": rows[(page-1)*limit:page*limit], "total": len(rows), "page": page, "pages": (len(rows)+limit-1)//limit,
            "summary": summary, "products": [{**group, "customers": len(group["customers"])} for group in groups.values()]}


@router.post("/admin/pending-items/availability-preview")
async def availability_preview(body: Selection, admin=Depends(require_module("orders"))):
    groups = await message_groups(await selected_rows(body))
    return {"customers": len(groups), "item_ids": [row["id"] for group in groups for row in group["items"]],
            "messages": [{key: group[key] for key in ["customer_id", "customer_name", "to", "message"]} for group in groups]}


@router.post("/admin/pending-items/notify-available")
async def notify_available(body: NotifySelection, admin=Depends(require_module("orders"))):
    batch_id = str(body.request_id)
    fingerprint = hashlib.sha256(json.dumps([sorted(set(body.item_ids)), sorted(set(body.variant_ids))]).encode()).hexdigest()
    previous = await db.pending_notification_batches.find_one({"_id": batch_id})
    if previous:
        if previous["fingerprint"] != fingerprint:
            raise HTTPException(409, "This notification request ID was already used for a different selection")
        if previous["status"] != "completed":
            raise HTTPException(409, "This notification batch is still processing; do not resend it")
        return previous["result"]
    groups = await message_groups(await selected_rows(body))
    try:
        await db.pending_notification_batches.insert_one({"_id": batch_id, "fingerprint": fingerprint, "status": "processing", "created_at": now_iso(), "created_by": admin["id"]})
    except DuplicateKeyError:
        raise HTTPException(409, "This notification batch is already processing")
    semaphore = asyncio.Semaphore(4)

    async def send_group(group):
        async with semaphore:
            claimed = []
            for row in group["items"]:
                changed = await db.orders.update_one({"id": row["order_id"], "status": {"$ne": "cancelled"}, "pending_items": {"$elemMatch": {
                    "id": row["id"], "state": {"$in": ["waiting", "available"]}, "availability_notice_status": {"$nin": ["sent", "simulated", "sending"]}}}}, {"$set": {
                        "pending_items.$.state": "available", "pending_items.$.available_at": now_iso(),
                        "pending_items.$.availability_notice_status": "sending", "pending_items.$.availability_batch_id": batch_id, "updated_at": now_iso()}})
                if changed.matched_count:
                    claimed.append(row)
            if not claimed:
                return None
            fresh_groups = await message_groups(claimed)
            try:
                sent = await send_whatsapp(db, fresh_groups[0]["to"], fresh_groups[0]["message"], kind="pending_items_available") if fresh_groups else {"status": "failed"}
            except Exception:
                sent = {"status": "failed"}
            status = sent.get("status", "failed")
            if status not in {"sent", "simulated"}:
                status = "failed"
            for row in claimed:
                await db.orders.update_one({"id": row["order_id"], "pending_items": {"$elemMatch": {"id": row["id"], "availability_batch_id": batch_id}}}, {"$set": {
                    "pending_items.$.availability_notice_status": status, "pending_items.$.availability_notified_at": now_iso(),
                    "pending_items.$.availability_notification_id": sent.get("id"), "updated_at": now_iso()}})
            return {"customer_id": group["customer_id"], "customer_name": group["customer_name"], "status": status, "items": len(claimed)}

    results = [row for row in await asyncio.gather(*(send_group(group) for group in groups)) if row]
    result = {"batch_id": batch_id, "customers": len(results), "sent": sum(row["status"] == "sent" for row in results),
              "simulated": sum(row["status"] == "simulated" for row in results), "failed": sum(row["status"] == "failed" for row in results), "results": results}
    await db.pending_notification_batches.update_one({"_id": batch_id}, {"$set": {"status": "completed", "result": result, "completed_at": now_iso()}})
    await log_audit(db, admin, "notify_pending_items_available", "pending_items", batch_id, result)
    return result
