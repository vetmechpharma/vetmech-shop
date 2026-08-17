import random
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional

from db import db
from security import (hash_password, verify_password, create_token,
                      get_current_admin, get_current_customer)
from helpers import new_id, now_iso, log_audit, send_whatsapp

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class OtpRequest(BaseModel):
    mobile: str


class OtpVerify(BaseModel):
    mobile: str
    otp: str


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


@router.post("/otp/request")
async def otp_request(body: OtpRequest):
    mobile = body.mobile.strip()
    if len(mobile) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    otp = f"{random.randint(100000, 999999)}"
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    await db.otps.update_one(
        {"mobile": mobile},
        {"$set": {"mobile": mobile, "otp": otp, "expires": expires,
                  "verified": False, "created_at": now_iso()}},
        upsert=True,
    )
    await send_whatsapp(db, mobile, f"Your VETMECH verification code is {otp}. Valid for 10 minutes.", kind="otp")
    # Mock/dev mode: return OTP so the flow works end-to-end
    return {"sent": True, "dev_otp": otp, "message": "OTP sent via WhatsApp (simulated)"}


@router.post("/otp/verify")
async def otp_verify(body: OtpVerify):
    mobile = body.mobile.strip()
    rec = await db.otps.find_one({"mobile": mobile})
    if not rec or rec.get("otp") != body.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if rec.get("expires", "") < now_iso():
        raise HTTPException(status_code=400, detail="OTP expired, request a new one")
    await db.otps.update_one({"mobile": mobile}, {"$set": {"verified": True}})
    customer = await db.customers.find_one({"mobile": mobile}, {"_id": 0})
    if customer and customer.get("active", True):
        token = create_token(customer["id"], "customer")
        return {"verified": True, "registered": True, "token": token, "customer": customer}
    return {"verified": True, "registered": False, "mobile": mobile}


@router.get("/customer/me")
async def customer_me(customer: dict = Depends(get_current_customer)):
    return customer
