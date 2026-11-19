"""Fixed animal groups; preserve legacy taxonomy for explicit reassignment."""
from datetime import datetime, timezone
from fastapi import HTTPException

MAIN_GROUPS = [
    ("ruminants", "Ruminants", {"ruminants", "ruminant", "large animal", "large animals", "cattle", "livestock"}),
    ("companion-pets", "Companion Pets", {"companion pets", "companion animals", "pets", "pet", "small animal", "small animals"}),
    ("poultry", "Poultry", {"poultry"}),
    ("pig", "Pig", {"pig", "pigs", "swine"}),
    ("horses", "Horses", {"horses", "horse", "equine", "equines"}),
    ("exotic-birds", "Exotic Birds", {"exotic birds", "exotic bird"}),
]
MIGRATION = "animal-taxonomy-v1"


def ids(record, singular, plural):
    return list(dict.fromkeys([*(record.get(plural) or []), *([record[singular]] if record.get(singular) else [])]))


async def ensure_animal_categories(db):
    if await db.settings.find_one({"id": MIGRATION}):
        return
    rows = await db.categories.find({}, {"_id": 0}).to_list(None)
    roots = [r for r in rows if not r.get("parent_id") or r.get("parent_id") == "none"]
    mapping, main_ids = {}, []
    now = datetime.now(timezone.utc).isoformat()
    for index, (slug, name, aliases) in enumerate(MAIN_GROUPS):
        matches = [r for r in roots if r.get("name", "").strip().casefold() in aliases]
        existing = next((r for r in matches if r.get("fixed_main")), matches[0] if matches else None)
        cid = existing["id"] if existing else "species-" + slug
        main_ids.append(cid)
        if existing:
            await db.categories.update_one({"id": cid}, {"$set": {"name": name, "parent_id": None, "fixed_main": True, "legacy_main": False, "active": True, "order": index}})
        else:
            candidate = slug
            while await db.categories.find_one({"slug": candidate}):
                candidate += "-species"
            await db.categories.update_one({"id": cid}, {"$setOnInsert": {"id": cid, "name": name, "slug": candidate, "parent_id": None, "fixed_main": True, "active": True, "order": index, "description": "", "image": "", "seo": {}, "created_at": now}}, upsert=True)
        for row in matches:
            mapping[row["id"]] = cid
    for row in roots:
        if row["id"] not in main_ids:
            await db.categories.update_one({"id": row["id"]}, {"$set": {"legacy_main": True, "fixed_main": False, "parent_id": None}})
    for row in rows:
        if row.get("parent_id") in mapping:
            await db.categories.update_one({"id": row["id"]}, {"$set": {"parent_id": mapping[row["parent_id"]]}})
    categories = {c["id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(None)}
    async for product in db.products.find({}):
        old = ids(product, "category_id", "category_ids")
        mains = list(dict.fromkeys(mapping.get(cid, cid) for cid in old if mapping.get(cid, cid) in main_ids))
        old_subs = ids(product, "subcategory_id", "subcategory_ids")
        subs = [cid for cid in old_subs if categories.get(cid, {}).get("parent_id") in mains]
        await db.products.update_one({"id": product["id"]}, {"$set": {
            "category_ids": mains, "category_id": next(iter(mains), None),
            "subcategory_ids": subs, "subcategory_id": next(iter(subs), None),
            "legacy_category_ids": list(dict.fromkeys([*(product.get("legacy_category_ids") or []), *[cid for cid in old if mapping.get(cid, cid) not in main_ids]])),
            "legacy_subcategory_ids": list(dict.fromkeys([*(product.get("legacy_subcategory_ids") or []), *[cid for cid in old_subs if cid not in subs]])),
        }})
    await db.settings.update_one({"id": MIGRATION}, {"$setOnInsert": {"id": MIGRATION, "applied_at": now}}, upsert=True)


async def validate_subcategory_parent(db, parent):
    if not parent or parent == "none":
        raise HTTPException(400, "Select one of the six main animal categories. Only subcategories can be created manually.")
    row = await db.categories.find_one({"id": parent, "fixed_main": True})
    if not row:
        raise HTTPException(400, "Subcategories must belong directly to a main animal category")


async def normalize_assignments(db, body, existing=None):
    keys = {"category_id", "category_ids", "subcategory_id", "subcategory_ids"}
    if not keys.intersection(body):
        return body
    source = dict(existing or {})
    source.update(body)
    # Explicit arrays are authoritative, including empty arrays (clear selection).
    mains = body.get("category_ids") if "category_ids" in body else ids(source, "category_id", "category_ids")
    subs = body.get("subcategory_ids") if "subcategory_ids" in body else ids(source, "subcategory_id", "subcategory_ids")
    if not isinstance(mains, list) or not isinstance(subs, list) or any(not isinstance(x, str) for x in mains + subs):
        raise HTTPException(400, "Category selections must be lists of IDs")
    mains, subs = list(dict.fromkeys(mains)), list(dict.fromkeys(subs))
    for cid in mains:
        if not await db.categories.find_one({"id": cid, "fixed_main": True}):
            raise HTTPException(400, "Select valid main animal categories")
    for cid in subs:
        if not await db.categories.find_one({"id": cid, "parent_id": {"$in": mains}, "fixed_main": {"$ne": True}, "legacy_main": {"$ne": True}}):
            raise HTTPException(400, "Select subcategories belonging to the selected main categories")
    return dict(body, category_ids=mains, category_id=next(iter(mains), None), subcategory_ids=subs, subcategory_id=next(iter(subs), None))
