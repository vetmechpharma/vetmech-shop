import re
import uuid
import httpx
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
    sp_best = {"id": None, "name": None, "label": None, "price": None, "min": None}
    for s in schemes:
        buy = s.get("buy_quantity") or 0
        min_q = s.get("min_quantity") or buy or 0
        max_q = s.get("max_quantity") or 0
        if max_q and qty > max_q:
            continue
        if s.get("scheme_type") in ("special_price", "case_price"):
            sp = s.get("special_price")
            if qty >= (min_q or 1) and sp is not None:
                if sp_best["price"] is None or sp < sp_best["price"]:
                    sp_best = {"id": s["id"], "name": s.get("name"), "label": f"{min_q} @ ₹{sp}", "price": sp, "min": min_q}
            continue
        # free_qty type — pick the scheme giving the MOST free units (best value, no stacking)
        if buy and qty >= buy:
            free = (qty // buy) * (s.get("free_quantity") or 0)
            if free > best_free:
                best_free = free
                best.update({"scheme_id": s["id"], "scheme_name": s.get("name"),
                             "scheme_label": f"{buy}+{s.get('free_quantity')}", "free_qty": free})
    if sp_best["price"] is not None:
        best["special_price"] = sp_best["price"]
        if best_free == 0:
            # no free offer applied — the special/case price IS the offer
            best["scheme_id"] = sp_best["id"]
            best["scheme_name"] = sp_best["name"]
            best["scheme_label"] = sp_best["label"]
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


# --- Notification layer: WhatsApp (wa.animitra.in) + Email ---
import logging
logger = logging.getLogger("vetmech.notify")

WA_DEFAULT_BASE = "https://wa.animitra.in"


def format_wa_number(m):
    """Return WhatsApp-ready digits with country code (Indian default)."""
    d = re.sub(r"\D", "", m or "")
    if len(d) == 10:
        d = "91" + d
    elif len(d) == 11 and d.startswith("0"):
        d = "91" + d[1:]
    return d


async def send_whatsapp(db, to_number, message, kind="generic"):
    settings = await db.settings.find_one({"id": "whatsapp"}, {"_id": 0}) or {}
    api_key = (settings.get("api_key") or "").strip()
    session_id = (settings.get("session_id") or "").strip()
    base_url = (settings.get("api_url") or WA_DEFAULT_BASE).strip().rstrip("/")
    live = bool(api_key and session_id)
    logged = {
        "id": new_id(),
        "channel": "whatsapp",
        "to": to_number,
        "kind": kind,
        "message": message,
        "simulated": not live,
        "status": "simulated",
        "created_at": now_iso(),
    }
    if live:
        try:
            async with httpx.AsyncClient(timeout=20) as http:
                resp = await http.post(
                    f"{base_url}/api/v1/send/text",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"session_id": session_id, "to": format_wa_number(to_number), "text": message},
                )
            if resp.status_code == 200:
                data = resp.json()
                logged["status"] = "sent"
                logged["message_id"] = data.get("messageId")
            else:
                logged["status"] = "failed"
                logged["error"] = f"{resp.status_code}: {resp.text[:300]}"
                logger.warning(f"[WHATSAPP FAIL {resp.status_code} -> {to_number}] {resp.text[:200]}")
        except Exception as e:
            logged["status"] = "failed"
            logged["error"] = str(e)[:300]
            logger.warning(f"[WHATSAPP ERROR -> {to_number}] {e}")
    else:
        logger.info(f"[WHATSAPP(sim) -> {to_number}] ({kind}) {message}")
    await db.notification_logs.insert_one(dict(logged))
    logged.pop("_id", None)
    return logged


def _smtp_send(host, port, username, password, sender, recipients, subject, html_body):
    import smtplib
    import ssl
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(html_body, "html"))
    port = int(port or 587)
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=25, context=ssl.create_default_context()) as s:
            s.login(username, password)
            s.sendmail(username, recipients, msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=25) as s:
            s.ehlo()
            try:
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
            except Exception:
                pass
            s.login(username, password)
            s.sendmail(username, recipients, msg.as_string())


EMAIL_DEFAULTS = {
    "welcome": {"subject": "Welcome to VETMECH Pharmaceuticals",
                "body": "Dear {name},\n\nThank you for registering with VETMECH Pharmaceuticals. Your account is being reviewed and you will be notified once it is approved. You can then log in to view your special B2B pricing and place orders.\n\nRegards,\nVETMECH Pharmaceuticals"},
    "otp": {"subject": "Your VETMECH verification code",
            "body": "Dear Customer,\n\nYour VETMECH verification code is {otp}. It is valid for 10 minutes.\n\nIf you did not request this, please ignore this email."},
    "order_received": {"subject": "VETMECH Order {order} received",
                       "body": "Dear {name},\n\nYour VETMECH order {order} has been received.\n\n{items}\n\nOur team will confirm it shortly. Thank you!"},
    "order_status": {"subject": "VETMECH Order {order} update",
                     "body": "Dear {name},\n\n{status_message}\n\nRegards,\nVETMECH Pharmaceuticals"},
}


async def email_for(db, key, ctx):
    doc = await db.settings.find_one({"id": "email_templates"}, {"_id": 0}) or {}
    t = (doc.get("templates") or {}).get(key) or {}
    d = EMAIL_DEFAULTS.get(key, {"subject": "VETMECH Pharmaceuticals", "body": "{body}"})
    subject = t.get("subject") or d["subject"]
    body = t.get("body") or d["body"]
    for k, v in (ctx or {}).items():
        subject = subject.replace("{" + k + "}", str(v))
        body = body.replace("{" + k + "}", str(v))
    return subject, body


async def send_email(db, to_email, subject, body, kind="generic", cc_admin=None):
    settings = await db.settings.find_one({"id": "smtp"}, {"_id": 0}) or {}
    host = (settings.get("host") or "").strip()
    username = (settings.get("username") or "").strip()
    password = (settings.get("password") or "").strip()
    admin_email = (settings.get("admin_email") or "").strip()
    sender_email = (settings.get("sender_email") or username).strip()
    sender_name = settings.get("sender_name") or "VETMECH Pharmaceuticals"
    to = admin_email if to_email == "admin" else to_email
    recipients = [r for r in [to] if r]
    if cc_admin is None:
        cc_admin = bool(settings.get("cc_admin"))
    if cc_admin and admin_email and to_email != "admin" and admin_email not in recipients:
        recipients.append(admin_email)
    live = bool(host and username and password and recipients)
    logged = {
        "id": new_id(),
        "channel": "email",
        "to": ", ".join(recipients) or to_email,
        "subject": subject,
        "kind": kind,
        "message": body,
        "simulated": not live,
        "status": "simulated",
        "created_at": now_iso(),
    }
    if live:
        try:
            sender = f"{sender_name} <{sender_email}>" if sender_email else username
            html = body if ("<" in body and ">" in body) else \
                "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;white-space:pre-line;line-height:1.6\">" + body + "</div>"
            import asyncio
            await asyncio.to_thread(_smtp_send, host, settings.get("port"), username, password, sender, recipients, subject, html)
            logged["status"] = "sent"
        except Exception as e:
            logged["status"] = "failed"
            logged["error"] = str(e)[:300]
            logger.warning(f"[EMAIL FAIL -> {to}] {e}")
    else:
        logger.info(f"[EMAIL(sim) -> {to}] {subject}")
    await db.notification_logs.insert_one(dict(logged))
    logged.pop("_id", None)
    return logged
