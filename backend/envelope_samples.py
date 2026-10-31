"""Explicit, repeatable creation of labelled envelope-print test records."""
from copy import deepcopy
from datetime import datetime, timezone

SAMPLE_MARKER = "envelope-print-v1"
SAMPLE_MOBILE = "0000000004"  # Deliberately not a routable Indian mobile.
CUSTOMER_ID = "sample-envelope-customer"
READY_ID = "sample-envelope-ready"
PAID_ID = "sample-envelope-paid"


def sample_documents():
    now = datetime.now(timezone.utc).isoformat()
    day = now[:10]
    address = dict(name="SAMPLE — Dr. Sample Customer", mobile=SAMPLE_MOBILE,
                   line1="12, Veterinary Clinic Road", line2="Near Bus Stand", line3="",
                   main_area="Koduvai", district="Tiruppur", state="Tamil Nadu", pincode="638660")
    customer = dict(id=CUSTOMER_ID, name=address["name"], prefix="Dr.", mobile=SAMPLE_MOBILE,
                    normalized_mobile=SAMPLE_MOBILE, whatsapp=SAMPLE_MOBILE, email="",
                    company_name="SAMPLE Veterinary Clinic — PRINT TEST ONLY", category="doctor",
                    status="active", active=True, addresses=[deepcopy(address)], default_address=deepcopy(address),
                    address=address["line1"], district=address["district"], state=address["state"],
                    pincode=address["pincode"], created_at=now, sample_data=SAMPLE_MARKER)
    specs = [("NERVIPHOS-BM", "100 ml", 650), ("NERVIPHOS-M", "100 ml", 450), ("MASTOBLISS-TSC", "500 g", 300)]
    items = [dict(product_id=f"sample-envelope-product-{i}", variant_id=f"sample-envelope-variant-{i}",
                  product_name=f"SAMPLE — {name}", brand_name="SAMPLE", pack_size=pack, unit="Pack",
                  image="", slug="", qty=24, free_qty=0, dispatch_qty=24, units_per_case=24,
                  mrp=rate, unit_price=rate, selling_price=rate, net_rate=rate, gst_percent=12,
                  gst_inclusive=False, price_source="sample", scheme_label=None, out_of_stock=False)
             for i, (name, pack, rate) in enumerate(specs, 1)]
    dispatch = dict(cases=3, transport="Customer Pickup", freight="to_pay", dispatch_date=day,
                    invoice_number="SAMPLE-INV-001", invoice_value=33600, invoice_date=day,
                    remarks="SAMPLE ONLY — DO NOT SHIP", lr_number="")
    base = dict(customer_id=CUSTOMER_ID, customer_name=customer["name"], customer_mobile=SAMPLE_MOBILE,
                customer_whatsapp=SAMPLE_MOBILE, customer_category="doctor", company_name=customer["company_name"],
                address=address, items=items, total_qty=72, total_free=0, total_dispatch=72,
                sales_value=33600, cash_discount=False, sample_data=SAMPLE_MARKER,
                notes="SAMPLE DATA — envelope print test. Fictional rates. No goods, payments or customer notifications.",
                internal_notes="Print-only sample. Product lines are snapshots, not public catalogue products. No invoice is posted to the ledger.",
                pending_items=[], review_reminder_sent=True, created_at=now, updated_at=now,
                origin={"device": "Maintenance sample", "location": "Synthetic test data"})
    orders = []
    for oid, number, status in [(READY_ID, "SAMPLE-ENV-TO-PAY", "ready_to_dispatch"),
                                 (PAID_ID, "SAMPLE-ENV-PAID", "dispatched")]:
        order = deepcopy(base)
        order.update(id=oid, order_number=number, status=status,
                     activity=[dict(id=oid+"-created", text="Sample envelope-print order created; no notifications sent", actor="Maintenance", at=now)])
        if oid == READY_ID:
            order.update(dispatch=None, dispatch_preparation=deepcopy(dispatch))
        else:
            order["dispatch"] = dict(dispatch, freight="paid", invoice_number="SAMPLE-INV-002",
                                     lr_number="SAMPLE-LR-002", dispatched_by="Maintenance sample", dispatched_at=now)
        orders.append(order)
    return [("customers", customer), *[("orders", o) for o in orders]]


async def add_envelope_samples(db, apply=False):
    documents = sample_documents()
    # Check all collisions before the first write; never overwrite an actual record.
    for collection, doc in documents:
        existing = await db[collection].find_one({"id": doc["id"]})
        if existing and existing.get("sample_data") != SAMPLE_MARKER:
            raise ValueError(f"Existing non-sample record uses {doc['id']}; no sample data was written")
    collision = await db.customers.find_one({"mobile": SAMPLE_MOBILE, "id": {"$ne": CUSTOMER_ID}})
    if collision:
        raise ValueError("Reserved sample mobile is already used; no sample data was written")
    created = []
    if apply:
        for collection, doc in documents:
            result = await db[collection].update_one({"id": doc["id"]}, {"$setOnInsert": doc}, upsert=True)
            if result.upserted_id is not None:
                created.append(doc["id"])
    return dict(status="applied" if apply else "preview", created=created,
                customer="SAMPLE — Dr. Sample Customer", orders=["SAMPLE-ENV-TO-PAY", "SAMPLE-ENV-PAID"],
                note="Print-test records only. No catalogue, stock, counters or ledger entries changed; no notifications sent. Existing sample edits are retained. Sample orders appear in ordinary order reports.")
