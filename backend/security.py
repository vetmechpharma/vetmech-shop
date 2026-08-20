import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Depends, Request

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_DAYS = 30

# Role -> allowed admin modules. super_admin bypasses all checks.
ROLE_MODULES = {
    "super_admin": ["*"],
    "product_manager": ["products", "categories", "brands", "units", "variants", "schemes"],
    "order_manager": ["orders", "customers", "quotations"],
    "content_manager": ["cms", "news", "gallery", "careers", "pages", "enquiries"],
    "sales_manager": ["orders", "customers", "reports", "quotations"],
    "admin": ["tickets", "orders", "customers", "reports", "quotations"],
    "manager": ["tickets", "reports"],
    "sales_executive": ["tickets"],
    "support_user": ["tickets"],
}

ROLE_LABELS = {
    "super_admin": "Super Admin",
    "product_manager": "Product Manager",
    "order_manager": "Order Manager",
    "content_manager": "Content Manager",
    "sales_manager": "Sales Manager",
    "admin": "Admin",
    "manager": "Manager",
    "sales_executive": "Sales Executive",
    "support_user": "Support User",
}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_token(subject_id: str, kind: str, extra: dict = None) -> str:
    payload = {
        "sub": subject_id,
        "kind": kind,  # "admin" or "customer"
        "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def _decode(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    try:
        return jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_admin(request: Request) -> dict:
    from db import db
    payload = _decode(request)
    if payload.get("kind") != "admin":
        raise HTTPException(status_code=401, detail="Admin authentication required")
    user = await db.admin_users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Admin account not found or disabled")
    return user


async def get_current_customer(request: Request) -> dict:
    from db import db
    payload = _decode(request)
    if payload.get("kind") != "customer":
        raise HTTPException(status_code=401, detail="Customer authentication required")
    cust = await db.customers.find_one({"id": payload["sub"]}, {"_id": 0})
    if not cust or not cust.get("active", True):
        raise HTTPException(status_code=401, detail="Customer account not found or disabled")
    return cust


async def optional_customer(request: Request):
    try:
        return await get_current_customer(request)
    except HTTPException:
        return None


def require_module(module: str):
    async def checker(admin: dict = Depends(get_current_admin)):
        role = admin.get("role", "")
        if role == "super_admin":
            return admin
        allowed = admin.get("permissions") or ROLE_MODULES.get(role, [])
        if "*" in allowed or module in allowed:
            return admin
        raise HTTPException(status_code=403, detail=f"You don't have permission for '{module}'")
    return checker
