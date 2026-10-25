"""An explicit, reversible presentation update for the existing live homepage."""
from copy import deepcopy
from datetime import datetime, timezone
import os
from pathlib import Path
from uuid import uuid4

from bson import json_util


PRESENTATION_VERSION = "connected-homepage-v1"
HERO_IMAGE = "/images/vetmech-connected-hero.svg"
PRESENTATION = {
    "hero": {
        "eyebrow": "The Science of Animal Health",
        "title": "Advancing animal health.\nConnected to your business.",
        "subtitle": "Explore veterinary medicines, professional pricing and a connected ordering workspace for your practice or business.",
        "image": HERO_IMAGE,
        "cta_text": "Explore Products",
        "cta_link": "/products",
    },
    "intro": {
        "title": "The Science of Animal Health",
        "text": "VETMECH PHARMACEUTICALS PRIVATE LIMITED brings product information, ordering and customer support into one connected workspace for veterinary professionals and trade partners.",
    },
    "strengths": [
        {"icon": "Package", "title": "Product Portfolio", "text": "Explore medicines, formulations and pack sizes."},
        {"icon": "Users", "title": "Professional Accounts", "text": "Access your approved account and business pricing."},
        {"icon": "Truck", "title": "Orders & Dispatch", "text": "Place orders and follow their progress."},
        {"icon": "ShieldCheck", "title": "Connected Support", "text": "Request quotations and contact the VETMECH team."},
    ],
    "quality": {
        "title": "Your catalogue and your business, connected",
        "text": "Find product information, request quotations and manage orders from one place.",
        "image": HERO_IMAGE,
    },
    "cta": {
        "title": "Find the right products for your business",
        "text": "Browse the VETMECH catalogue or contact our team for product information, pricing and bulk-order enquiries.",
    },
    "presentation_version": PRESENTATION_VERSION,
}
MANAGED_FIELDS = tuple(PRESENTATION)


def timestamp():
    return datetime.now(timezone.utc).isoformat()


async def current_homepage(db):
    documents = await db.settings.find({"id": "homepage"}).limit(2).to_list(2)
    if len(documents) != 1:
        raise ValueError("Expected exactly one existing homepage setting. Configure it in Admin before applying this update.")
    return documents[0]


def presentation_patch(current):
    patch = deepcopy(PRESENTATION)
    # Keep extra nested controls, such as the existing WhatsApp button label.
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(current.get(key), dict):
            patch[key] = {**deepcopy(current[key]), **value}
    return patch


def matches_fields(actual, expected, fields):
    return all((key in actual) == (key in expected) and actual.get(key) == expected.get(key) for key in fields)


def unchanged_filter(document):
    query = {"_id": document["_id"], "id": "homepage"}
    for key in (*MANAGED_FIELDS, "updated_at"):
        query[key] = {"$exists": key in document}
        if key in document:
            query[key]["$eq"] = document[key]
    return query


def write_snapshot(output, snapshot):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    directory = Path(output) / f"homepage-{stamp}-{uuid4().hex[:8]}"
    directory.mkdir(parents=True, mode=0o700)
    path = directory / "homepage.json"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as file:
        file.write(json_util.dumps(snapshot, indent=2))
        file.flush()
        os.fsync(file.fileno())
    return path


async def refresh_homepage(db, output="backups", apply=False):
    current = await current_homepage(db)
    if current.get("presentation_version") == PRESENTATION_VERSION:
        return {"status": "already_applied", "presentation_version": PRESENTATION_VERSION}
    patch = presentation_patch(current)
    result = {
        "status": "preview", "presentation_version": PRESENTATION_VERSION,
        "changed_fields": [key for key in MANAGED_FIELDS if not matches_fields(current, patch, [key])],
        "previous_title": (current.get("hero") or {}).get("title") if isinstance(current.get("hero"), dict) else None,
        "title": patch["hero"]["title"], "image": HERO_IMAGE,
    }
    if not apply:
        return result
    after = {**deepcopy(current), **patch, "updated_at": timestamp()}
    backup = write_snapshot(output, {
        "format": "vetmech-homepage", "version": 1, "database": db.name,
        "created_at": timestamp(), "before": current, "after": after,
    })
    update = await db.settings.update_one(unchanged_filter(current), {
        "$set": {key: after[key] for key in (*MANAGED_FIELDS, "updated_at")},
    })
    if update.matched_count != 1:
        raise ValueError("Homepage changed during the update; no presentation was written. Review the admin edits and retry.")
    return {**result, "status": "applied", "backup": str(backup)}


def read_snapshot(path, database):
    snapshot = json_util.loads(Path(path).read_text())
    if (not isinstance(snapshot, dict) or snapshot.get("format") != "vetmech-homepage"
            or snapshot.get("version") != 1 or snapshot.get("database") != database):
        raise ValueError("Expected a homepage snapshot for this database.")
    before, after = snapshot.get("before"), snapshot.get("after")
    if (not isinstance(before, dict) or not isinstance(after, dict)
            or before.get("id") != "homepage" or after.get("id") != "homepage"
            or "_id" not in before or before["_id"] != after.get("_id")
            or not all(key in after for key in MANAGED_FIELDS)
            or after.get("presentation_version") != PRESENTATION_VERSION):
        raise ValueError("Invalid homepage snapshot.")
    return before, after


async def restore_homepage(db, backup, apply=False):
    before, after = read_snapshot(backup, db.name)
    current = await current_homepage(db)
    if current["_id"] != before["_id"]:
        raise ValueError("The snapshot belongs to a different homepage record.")
    if matches_fields(current, before, MANAGED_FIELDS):
        return {"status": "already_restored"}
    if not matches_fields(current, after, MANAGED_FIELDS):
        raise ValueError("Homepage content was edited after this update. Restore refused to preserve those edits.")
    if not apply:
        return {"status": "restore_preview", "backup": str(backup)}
    update = {"$set": {key: before[key] for key in MANAGED_FIELDS if key in before}}
    update["$set"]["updated_at"] = timestamp()
    missing = {key: "" for key in MANAGED_FIELDS if key not in before}
    if missing:
        update["$unset"] = missing
    result = await db.settings.update_one(unchanged_filter(current), update)
    if result.matched_count != 1:
        raise ValueError("Homepage changed during restore; nothing was restored. Review the admin edits and retry.")
    return {"status": "restored", "backup": str(backup)}
