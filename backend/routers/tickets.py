import re
import logging
from datetime import datetime, timezone, timedelta
from collections import Counter, defaultdict
from fastapi import APIRouter, HTTPException, Depends, Body, Query, Request
from typing import Optional

from db import db, paginate
from security import require_module, get_current_admin
from helpers import new_id, now_iso, log_audit, send_whatsapp

router = APIRouter(prefix="/api", tags=["tickets"])
require_tickets = require_module("tickets")
logger_wh = logging.getLogger("vetmech.webhook")

STATUSES = ["open", "in_progress", "pending", "closed"]
STATUS_LABELS = {"open": "Open", "in_progress": "In Progress", "pending": "Pending", "closed": "Closed", "overdue": "Overdue"}


async def next_ticket_number():
    res = await db.counters.find_one_and_update(
        {"id": "ticket"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return f"VM-{res['seq']}"


def decorate(t):
    """Add derived overdue info + effective status."""
    t.pop("_id", None)
    is_overdue = False
    days_overdue = 0
    if t.get("status") != "closed" and t.get("due_date"):
        try:
            due = datetime.fromisoformat(t["due_date"].replace("Z", "+00:00"))
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            if due < now:
                is_overdue = True
                days_overdue = (now - due).days
        except Exception:
            pass
    t["is_overdue"] = is_overdue
    t["days_overdue"] = days_overdue
    t["effective_status"] = "overdue" if is_overdue else t.get("status")
    return t


async def add_activity(ticket, action, actor, message=""):
    ticket.setdefault("activity", []).append({
        "id": new_id(), "action": action, "message": message,
        "user": actor.get("name", "System"), "at": now_iso(),
    })


async def notify(ticket_id, message, ntype, target_user_id=None):
    await db.ticket_notifications.insert_one({
        "id": new_id(), "ticket_id": ticket_id, "message": message, "type": ntype,
        "target_user_id": target_user_id, "read": False, "created_at": now_iso(),
    })


async def send_ticket_whatsapp(ticket, template_key, status_label=""):
    """Send an editable WhatsApp message to the ticket's customer (respects channel toggle)."""
    phone = ticket.get("customer_phone")
    if not phone:
        return
    cfg = await db.settings.find_one({"id": "ticket_config"}, {"_id": 0}) or {}
    if cfg.get("channels") and cfg["channels"].get("whatsapp") is False:
        return
    from routers.orders import get_templates
    tmpls = await get_templates()
    body = (tmpls.get(template_key) or {}).get("body", "")
    if not body:
        return
    msg = (body.replace("{name}", ticket.get("customer_name", ""))
              .replace("{ticket}", ticket.get("ticket_number", ""))
              .replace("{title}", ticket.get("title", ""))
              .replace("{status}", status_label))
    await send_whatsapp(db, phone, msg, kind=template_key)


# =============== CONFIG ===============
DEFAULT_TYPES = [
    {"name": "Product Discussion", "icon": "MessageSquare"}, {"name": "Meeting", "icon": "Users"},
    {"name": "Call to Person", "icon": "Phone"}, {"name": "Order Related", "icon": "ShoppingBag"},
    {"name": "Replacement", "icon": "RefreshCw"}, {"name": "Complaint", "icon": "AlertTriangle"},
    {"name": "Payment Follow-up", "icon": "IndianRupee"}, {"name": "Delivery Issue", "icon": "Truck"},
    {"name": "Product Enquiry", "icon": "HelpCircle"}, {"name": "Sample Request", "icon": "Package"},
    {"name": "WhatsApp", "icon": "MessageCircle"},
    {"name": "Other", "icon": "Circle"},
]
CUSTOMER_TYPES = ["Veterinary Clinic", "Dairy Farm", "Distributor", "Dealer", "Retailer", "Hospital", "Individual", "Other"]


@router.get("/tickets/config")
async def get_config(admin=Depends(require_tickets)):
    cfg = await db.settings.find_one({"id": "ticket_config"}, {"_id": 0})
    if not cfg:
        cfg = {"id": "ticket_config", "types": DEFAULT_TYPES,
               "priorities": ["Low", "Normal", "High", "Urgent"],
               "customer_types": CUSTOMER_TYPES,
               "channels": {"whatsapp": True, "email": True, "sms": False, "inapp": True}}
        await db.settings.insert_one(dict(cfg))
        cfg.pop("_id", None)
    return cfg


@router.put("/admin/tickets/config")
async def update_config(body: dict = Body(...), admin=Depends(require_tickets)):
    body.pop("_id", None); body["id"] = "ticket_config"
    await db.settings.update_one({"id": "ticket_config"}, {"$set": body}, upsert=True)
    return await db.settings.find_one({"id": "ticket_config"}, {"_id": 0})


# =============== INCOMING WHATSAPP WEBHOOK (wa.animitra.in) ===============
@router.get("/whatsapp/webhook")
async def whatsapp_webhook_verify(token: Optional[str] = None):
    """GET verification ping (some providers check reachability before enabling)."""
    return {"ok": True, "service": "vetmech-whatsapp-webhook"}


@router.get("/admin/whatsapp/webhook-debug")
async def webhook_debug(admin=Depends(require_tickets)):
    """Shows the last raw payloads received from wa.animitra.in (for diagnosing format)."""
    items = await db.webhook_debug.find({}, {"_id": 0}).sort("at", -1).limit(20).to_list(20)
    return {"items": items, "count": len(items)}


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request, token: Optional[str] = None):
    """Public webhook for wa.animitra.in incoming messages -> CRM/ticket inbox."""
    settings = await db.settings.find_one({"id": "whatsapp"}, {"_id": 0}) or {}
    secret = (settings.get("webhook_token") or "").strip()
    if secret and token != secret:
        raise HTTPException(status_code=401, detail="Invalid webhook token")
    raw = {}
    try:
        raw = await request.json()
    except Exception:
        try:
            raw = dict(await request.form())
        except Exception:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    try:
        await db.webhook_debug.insert_one({"id": new_id(), "at": now_iso(), "payload": raw})
    except Exception:
        pass
    logger_wh.info(f"[WA WEBHOOK] {raw}")
    layers = [raw]
    for key in ("data", "message", "payload", "messages"):
        v = raw.get(key)
        if isinstance(v, dict):
            layers.append(v)
        elif isinstance(v, list) and v and isinstance(v[0], dict):
            layers.append(v[0])

    def pick(*keys):
        for lay in layers:
            for k in keys:
                val = lay.get(k)
                if val not in (None, ""):
                    return val
        return None

    if pick("fromMe", "from_me") in (True, "true", 1, "1"):
        return {"ok": True, "skipped": "outgoing"}
    direction = pick("direction")
    if direction and direction not in ("incoming", "inbound", "received"):
        return {"ok": True, "skipped": f"direction:{direction}"}
    jid = pick("remote_jid", "remoteJid", "from", "sender", "chatId", "chat_id", "jid", "author") or ""
    if str(jid).endswith("@g.us"):
        return {"ok": True, "skipped": "group"}
    phone = re.sub(r"\D", "", str(jid).split("@")[0].split(":")[0])
    last10 = phone[-10:] if len(phone) >= 10 else phone
    if not last10:
        return {"ok": True, "skipped": "no-phone", "raw_keys": list(raw.keys())}
    text_val = pick("text", "body", "caption", "conversation", "content")
    if isinstance(text_val, dict):
        text_val = text_val.get("text") or text_val.get("conversation") or ""
    text = str(text_val or "").strip()
    push_name = pick("push_name", "pushName", "notifyName", "senderName", "name") or "WhatsApp User"
    mid = pick("message_id", "messageId", "id")
    msg_id = mid if isinstance(mid, str) else None
    await db.notification_logs.insert_one({
        "id": new_id(), "channel": "whatsapp", "direction": "incoming",
        "to": phone, "from": phone, "kind": "inbound_message", "message": text or "(media)",
        "message_id": msg_id, "push_name": push_name, "simulated": False,
        "status": "received", "created_at": now_iso(),
    })
    cust = None
    if last10:
        cust = await db.crm_customers.find_one(
            {"$or": [{"phone": {"$regex": last10}}, {"alt_phone": {"$regex": last10}}]}, {"_id": 0})
    if not cust:
        cust = {"id": new_id(), "contact_name": push_name, "company_name": "", "address": "",
                "email": "", "phone": phone, "alt_phone": "", "customer_type": "Other",
                "notes": "Auto-created from incoming WhatsApp", "source": "whatsapp", "auto_created": True,
                "created_at": now_iso()}
        await db.crm_customers.insert_one(dict(cust))
        cust.pop("_id", None)
    system = {"id": None, "name": "WhatsApp Bot"}
    snippet = (text[:60] + "…") if len(text) > 60 else (text or "(media message)")
    # Dedup: thread into the customer's most recent WhatsApp ticket updated within 7 days (reopen if closed)
    recent = await db.tickets.find_one(
        {"customer_id": cust["id"], "type": "WhatsApp"}, {"_id": 0}, sort=[("updated_at", -1)])
    within_window = False
    if recent:
        try:
            last = datetime.fromisoformat((recent.get("updated_at") or "").replace("Z", "+00:00"))
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            within_window = (datetime.now(timezone.utc) - last) <= timedelta(days=7)
        except Exception:
            within_window = False
    if recent and within_window:
        reopened = recent.get("status") == "closed"
        await add_activity(recent, "customer_reply", system, text or "(media message)")
        await db.tickets.update_one({"id": recent["id"]}, {"$set": {
            "activity": recent["activity"], "updated_at": now_iso(),
            "status": "open" if reopened else recent.get("status", "open")}})
        await notify(recent["id"], f"New WhatsApp reply on {recent['ticket_number']} from {push_name}", "customer_reply", recent.get("assignee_id"))
        return {"ok": True, "ticket": recent["ticket_number"], "threaded": True, "reopened": reopened}
    num = await next_ticket_number()
    doc = {
        "id": new_id(), "ticket_number": num, "customer_id": cust["id"],
        "customer_name": cust.get("contact_name", push_name), "company_name": cust.get("company_name", ""),
        "customer_phone": cust.get("phone", phone), "customer_email": cust.get("email", ""),
        "title": f"WhatsApp: {snippet}", "type": "WhatsApp", "description": text or "(media message)",
        "priority": "Normal", "status": "open", "assignee_id": None, "assignee_name": "Unassigned",
        "created_by": None, "created_by_name": "WhatsApp Bot", "due_date": None, "reminder": None,
        "attachments": [], "activity": [], "channel": "whatsapp",
        "created_at": now_iso(), "updated_at": now_iso(), "closed_date": None,
    }
    await add_activity(doc, "created", system, "Ticket auto-created from incoming WhatsApp")
    await db.tickets.insert_one(dict(doc))
    await notify(doc["id"], f"New WhatsApp message ticket {num} from {push_name}", "new_whatsapp")
    await send_ticket_whatsapp(doc, "ticket_created")
    return {"ok": True, "ticket": num, "threaded": False}



@router.get("/tickets/staff")
async def staff(admin=Depends(require_tickets)):
    users = await db.admin_users.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "role": 1, "department": 1}).to_list(200)
    return users


# =============== CRM CUSTOMERS ===============
@router.get("/crm/customers")
async def list_crm(q: Optional[str] = None, customer_type: Optional[str] = None,
                   page: int = 1, limit: int = 50, admin=Depends(require_tickets)):
    query = {}
    if customer_type:
        query["customer_type"] = customer_type
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"contact_name": rx}, {"company_name": rx}, {"phone": rx}, {"email": rx}]
    res = await paginate(db.crm_customers, query, page, limit)
    for c in res["items"]:
        c["ticket_count"] = await db.tickets.count_documents({"customer_id": c["id"]})
    return res


@router.get("/crm/customers/{cid}")
async def get_crm(cid: str, admin=Depends(require_tickets)):
    c = await db.crm_customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    tickets = [decorate(t) for t in await db.tickets.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)]
    c["tickets"] = tickets
    c["stats"] = {
        "total": len(tickets),
        "open": sum(1 for t in tickets if t["effective_status"] == "open"),
        "pending": sum(1 for t in tickets if t["effective_status"] == "pending"),
        "completed": sum(1 for t in tickets if t["status"] == "closed"),
        "overdue": sum(1 for t in tickets if t["is_overdue"]),
    }
    timeline = []
    for t in tickets:
        for a in t.get("activity", []):
            timeline.append({**a, "ticket_number": t["ticket_number"]})
    timeline.sort(key=lambda x: x["at"], reverse=True)
    c["timeline"] = timeline[:30]
    return c


@router.post("/crm/customers")
async def create_crm(body: dict = Body(...), admin=Depends(require_tickets)):
    doc = {"id": new_id(), "contact_name": body.get("contact_name", ""),
           "company_name": body.get("company_name", ""), "address": body.get("address", ""),
           "email": body.get("email", ""), "phone": body.get("phone", ""),
           "alt_phone": body.get("alt_phone", ""), "customer_type": body.get("customer_type", "Other"),
           "notes": body.get("notes", ""), "is_demo": body.get("is_demo", False), "created_at": now_iso()}
    await db.crm_customers.insert_one(dict(doc))
    await log_audit(db, admin, "create", "crm_customer", doc["id"], {"name": doc["contact_name"]})
    doc.pop("_id", None)
    return doc


@router.put("/crm/customers/{cid}")
async def update_crm(cid: str, body: dict = Body(...), admin=Depends(require_tickets)):
    body.pop("id", None); body.pop("_id", None); body.pop("tickets", None); body.pop("stats", None); body.pop("timeline", None)
    await db.crm_customers.update_one({"id": cid}, {"$set": body})
    return await db.crm_customers.find_one({"id": cid}, {"_id": 0})


@router.delete("/crm/customers/{cid}")
async def delete_crm(cid: str, admin=Depends(require_tickets)):
    await db.crm_customers.delete_one({"id": cid})
    return {"deleted": True}


# =============== TICKETS ===============
@router.get("/tickets")
async def list_tickets(status: Optional[str] = None, priority: Optional[str] = None,
                       type: Optional[str] = None, assignee: Optional[str] = None,
                       customer: Optional[str] = None, q: Optional[str] = None,
                       mine: Optional[bool] = False, admin=Depends(require_tickets)):
    query = {}
    if priority:
        query["priority"] = priority
    if type:
        query["type"] = type
    if assignee:
        query["assignee_id"] = assignee
    if customer:
        query["customer_id"] = customer
    if mine:
        query["assignee_id"] = admin["id"]
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"ticket_number": rx}, {"title": rx}, {"customer_name": rx},
                        {"company_name": rx}, {"customer_phone": rx}, {"customer_email": rx}, {"assignee_name": rx}]
    items = [decorate(t) for t in await db.tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)]
    if status:
        items = [t for t in items if t["effective_status"] == status]
    return {"items": items, "total": len(items)}


@router.get("/tickets/dashboard")
async def dashboard(admin=Depends(require_tickets)):
    tickets = [decorate(t) for t in await db.tickets.find({}, {"_id": 0}).to_list(5000)]
    total = len(tickets)
    eff = Counter(t["effective_status"] for t in tickets)
    today = datetime.now(timezone.utc).date().isoformat()

    by_type = Counter(t.get("type", "Other") for t in tickets)
    by_priority = Counter(t.get("priority", "Normal") for t in tickets)
    by_assignee = Counter(t.get("assignee_name", "Unassigned") for t in tickets)
    by_customer = Counter(t.get("company_name") or t.get("customer_name", "?") for t in tickets)

    daily = defaultdict(int)
    for t in tickets:
        daily[t["created_at"][:10]] += 1
    trend = [{"date": d[5:], "count": daily.get(d, 0)} for d in sorted(daily.keys())[-7:]]

    # ticket overview over time by status (last 7 create days)
    overview = []
    for d in sorted(daily.keys())[-7:]:
        day_t = [t for t in tickets if t["created_at"][:10] <= d]
        overview.append({"date": d[5:],
                         "open": sum(1 for t in day_t if t["status"] == "open"),
                         "in_progress": sum(1 for t in day_t if t["status"] == "in_progress"),
                         "pending": sum(1 for t in day_t if t["status"] == "pending"),
                         "closed": sum(1 for t in day_t if t["status"] == "closed")})

    overdue_list = sorted([t for t in tickets if t["is_overdue"]], key=lambda x: x["days_overdue"], reverse=True)[:10]
    upcoming = sorted([t for t in tickets if not t["is_overdue"] and t["status"] != "closed" and t.get("due_date")],
                      key=lambda x: x["due_date"])[:10]
    recent = sorted(tickets, key=lambda x: x["updated_at"], reverse=True)[:10]

    activity = []
    for t in tickets:
        for a in t.get("activity", []):
            activity.append({**a, "ticket_number": t["ticket_number"]})
    activity.sort(key=lambda x: x["at"], reverse=True)

    return {
        "kpi": {"total": total, "open": eff.get("open", 0), "in_progress": eff.get("in_progress", 0),
                "pending": eff.get("pending", 0), "overdue": eff.get("overdue", 0),
                "completed": sum(1 for t in tickets if t["status"] == "closed")},
        "task_summary": {
            "today": sum(1 for t in tickets if (t.get("due_date") or "")[:10] == today and t["status"] != "closed"),
            "upcoming": len(upcoming), "pending": eff.get("pending", 0),
            "overdue": eff.get("overdue", 0), "completed": sum(1 for t in tickets if t["status"] == "closed")},
        "by_type": [{"name": k, "value": v} for k, v in by_type.most_common()],
        "by_priority": [{"name": k, "value": v} for k, v in by_priority.most_common()],
        "by_status": [{"name": STATUS_LABELS[k], "value": v} for k, v in eff.items()],
        "by_assignee": [{"name": k, "value": v} for k, v in by_assignee.most_common(8)],
        "top_customers": [{"name": k, "value": v} for k, v in by_customer.most_common(6)],
        "trend": trend, "overview": overview,
        "overdue": overdue_list, "upcoming": upcoming, "recent": recent,
        "activity": activity[:15],
    }


@router.get("/tickets/reports")
async def reports(admin=Depends(require_tickets)):
    tickets = [decorate(t) for t in await db.tickets.find({}, {"_id": 0}).to_list(5000)]
    closed = [t for t in tickets if t["status"] == "closed"]
    # avg completion time (hours)
    durations = []
    for t in closed:
        if t.get("closed_date") and t.get("created_at"):
            try:
                d = (datetime.fromisoformat(t["closed_date"]) - datetime.fromisoformat(t["created_at"])).total_seconds() / 3600
                durations.append(d)
            except Exception:
                pass
    avg_hours = round(sum(durations) / len(durations), 1) if durations else 0

    staff = await db.admin_users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    employee = []
    for s in staff:
        assigned = [t for t in tickets if t.get("assignee_id") == s["id"]]
        if not assigned:
            continue
        comp = sum(1 for t in assigned if t["status"] == "closed")
        employee.append({"name": s["name"], "total": len(assigned), "completed": comp,
                         "pending": sum(1 for t in assigned if t["effective_status"] == "pending"),
                         "overdue": sum(1 for t in assigned if t["is_overdue"]),
                         "rate": round(comp / len(assigned) * 100) if assigned else 0})

    by_customer = Counter(t.get("company_name") or t.get("customer_name", "?") for t in tickets)
    complaints = Counter(t.get("company_name") or t.get("customer_name", "?") for t in tickets if t.get("type") == "Complaint")
    by_type = Counter(t.get("type", "Other") for t in tickets)

    return {
        "performance": {"total": len(tickets), "completed": len(closed),
                        "pending": sum(1 for t in tickets if t["effective_status"] == "pending"),
                        "overdue": sum(1 for t in tickets if t["is_overdue"]),
                        "avg_completion_hours": avg_hours},
        "employee": sorted(employee, key=lambda x: x["total"], reverse=True),
        "top_customers": [{"name": k, "value": v} for k, v in by_customer.most_common(10)],
        "most_complaints": [{"name": k, "value": v} for k, v in complaints.most_common(5)],
        "by_type": [{"name": k, "value": v} for k, v in by_type.most_common()],
    }


@router.get("/tickets/{tid}")
async def get_ticket(tid: str, admin=Depends(require_tickets)):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return decorate(t)


@router.post("/tickets")
async def create_ticket(body: dict = Body(...), admin=Depends(require_tickets)):
    cust = await db.crm_customers.find_one({"id": body.get("customer_id")}, {"_id": 0})
    if not cust:
        raise HTTPException(status_code=400, detail="Valid customer is required")
    assignee = await db.admin_users.find_one({"id": body.get("assignee_id")}, {"_id": 0}) if body.get("assignee_id") else None
    num = await next_ticket_number()
    doc = {
        "id": new_id(), "ticket_number": num, "customer_id": cust["id"],
        "customer_name": cust["contact_name"], "company_name": cust["company_name"],
        "customer_phone": cust.get("phone", ""), "customer_email": cust.get("email", ""),
        "title": body.get("title", "Untitled"), "type": body.get("type", "Other"),
        "description": body.get("description", ""), "priority": body.get("priority", "Normal"),
        "status": "open", "assignee_id": assignee["id"] if assignee else None,
        "assignee_name": assignee["name"] if assignee else "Unassigned",
        "created_by": admin["id"], "created_by_name": admin["name"],
        "due_date": body.get("due_date"), "reminder": body.get("reminder"),
        "attachments": body.get("attachments", []), "activity": [],
        "is_demo": body.get("is_demo", False),
        "created_at": now_iso(), "updated_at": now_iso(), "closed_date": None,
    }
    await add_activity(doc, "created", admin, "Ticket created")
    if assignee:
        await add_activity(doc, "assigned", admin, f"Assigned to {assignee['name']}")
    await db.tickets.insert_one(dict(doc))
    await notify(doc["id"], f"New ticket {num} assigned to you", "assigned", assignee["id"] if assignee else None)
    await send_ticket_whatsapp(doc, "ticket_created")
    await log_audit(db, admin, "create", "ticket", doc["id"], {"number": num})
    return decorate(doc)


@router.put("/tickets/{tid}")
async def update_ticket(tid: str, body: dict = Body(...), admin=Depends(require_tickets)):
    t = await db.tickets.find_one({"id": tid})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    updates = {"updated_at": now_iso()}
    for k in ["title", "type", "description", "priority", "due_date", "reminder", "attachments"]:
        if k in body:
            updates[k] = body[k]
    if "assignee_id" in body and body["assignee_id"] != t.get("assignee_id"):
        assignee = await db.admin_users.find_one({"id": body["assignee_id"]}, {"_id": 0})
        updates["assignee_id"] = body["assignee_id"]
        updates["assignee_name"] = assignee["name"] if assignee else "Unassigned"
        await add_activity(t, "assigned", admin, f"Reassigned to {updates['assignee_name']}")
        await notify(tid, f"Ticket {t['ticket_number']} assigned to you", "assigned", body["assignee_id"])
    if "due_date" in body and body["due_date"] != t.get("due_date"):
        await add_activity(t, "due_changed", admin, "Due date changed")
    updates["activity"] = t["activity"]
    await db.tickets.update_one({"id": tid}, {"$set": updates})
    await log_audit(db, admin, "update", "ticket", tid)
    return decorate(await db.tickets.find_one({"id": tid}, {"_id": 0}))


@router.patch("/tickets/{tid}/status")
async def change_status(tid: str, body: dict = Body(...), admin=Depends(require_tickets)):
    t = await db.tickets.find_one({"id": tid})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    st = body.get("status")
    if st not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    upd = {"status": st, "updated_at": now_iso()}
    if st == "closed":
        upd["closed_date"] = now_iso()
    await add_activity(t, "status_changed", admin, f"Status changed to {STATUS_LABELS[st]}")
    upd["activity"] = t["activity"]
    await db.tickets.update_one({"id": tid}, {"$set": upd})
    await notify(tid, f"Ticket {t['ticket_number']} is now {STATUS_LABELS[st]}", "status", t.get("assignee_id"))
    await send_ticket_whatsapp(t, "ticket_status", STATUS_LABELS[st])
    await log_audit(db, admin, "status_change", "ticket", tid, {"status": st})
    return decorate(await db.tickets.find_one({"id": tid}, {"_id": 0}))


@router.post("/tickets/{tid}/updates")
async def add_update(tid: str, body: dict = Body(...), admin=Depends(require_tickets)):
    t = await db.tickets.find_one({"id": tid})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    await add_activity(t, "comment", admin, body.get("message", ""))
    await db.tickets.update_one({"id": tid}, {"$set": {"activity": t["activity"], "updated_at": now_iso()}})
    await notify(tid, f"New update on ticket {t['ticket_number']}", "comment", t.get("assignee_id"))
    return decorate(await db.tickets.find_one({"id": tid}, {"_id": 0}))


@router.post("/tickets/{tid}/reply")
async def reply_whatsapp(tid: str, body: dict = Body(...), admin=Depends(require_tickets)):
    """Send an agent reply to the customer via the WhatsApp API and log it to the timeline."""
    t = await db.tickets.find_one({"id": tid})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    phone = t.get("customer_phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Customer has no phone number")
    msg = (body.get("message") or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Message is required")
    res = await send_whatsapp(db, phone, msg, kind="ticket_reply")
    ok = res.get("status") == "sent"
    note = f"↩ WhatsApp to customer: {msg}" + ("" if ok else f"  (delivery: {res.get('status')})")
    await add_activity(t, "whatsapp_reply", admin, note)
    await db.tickets.update_one({"id": tid}, {"$set": {"activity": t["activity"], "updated_at": now_iso()}})
    return {"ok": ok, "delivery": res.get("status"), "ticket": decorate(await db.tickets.find_one({"id": tid}, {"_id": 0}))}


@router.post("/tickets/{tid}/attachments")
async def add_attachment(tid: str, body: dict = Body(...), admin=Depends(require_tickets)):
    t = await db.tickets.find_one({"id": tid})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    att = {"id": new_id(), "filename": body.get("filename", "file"), "url": body.get("url", ""),
           "size": body.get("size", 0), "uploaded_by": admin["name"], "uploaded_at": now_iso()}
    atts = t.get("attachments", []) + [att]
    await add_activity(t, "attachment", admin, f"Uploaded {att['filename']}")
    await db.tickets.update_one({"id": tid}, {"$set": {"attachments": atts, "activity": t["activity"], "updated_at": now_iso()}})
    return decorate(await db.tickets.find_one({"id": tid}, {"_id": 0}))


@router.delete("/tickets/{tid}/attachments/{aid}")
async def del_attachment(tid: str, aid: str, admin=Depends(require_tickets)):
    t = await db.tickets.find_one({"id": tid})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    atts = [a for a in t.get("attachments", []) if a["id"] != aid]
    await db.tickets.update_one({"id": tid}, {"$set": {"attachments": atts}})
    return {"deleted": True}


@router.delete("/tickets/{tid}")
async def delete_ticket(tid: str, admin=Depends(require_tickets)):
    await db.tickets.delete_one({"id": tid})
    return {"deleted": True}


# =============== NOTIFICATIONS ===============
@router.get("/tickets/notifications/list")
async def notifications(admin=Depends(require_tickets)):
    items = await db.ticket_notifications.find(
        {"$or": [{"target_user_id": admin["id"]}, {"target_user_id": None}]},
        {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    unread = sum(1 for n in items if not n.get("read"))
    return {"items": items, "unread": unread}


@router.patch("/tickets/notifications/{nid}/read")
async def read_notif(nid: str, admin=Depends(require_tickets)):
    await db.ticket_notifications.update_one({"id": nid}, {"$set": {"read": True}})
    return {"ok": True}


@router.patch("/tickets/notifications/read-all")
async def read_all(admin=Depends(require_tickets)):
    await db.ticket_notifications.update_many(
        {"$or": [{"target_user_id": admin["id"]}, {"target_user_id": None}]}, {"$set": {"read": True}})
    return {"ok": True}
