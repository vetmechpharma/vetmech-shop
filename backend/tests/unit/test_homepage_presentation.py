from copy import deepcopy
from types import SimpleNamespace

from bson import json_util
import pytest

import homepage_presentation as homepage
from manage import parser


async def seed(database):
    document = {
        "id": "homepage", "hero": {"title": "Previous title", "image": "/old.jpg", "whatsapp_text": "Contact our team", "custom_control": "keep"},
        "intro": {"title": "Previous introduction", "custom_control": True},
        "strengths": [{"title": "Previous strength"}], "quality": {"title": "Previous quality"},
        "cta": {"title": "Previous CTA"}, "featured_product_ids": ["actual-product"],
        "custom_section": {"enabled": True}, "updated_at": "2026-09-15T00:00:00Z",
    }
    await database.settings.insert_one(document)
    return deepcopy(document)


@pytest.mark.asyncio
async def test_preview_has_no_database_or_filesystem_writes(database, tmp_path):
    original = await seed(database)
    result = await homepage.refresh_homepage(database, tmp_path)
    assert result["status"] == "preview"
    assert result["previous_title"] == "Previous title"
    assert "Connected to your business." in result["title"]
    assert await database.settings.find_one({"id": "homepage"}) == original
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_apply_only_changes_homepage_presentation_and_saves_private_bson_snapshot(database, tmp_path):
    original = await seed(database)
    other_settings = [{"id": "company", "logo": "/real-logo.png", "phone": "real-phone"},
                      {"id": "whatsapp", "api_key": "preserve-test-key"}, {"id": "pricing_engine", "enable_offers": True}]
    await database.settings.insert_many(deepcopy(other_settings))
    before = {}
    for collection in ["products", "customers", "admin_users", "orders", "quotations", "category_prices", "customer_prices", "schemes"]:
        await database[collection].insert_one({"id": f"real-{collection}", "value": 175})
        before[collection] = await database[collection].find({}).to_list(100)
    settings_before = await database.settings.find({"id": {"$ne": "homepage"}}).to_list(100)
    result = await homepage.refresh_homepage(database, tmp_path, apply=True)
    current = await database.settings.find_one({"id": "homepage"})
    assert result["status"] == "applied"
    assert current["hero"]["image"] == homepage.HERO_IMAGE
    assert current["hero"]["whatsapp_text"] == "Contact our team"
    assert current["hero"]["custom_control"] == "keep"
    assert current["intro"]["custom_control"] is True
    assert current["featured_product_ids"] == ["actual-product"]
    assert current["custom_section"] == original["custom_section"]
    assert current["_id"] == original["_id"]
    assert current["presentation_version"] == homepage.PRESENTATION_VERSION
    assert await database.settings.find({"id": {"$ne": "homepage"}}).to_list(100) == settings_before
    for collection, documents in before.items():
        assert await database[collection].find({}).to_list(100) == documents
    backup = next(tmp_path.glob("homepage-*/homepage.json"))
    snapshot = json_util.loads(backup.read_text())
    assert snapshot["before"] == original
    assert snapshot["after"] == current
    assert backup.stat().st_mode & 0o777 == 0o600
    assert backup.parent.stat().st_mode & 0o777 == 0o700


@pytest.mark.asyncio
async def test_redeploy_keeps_later_admin_edits_and_does_not_repeat_backup(database, tmp_path):
    await seed(database)
    await homepage.refresh_homepage(database, tmp_path, apply=True)
    await database.settings.update_one({"id": "homepage"}, {"$set": {"hero.title": "Our team's later headline"}})
    result = await homepage.refresh_homepage(database, tmp_path, apply=True)
    assert result["status"] == "already_applied"
    assert (await database.settings.find_one({"id": "homepage"}))["hero"]["title"] == "Our team's later headline"
    assert len(list(tmp_path.glob("homepage-*"))) == 1


@pytest.mark.asyncio
async def test_backup_failure_prevents_any_content_write(database, tmp_path, monkeypatch):
    original = await seed(database)
    def failure(*args):
        raise PermissionError("Private backup directory is not writable")
    monkeypatch.setattr(homepage, "write_snapshot", failure)
    with pytest.raises(PermissionError):
        await homepage.refresh_homepage(database, tmp_path, apply=True)
    assert await database.settings.find_one({"id": "homepage"}) == original


@pytest.mark.asyncio
async def test_concurrent_admin_edit_is_not_overwritten(database, tmp_path, monkeypatch):
    await seed(database)
    collection = database.settings
    original_update = collection.update_one
    async def racing_update(query, update):
        await original_update({"id": "homepage"}, {"$set": {"hero.title": "Concurrent edit"}})
        return await original_update(query, update)
    monkeypatch.setattr(collection, "update_one", racing_update)
    with pytest.raises(ValueError, match="changed during"):
        await homepage.refresh_homepage(SimpleNamespace(settings=collection, name=database.name), tmp_path, apply=True)
    current = await database.settings.find_one({"id": "homepage"})
    assert current["hero"]["title"] == "Concurrent edit"
    assert "presentation_version" not in current


@pytest.mark.asyncio
async def test_restore_round_trip_preserves_later_unmanaged_sections(database, tmp_path):
    original = await seed(database)
    result = await homepage.refresh_homepage(database, tmp_path, apply=True)
    await database.settings.update_one({"id": "homepage"}, {"$set": {"custom_section": {"new_value": 42}, "updated_at": "later-edit"}})
    assert (await homepage.restore_homepage(database, result["backup"]))["status"] == "restore_preview"
    assert (await database.settings.find_one({"id": "homepage"}))["presentation_version"] == homepage.PRESENTATION_VERSION
    assert (await homepage.restore_homepage(database, result["backup"], apply=True))["status"] == "restored"
    current = await database.settings.find_one({"id": "homepage"})
    for field in homepage.MANAGED_FIELDS:
        assert (field in current) == (field in original)
        assert current.get(field) == original.get(field)
    assert current["custom_section"] == {"new_value": 42}
    assert (await homepage.restore_homepage(database, result["backup"], apply=True))["status"] == "already_restored"


@pytest.mark.asyncio
async def test_restore_refuses_to_replace_later_managed_content(database, tmp_path):
    await seed(database)
    result = await homepage.refresh_homepage(database, tmp_path, apply=True)
    await database.settings.update_one({"id": "homepage"}, {"$set": {"intro.title": "Later admin title"}})
    current = await database.settings.find_one({"id": "homepage"})
    with pytest.raises(ValueError, match="edited after"):
        await homepage.restore_homepage(database, result["backup"], apply=True)
    assert await database.settings.find_one({"id": "homepage"}) == current


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["database", "format", "identity"])
async def test_invalid_snapshot_cannot_write_settings(database, tmp_path, mutation):
    await seed(database)
    result = await homepage.refresh_homepage(database, tmp_path, apply=True)
    from pathlib import Path
    path = Path(result["backup"])
    payload = json_util.loads(path.read_text())
    if mutation == "identity":
        payload["after"]["id"] = "company"
    else:
        payload[mutation] = "wrong-value"
    path.write_text(json_util.dumps(payload))
    current = await database.settings.find_one({"id": "homepage"})
    with pytest.raises(ValueError):
        await homepage.restore_homepage(database, path, apply=True)
    assert await database.settings.find_one({"id": "homepage"}) == current


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [0, 2])
async def test_missing_or_duplicate_homepage_is_not_silently_created_or_replaced(database, tmp_path, count):
    for _ in range(count):
        await seed(database)
    with pytest.raises(ValueError, match="exactly one"):
        await homepage.refresh_homepage(database, tmp_path, apply=True)
    assert await database.settings.count_documents({"id": "homepage"}) == count
    assert list(tmp_path.iterdir()) == []


def test_cli_defaults_to_preview_and_requires_explicit_apply():
    assert parser().parse_args(["refresh-homepage"]).apply is False
    assert parser().parse_args(["refresh-homepage", "--apply"]).apply is True
    assert parser().parse_args(["restore-homepage", "--backup", "homepage.json"]).apply is False
