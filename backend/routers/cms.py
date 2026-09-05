from fastapi import APIRouter, HTTPException, Depends, Body, Query
from typing import Optional

from db import db, paginate
from security import require_module, get_current_admin
from helpers import new_id, now_iso, log_audit, send_email, send_whatsapp
from routers.catalog import slugify, unique_slug
import httpx

router = APIRouter(prefix="/api", tags=["cms"])


# =============== PAGES (About, Quality, etc.) ===============
@router.get("/pages/{slug}")
async def public_page(slug: str):
    page = await db.pages.find_one({"slug": slug}, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.get("/admin/pages")
async def admin_pages(admin=Depends(require_module("pages"))):
    return await db.pages.find({}, {"_id": 0}).to_list(200)


@router.put("/admin/pages/{slug}")
async def update_page(slug: str, body: dict = Body(...), admin=Depends(require_module("pages"))):
    body.pop("_id", None)
    body["slug"] = slug
    body["updated_at"] = now_iso()
    await db.pages.update_one({"slug": slug}, {"$set": body}, upsert=True)
    await log_audit(db, admin, "update", "page", slug)
    return await db.pages.find_one({"slug": slug}, {"_id": 0})


# =============== HOMEPAGE / SETTINGS ===============
SETTING_IDS = ["company", "whatsapp", "smtp", "seo", "website", "homepage"]


@router.get("/settings/{sid}")
async def public_setting(sid: str):
    # public safe settings only
    if sid in ("whatsapp", "smtp"):
        raise HTTPException(status_code=403, detail="Not public")
    s = await db.settings.find_one({"id": sid}, {"_id": 0})
    return s or {"id": sid}


@router.get("/admin/settings/{sid}")
async def admin_setting(sid: str, admin=Depends(get_current_admin)):
    s = await db.settings.find_one({"id": sid}, {"_id": 0})
    return s or {"id": sid}


@router.put("/admin/settings/{sid}")
async def update_setting(sid: str, body: dict = Body(...), admin=Depends(require_module("cms"))):
    body.pop("_id", None)
    body["id"] = sid
    body["updated_at"] = now_iso()
    await db.settings.update_one({"id": sid}, {"$set": body}, upsert=True)
    await log_audit(db, admin, "update", "settings", sid)
    return await db.settings.find_one({"id": sid}, {"_id": 0})


# =============== WHATSAPP LIVE STATUS + TEST (wa.animitra.in) ===============
@router.get("/admin/whatsapp/status")
async def whatsapp_status(admin=Depends(get_current_admin)):
    s = await db.settings.find_one({"id": "whatsapp"}, {"_id": 0}) or {}
    api_key = (s.get("api_key") or "").strip()
    session_id = (s.get("session_id") or "").strip()
    base_url = (s.get("api_url") or "https://wa.animitra.in").strip().rstrip("/")
    if not (api_key and session_id):
        return {"configured": False, "connected": False, "status": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.get(f"{base_url}/api/v1/sessions/{session_id}",
                                  headers={"Authorization": f"Bearer {api_key}"})
        if resp.status_code == 200:
            d = resp.json()
            return {"configured": True, "connected": bool(d.get("connected")),
                    "status": d.get("status"), "phone": d.get("phone"),
                    "name": (d.get("me") or {}).get("name"),
                    "has_qr": bool(d.get("hasQr")), "qr": d.get("qrDataUrl") or d.get("qr"),
                    "pairing_code": d.get("pairingCode"),
                    "sidecar_reachable": d.get("sidecar_reachable"), "checked_at": d.get("checked_at")}
        if resp.status_code == 403 and "scope" in resp.text.lower():
            return {"configured": True, "connected": True, "status": "send_only",
                    "note": "This API key is send-only (no sessions:read scope). Messages send fine; live connection status is unavailable."}
        return {"configured": True, "connected": False, "status": "error",
                "error": f"{resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"configured": True, "connected": False, "status": "error", "error": str(e)[:200]}


@router.post("/admin/whatsapp/test")
async def whatsapp_test(body: dict = Body(...), admin=Depends(require_module("cms"))):
    to = (body.get("to") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Recipient number required")
    res = await send_whatsapp(db, to, body.get("message") or "VETMECH test message ✅", kind="test")
    return res


# =============== NEWS ===============
@router.get("/news")
async def public_news(page: int = 1, limit: int = 9):
    return await paginate(db.news, {"active": True}, page, limit, sort_field="publish_date", sort_dir=-1)


@router.get("/news/{slug}")
async def public_article(slug: str):
    art = await db.news.find_one({"slug": slug, "active": True}, {"_id": 0})
    if not art:
        raise HTTPException(status_code=404, detail="Article not found")
    related = await db.news.find({"active": True, "slug": {"$ne": slug}}, {"_id": 0}).limit(3).to_list(3)
    art["related"] = related
    return art


@router.get("/admin/news")
async def admin_news(admin=Depends(require_module("news"))):
    return await db.news.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/admin/news")
async def create_news(body: dict = Body(...), admin=Depends(require_module("news"))):
    doc = {"id": new_id(), "title": body.get("title", "Untitled"),
           "slug": await unique_slug(db.news, slugify(body.get("slug") or body.get("title"))),
           "featured_image": body.get("featured_image", ""), "content": body.get("content", ""),
           "excerpt": body.get("excerpt", ""), "category": body.get("category", "News"),
           "author": body.get("author", "VETMECH"), "publish_date": body.get("publish_date", now_iso()),
           "seo": body.get("seo", {}), "active": body.get("active", True),
           "is_demo": body.get("is_demo", False), "created_at": now_iso()}
    await db.news.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/admin/news/{nid}")
async def update_news(nid: str, body: dict = Body(...), admin=Depends(require_module("news"))):
    body.pop("id", None); body.pop("_id", None)
    if body.get("slug"):
        body["slug"] = await unique_slug(db.news, slugify(body["slug"]), exclude_id=nid)
    await db.news.update_one({"id": nid}, {"$set": body})
    return await db.news.find_one({"id": nid}, {"_id": 0})


@router.delete("/admin/news/{nid}")
async def delete_news(nid: str, admin=Depends(require_module("news"))):
    await db.news.delete_one({"id": nid})
    return {"deleted": True}


# =============== GALLERY ===============
@router.get("/gallery")
async def public_gallery():
    return await db.gallery.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(500)


@router.get("/admin/gallery")
async def admin_gallery(admin=Depends(require_module("gallery"))):
    return await db.gallery.find({}, {"_id": 0}).sort("order", 1).to_list(500)


@router.post("/admin/gallery")
async def create_gallery(body: dict = Body(...), admin=Depends(require_module("gallery"))):
    doc = {"id": new_id(), "title": body.get("title", ""), "description": body.get("description", ""),
           "image": body.get("image", ""), "album": body.get("album", "General"),
           "active": body.get("active", True), "order": body.get("order", 0),
           "is_demo": body.get("is_demo", False), "created_at": now_iso()}
    await db.gallery.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/admin/gallery/{gid}")
async def update_gallery(gid: str, body: dict = Body(...), admin=Depends(require_module("gallery"))):
    body.pop("id", None); body.pop("_id", None)
    await db.gallery.update_one({"id": gid}, {"$set": body})
    return await db.gallery.find_one({"id": gid}, {"_id": 0})


@router.delete("/admin/gallery/{gid}")
async def delete_gallery(gid: str, admin=Depends(require_module("gallery"))):
    await db.gallery.delete_one({"id": gid})
    return {"deleted": True}


# =============== CAREERS ===============
@router.get("/careers")
async def public_careers():
    return await db.careers.find({"active": True}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.get("/admin/careers")
async def admin_careers(admin=Depends(require_module("careers"))):
    return await db.careers.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/admin/careers")
async def create_career(body: dict = Body(...), admin=Depends(require_module("careers"))):
    doc = {"id": new_id(), "title": body.get("title", ""), "department": body.get("department", ""),
           "location": body.get("location", ""), "experience": body.get("experience", ""),
           "qualification": body.get("qualification", ""), "description": body.get("description", ""),
           "requirements": body.get("requirements", ""), "active": body.get("active", True),
           "is_demo": body.get("is_demo", False), "created_at": now_iso()}
    await db.careers.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/admin/careers/{cid}")
async def update_career(cid: str, body: dict = Body(...), admin=Depends(require_module("careers"))):
    body.pop("id", None); body.pop("_id", None)
    await db.careers.update_one({"id": cid}, {"$set": body})
    return await db.careers.find_one({"id": cid}, {"_id": 0})


@router.delete("/admin/careers/{cid}")
async def delete_career(cid: str, admin=Depends(require_module("careers"))):
    await db.careers.delete_one({"id": cid})
    return {"deleted": True}


@router.post("/careers/apply")
async def apply_career(body: dict = Body(...)):
    doc = {"id": new_id(), "job_id": body.get("job_id"), "job_title": body.get("job_title", ""),
           "name": body.get("name", ""), "mobile": body.get("mobile", ""), "email": body.get("email", ""),
           "qualification": body.get("qualification", ""), "experience": body.get("experience", ""),
           "resume_url": body.get("resume_url", ""), "message": body.get("message", ""),
           "created_at": now_iso()}
    await db.applications.insert_one(dict(doc))
    await send_email(db, "admin", "New Career Application", f"{doc['name']} applied for {doc['job_title']}", kind="career_application")
    doc.pop("_id", None)
    return {"submitted": True}


@router.get("/admin/applications")
async def admin_applications(admin=Depends(require_module("careers"))):
    return await db.applications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


# =============== CONTACT / ENQUIRIES ===============
@router.post("/enquiries")
async def create_enquiry(body: dict = Body(...)):
    doc = {"id": new_id(), "name": body.get("name", ""), "mobile": body.get("mobile", ""),
           "email": body.get("email", ""), "subject": body.get("subject", ""),
           "message": body.get("message", ""), "read": False, "created_at": now_iso()}
    await db.enquiries.insert_one(dict(doc))
    await send_email(db, "admin", f"New Enquiry: {doc['subject']}", doc["message"], kind="enquiry")
    doc.pop("_id", None)
    return {"submitted": True}


@router.get("/admin/enquiries")
async def admin_enquiries(admin=Depends(require_module("enquiries"))):
    return await db.enquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.delete("/admin/enquiries/{eid}")
async def delete_enquiry(eid: str, admin=Depends(require_module("enquiries"))):
    await db.enquiries.delete_one({"id": eid})
    return {"deleted": True}
