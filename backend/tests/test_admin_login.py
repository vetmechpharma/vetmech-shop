"""Admin login bug regression tests"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vetmech-pharma.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PASSWORD = "Admin@123"
STAFF_EMAIL = "arun@vetmech.com"
STAFF_PASSWORD = "Vetmech@123"


def test_admin_login_success():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
    assert data["user"]["email"] == ADMIN_EMAIL
    assert data["user"]["role"] == "super_admin"
    assert "password_hash" not in data["user"]
    assert "_id" not in data["user"]


def test_admin_login_wrong_password():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": "WrongPass!"}, timeout=15)
    assert r.status_code == 401
    body = r.json()
    assert "detail" in body


def test_admin_login_unknown_email():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": "nope@vetmech.com", "password": "whatever"}, timeout=15)
    assert r.status_code == 401


def test_admin_me_with_token():
    login = requests.post(f"{BASE_URL}/api/auth/admin/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15).json()
    token = login["token"]
    r = requests.get(f"{BASE_URL}/api/auth/admin/me",
                     headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


def test_admin_me_without_token_401():
    r = requests.get(f"{BASE_URL}/api/auth/admin/me", timeout=15)
    assert r.status_code in (401, 403)


def test_admin_me_bad_token_401():
    r = requests.get(f"{BASE_URL}/api/auth/admin/me",
                     headers={"Authorization": "Bearer garbage.token.value"}, timeout=15)
    assert r.status_code in (401, 403)


def test_staff_login_success():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["email"] == STAFF_EMAIL
    assert data["user"]["role"] == "sales_executive"
    token = data["token"]
    me = requests.get(f"{BASE_URL}/api/auth/admin/me",
                      headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert me.status_code == 200
    assert me.json()["email"] == STAFF_EMAIL
