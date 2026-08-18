import random
from datetime import datetime, timezone, timedelta
from security import hash_password
from helpers import new_id, now_iso


def iso(dt):
    return dt.isoformat()


async def run_seed_tickets(db):
    # Staff (assignable admin users)
    if await db.admin_users.count_documents({"role": {"$in": ["sales_executive", "manager", "support_user", "admin"]}}) == 0:
        staff = [
            ("Arun Kumar", "arun@vetmech.com", "sales_executive", "Sales"),
            ("Monisha R", "monisha@vetmech.com", "sales_executive", "Sales"),
            ("Suresh Babu", "suresh@vetmech.com", "support_user", "Support"),
            ("Karthik S", "karthik@vetmech.com", "manager", "Operations"),
            ("Senthil M", "senthil@vetmech.com", "support_user", "Support"),
        ]
        for name, email, role, dept in staff:
            await db.admin_users.insert_one({
                "id": new_id(), "name": name, "email": email,
                "password_hash": hash_password("Vetmech@123"), "role": role,
                "department": dept, "permissions": None, "active": True,
                "is_demo": True, "created_at": now_iso(),
            })

    if await db.crm_customers.count_documents({}) == 0:
        customers = [
            ("Dr. Kumar", "ABC Veterinary Clinic", "Veterinary Clinic", "9876543210", "abcvet@example.com", "12 MG Road, Coimbatore, TN"),
            ("Sivakumar", "Siva Dairy Farm", "Dairy Farm", "9876500011", "siva.dairy@example.com", "Kovai Road, Erode, TN"),
            ("Green Valley Mgr", "Green Valley Farms", "Dairy Farm", "9876500022", "greenvalley@example.com", "NH-44, Salem, TN"),
            ("Dr. Anbu", "Anbu Veterinary", "Veterinary Clinic", "9876500033", "anbuvet@example.com", "Gandhi Nagar, Madurai, TN"),
            ("Rajesh Distributors", "Kumar Vet Clinic", "Veterinary Clinic", "9876500044", "kumarvet@example.com", "Trichy Main Road, Trichy, TN"),
            ("Meena Traders", "Meena Agri Distributors", "Distributor", "9876500055", "meena.dist@example.com", "Market Street, Namakkal, TN"),
            ("Bharath Retail", "Bharath Vet Store", "Retailer", "9876500066", "bharath.store@example.com", "Bazaar Road, Tirupur, TN"),
            ("Dr. Lakshmi", "City Pet Hospital", "Hospital", "9876500077", "citypet@example.com", "Race Course, Coimbatore, TN"),
        ]
        for cn, comp, ct, ph, em, addr in customers:
            await db.crm_customers.insert_one({
                "id": new_id(), "contact_name": cn, "company_name": comp, "customer_type": ct,
                "phone": ph, "alt_phone": "", "email": em, "address": addr, "notes": "",
                "is_demo": True, "created_at": now_iso(),
            })

    if await db.tickets.count_documents({}) == 0:
        staff = await db.admin_users.find({"role": {"$in": ["sales_executive", "manager", "support_user"]}}, {"_id": 0}).to_list(50)
        custs = await db.crm_customers.find({}, {"_id": 0}).to_list(50)
        if not staff or not custs:
            return
        types = ["Product Discussion", "Meeting", "Call to Person", "Order Related", "Replacement",
                 "Complaint", "Payment Follow-up", "Delivery Issue", "Product Enquiry"]
        titles = {
            "Product Discussion": "Discuss VETMECH Mastitis product range",
            "Meeting": "Schedule product demo meeting",
            "Call to Person": "Follow-up call regarding recent order",
            "Order Related": "Confirm bulk order quantities",
            "Replacement": "Broken bottle replacement request",
            "Complaint": "Complaint about delivery delay",
            "Payment Follow-up": "Pending payment reminder",
            "Delivery Issue": "Shipment not received",
            "Product Enquiry": "Enquiry on new poultry supplement",
        }
        priorities = ["Low", "Normal", "High", "Urgent"]
        statuses = ["open", "in_progress", "pending", "closed"]
        now = datetime.now(timezone.utc)
        seq = 1024
        for i in range(22):
            seq += 1
            c = random.choice(custs)
            s = random.choice(staff)
            typ = random.choice(types)
            status = random.choices(statuses, weights=[3, 2, 2, 4])[0]
            created = now - timedelta(days=random.randint(0, 12), hours=random.randint(0, 10))
            due = created + timedelta(days=random.randint(1, 6))
            # make a few overdue
            if i % 5 == 0 and status != "closed":
                due = now - timedelta(days=random.randint(1, 4))
            activity = [{"id": new_id(), "action": "created", "message": "Ticket created", "user": s["name"], "at": iso(created)},
                        {"id": new_id(), "action": "assigned", "message": f"Assigned to {s['name']}", "user": "VETMECH Admin", "at": iso(created)}]
            if status in ("in_progress", "pending", "closed"):
                activity.append({"id": new_id(), "action": "status_changed", "message": "Status changed to In Progress", "user": s["name"], "at": iso(created + timedelta(hours=3))})
            closed_date = iso(due - timedelta(hours=2)) if status == "closed" else None
            await db.tickets.insert_one({
                "id": new_id(), "ticket_number": f"VM-{seq}", "customer_id": c["id"],
                "customer_name": c["contact_name"], "company_name": c["company_name"],
                "customer_phone": c["phone"], "customer_email": c["email"],
                "title": titles.get(typ, typ), "type": typ, "description": f"{titles.get(typ, typ)} for {c['company_name']}.",
                "priority": random.choice(priorities), "status": status,
                "assignee_id": s["id"], "assignee_name": s["name"],
                "created_by": None, "created_by_name": "VETMECH Admin",
                "due_date": iso(due), "reminder": None, "attachments": [], "activity": activity,
                "is_demo": True, "created_at": iso(created), "updated_at": iso(created + timedelta(hours=4)),
                "closed_date": closed_date,
            })
        await db.counters.update_one({"id": "ticket"}, {"$set": {"seq": seq}}, upsert=True)
