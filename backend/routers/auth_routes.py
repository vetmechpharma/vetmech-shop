import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional

from db import db
from config import dev_otp_enabled
from security import (hash_password, verify_password, create_token, validate_customer_password,
                      get_current_admin, get_current_customer, customer_status_label, ROLE_MODULES)
from helpers import new_id, now_iso, log_audit, send_whatsapp, send_email, email_for, normalize_mobile

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
    license_number: Optional[str] = ""
    password: str
    verification_token: str


def _admin_public(user):
    return {**{k: v for k, v in user.items() if k not in {"_id", "password_hash"}},
            "permissions": user.get("permissions") or ROLE_MODULES.get(user.get("role"), [])}


def _mobile(value):
    mobile = normalize_mobile(value)
    if len(mobile) != 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number")
    return mobile


async def _existing_customer(mobile):
    return await db.customers.find_one(
        {"$or": [{"normalized_mobile": mobile}, {"mobile": {"$regex": mobile + "$"}}]})


async def _check_login_lock(identifier):
    record = await db.login_attempts.find_one({"identifier": identifier}) or {}
    if record.get("locked_until") and datetime.fromisoformat(record["locked_until"]) > datetime.now(timezone.utc):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Please try again in a few minutes.")
    return record


async def _failed_login(identifier, record):
    fails = record.get("fails", 0) + 1
    update = {"identifier": identifier, "fails": fails, "updated_at": now_iso()}
    if fails >= 5:
        update.update(locked_until=(datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(), fails=0)
    await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)


@router.post("/admin/login")
async def admin_login(body: AdminLogin):
    email = body.email.lower().strip()
    identifier = f"admin:{email}"
    attempts = await _check_login_lock(identifier)
    user = await db.admin_users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        await _failed_login(identifier, attempts)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    await db.login_attempts.delete_one({"identifier": identifier})
    token = create_token(user["id"], "admin")
    await db.admin_users.update_one({"id": user["id"]}, {"$set": {"last_login": now_iso()}})
    await log_audit(db, user, "login", "admin_user", user["id"])
    return {"token": token, "user": _admin_public(user)}


@router.get("/admin/me")
async def admin_me(admin: dict = Depends(get_current_admin)):
    return _admin_public(admin)


# =============== CUSTOMER REGISTRATION ===============
@router.post("/register")
async def register(body: Register):
    mobile = _mobile(body.mobile)
    validate_customer_password(body.password)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Please enter your name")
    if body.category not in {"doctor", "agency", "medical_shop", "distributor", "farm", "other"}:
        raise HTTPException(status_code=400, detail="Choose a valid customer category")
    existing = await _existing_customer(mobile)
    if existing:
        raise HTTPException(status_code=409,
                            detail="An account already exists with this mobile number. Please login or contact support.")
    settings = await pricing_settings()
    require_approval = settings.get("require_approval", True)
    status = "pending" if require_approval else "active"
    LICENSE_REQUIRED = {"doctor", "agency", "medical_shop", "distributor"}
    license_number = (body.license_number or "").strip()
    if body.category in LICENSE_REQUIRED and not license_number:
        raise HTTPException(status_code=400, detail="License Number is required for your selected category.")
    # A one-use grant is bound to the verified number. Old login OTP records are not accepted.
    password_hash = hash_password(body.password)
    claimed = await db.otps.find_one_and_update(
        {"_id": f"registration:{mobile}", "purpose": "registration", "mobile": mobile,
         "registration_token_hash": hashlib.sha256(body.verification_token.encode()).hexdigest(),
         "verified": True, "consumed": False, "registration_expires": {"$gt": now_iso()}},
        {"$set": {"consumed": True, "consumed_at": now_iso()}, "$unset": {"registration_token_hash": ""}},
    )
    if not claimed:
        raise HTTPException(status_code=400, detail="Verify your mobile number with a registration OTP first. Verification may have expired.")
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
        "license_number": license_number,
        "status": status,
        "active": True,
        "price_protected": False,
        "addresses": [],
        "created_at": now_iso(),
        "source": "self_registration",
        "mobile_verified_at": claimed.get("verified_at"),
        "password_hash": password_hash,
    }
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
    if doc["email"]:
        subj, ebody = await email_for(db, "welcome", {"name": doc["name"]})
        await send_email(db, doc["email"], subj, ebody, kind="welcome")
    return {"registered": True, "status": status,
            "message": ("Registration received. Your account is pending admin approval — "
                        "you'll be notified once approved." if status == "pending"
                        else "Registration successful. You can now log in.")}


# =============== REGISTRATION MOBILE VERIFICATION ===============
@router.post("/otp/request")
async def otp_request(body: OtpRequest):
    mobile = _mobile(body.mobile)
    if await _existing_customer(mobile):
        raise HTTPException(status_code=409, detail="This mobile number is already registered. Sign in with your password or contact support to reset it.")
    otp_id = f"registration:{mobile}"
    rec = await db.otps.find_one({"_id": otp_id}) or {}
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
    otp = str(secrets.randbelow(900000) + 100000)
    expires = (now + timedelta(minutes=10)).isoformat()
    await db.otps.update_one(
        {"_id": otp_id},
        {"$set": {"mobile": mobile, "purpose": "registration", "otp": otp, "expires": expires, "verified": False,
                  "consumed": False,
                  "wrong_attempts": 0, "window_start": window_start, "request_count": count + 1,
                  "created_at": now_iso()}, "$unset": {"registration_token_hash": "", "registration_expires": ""}},
        upsert=True,
    )
    whatsapp = await send_whatsapp(db, mobile, f"Your VETMECH registration verification code is {otp}. Valid for 10 minutes.", kind="otp")
    delivered = whatsapp.get("status") == "sent"
    if not delivered and not dev_otp_enabled():
        await db.otps.update_one({"_id": otp_id, "otp": otp}, {"$set": {"otp": "", "expires": now_iso()}})
        raise HTTPException(status_code=503, detail="Registration OTP could not be sent. Please try again later or contact VETMECH support.")
    result = {"sent": True, "message": "Registration OTP sent to your mobile on WhatsApp."}
    if dev_otp_enabled():
        result.update(dev_otp=otp, message="Development OTP generated.")
    return result


def _status_of(cust):
    return cust.get("status") or ("active" if cust.get("active", True) else "suspended")


@router.post("/otp/verify")
async def otp_verify(body: OtpVerify):
    mobile = _mobile(body.mobile)
    if await _existing_customer(mobile):
        raise HTTPException(status_code=409, detail="Sign in with your password. OTP is only for new registrations.")
    otp_id = f"registration:{mobile}"
    rec = await db.otps.find_one({"_id": otp_id, "purpose": "registration"})
    if not rec:
        raise HTTPException(status_code=400, detail="Please request an OTP first")
    if rec.get("verified"):
        raise HTTPException(status_code=400, detail="OTP already used. Please request a new OTP.")
    if rec.get("wrong_attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please request a new OTP.")
    if rec.get("otp") != body.otp.strip():
        await db.otps.update_one({"_id": otp_id}, {"$inc": {"wrong_attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if rec.get("expires", "") < now_iso():
        raise HTTPException(status_code=400, detail="OTP expired, request a new one")
    registration_token = secrets.token_urlsafe(32)
    claimed = await db.otps.find_one_and_update(
        {"_id": otp_id, "purpose": "registration", "otp": body.otp.strip(), "verified": False,
         "expires": {"$gt": now_iso()}, "wrong_attempts": {"$lt": 5}},
        {"$set": {"verified": True, "verified_at": now_iso(), "wrong_attempts": 0,
                  "registration_token_hash": hashlib.sha256(registration_token.encode()).hexdigest(),
                  "registration_expires": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
    )
    if not claimed:
        raise HTTPException(status_code=400, detail="OTP expired or already used. Please request a new OTP.")
    return {"verified": True, "registered": False, "mobile": mobile,
            "verification_token": registration_token}


@router.post("/login/password")
async def login_password(body: PasswordLogin):
    mobile = _mobile(body.mobile)
    ident = f"pw:{mobile}"
    att = await _check_login_lock(ident)
    customer = await db.customers.find_one(
        {"$or": [{"normalized_mobile": mobile}, {"mobile": {"$regex": mobile + "$"}}]})
    if not customer or not customer.get("password_hash") or not verify_password(body.password, customer["password_hash"]):
        await _failed_login(ident, att)
        raise HTTPException(status_code=401, detail="Invalid mobile number or password")
    st = _status_of(customer)
    if st in BLOCKED:
        raise HTTPException(status_code=403, detail=BLOCKED[st])
    await db.login_attempts.delete_one({"identifier": ident})
    token = create_token(customer["id"], "customer")
    customer.pop("_id", None)
    customer.pop("password_hash", None)
    customer.pop("password", None)
    return {"token": token, "customer": customer, "status": st, "status_label": customer_status_label(st)}


@router.get("/customer/me")
async def customer_me(customer: dict = Depends(get_current_customer)):
    customer.pop("password_hash", None)
    customer.pop("password", None)
    return customer
