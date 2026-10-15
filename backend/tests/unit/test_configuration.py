import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("init_config", Path(__file__).resolve().parents[3] / "scripts/init_config.py")
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


def test_generated_configuration_is_private_consistent_and_not_overwritten(tmp_path):
    config.generate(tmp_path, "https://copy.example.com", "owner@example.com")
    backend = tmp_path / "backend/.env"
    original = backend.read_text()
    assert "APP_ENV=production" in original
    assert "SEED_DEMO_DATA=false" in original
    assert "ALLOW_DEV_OTP=false" in original
    assert backend.stat().st_mode & 0o777 == 0o600
    root_values = dict(line.split("=", 1) for line in (tmp_path / ".env").read_text().splitlines())
    backend_values = dict(line.split("=", 1) for line in original.splitlines())
    assert root_values["JWT_SECRET"] == backend_values["JWT_SECRET"]
    assert len(root_values["JWT_SECRET"]) >= 48
    with pytest.raises(ValueError, match="already exists"):
        config.generate(tmp_path, "https://other.example.com", "other@example.com")
    assert backend.read_text() == original


@pytest.mark.parametrize("site", ["ftp://example.com", "https://example.com/path", "https://example.com?x=1"])
def test_configuration_rejects_invalid_site_origins(tmp_path, site):
    with pytest.raises(ValueError):
        config.generate(tmp_path, site, "owner@example.com")
    assert list(tmp_path.iterdir()) == []
