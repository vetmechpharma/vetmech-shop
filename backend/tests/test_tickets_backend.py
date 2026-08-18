"""VETMECH Customer Support / Tickets module backend tests."""
import os
import random
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vetmech-pharma.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PASSWORD = "Admin@123"
STAFF_EMAIL = "arun@vetmech.com"
STAFF_PASSWORD = "Vetmech@123"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_headers(s):
    r = s.post(f"{BASE_URL}/api/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def staff_headers(s):
    r = s.post(f"{BASE_URL}/api/auth/admin/login", json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Staff login failed: {r.status_code} {r.text}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


# -------------------- DASHBOARD --------------------
class TestDashboard:
    def test_dashboard_kpis(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets/dashboard", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["kpi", "by_type", "by_status", "by_assignee", "by_priority",
                  "overdue", "recent", "activity", "task_summary", "top_customers", "trend", "overview"]:
            assert k in d, f"missing {k}"
        for k in ["total", "open", "in_progress", "pending", "overdue", "completed"]:
            assert k in d["kpi"], f"missing kpi.{k}"
        assert d["kpi"]["total"] >= 22, f"expected >=22 seeded tickets, got {d['kpi']['total']}"
        assert isinstance(d["overdue"], list)


# -------------------- LIST TICKETS + FILTERS --------------------
class TestListTickets:
    def test_list_all(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 22
        assert all("effective_status" in t for t in data["items"])
        # derived overdue
        for t in data["items"]:
            if t["is_overdue"]:
                assert t["effective_status"] == "overdue"
                assert t["status"] != "closed"

    def test_filter_status_open(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets?status=open", headers=admin_headers)
        assert r.status_code == 200
        for t in r.json()["items"]:
            assert t["effective_status"] == "open"

    def test_filter_status_overdue(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets?status=overdue", headers=admin_headers)
        assert r.status_code == 200
        for t in r.json()["items"]:
            assert t["is_overdue"] is True

    def test_filter_mine(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets?mine=true", headers=admin_headers)
        assert r.status_code == 200

    def test_search_q(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets?q=VM", headers=admin_headers)
        assert r.status_code == 200


# -------------------- CONFIG + STAFF --------------------
class TestConfig:
    def test_get_config(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets/config", headers=admin_headers)
        assert r.status_code == 200
        c = r.json()
        assert len(c["types"]) == 11
        assert set(c["priorities"]) == {"Low", "Normal", "High", "Urgent"}
        assert "channels" in c

    def test_update_config(self, s, admin_headers):
        cur = s.get(f"{BASE_URL}/api/tickets/config", headers=admin_headers).json()
        cur["channels"]["sms"] = True
        r = s.put(f"{BASE_URL}/api/admin/tickets/config", headers=admin_headers, json=cur)
        assert r.status_code == 200
        assert r.json()["channels"]["sms"] is True
        # revert
        cur["channels"]["sms"] = False
        s.put(f"{BASE_URL}/api/admin/tickets/config", headers=admin_headers, json=cur)

    def test_staff_list(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets/staff", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 5


# -------------------- CRM CUSTOMERS --------------------
@pytest.fixture(scope="session")
def sample_customer_id(s, admin_headers):
    r = s.get(f"{BASE_URL}/api/crm/customers", headers=admin_headers)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 8, f"expected 8 seeded customers, got {len(items)}"
    return items[0]["id"]


class TestCRM:
    def test_list_customers(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/crm/customers", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["total"] >= 8

    def test_get_customer_stats(self, s, admin_headers, sample_customer_id):
        r = s.get(f"{BASE_URL}/api/crm/customers/{sample_customer_id}", headers=admin_headers)
        assert r.status_code == 200
        c = r.json()
        assert "stats" in c and "tickets" in c and "timeline" in c
        for k in ["total", "open", "pending", "completed", "overdue"]:
            assert k in c["stats"]

    def test_create_customer(self, s, admin_headers):
        payload = {"contact_name": "TEST_C", "company_name": "TEST_Co",
                   "phone": "9" + str(random.randint(100000000, 999999999)),
                   "email": "test@t.com", "customer_type": "Distributor"}
        r = s.post(f"{BASE_URL}/api/crm/customers", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        g = s.get(f"{BASE_URL}/api/crm/customers/{cid}", headers=admin_headers)
        assert g.status_code == 200
        assert g.json()["contact_name"] == "TEST_C"
        # cleanup
        s.delete(f"{BASE_URL}/api/crm/customers/{cid}", headers=admin_headers)


# -------------------- TICKET LIFECYCLE --------------------
@pytest.fixture(scope="session")
def created_ticket(s, admin_headers, sample_customer_id):
    staff = s.get(f"{BASE_URL}/api/tickets/staff", headers=admin_headers).json()
    assignee_id = staff[0]["id"]
    due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    payload = {
        "customer_id": sample_customer_id,
        "title": "TEST_Ticket_" + str(random.randint(1000, 9999)),
        "type": "Complaint", "priority": "High",
        "assignee_id": assignee_id, "due_date": due,
        "description": "test desc",
    }
    r = s.post(f"{BASE_URL}/api/tickets", headers=admin_headers, json=payload)
    assert r.status_code == 200, r.text
    return r.json()


class TestTicketLifecycle:
    def test_create(self, created_ticket):
        t = created_ticket
        assert t["ticket_number"].startswith("VM-")
        assert t["status"] == "open"
        assert t["assignee_id"]
        # created + assigned activity
        actions = [a["action"] for a in t["activity"]]
        assert "created" in actions
        assert "assigned" in actions

    def test_appears_in_list(self, s, admin_headers, created_ticket):
        r = s.get(f"{BASE_URL}/api/tickets", headers=admin_headers)
        nums = [x["ticket_number"] for x in r.json()["items"]]
        assert created_ticket["ticket_number"] in nums

    def test_notification_created(self, s, admin_headers, created_ticket):
        r = s.get(f"{BASE_URL}/api/tickets/notifications/list", headers=admin_headers)
        assert r.status_code == 200
        # The notification is targeted to assignee; admin sees only own + global.
        # Verify endpoint works and structure
        d = r.json()
        assert "items" in d and "unread" in d

    def test_status_in_progress(self, s, admin_headers, created_ticket):
        r = s.patch(f"{BASE_URL}/api/tickets/{created_ticket['id']}/status",
                    headers=admin_headers, json={"status": "in_progress"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "in_progress"
        assert any(a["action"] == "status_changed" for a in d["activity"])

    def test_status_closed_sets_closed_date(self, s, admin_headers, created_ticket):
        r = s.patch(f"{BASE_URL}/api/tickets/{created_ticket['id']}/status",
                    headers=admin_headers, json={"status": "closed"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "closed"
        assert d["closed_date"] is not None

    def test_status_overdue_rejected(self, s, admin_headers, created_ticket):
        r = s.patch(f"{BASE_URL}/api/tickets/{created_ticket['id']}/status",
                    headers=admin_headers, json={"status": "overdue"})
        assert r.status_code == 400

    def test_add_update_comment(self, s, admin_headers, created_ticket):
        r = s.post(f"{BASE_URL}/api/tickets/{created_ticket['id']}/updates",
                   headers=admin_headers, json={"message": "test comment"})
        assert r.status_code == 200
        assert any(a.get("message") == "test comment" for a in r.json()["activity"])

    def test_attachment_add_delete(self, s, admin_headers, created_ticket):
        r = s.post(f"{BASE_URL}/api/tickets/{created_ticket['id']}/attachments",
                   headers=admin_headers, json={"filename": "t.pdf", "url": "http://x/t.pdf", "size": 100})
        assert r.status_code == 200
        atts = r.json()["attachments"]
        assert len(atts) >= 1
        aid = atts[-1]["id"]
        r2 = s.delete(f"{BASE_URL}/api/tickets/{created_ticket['id']}/attachments/{aid}",
                      headers=admin_headers)
        assert r2.status_code == 200


# -------------------- REPORTS --------------------
class TestReports:
    def test_reports(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets/reports", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "performance" in d
        assert "avg_completion_hours" in d["performance"]
        assert isinstance(d["employee"], list)
        assert "top_customers" in d and "most_complaints" in d and "by_type" in d


# -------------------- NOTIFICATIONS --------------------
class TestNotifications:
    def test_list(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/tickets/notifications/list", headers=admin_headers)
        assert r.status_code == 200
        assert "items" in r.json() and "unread" in r.json()

    def test_read_all(self, s, admin_headers):
        r = s.patch(f"{BASE_URL}/api/tickets/notifications/read-all", headers=admin_headers)
        assert r.status_code == 200


# -------------------- ROLE GATING --------------------
class TestRoleGating:
    def test_staff_can_access_tickets(self, s, staff_headers):
        r = s.get(f"{BASE_URL}/api/tickets", headers=staff_headers)
        assert r.status_code == 200, r.text

    def test_staff_can_access_dashboard(self, s, staff_headers):
        r = s.get(f"{BASE_URL}/api/tickets/dashboard", headers=staff_headers)
        assert r.status_code == 200

    def test_unauth_rejected(self, s):
        r = s.get(f"{BASE_URL}/api/tickets")
        assert r.status_code in (401, 403)
