"""Complete, versioned exports and non-overwriting imports for a shop migration."""
import io
import stat
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from bson import json_util


async def collection_names(db):
    return sorted(name for name in await db.list_collection_names() if not name.startswith("system."))


async def backup_stats(db):
    counts = {name: await db[name].count_documents({}) for name in await collection_names(db)}
    return {"collections": counts, "total_records": sum(counts.values())}


async def export_database(db):
    data, indexes = {}, {}
    for name in await collection_names(db):
        # No record limit; preserve Mongo IDs, dates, decimals and custom collections.
        data[name] = [doc async for doc in db[name].find({})]
        indexes[name] = await db[name].index_information()
    payload = {
        "format": "vetmech-shop", "version": 2, "database": db.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data": data, "indexes": indexes,
        "total_records": sum(len(docs) for docs in data.values()),
    }
    return json_util.dumps(payload, indent=2).encode("utf-8")


def read_backup(content):
    payload = json_util.loads(content)
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
        raise ValueError("Expected a VETMECH database backup with a data object.")
    if payload.get("format", "vetmech-shop") != "vetmech-shop" or payload.get("version", 1) not in (1, 2):
        raise ValueError("Unsupported database backup format or version.")
    for name, docs in payload["data"].items():
        if not name or "\x00" in name or "$" in name or name.startswith("system."):
            raise ValueError(f"Invalid collection name: {name!r}")
        if not isinstance(docs, list) or any(not isinstance(doc, dict) for doc in docs):
            raise ValueError(f"Invalid records for collection {name!r}.")
    indexes = payload.get("indexes", {})
    if not isinstance(indexes, dict) or set(indexes) - set(payload["data"]):
        raise ValueError("Invalid backup index manifest.")
    for name, definitions in indexes.items():
        if not isinstance(definitions, dict):
            raise ValueError(f"Invalid indexes for {name!r}.")
        for index_name, options in definitions.items():
            if not isinstance(options, dict) or not isinstance(options.get("key"), list):
                raise ValueError(f"Invalid index {index_name!r}.")
            if any(not isinstance(key, (list, tuple)) or len(key) != 2 for key in options["key"]):
                raise ValueError(f"Invalid index keys for {index_name!r}.")
    return payload


async def restore_database(db, payload):
    # Called with the web service stopped. Never merge with a populated target.
    if await collection_names(db):
        raise ValueError("Restore requires an empty target database. Choose a new DB_NAME and stop the app first.")
    created = []
    try:
        for name, docs in payload["data"].items():
            await db.create_collection(name)
            created.append(name)
            if docs:
                await db[name].insert_many(docs)
            for index_name, options in payload.get("indexes", {}).get(name, {}).items():
                if index_name == "_id_":
                    continue
                index_options = {k: v for k, v in options.items() if k not in {"key", "v", "ns"}}
                await db[name].create_index([tuple(key) for key in options["key"]], name=index_name, **index_options)
    except Exception:
        for name in reversed(created):
            await db.drop_collection(name)
        raise
    return {name: len(docs) for name, docs in payload["data"].items()}


def export_uploads(directory):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(Path(directory).iterdir()):
            if path.is_file() and not path.is_symlink():
                archive.write(path, path.name)
    return buffer.getvalue()


def validate_uploads(content, directory, max_size=2 * 1024**3):
    """Validate every entry and collision before any file or database is changed."""
    files, total = {}, 0
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            name = info.filename
            if (not name or PurePosixPath(name).name != name or name in {".", ".."}
                    or "\\" in name or "\x00" in name or ":" in name
                    or stat.S_ISLNK(info.external_attr >> 16)):
                raise ValueError("Uploads archive contains an unsafe path or symlink.")
            if name in files:
                raise ValueError(f"Duplicate upload filename: {name}")
            total += info.file_size
            if total > max_size:
                raise ValueError("Uploads archive exceeds the maximum expanded size.")
            data = archive.read(info)
            target = Path(directory) / name
            if target.is_symlink() or (target.exists() and (not target.is_file() or target.read_bytes() != data)):
                raise ValueError(f"Existing upload differs: {name}. Choose an empty uploads directory.")
            files[name] = data
    return files


def restore_uploads(files, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    written = []
    try:
        for name, data in files.items():
            target = directory / name
            if target.exists():
                if target.is_symlink() or target.read_bytes() != data:
                    raise ValueError(f"Existing upload differs: {name}")
                continue
            with target.open("xb") as output:
                written.append(target)
                output.write(data)
    except Exception:
        for path in written:
            path.unlink(missing_ok=True)
        raise
    return written
