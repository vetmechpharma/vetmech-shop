import io
import zipfile
from datetime import datetime, timezone

from bson import Decimal128
from mongomock_motor import AsyncMongoMockClient
import pytest

from backup import (backup_stats, export_database, read_backup, restore_database,
                    export_uploads, validate_uploads, restore_uploads)


@pytest.mark.asyncio
async def test_round_trip_keeps_all_business_collections_types_and_indexes(database):
    for name in ["quotations", "customer_prices", "pricing_audit", "transports", "reviews", "catalog_downloads", "custom_future_module"]:
        await database[name].insert_one({"id": name, "amount": Decimal128("178.50"),
                                         "date": datetime(2026, 10, 15, tzinfo=timezone.utc)})
    await database.customer_prices.create_index("id", unique=True)
    payload = read_backup((await export_database(database)).decode())
    target = AsyncMongoMockClient()["restored"]
    counts = await restore_database(target, payload)
    assert len(counts) == 7
    assert sum(counts.values()) == 7
    for name in counts:
        original = await database[name].find_one({})
        restored = await target[name].find_one({})
        assert restored == original
    assert (await target.customer_prices.index_information())["id_1"]["unique"] is True
    assert (await backup_stats(target))["total_records"] == 7


@pytest.mark.asyncio
async def test_restore_refuses_existing_database_without_changing_it(database):
    await database.products.insert_one({"id": "keep", "name": "Existing live product"})
    with pytest.raises(ValueError, match="empty"):
        await restore_database(database, {"data": {"products": [{"id": "replacement"}]}})
    assert (await database.products.find_one({}))["id"] == "keep"


@pytest.mark.asyncio
async def test_failed_restore_removes_only_its_new_collections(database):
    payload = {"data": {"products": [{"_id": "duplicate"}, {"_id": "duplicate"}]}}
    with pytest.raises(Exception):
        await restore_database(database, payload)
    assert await database.list_collection_names() == []


@pytest.mark.parametrize("content", [
    '{"data": {"products": "wrong"}}', '{"data": {"system.users": []}}',
    '{"version": 99, "data": {}}', '{"data": {}, "indexes": {"other": {}}}',
])
def test_malformed_backup_is_rejected_before_restore(content):
    with pytest.raises(ValueError):
        read_backup(content)


def archive(entries):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zip_file:
        for name, content in entries:
            zip_file.writestr(name, content)
    return buffer.getvalue()


@pytest.mark.parametrize("name", ["../outside.txt", "/outside.txt", "folder/file.txt", "..\\outside.txt", "C:outside.txt"])
def test_upload_restore_rejects_unsafe_paths(tmp_path, name):
    with pytest.raises(ValueError, match="unsafe"):
        validate_uploads(archive([(name, b"bad")]), tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_upload_restore_validates_collisions_before_writing(tmp_path):
    (tmp_path / "logo.png").write_bytes(b"original")
    with pytest.raises(ValueError, match="differs"):
        validate_uploads(archive([("new.png", b"new"), ("logo.png", b"different")]), tmp_path)
    assert (tmp_path / "logo.png").read_bytes() == b"original"
    assert not (tmp_path / "new.png").exists()


def test_uploads_round_trip_and_repeated_restore(tmp_path):
    source = tmp_path / "source"
    target = tmp_path / "target"
    source.mkdir()
    (source / "logo.png").write_bytes(b"logo")
    files = validate_uploads(export_uploads(source), target)
    assert len(restore_uploads(files, target)) == 1
    assert restore_uploads(files, target) == []
    assert (target / "logo.png").read_bytes() == b"logo"


def test_archive_expansion_limit(tmp_path):
    with pytest.raises(ValueError, match="expanded"):
        validate_uploads(archive([("large.txt", b"x" * 50)]), tmp_path, max_size=10)
