import os
from pathlib import Path
import sys

import pytest
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "vetmech_unit_tests")
os.environ.setdefault("JWT_SECRET", "isolated-unit-tests-secret-with-enough-entropy")


@pytest.fixture
def database():
    return AsyncMongoMockClient()["vetmech_unit_tests"]


@pytest.fixture(autouse=True)
def production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("ALLOW_DEV_OTP", raising=False)
    monkeypatch.delenv("SEED_DEMO_DATA", raising=False)


@pytest.fixture
def client(database, monkeypatch):
    import db
    import server
    from fastapi.testclient import TestClient

    for name, module in list(sys.modules.items()):
        if name in {"db", "server"} or name.startswith("routers."):
            if hasattr(module, "db"):
                monkeypatch.setattr(module, "db", database)
    # No lifespan: these isolated tests control their own database fixtures.
    return TestClient(server.app)
