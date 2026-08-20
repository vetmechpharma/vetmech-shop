import io
from datetime import datetime, timezone, timedelta
from collections import Counter
from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Optional

from db import db, paginate
from security import get_current_admin
from helpers import new_id, now_iso, log_audit, next_order_number, add_order_activity, send_whatsapp, send_email

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from num2words import num2words

router = APIRouter(prefix="/api/admin/quotations", tags=["quotations"])
admin_dep = Depends(get_current_admin)

STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "cancelled"]


async def gen_number():
    cfg = (await db.settings.find_one({"id": "quotation"}, {"_id": 0})) or {}
    prefix = cfg.get("prefix", "VMP/QTN")
    year = datetime.now(timezone.utc).year
    digits = int(cfg.get("digits", 5))
    start = int(cfg.get("start", 1))
    res = await db.counters.find_one_and_update({"id": f"qtn-{year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    seq = res["seq"] + start - 1
    return f"{prefix}/{year}/{str(seq).zfill(digits)}"


def calc_item(it):
    qty = float(it.get("qty", 0)); rate = float(it.get("rate", 0))
    gross = qty * rate
    disc = it.get("discount", 0) or 0
    if it.get("discount_type", "amount") == "percent":
        disc_amt = gross * float(disc) / 100
    else:
        disc_amt = float(disc)
    taxable = max(gross - disc_amt, 0)
    gst_amt = taxable * float(it.get("gst", 0)) / 100
    it["gross"] = round(gross, 2); it["discount_amount"] = round(disc_amt, 2)
    it["taxable"] = round(taxable, 2); it["gst_amount"] = round(gst_amt, 2)
    it["total"] = round(taxable + gst_amt, 2)
    return it


def totals(items):
    total = sum(i["gross"] for i in items)
    disc = sum(i["discount_amount"] for i in items)
    gst = sum(i["gst_amount"] for i in items)
    grand = sum(i["total"] for i in items)
    words = "Rupees " + num2words(round(grand), lang="en_IN").title() + " Only"
    return {"total": round(total, 2), "discount": round(disc, 2), "gst": round(gst, 2),
            "grand_total": round(grand, 2), "amount_words": words}


def check_expiry(q):
    if q.get("status") in ("draft", "sent") and q.get("valid_until"):
        if q["valid_until"] < now_iso()[:10]:
            q["status"] = "expired"
    return q


async def build_snapshot(admin, customer_id, override_terms=None):
    company = (await db.settings.find_one({"id": "company"}, {"_id": 0})) or {}
    qcfg = (await db.settings.find_one({"id": "quotation"}, {"_id": 0})) or {}
    cust = await db.crm_customers.find_one({"id": customer_id}, {"_id": 0}) if customer_id else None
    if not cust and customer_id:
        cust = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    user = await db.admin_users.find_one({"id": admin["id"]}, {"_id": 0, "password_hash": 0})
    return {
        "company_snapshot": company,
        "terms": override_terms if override_terms is not None else qcfg.get("terms", []),
        "signatory": {"name": user.get("name"), "designation": user.get("designation", ""),
                      "signature": user.get("signature") if user.get("use_signature", True) else None},
        "customer": cust,
    }


@router.get("")
async def list_quotations(status: Optional[str] = None, q: Optional[str] = None, page: int = 1, limit: int = 50, admin=admin_dep):
    query = {}
    if status:
        query["status"] = status
    if q:
        import re
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"number": rx}, {"customer.contact_name": rx}, {"customer.company_name": rx}, {"customer.phone": rx}]
    res = await paginate(db.quotations, query, page, limit)
    res["items"] = [check_expiry(x) for x in res["items"]]
    return res


@router.get("/dashboard")
async def dashboard(admin=admin_dep):
    qs = [check_expiry(x) for x in await db.quotations.find({}, {"_id": 0}).to_list(5000)]
    by = Counter(x["status"] for x in qs)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    return {
        "counts": {s: by.get(s, 0) for s in STATUSES},
        "total": len(qs),
        "this_month": sum(1 for x in qs if x["created_at"][:7] == month),
        "value": round(sum(x.get("summary", {}).get("grand_total", 0) for x in qs), 2),
        "accepted_value": round(sum(x.get("summary", {}).get("grand_total", 0) for x in qs if x["status"] == "accepted"), 2),
        "conversion_rate": round(by.get("accepted", 0) / len(qs) * 100) if qs else 0,
        "top_customers": [{"name": n, "value": v} for n, v in Counter(x["customer"]["company_name"] for x in qs if x.get("customer")).most_common(5)],
    }


@router.get("/{qid}")
async def get_quotation(qid: str, admin=admin_dep):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Not found")
    return check_expiry(q)


async def _persist(qid, q):
    q["updated_at"] = now_iso()
    await db.quotations.update_one({"id": qid}, {"$set": q})


@router.post("")
async def create_quotation(body: dict = Body(...), admin=admin_dep):
    items = [calc_item(dict(i)) for i in body.get("items", [])]
    snap = await build_snapshot(admin, body.get("customer_id"), body.get("terms"))
    qdate = body.get("quote_date") or now_iso()[:10]
    validity = int(body.get("validity_days", 15))
    valid_until = (datetime.fromisoformat(qdate) + timedelta(days=validity)).date().isoformat()
    q = {
        "id": new_id(), "number": await gen_number(), "status": body.get("status", "draft"),
        "quote_date": qdate, "validity_days": validity, "valid_until": valid_until,
        "customer": snap["customer"], "customer_id": body.get("customer_id"),
        "items": items, "summary": totals(items),
        "company_snapshot": snap["company_snapshot"], "terms": snap["terms"],
        "signatory": snap["signatory"], "notes": body.get("notes", ""),
        "created_by": admin["id"], "created_by_name": admin["name"],
        "history": [{"at": now_iso(), "user": admin["name"], "action": "Quotation created", "channel": ""}],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.quotations.insert_one(dict(q))
    await log_audit(db, admin, "create", "quotation", q["id"], {"number": q["number"]})
    q.pop("_id", None)
    return q


@router.put("/{qid}")
async def update_quotation(qid: str, body: dict = Body(...), admin=admin_dep):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Not found")
    if "items" in body:
        q["items"] = [calc_item(dict(i)) for i in body["items"]]
        q["summary"] = totals(q["items"])
    for k in ["quote_date", "validity_days", "notes", "terms", "status"]:
        if k in body:
            q[k] = body[k]
    if body.get("customer_id") and body["customer_id"] != q.get("customer_id"):
        snap = await build_snapshot(admin, body["customer_id"])
        q["customer"] = snap["customer"]; q["customer_id"] = body["customer_id"]
    if "quote_date" in body or "validity_days" in body:
        q["valid_until"] = (datetime.fromisoformat(q["quote_date"]) + timedelta(days=int(q["validity_days"]))).date().isoformat()
    q.setdefault("history", []).append({"at": now_iso(), "user": admin["name"], "action": "Quotation edited", "channel": ""})
    await _persist(qid, q)
    await log_audit(db, admin, "update", "quotation", qid)
    return await db.quotations.find_one({"id": qid}, {"_id": 0})


@router.patch("/{qid}/status")
async def set_status(qid: str, body: dict = Body(...), admin=admin_dep):
    st = body.get("status")
    if st not in STATUSES:
        raise HTTPException(400, "Invalid status")
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Not found")
    q["status"] = st
    q.setdefault("history", []).append({"at": now_iso(), "user": admin["name"], "action": f"Status → {st}", "channel": ""})
    await _persist(qid, q)
    return q


@router.post("/{qid}/duplicate")
async def duplicate(qid: str, admin=admin_dep):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Not found")
    nq = dict(q)
    nq["id"] = new_id(); nq["number"] = await gen_number(); nq["status"] = "draft"
    nq["quote_date"] = now_iso()[:10]
    nq["valid_until"] = (datetime.now(timezone.utc) + timedelta(days=int(q.get("validity_days", 15)))).date().isoformat()
    nq["created_by"] = admin["id"]; nq["created_by_name"] = admin["name"]
    nq["history"] = [{"at": now_iso(), "user": admin["name"], "action": f"Duplicated from {q['number']}", "channel": ""}]
    nq["created_at"] = now_iso(); nq["updated_at"] = now_iso()
    await db.quotations.insert_one(dict(nq))
    nq.pop("_id", None)
    return nq


@router.post("/{qid}/convert")
async def convert_to_order(qid: str, admin=admin_dep):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Not found")
    cust = q.get("customer") or {}
    lines = [{"product_id": it.get("product_id"), "product_name": it.get("name"), "brand_name": "",
              "image": "", "slug": None, "variant_id": it.get("variant_id"), "pack_size": it.get("packing", ""),
              "unit": it.get("unit", ""), "sku": "", "mrp": it.get("mrp"), "selling_price": it.get("rate"),
              "unit_price": it.get("rate"), "gst_percent": it.get("gst", 0), "gst_inclusive": False,
              "stock_status": "in_stock", "qty": int(it.get("qty", 0)), "scheme_id": None,
              "scheme_label": None, "free_qty": 0, "dispatch_qty": int(it.get("qty", 0))} for it in q.get("items", [])]
    order_no = await next_order_number(db)
    total_qty = sum(l["qty"] for l in lines)
    order = {
        "id": new_id(), "order_number": order_no, "customer_id": q.get("customer_id"),
        "customer_name": cust.get("contact_name", ""), "customer_mobile": cust.get("phone", ""),
        "customer_whatsapp": cust.get("phone", ""), "company_name": cust.get("company_name", ""),
        "customer_category": cust.get("customer_type", "other"),
        "address": {"line1": cust.get("address", ""), "pincode": cust.get("pincode", ""), "state": cust.get("state", ""), "district": cust.get("district", "")},
        "items": lines, "total_qty": total_qty, "total_free": 0, "total_dispatch": total_qty,
        "status": "new", "notes": f"Created From Quotation: {q['number']}", "internal_notes": "",
        "from_quotation": q["number"], "activity": [], "created_at": now_iso(), "updated_at": now_iso(),
    }
    add_order_activity(order, f"Order created from quotation {q['number']}", admin["name"])
    await db.orders.insert_one(dict(order))
    q.setdefault("history", []).append({"at": now_iso(), "user": admin["name"], "action": f"Converted to Order {order_no}", "channel": ""})
    q["status"] = "accepted"; q["converted_order"] = order_no
    await _persist(qid, q)
    return {"order_number": order_no}


@router.post("/{qid}/send")
async def send_quotation(qid: str, body: dict = Body(...), admin=admin_dep):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Not found")
    channel = body.get("channel", "email")
    cust = q.get("customer") or {}
    if channel == "whatsapp":
        msg = f"Dear {cust.get('contact_name','')},\n\nPlease find our quotation.\n\nQuotation No: {q['number']}\nDate: {q['quote_date']}\nValid Until: {q['valid_until']}\n\nThank you.\nVETMECH PHARMACEUTICALS PRIVATE LIMITED"
        await send_whatsapp(db, cust.get("phone", ""), msg, kind="quotation")
    else:
        await send_email(db, cust.get("email", "admin"), f"Quotation {q['number']} – VETMECH PHARMACEUTICALS",
                         f"Please find quotation {q['number']} attached.", kind="quotation")
    if q["status"] == "draft":
        q["status"] = "sent"
    q.setdefault("history", []).append({"at": now_iso(), "user": admin["name"], "action": f"Sent via {channel}", "channel": channel})
    await _persist(qid, q)
    await log_audit(db, admin, "send", "quotation", qid, {"channel": channel})
    return {"sent": True, "channel": channel}


@router.delete("/{qid}")
async def delete_quotation(qid: str, admin=admin_dep):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Not found")
    if q.get("status") != "draft" and admin.get("role") != "super_admin":
        raise HTTPException(400, "Only draft quotations can be deleted")
    await db.quotations.delete_one({"id": qid})
    return {"deleted": True}


def _inr(v):
    return "Rs. " + f"{v:,.2f}"


@router.get("/{qid}/pdf")
async def quotation_pdf(qid: str, admin=admin_dep):
    from fastapi.responses import Response
    from mediahelper import fetch_image
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Not found")
    comp = q.get("company_snapshot", {}); cust = q.get("customer") or {}; s = q.get("summary", {})
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=18 * mm, leftMargin=14 * mm, rightMargin=14 * mm)
    ss = getSampleStyleSheet()
    small = ParagraphStyle("s", parent=ss["Normal"], fontSize=8)
    green = colors.HexColor("#045D3A")
    story = []
    title = ParagraphStyle("t", parent=ss["Title"], textColor=green, fontSize=18)
    story.append(Paragraph(comp.get("name", "VETMECH PHARMACEUTICALS"), title))
    story.append(Paragraph(f"{comp.get('address','')}<br/>Phone: {comp.get('phone','')} | Email: {comp.get('email','')}<br/>GST: {comp.get('gst_number','')}", small))
    story.append(Spacer(1, 6))
    head = ParagraphStyle("h", parent=ss["Heading2"], textColor=green)
    story.append(Paragraph("QUOTATION", head))
    story.append(Paragraph(f"Quote No: <b>{q['number']}</b> &nbsp; Date: {q['quote_date']} &nbsp; Valid Until: {q['valid_until']}", small))
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>QUOTATION TO</b>", small))
    story.append(Paragraph(f"{cust.get('company_name','')}<br/>{cust.get('contact_name','')}<br/>Phone: {cust.get('phone','')} | Email: {cust.get('email','')}<br/>{cust.get('address','')} {cust.get('district','')} {cust.get('state','')} {cust.get('pincode','')}", small))
    story.append(Spacer(1, 10))
    data = [["S.No", "Product", "Pack", "Unit", "Qty", "MRP", "Rate", "Disc", "GST%", "Total"]]
    for i, it in enumerate(q.get("items", []), 1):
        data.append([str(i), it.get("name", ""), it.get("packing", ""), it.get("unit", ""), str(it.get("qty", "")),
                     _inr(it.get("mrp", 0)), _inr(it.get("rate", 0)), _inr(it.get("discount_amount", 0)),
                     str(it.get("gst", 0)), _inr(it.get("total", 0))])
    t = Table(data, repeatRows=1, colWidths=[24, 120, 45, 35, 30, 55, 55, 45, 32, 60])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), green), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("FONTSIZE", (0, 0), (-1, -1), 7.5), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (4, 1), (-1, -1), "RIGHT")]))
    story.append(t)
    story.append(Spacer(1, 8))
    summ = Table([["Total", _inr(s.get("total", 0))], ["Discount", _inr(s.get("discount", 0))],
                  ["GST", _inr(s.get("gst", 0))], ["Grand Total", _inr(s.get("grand_total", 0))]], colWidths=[80, 90], hAlign="RIGHT")
    summ.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("BACKGROUND", (0, 3), (-1, 3), green),
                              ("TEXTCOLOR", (0, 3), (-1, 3), colors.white), ("ALIGN", (1, 0), (1, -1), "RIGHT")]))
    story.append(summ)
    story.append(Paragraph(f"<b>Amount in words:</b> {s.get('amount_words','')}", small))
    story.append(Spacer(1, 12))
    if q.get("terms"):
        story.append(Paragraph("<b>Terms & Conditions</b>", small))
        for tterm in q["terms"]:
            story.append(Paragraph(f"• {tterm}", small))
    story.append(Spacer(1, 16))
    sig = q.get("signatory", {})
    story.append(Paragraph(f"For {comp.get('name','VETMECH PHARMACEUTICALS PRIVATE LIMITED')}", small))
    img = fetch_image(sig.get("signature"))
    if img:
        try:
            story.append(RLImage(img, width=45 * mm, height=15 * mm))
        except Exception:
            pass
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>{sig.get('name','')}</b><br/>{sig.get('designation','')}<br/>Authorized Signatory", small))

    def footer(canvas, d):
        canvas.saveState(); canvas.setFont("Helvetica", 7)
        canvas.drawString(14 * mm, 10 * mm, f"{comp.get('name','')} | {comp.get('phone','')} | {comp.get('email','')} | GST: {comp.get('gst_number','')}")
        canvas.drawRightString(196 * mm, 10 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename={q['number'].replace('/','-')}.pdf"})
