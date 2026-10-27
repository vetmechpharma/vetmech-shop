"""Customer statements in integer paise; invoice posting is atomic with order closure."""
import hashlib
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError

from db import db, paginate
from helpers import new_id, now_iso, log_audit
from security import get_current_customer, require_module

router = APIRouter(prefix="/api", tags=["customer-ledger"])


class BookBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class OpeningBody(BookBody):
    amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    direction: Literal["debit", "credit"] = "debit"
    as_of_date: date
    expected_revision: int = Field(default=0, ge=0)
    notes: str = Field(default="", max_length=500)
    reason: str = Field(default="", max_length=500)


class PaymentBody(BookBody):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    transaction_date: date
    mode: Literal["GPAY", "UPI", "NET_BANKING"]
    transaction_id: str = Field(min_length=3, max_length=128)
    notes: str = Field(default="", max_length=500)


class CloseBody(BookBody):
    invoice_number: str = Field(min_length=1, max_length=80)
    invoice_date: date
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    expected_updated_at: str | None = None


class ReasonBody(BookBody):
    reason: str = Field(min_length=5, max_length=500)


def check_date(value):
    if value > datetime.now(ZoneInfo("Asia/Kolkata")).date():
        raise HTTPException(400, "The transaction date cannot be in the future")
    return value.isoformat()


def paise(amount):
    return int(amount * 100)


async def customer_record(cid, writing=False):
    customer = await db.customers.find_one({"id": cid}, {"_id": 0, "id": 1, "name": 1, "mobile": 1, "company_name": 1, "status": 1})
    if not customer:
        raise HTTPException(404, "Customer not found")
    if writing and customer.get("status") == "deleted":
        raise HTTPException(409, "This customer is deleted; the retained ledger is read-only")
    return customer


def public_entry(row):
    return {key: value for key, value in row.items() if key not in {"_id", "history", "created_by", "reviewed_by", "voided_by"}}


async def statement(cid, page, limit):
    customer = await customer_record(cid)
    rows = [public_entry(row) async for row in db.ledger_entries.find({"customer_id": cid})]
    opening = next((row for row in rows if row["entry_type"] == "opening"), None)
    async for order in db.orders.find({"customer_id": cid, "$or": [{"invoice": {"$exists": True}}, {"voided_invoices.0": {"$exists": True}}]}):
        invoices = [*order.get("voided_invoices", []), *([order["invoice"]] if order.get("invoice") else [])]
        for invoice in invoices:
            rows.append({**public_entry(invoice), "entry_type": "invoice", "transaction_date": invoice["invoice_date"],
                         "customer_id": cid, "order_id": order["id"], "order_number": order.get("order_number", ""),
                         "description": "Invoice " + invoice["invoice_number"]})
    rows.sort(key=lambda row: (row["transaction_date"], row.get("created_at", ""), row["id"]))
    balance = debit = credit = 0
    for row in rows:
        posted = row["status"] in {"posted", "confirmed"}
        amount = row["amount_paise"] if posted else 0
        row["debit_paise"] = amount if row["entry_type"] == "invoice" or row.get("direction") == "debit" else 0
        row["credit_paise"] = amount if row["entry_type"] == "payment" or row.get("direction") == "credit" else 0
        debit += row["debit_paise"]
        credit += row["credit_paise"]
        balance += row["debit_paise"] - row["credit_paise"]
        row["balance_paise"] = balance
    rows.reverse()
    total = len(rows)
    return {"customer": customer, "currency": "INR", "opening": opening,
            "summary": {"debit_paise": debit, "credit_paise": credit, "balance_paise": balance,
                        "outstanding_paise": max(0, balance), "advance_paise": max(0, -balance),
                        "pending_payments": sum(row["status"] == "pending" for row in rows)},
            "items": rows[(page - 1) * limit:page * limit], "total": total,
            "page": page, "limit": limit, "pages": (total + limit - 1) // limit}


@router.get("/ledger/mine")
async def my_ledger(page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), customer=Depends(get_current_customer)):
    return await statement(customer["id"], page, limit)


@router.get("/admin/customers/{cid}/ledger")
async def customer_ledger(cid: str, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), admin=Depends(require_module("customers"))):
    return await statement(cid, page, limit)


@router.put("/admin/customers/{cid}/opening-balance")
async def set_opening(cid: str, body: OpeningBody, admin=Depends(require_module("customers"))):
    await customer_record(cid, writing=True)
    values = {"amount_paise": paise(body.amount), "direction": body.direction,
              "transaction_date": check_date(body.as_of_date), "notes": body.notes}
    key = "opening:" + cid
    existing = await db.ledger_entries.find_one({"_id": key})
    if existing and all(existing.get(k) == v for k, v in values.items()):
        return public_entry(existing)
    if existing:
        if len(body.reason) < 5:
            raise HTTPException(400, "Enter a reason of at least 5 characters to correct the opening balance")
        if existing["revision"] != body.expected_revision:
            raise HTTPException(409, "The opening balance changed; refresh the ledger before correcting it")
        row = await db.ledger_entries.find_one_and_update({"_id": key, "revision": body.expected_revision}, {
            "$set": {**values, "updated_at": now_iso()}, "$inc": {"revision": 1},
            "$push": {"history": {**public_entry(existing), "reason": body.reason, "changed_by": admin["id"], "changed_at": now_iso()}},
        }, return_document=True)
        if not row:
            raise HTTPException(409, "The opening balance changed; refresh the ledger")
    else:
        row = {"_id": key, "id": key, "customer_id": cid, "entry_type": "opening", "status": "posted",
               "description": "Opening balance", "revision": 1, "created_at": now_iso(), "created_by": admin["id"], **values}
        try:
            await db.ledger_entries.insert_one(dict(row))
        except DuplicateKeyError:
            raise HTTPException(409, "The opening balance has already been set; refresh the ledger")
    await log_audit(db, admin, "set_opening_balance", "customer_ledger", cid, {**values, "reason": body.reason})
    return public_entry(row)


async def record_payment(cid, body, actor, origin):
    customer = await customer_record(cid, writing=True)
    ref = re.sub(r"\s+", "", body.transaction_id).upper()
    if not re.fullmatch(r"[A-Z0-9/_-]{3,128}", ref):
        raise HTTPException(400, "Enter a valid transaction ID using letters, numbers, /, _ or -")
    key = "payment:" + hashlib.sha256(ref.encode()).hexdigest()
    values = {"customer_id": cid, "amount_paise": paise(body.amount), "mode": body.mode,
              "transaction_id": ref, "transaction_date": check_date(body.transaction_date)}
    status = "confirmed" if origin == "admin" else "pending"
    existing = await db.ledger_entries.find_one({"_id": key})
    if existing:
        if all(existing.get(k) == v for k, v in values.items()) and existing["status"] == status:
            return public_entry(existing)
        raise HTTPException(409, "This transaction ID is already recorded. Review the existing payment instead of entering it again.")
    row = {"_id": key, "id": key, **values, "entry_type": "payment", "description": "Payment received" if origin == "admin" else "Payment reported",
           "status": status, "origin": origin, "notes": body.notes, "customer_name": customer.get("name", ""),
           "customer_mobile": customer.get("mobile", ""), "created_at": now_iso(), "created_by": actor["id"]}
    try:
        await db.ledger_entries.insert_one(dict(row))
    except DuplicateKeyError:
        raise HTTPException(409, "This transaction ID is already recorded; refresh the ledger")
    await log_audit(db, actor, "record_payment" if origin == "admin" else "report_payment", "customer_ledger", cid, values)
    return public_entry(row)


@router.post("/admin/customers/{cid}/payments")
async def admin_payment(cid: str, body: PaymentBody, admin=Depends(require_module("customers"))):
    return await record_payment(cid, body, admin, "admin")


@router.post("/ledger/payments")
async def report_payment(body: PaymentBody, customer=Depends(get_current_customer)):
    return await record_payment(customer["id"], body, customer, "customer")


@router.get("/admin/payments/pending")
async def pending_payments(page: int = Query(1, ge=1), admin=Depends(require_module("customers"))):
    return await paginate(db.ledger_entries, {"entry_type": "payment", "status": "pending"}, page, 50,
                          projection={"history": 0, "created_by": 0})


async def review_payment(pid, action, admin, reason=""):
    row = await db.ledger_entries.find_one({"id": pid, "entry_type": "payment"})
    if not row:
        raise HTTPException(404, "Payment not found")
    await customer_record(row["customer_id"], writing=True)
    source, target = ("confirmed", "voided") if action == "void" else ("pending", "confirmed" if action == "confirm" else "rejected")
    if row["status"] == target:
        return public_entry(row)
    if row["status"] != source:
        raise HTTPException(409, "This payment was already reviewed; refresh the ledger")
    result = await db.ledger_entries.find_one_and_update({"id": pid, "status": source}, {
        "$set": {"status": target, "reviewed_at": now_iso(), "reviewed_by": admin["id"], "reason": reason},
    }, return_document=True)
    if not result:
        raise HTTPException(409, "This payment was already reviewed; refresh the ledger")
    await log_audit(db, admin, action + "_payment", "customer_ledger", row["customer_id"], {"payment_id": pid, "reason": reason})
    return public_entry(result)


@router.post("/admin/payments/{pid}/confirm")
async def confirm_payment(pid: str, admin=Depends(require_module("customers"))):
    return await review_payment(pid, "confirm", admin)


@router.post("/admin/payments/{pid}/reject")
async def reject_payment(pid: str, body: ReasonBody, admin=Depends(require_module("customers"))):
    return await review_payment(pid, "reject", admin, body.reason)


@router.post("/admin/payments/{pid}/void")
async def void_payment(pid: str, body: ReasonBody, admin=Depends(require_module("customers"))):
    return await review_payment(pid, "void", admin, body.reason)


@router.post("/admin/orders/{oid}/close")
async def close_order(oid: str, body: CloseBody, admin=Depends(require_module("orders"))):
    invoice_date = check_date(body.invoice_date)
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    await customer_record(order.get("customer_id"), writing=True)
    values = {"invoice_number": body.invoice_number, "invoice_date": invoice_date, "amount_paise": paise(body.amount)}
    if order.get("invoice", {}).get("status") == "posted":
        if all(order["invoice"].get(k) == v for k, v in values.items()):
            return order
        raise HTTPException(409, "This order is already invoiced; void the invoice before correcting it")
    if order.get("status") == "cancelled":
        raise HTTPException(409, "A cancelled order cannot be invoiced")
    if body.expected_updated_at is not None and body.expected_updated_at != order.get("updated_at"):
        raise HTTPException(409, "This order changed; refresh it before closing")
    year = body.invoice_date.year - (body.invoice_date.month < 4)
    invoice_key = str(year) + ":" + body.invoice_number.casefold()
    if await db.orders.find_one({"invoice_key": invoice_key, "id": {"$ne": oid}}):
        raise HTTPException(409, "This invoice number is already used in this financial year")
    invoice = {"id": new_id(), **values, "status": "posted", "created_at": now_iso(), "created_by": admin["id"]}
    try:
        result = await db.orders.find_one_and_update({"id": oid, "invoice.status": {"$ne": "posted"}, "updated_at": order.get("updated_at")}, {
            "$set": {"status": "closed", "invoice": invoice, "invoice_key": invoice_key, "closed_at": now_iso(), "updated_at": now_iso()},
            "$push": {"activity": {"id": new_id(), "text": "Closed with invoice " + body.invoice_number, "actor": admin.get("name", "Admin"), "at": now_iso()}},
        }, return_document=True)
    except DuplicateKeyError:
        raise HTTPException(409, "This invoice number is already used in this financial year")
    if not result:
        raise HTTPException(409, "This order changed; refresh it before closing")
    result.pop("_id", None)
    await log_audit(db, admin, "close_with_invoice", "order", oid, values)
    return result


@router.post("/admin/orders/{oid}/invoice/void")
async def void_invoice(oid: str, body: ReasonBody, admin=Depends(require_module("orders"))):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order or not order.get("invoice"):
        raise HTTPException(404, "Posted invoice not found")
    invoice = order["invoice"]
    previous = {**invoice, "status": "voided", "reason": body.reason, "voided_at": now_iso(), "voided_by": admin["id"]}
    result = await db.orders.find_one_and_update({"id": oid, "invoice.id": invoice["id"], "invoice.status": "posted"}, {
        "$unset": {"invoice": "", "invoice_key": "", "closed_at": ""},
        "$set": {"status": "delivered", "updated_at": now_iso()},
        "$push": {"voided_invoices": previous, "activity": {"id": new_id(), "text": "Invoice voided: " + body.reason, "actor": admin.get("name", "Admin"), "at": now_iso()}},
    }, return_document=True)
    if not result:
        raise HTTPException(409, "This invoice changed; refresh the order")
    result.pop("_id", None)
    await log_audit(db, admin, "void_invoice", "order", oid, {"invoice_number": invoice["invoice_number"], "reason": body.reason})
    return result
