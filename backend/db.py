import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Standard projection to exclude Mongo's _id everywhere
NO_ID = {"_id": 0}


def clean(doc):
    """Strip Mongo _id from a single document."""
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc


async def paginate(collection, query, page=1, limit=20, sort_field="created_at", sort_dir=-1, projection=None):
    page = max(int(page), 1)
    limit = max(min(int(limit), 200), 1)
    skip = (page - 1) * limit
    proj = {"_id": 0}
    if projection:
        proj.update(projection)
    cursor = collection.find(query, proj).sort(sort_field, sort_dir).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await collection.count_documents(query)
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }
