import re
import uuid
from datetime import datetime, timezone


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_mobile(m):
    """Normalize an Indian mobile number to its 10-digit form."""
    d = re.sub(r"\D", "", m or "")
    if len(d) > 10:
        d = d[-10:]
    return d


def new_id():
    return str(uuid.uuid4())


async def next_order_number(db):
    year = datetime.now(timezone.utc).year
    res = await db.counters.find_one_and_update(
        {"id": f"order-{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = res["seq"]
    return f"VM-{year}-{seq:05d}"


async def log_audit(db, actor, action, entity=None, entity_id=None, meta=None):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "actor_id": (actor or {}).get("id"),
        "actor_name": (actor or {}).get("name", "System"),
        "actor_role": (actor or {}).get("role"),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "meta": meta or {},
        "created_at": now_iso(),
    })


def add_order_activity(order, text, actor_name="System"):
    entry = {
        "id": new_id(),
        "text": text,
        "actor": actor_name,
        "at": now_iso(),
    }
    order.setdefault("activity", []).append(entry)
    return entry


def compute_scheme(qty, schemes):
    """
    Given an ordered qty and a list of applicable scheme docs for a variant,
    return dict: {scheme_id, scheme_name, scheme_label, free_qty, special_price}
    """
    best = {"scheme_id": None, "scheme_name": None, "scheme_label": None,
            "free_qty": 0, "special_price": None}
    best_free = 0
    best_tier = 0
    for s in schemes:
        buy = s.get("buy_quantity") or 0
        min_q = s.get("min_quantity") or buy or 0
        max_q = s.get("max_quantity") or 0
        if max_q and qty > max_q:
            continue
        if s.get("scheme_type") in ("special_price", "case_price"):
            sp = s.get("special_price")
            if qty >= (min_q or 1) and sp is not None:
                # one-to-many: pick the lowest applicable price
                if best["special_price"] is None or sp < best["special_price"]:
                    best["special_price"] = sp
                    if best["scheme_id"] is None:
                        best["scheme_id"] = s["id"]
                        best["scheme_name"] = s.get("name")
                    best["scheme_label"] = f"{min_q} @ ₹{sp}"
            continue
        # free_qty type
        if buy and qty >= buy:
            times = qty // buy
            free = times * (s.get("free_quantity") or 0)
            # prefer the scheme with highest buy tier the qty qualifies for
            if buy > best_tier or (buy == best_tier and free > best_free):
                best_tier = buy
                best_free = free
                best["scheme_id"] = s["id"]
                best["scheme_name"] = s.get("name")
                best["scheme_label"] = f"{buy}+{s.get('free_quantity')}"
                best["free_qty"] = free
    return best


async def applicable_schemes(db, variant_id, product_id, customer_type=None):
    today = now_iso()
    q = {
        "active": True,
        "$and": [
            {"$or": [{"variant_id": variant_id}, {"product_id": product_id, "variant_id": None}]},
        ],
    }
    schemes = await db.schemes.find(q, {"_id": 0}).to_list(200)
    out = []
    for s in schemes:
        sd = s.get("start_date")
        ed = s.get("end_date")
        if sd and today < sd:
            continue
        if ed and today > ed:
            continue
        ct = s.get("customer_type")
        if ct and ct != "all" and customer_type and ct != customer_type:
            continue
        out.append(s)
    return out


# --- Mock notification layer (WhatsApp + Email) ---
import logging
logger = logging.getLogger("vetmech.notify")


async def send_whatsapp(db, to_number, message, kind="generic"):
    settings = await db.settings.find_one({"id": "whatsapp"}, {"_id": 0}) or {}
    logged = {
        "id": new_id(),
        "channel": "whatsapp",
        "to": to_number,
        "kind": kind,
        "message": message,
        "simulated": not bool(settings.get("api_url") and settings.get("api_key")),
        "created_at": now_iso(),
    }
    await db.notification_logs.insert_one(dict(logged))
    logger.info(f"[WHATSAPP -> {to_number}] ({kind}) {message}")
    logged.pop("_id", None)
    return logged


async def send_email(db, to_email, subject, body, kind="generic"):
    settings = await db.settings.find_one({"id": "smtp"}, {"_id": 0}) or {}
    logged = {
        "id": new_id(),
        "channel": "email",
        "to": to_email,
        "subject": subject,
        "kind": kind,
        "message": body,
        "simulated": not bool(settings.get("host") and settings.get("username")),
        "created_at": now_iso(),
    }
    await db.notification_logs.insert_one(dict(logged))
    logger.info(f"[EMAIL -> {to_email}] {subject}")
    logged.pop("_id", None)
    return logged
