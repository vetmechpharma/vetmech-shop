import random
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional

from db import db
from security import (hash_password, verify_password, create_token,
                      get_current_admin, get_current_customer, customer_status_label)
from helpers import new_id, now_iso, log_audit, send_whatsapp, send_email, normalize_mobile

router = APIRouter(prefix="/api/auth", tags=["auth"])

BLOCKED = {"suspended": "Your account has been suspended. Please contact support.",
           "rejected": "Your registration was not approved. Please contact support.",
           "deleted": "This account no longer exists."}


async def pricing_settings():
    return await db.settings.find_one({"id": "pricing_engine"}, {"_id": 0}) or {}


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class OtpRequest(BaseModel):
    mobile: str


class OtpVerify(BaseModel):
    mobile: str
    otp: str


class PasswordLogin(BaseModel):
    mobile: str
    password: str


class Register(BaseModel):
    prefix: Optional[str] = "Mr."
    name: str
    mobile: str
    whatsapp: Optional[str] = None
    email: Optional[str] = ""
    company_name: Optional[str] = ""
    address: Optional[str] = ""
    pincode: Optional[str] = ""
    district: Optional[str] = ""
    state: Optional[str] = ""
    category: Optional[str] = "other"
    password: Optional[str] = None


@router.post("/admin/login")
async def admin_login(body: AdminLogin):
    email = body.email.lower().strip()
    user = await db.admin_users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_token(user["id"], "admin")
    await db.admin_users.update_one({"id": user["id"]}, {"$set": {"last_login": now_iso()}})
    await log_audit(db, user, "login", "admin_user", user["id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": token, "user": user}


@router.get("/admin/me")
async def admin_me(admin: dict = Depends(get_current_admin)):
    return admin


# =============== CUSTOMER REGISTRATION ===============
@router.post("/register")
async def register(body: Register):
    mobile = normalize_mobile(body.mobile)
    if len(mobile) != 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number")
    existing = await db.customers.find_one({"normalized_mobile": mobile})
    if not existing:
        existing = await db.customers.find_one({"mobile": {"$regex": mobile + "$"}})
    if existing:
        raise HTTPException(status_code=409,
                            detail="An account already exists with this mobile number. Please login or contact support.")
    settings = await pricing_settings()
    require_approval = settings.get("require_approval", True)
    status = "pending" if require_approval else "active"
    doc = {
        "id": new_id(),
        "prefix": body.prefix or "Mr.",
        "name": body.name.strip(),
        "mobile": mobile,
        "normalized_mobile": mobile,
        "whatsapp": normalize_mobile(body.whatsapp) or mobile,
        "email": (body.email or "").lower().strip(),
        "company_name": body.company_name or "",
        "address": body.address or "",
        "pincode": body.pincode or "",
        "district": body.district or "",
        "state": body.state or "",
        "category": body.category or "other",
        "status": status,
        "active": True,
        "price_protected": False,
        "addresses": [],
        "created_at": now_iso(),
        "source": "self_registration",
    }
    if body.password:
        doc["password_hash"] = hash_password(body.password)
    await db.customers.insert_one(dict(doc))
    await send_email(db, "admin", "New Customer Registration",
                     f"New customer {doc['name']} ({mobile}), category {doc['category']}, status {status}.",
                     kind="customer_registration")
    # Notify admins on WhatsApp for fast approval
    wa = await db.settings.find_one({"id": "whatsapp"}, {"_id": 0}) or {}
    admin_msg = (f"🆕 New VETMECH registration\nName: {doc['prefix']} {doc['name']}\nMobile: {mobile}\n"
                 f"Company: {doc['company_name'] or '—'}\nCategory: {doc['category']}\nStatus: {status.upper()}"
                 + (" — please review & approve." if status == "pending" else "."))
    for num in (wa.get("admin_numbers") or []):
        if num:
            await send_whatsapp(db, num, admin_msg, kind="new_registration")
    return {"registered": True, "status": status,
            "message": ("Registration received. Your account is pending admin approval — "
                        "you'll be notified once approved." if status == "pending"
                        else "Registration successful. You can now log in.")}


# =============== CUSTOMER LOGIN ===============
@router.post("/otp/request")
async def otp_request(body: OtpRequest):
    settings = await pricing_settings()
    if not settings.get("enable_otp", True):
        raise HTTPException(status_code=400, detail="OTP login is currently disabled. Please use password login.")
    mobile = normalize_mobile(body.mobile)
    if len(mobile) != 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number")
    rec = await db.otps.find_one({"mobile": mobile}) or {}
    now = datetime.now(timezone.utc)
    # rate limit: max 5 requests per 15 min
    window_start = rec.get("window_start")
    count = rec.get("request_count", 0)
    if window_start:
        ws = datetime.fromisoformat(window_start)
        if (now - ws) < timedelta(minutes=15):
            if count >= 5:
                raise HTTPException(status_code=429, detail="Too many OTP requests. Please try again later.")
        else:
            window_start = None
            count = 0
    if not window_start:
        window_start = now.isoformat()
        count = 0
    otp = f"{random.randint(100000, 999999)}"
    expires = (now + timedelta(minutes=10)).isoformat()
    await db.otps.update_one(
        {"mobile": mobile},
        {"$set": {"mobile": mobile, "otp": otp, "expires": expires, "verified": False,
                  "wrong_attempts": 0, "window_start": window_start, "request_count": count + 1,
                  "created_at": now_iso()}},
        upsert=True,
    )
    await send_whatsapp(db, mobile, f"Your VETMECH verification code is {otp}. Valid for 10 minutes.", kind="otp")
    return {"sent": True, "dev_otp": otp, "message": "OTP sent via WhatsApp (simulated)"}


def _status_of(cust):
    return cust.get("status") or ("active" if cust.get("active", True) else "suspended")


@router.post("/otp/verify")
async def otp_verify(body: OtpVerify):
    mobile = normalize_mobile(body.mobile)
    rec = await db.otps.find_one({"mobile": mobile})
    if not rec:
        raise HTTPException(status_code=400, detail="Please request an OTP first")
    if rec.get("wrong_attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please request a new OTP.")
    if rec.get("otp") != body.otp.strip():
        await db.otps.update_one({"mobile": mobile}, {"$inc": {"wrong_attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if rec.get("expires", "") < now_iso():
        raise HTTPException(status_code=400, detail="OTP expired, request a new one")
    await db.otps.update_one({"mobile": mobile}, {"$set": {"verified": True, "wrong_attempts": 0}})
    customer = await db.customers.find_one(
        {"$or": [{"normalized_mobile": mobile}, {"mobile": {"$regex": mobile + "$"}}]}, {"_id": 0})
    if customer:
        st = _status_of(customer)
        if st in BLOCKED:
            raise HTTPException(status_code=403, detail=BLOCKED[st])
        token = create_token(customer["id"], "customer")
        customer.pop("password_hash", None)
        return {"verified": True, "registered": True, "token": token, "customer": customer,
                "status": st, "status_label": customer_status_label(st)}
    return {"verified": True, "registered": False, "mobile": mobile}


@router.post("/login/password")
async def login_password(body: PasswordLogin):
    settings = await pricing_settings()
    if not settings.get("enable_password_login", True):
        raise HTTPException(status_code=400, detail="Password login is currently disabled. Please use OTP login.")
    mobile = normalize_mobile(body.mobile)
    ident = f"pw:{mobile}"
    att = await db.login_attempts.find_one({"identifier": ident}) or {}
    now = datetime.now(timezone.utc)
    locked_until = att.get("locked_until")
    if locked_until and datetime.fromisoformat(locked_until) > now:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Please try again in a few minutes.")
    customer = await db.customers.find_one(
        {"$or": [{"normalized_mobile": mobile}, {"mobile": {"$regex": mobile + "$"}}]})
    if not customer or not customer.get("password_hash") or not verify_password(body.password, customer["password_hash"]):
        fails = att.get("fails", 0) + 1
        upd = {"identifier": ident, "fails": fails, "updated_at": now_iso()}
        if fails >= 5:
            upd["locked_until"] = (now + timedelta(minutes=15)).isoformat()
            upd["fails"] = 0
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid mobile number or password")
    st = _status_of(customer)
    if st in BLOCKED:
        raise HTTPException(status_code=403, detail=BLOCKED[st])
    await db.login_attempts.delete_one({"identifier": ident})
    token = create_token(customer["id"], "customer")
    customer.pop("_id", None)
    customer.pop("password_hash", None)
    return {"token": token, "customer": customer, "status": st, "status_label": customer_status_label(st)}


@router.get("/customer/me")
async def customer_me(customer: dict = Depends(get_current_customer)):
    customer.pop("password_hash", None)
    return customer
