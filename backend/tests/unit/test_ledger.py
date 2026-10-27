import pytest
from security import create_token


ADMIN = {"Authorization": "Bearer " + create_token("owner", "admin")}
ALICE = {"Authorization": "Bearer " + create_token("alice", "customer")}
BOB = {"Authorization": "Bearer " + create_token("bob", "customer")}
DAY = "2026-01-10"
OPENING = {"amount": "1000.10", "direction": "debit", "as_of_date": "2026-01-01"}
PAYMENT = {"amount": "100.05", "transaction_date": DAY, "mode": "UPI", "transaction_id": "UTR123456"}
INVOICE = {"invoice_number": "VM/25-26/001", "invoice_date": "2026-01-05", "amount": "200.20"}


async def seed(database):
    await database.admin_users.insert_many([{"id": "owner", "name": "Owner", "role": "super_admin", "active": True},
                                           {"id": "catalog", "role": "product_manager", "active": True}])
    await database.customers.insert_many([{"id": cid, "name": cid.title(), "mobile": "900000000" + str(i), "status": "active"} for i, cid in enumerate(["alice", "bob"])])
    await database.orders.insert_many([{"id": oid, "customer_id": "alice", "customer_name": "Alice", "customer_mobile": "9000000000",
                                       "order_number": oid, "status": "delivered", "items": [], "activity": [], "updated_at": DAY + "T00:00:00Z"} for oid in ["o1", "o2"]])
    await database.orders.create_index("invoice_key", unique=True, sparse=True)


def ledger(client, cid="alice", **params):
    response = client.get(f"/api/admin/customers/{cid}/ledger", headers=ADMIN, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_opening_invoice_and_payment_form_an_exact_statement_with_no_duplicate_postings(client, database):
    await seed(database)
    assert client.put("/api/admin/customers/alice/opening-balance", json=OPENING, headers=ADMIN).status_code == 200
    for _ in range(2):
        response = client.post("/api/admin/orders/o1/close", json=INVOICE, headers=ADMIN)
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "closed"
        assert client.post("/api/admin/customers/alice/payments", json=PAYMENT, headers=ADMIN).status_code == 200
    result = ledger(client)
    assert result["total"] == 3
    assert result["summary"]["balance_paise"] == 110025
    assert result["summary"]["debit_paise"] == 120030
    assert result["summary"]["credit_paise"] == 10005
    assert [row["balance_paise"] for row in result["items"]] == [110025, 120030, 100010]
    own = client.get("/api/ledger/mine", headers=ALICE).json()
    assert own["summary"] == result["summary"]
    assert all("history" not in row and "created_by" not in row for row in own["items"])


@pytest.mark.asyncio
async def test_customer_reports_wait_for_admin_confirmation_and_cannot_choose_another_customer(client, database):
    await seed(database)
    response = client.post("/api/ledger/payments", json=PAYMENT, headers=ALICE)
    assert response.status_code == 200, response.text
    pid = response.json()["id"]
    assert response.json()["status"] == "pending"
    assert ledger(client)["summary"]["balance_paise"] == 0
    assert ledger(client)["summary"]["pending_payments"] == 1
    assert client.get("/api/admin/payments/pending", headers=ADMIN).json()["total"] == 1
    for _ in range(2):
        assert client.post(f"/api/admin/payments/{pid}/confirm", headers=ADMIN).status_code == 200
    assert ledger(client)["summary"]["advance_paise"] == 10005
    assert ledger(client)["summary"]["pending_payments"] == 0
    assert client.get("/api/ledger/mine", headers=BOB).json()["total"] == 0
    assert client.get("/api/admin/customers/alice/ledger", headers=BOB).status_code in [401, 403]
    assert client.post("/api/ledger/payments", json={**PAYMENT, "customer_id": "bob"}, headers=ALICE).status_code == 422
    assert client.post(f"/api/admin/payments/{pid}/confirm", headers=ALICE).status_code in [401, 403]
    assert client.post("/api/admin/customers/bob/payments", json={**PAYMENT, "transaction_id": "utr 123456"}, headers=ADMIN).status_code == 409
    assert client.post("/api/admin/customers/alice/payments", json={**PAYMENT, "amount": "200"}, headers=ADMIN).status_code == 409


@pytest.mark.asyncio
async def test_opening_corrections_are_versioned_and_require_a_reason(client, database):
    await seed(database)
    first = client.put("/api/admin/customers/alice/opening-balance", json=OPENING, headers=ADMIN).json()
    assert first["revision"] == 1
    correction = {**OPENING, "amount": "50.01", "direction": "credit", "expected_revision": 1}
    assert client.put("/api/admin/customers/alice/opening-balance", json=correction, headers=ADMIN).status_code == 400
    assert client.put("/api/admin/customers/alice/opening-balance", json={**correction, "reason": "Correct carried balance"}, headers=ADMIN).status_code == 200
    assert client.put("/api/admin/customers/alice/opening-balance", json={**correction, "amount": "51", "reason": "Stale correction"}, headers=ADMIN).status_code == 409
    assert ledger(client)["summary"]["balance_paise"] == -5001
    row = await database.ledger_entries.find_one({"id": "opening:alice"})
    assert row["history"][0]["amount_paise"] == 100010
    assert row["revision"] == 2


@pytest.mark.asyncio
async def test_posted_invoice_protects_order_history_and_voiding_allows_correction(client, database):
    await seed(database)
    assert client.post("/api/admin/orders/o1/close", json=INVOICE, headers=ADMIN).status_code == 200
    assert client.post("/api/admin/orders/o1/close", json={**INVOICE, "amount": "999"}, headers=ADMIN).status_code == 409
    assert client.post("/api/admin/orders/o2/close", json=INVOICE, headers=ADMIN).status_code == 409
    assert client.delete("/api/admin/orders/o1", headers=ADMIN).status_code == 409
    assert client.put("/api/admin/orders/o1", json={"items": []}, headers=ADMIN).status_code == 409
    assert client.patch("/api/admin/orders/o1/status", json={"status": "cancelled"}, headers=ADMIN).status_code == 409
    assert client.post("/api/admin/orders/o1/dispatch", json={}, headers=ADMIN).status_code == 409
    assert client.patch("/api/admin/orders/o2/status", json={"status": "closed"}, headers=ADMIN).status_code == 400
    assert client.post("/api/admin/orders/o1/invoice/void", json={"reason": "Incorrect invoice amount"}, headers=ADMIN).status_code == 200
    assert ledger(client)["summary"]["balance_paise"] == 0
    assert ledger(client)["items"][0]["status"] == "voided"
    assert client.delete("/api/admin/orders/o1", headers=ADMIN).status_code == 409
    assert client.post("/api/admin/orders/o1/close", json={**INVOICE, "amount": "250.25"}, headers=ADMIN).status_code == 200
    assert ledger(client)["summary"]["balance_paise"] == 25025
    assert ledger(client)["total"] == 2


@pytest.mark.asyncio
async def test_payment_void_and_rejection_keep_history_without_crediting_twice(client, database):
    await seed(database)
    confirmed = client.post("/api/admin/customers/alice/payments", json=PAYMENT, headers=ADMIN).json()
    pid = confirmed["id"]
    assert client.post(f"/api/admin/payments/{pid}/void", json={"reason": "Wrong account reference"}, headers=ADMIN).status_code == 200
    assert ledger(client)["summary"]["balance_paise"] == 0
    reported = client.post("/api/ledger/payments", json={**PAYMENT, "transaction_id": "OTHER123"}, headers=ALICE).json()
    assert client.post(f"/api/admin/payments/{reported['id']}/reject", json={"reason": "Receipt was not found"}, headers=ADMIN).status_code == 200
    assert client.post(f"/api/admin/payments/{reported['id']}/confirm", headers=ADMIN).status_code == 409
    assert ledger(client)["total"] == 2
    assert ledger(client)["summary"]["balance_paise"] == 0
    assert {row["status"] for row in ledger(client)["items"]} == {"voided", "rejected"}


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [{"amount": "0"}, {"amount": "-1"}, {"amount": "0.001"}, {"amount": "NaN"}, {"amount": "Infinity"}, {"amount": "10000000000"}, {"mode": "CASH"}, {"transaction_id": ""}, {"transaction_date": "2099-01-01"}, {"transaction_date": "2026-02-30"}])
async def test_invalid_payments_never_change_the_ledger(client, database, change):
    await seed(database)
    response = client.post("/api/admin/customers/alice/payments", json={**PAYMENT, **change}, headers=ADMIN)
    assert response.status_code in [400, 422], response.text
    assert ledger(client)["total"] == 0


@pytest.mark.asyncio
async def test_ledger_requires_permissions_and_keeps_deleted_customer_history(client, database):
    await seed(database)
    for headers, status in [({}, 401), ({"Authorization": "Bearer " + create_token("catalog", "admin")}, 403)]:
        assert client.get("/api/admin/customers/alice/ledger", headers=headers).status_code == status
        assert client.post("/api/admin/customers/alice/payments", json=PAYMENT, headers=headers).status_code == status
        assert client.post("/api/admin/orders/o1/close", json=INVOICE, headers=headers).status_code == status
    assert client.get("/api/ledger/mine").status_code == 401
    client.put("/api/admin/customers/alice/opening-balance", json=OPENING, headers=ADMIN)
    assert client.delete("/api/admin/customers/alice?hard=true", headers=ADMIN).status_code == 409
    client.delete("/api/admin/customers/alice", headers=ADMIN)
    assert ledger(client)["summary"]["balance_paise"] == 100010
    assert client.get("/api/ledger/mine", headers=ALICE).status_code == 403
    assert client.post("/api/admin/customers/alice/payments", json=PAYMENT, headers=ADMIN).status_code == 409


@pytest.mark.asyncio
async def test_pagination_balances_include_all_rows_and_backdated_payments(client, database):
    await seed(database)
    client.put("/api/admin/customers/alice/opening-balance", json=OPENING, headers=ADMIN)
    for i, day in enumerate(["2026-01-20", "2026-01-05", "2026-01-15"]):
        assert client.post("/api/admin/customers/alice/payments", json={**PAYMENT, "amount": "0.10", "transaction_id": "PAY"+str(i), "transaction_date": day}, headers=ADMIN).status_code == 200
    first = ledger(client, page=1, limit=2)
    second = ledger(client, page=2, limit=2)
    assert first["summary"]["balance_paise"] == 99980
    assert second["summary"] == first["summary"]
    assert [row["balance_paise"] for row in first["items"]+second["items"]] == [99980, 99990, 100000, 100010]
