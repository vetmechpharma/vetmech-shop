import os
from pathlib import Path
from datetime import datetime, timezone, timedelta
from security import hash_password, verify_password
from helpers import new_id, now_iso

IMG = {
    "nerviphos_bm": "https://static.prod-images.emergentagent.com/jobs/e1c483d3-98a9-41f6-a213-66d047d17ade/images/3a7e26b26621be128a5533c531797435d88bec246a3fb4299054edecfd589e59.jpeg",
    "nerviphos_m": "https://static.prod-images.emergentagent.com/jobs/e1c483d3-98a9-41f6-a213-66d047d17ade/images/2bed1a7433b2db761c59a68ee2e58d13f1b6981f2368a8c1c934a7f7fb75a4eb.jpeg",
    "vetkclor": "https://static.prod-images.emergentagent.com/jobs/e1c483d3-98a9-41f6-a213-66d047d17ade/images/cd0bac374c2ec4be489065bc6506ad3f002d5ae17287f4562f5625264c68465d.jpeg",
    "mastobliss": "https://static.prod-images.emergentagent.com/jobs/e1c483d3-98a9-41f6-a213-66d047d17ade/images/f2efb1071fdeca72d61916f21c4abf907fac13b68a2d1776f696b2a9fcd948d6.jpeg",
    "hero": "https://static.prod-images.emergentagent.com/jobs/e1c483d3-98a9-41f6-a213-66d047d17ade/images/469191804573dff5959cf7ad8c78cee46c7f9ed0189fa03f43a36866c2170ba4.jpeg",
    "cattle": "https://images.unsplash.com/photo-1633023103172-f26a882a2881?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
    "poultry": "https://images.unsplash.com/photo-1589922583749-6b8473a85048?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
    "small_animal": "https://images.pexels.com/photos/6235114/pexels-photo-6235114.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "lab": "https://images.unsplash.com/photo-1614935151651-0bea6508db6b?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
    "manufacturing": "https://images.unsplash.com/photo-1669101283516-e608dcf142df?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
    "rd": "https://images.unsplash.com/photo-1639772823849-6efbd173043c?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
}


async def seed_admin(db):
    email = os.environ["ADMIN_EMAIL"].lower()
    password = os.environ["ADMIN_PASSWORD"]
    existing = await db.admin_users.find_one({"email": email})
    if not existing:
        await db.admin_users.insert_one({
            "id": new_id(), "name": "VETMECH Admin", "email": email,
            "password_hash": hash_password(password), "role": "super_admin",
            "permissions": ["*"], "active": True, "created_at": now_iso(),
        })
    elif not verify_password(password, existing.get("password_hash", "")):
        await db.admin_users.update_one({"email": email},
                                        {"$set": {"password_hash": hash_password(password)}})


async def run_seed(db):
    await seed_admin(db)
    write_test_credentials()

    if await db.settings.count_documents({}) == 0:
        await seed_settings(db)
    if await db.units.count_documents({}) == 0:
        for u in ["Pcs", "Bottle", "Strip", "Pack", "Box", "Tube", "Vial", "Sachet", "Kg", "Gram", "Litre", "ml"]:
            await db.units.insert_one({"id": new_id(), "name": u, "created_at": now_iso()})
    if await db.brands.count_documents({}) == 0:
        await db.brands.insert_one({"id": "brand-vetmech", "name": "VETMECH", "logo": "",
                                    "description": "VETMECH flagship veterinary range", "active": True,
                                    "is_demo": True, "created_at": now_iso()})
    if await db.categories.count_documents({}) == 0:
        await seed_categories(db)
    if await db.products.count_documents({}) == 0:
        await seed_products(db)
    if await db.schemes.count_documents({}) == 0:
        await seed_schemes(db)
    if await db.pages.count_documents({}) == 0:
        await seed_pages(db)
    if await db.news.count_documents({}) == 0:
        await seed_news(db)
    if await db.gallery.count_documents({}) == 0:
        await seed_gallery(db)
    if await db.careers.count_documents({}) == 0:
        await seed_careers(db)


def write_test_credentials():
    p = Path("/app/memory/test_credentials.md")
    if not p.parent.exists():
        return  # Skip on non-Emergent hosts (e.g. self-hosted VPS) where /app/memory doesn't exist
    p.write_text(
        "# VETMECH Test Credentials\n\n"
        "## Admin Panel (login at /admin/login)\n"
        f"- Email: {os.environ['ADMIN_EMAIL']}\n"
        f"- Password: {os.environ['ADMIN_PASSWORD']}\n"
        "- Role: super_admin (full access)\n\n"
        "## Customer login (WhatsApp OTP, mocked)\n"
        "- Go to Checkout or Account, enter any 10-digit mobile (e.g. 9876543210)\n"
        "- Click 'Send OTP' — the OTP is returned in the API response (dev_otp) and shown on screen\n"
        "- Enter that OTP to verify\n\n"
        "## Key endpoints\n"
        "- POST /api/auth/admin/login\n"
        "- POST /api/auth/otp/request  {mobile}\n"
        "- POST /api/auth/otp/verify   {mobile, otp}\n"
        "- POST /api/orders            (checkout)\n"
    )


async def seed_settings(db):
    docs = [
        {"id": "company", "name": "VETMECH PHARMACEUTICALS PRIVATE LIMITED",
         "tagline": "Advancing Animal Health", "logo": "", "favicon": "",
         "address": "Plot 42, Pharma Industrial Estate, Ahmedabad, Gujarat 382210, India",
         "phone": "+91 98250 00000", "whatsapp": "919825000000",
         "email": "vetmechpharma@gmail.com", "gst_number": "24ABCDE1234F1Z5",
         "social": {"facebook": "#", "instagram": "#", "linkedin": "#", "youtube": "#"},
         "business_hours": "Mon - Sat: 9:30 AM to 6:30 PM"},
        {"id": "whatsapp", "api_url": "", "api_key": "", "sender_number": "919825000000",
         "admin_numbers": ["919825000000"],
         "otp_template": "Your VETMECH OTP is {otp}",
         "order_template": "Order {order} received",
         "status_templates": {
             "confirmed": "Dear {name}, your VETMECH order {order} is CONFIRMED. Thank you!",
             "processing": "Your VETMECH order {order} is now being PROCESSED.",
             "ready_to_dispatch": "Your VETMECH order {order} is READY TO DISPATCH.",
             "dispatched": "Good news! Your VETMECH order {order} has been DISPATCHED.",
             "delivered": "Your VETMECH order {order} has been DELIVERED. Thank you for choosing VETMECH!",
             "cancelled": "Your VETMECH order {order} has been CANCELLED. Contact us for help.",
         }},
        {"id": "smtp", "host": "", "port": 587, "username": "", "password": "",
         "sender_name": "VETMECH Pharmaceuticals", "sender_email": "vetmechpharma@gmail.com",
         "admin_email": "vetmechpharma@gmail.com"},
        {"id": "seo", "default_title": "VETMECH Pharmaceuticals | Veterinary Medicines India",
         "default_description": "Premium veterinary pharmaceuticals for large animals, small animals and poultry.",
         "default_keywords": "veterinary medicine, cattle tonic, poultry health, animal pharma India",
         "default_og_image": IMG["hero"], "robots": "index, follow"},
        {"id": "website",
         "footer_about": "VETMECH Pharmaceuticals is a trusted Indian veterinary pharmaceutical company delivering quality-assured medicines for large animals, companion animals and poultry.",
         "social": {"facebook": "#", "instagram": "#", "linkedin": "#", "youtube": "#"}},
        {"id": "homepage",
         "hero": {"title": "Advancing Animal Health Across India",
                  "subtitle": "Quality-assured veterinary pharmaceuticals for cattle, companion animals and poultry — trusted by doctors, distributors and farms nationwide.",
                  "image": IMG["hero"], "cta_text": "Explore Products", "cta_link": "/products",
                  "whatsapp_text": "Order on WhatsApp"},
         "intro": {"title": "Trusted Veterinary Pharmaceuticals",
                   "text": "For over a decade, VETMECH has manufactured GMP-grade veterinary formulations that keep animals healthy and productive. From large-animal tonics to poultry supplements, our science-led range supports veterinarians and farmers across India."},
         "strengths": [
             {"icon": "ShieldCheck", "title": "GMP Certified", "text": "Manufactured in WHO-GMP compliant facilities."},
             {"icon": "FlaskConical", "title": "R&D Driven", "text": "Backed by a dedicated research team."},
             {"icon": "Truck", "title": "Pan-India Supply", "text": "Reliable distribution to every state."},
             {"icon": "Users", "title": "Vet Approved", "text": "Formulations trusted by 5,000+ vets."},
         ],
         "quality": {"title": "Quality You Can Trust",
                     "text": "Every batch undergoes rigorous quality control — raw material testing, in-process checks and finished-product analysis in our accredited laboratory.",
                     "image": IMG["lab"]},
         "cta": {"title": "Ready to place a bulk order?",
                 "text": "Add products to your cart and confirm instantly over WhatsApp. No online payment required."}},
    ]
    for d in docs:
        d["updated_at"] = now_iso()
        await db.settings.insert_one(d)


async def seed_categories(db):
    cats = [
        {"id": "cat-large", "name": "Large Animal", "slug": "large-animal", "parent_id": None,
         "image": IMG["cattle"], "order": 1,
         "description": "Tonics, minerals and therapeutics for cattle, buffalo and livestock."},
        {"id": "cat-small", "name": "Small Animal", "slug": "small-animal", "parent_id": None,
         "image": IMG["small_animal"], "order": 2,
         "description": "Companion animal care for dogs, cats and pets."},
        {"id": "cat-poultry", "name": "Poultry", "slug": "poultry", "parent_id": None,
         "image": IMG["poultry"], "order": 3,
         "description": "Growth promoters, supplements and health solutions for poultry."},
        {"id": "sub-tonics", "name": "Tonics & Supplements", "slug": "tonics-supplements",
         "parent_id": "cat-large", "image": "", "order": 1, "description": ""},
        {"id": "sub-antibiotics", "name": "Antibiotics", "slug": "antibiotics",
         "parent_id": "cat-large", "image": "", "order": 2, "description": ""},
        {"id": "sub-mastitis", "name": "Mastitis Care", "slug": "mastitis-care",
         "parent_id": "cat-large", "image": "", "order": 3, "description": ""},
    ]
    for c in cats:
        c.update({"active": True, "seo": {}, "is_demo": True, "created_at": now_iso()})
        await db.categories.insert_one(c)


def _variant(pack, unit, sku, mrp, sp, gst=12, moq=1, stock="in_stock"):
    return {"id": new_id(), "pack_size": pack, "unit": unit, "sku": sku, "mrp": mrp,
            "selling_price": sp, "gst_percent": gst, "gst_inclusive": True,
            "stock_status": stock, "min_order_qty": moq, "max_order_qty": 0}


async def seed_products(db):
    products = [
        {"id": "prod-nerviphos-bm", "name": "NERVIPHOS-BM", "slug": "nerviphos-bm",
         "product_code": "VM-NBM", "image": IMG["nerviphos_bm"], "category_id": "cat-large",
         "subcategory_id": "sub-tonics",
         "short_description": "Phosphorus, B-complex & minerals tonic for cattle and buffalo.",
         "full_description": "NERVIPHOS-BM is a balanced phosphorus and B-complex tonic formulated to correct phosphorus deficiency, improve fertility, boost milk yield and support nervous system health in large animals.",
         "composition": "Each 100 ml contains: Phosphorus 3.0g, Vitamin B1 100mg, Vitamin B6 50mg, Vitamin B12 500mcg, Cyanocobalamin, Sorbitol.",
         "indications": "Downer cow syndrome, infertility, reduced milk yield, post-calving weakness, phosphorus deficiency.",
         "dosage": "Cattle & Buffalo: 100 ml daily for 3-5 days or as directed by a veterinarian.",
         "benefits": "Improves fertility, boosts milk production, restores appetite and energy.",
         "storage": "Store in a cool, dry place away from direct sunlight.",
         "badges": {"featured": True, "best_seller": True, "new": False, "offer": True},
         "variants": [_variant("100 ml", "Bottle", "NBM-100", 180, 155),
                      _variant("500 ml", "Bottle", "NBM-500", 720, 640),
                      _variant("1 L", "Bottle", "NBM-1000", 1350, 1200)],
         "related_product_ids": ["prod-nerviphos-m", "prod-vetkclor"]},
        {"id": "prod-nerviphos-m", "name": "NERVIPHOS-M", "slug": "nerviphos-m",
         "product_code": "VM-NM", "image": IMG["nerviphos_m"], "category_id": "cat-large",
         "subcategory_id": "sub-tonics",
         "short_description": "Injectable B1, B6, B12 & minerals for rapid recovery.",
         "full_description": "NERVIPHOS-M injection delivers vitamins and minerals directly for fast correction of metabolic disorders and nervous weakness in cattle.",
         "composition": "Each ml contains: Vitamin B1 25mg, B6 10mg, B12 250mcg, Phosphorus.",
         "dosage": "5-10 ml by deep IM injection or as advised by a veterinarian.",
         "benefits": "Fast-acting recovery from weakness and metabolic stress.",
         "storage": "Store below 25°C. Protect from light.",
         "badges": {"featured": True, "new": True},
         "variants": [_variant("30 ml", "Vial", "NM-30", 90, 78, moq=1),
                      _variant("100 ml", "Vial", "NM-100", 260, 230)],
         "related_product_ids": ["prod-nerviphos-bm"]},
        {"id": "prod-vetkclor", "name": "VETKCLOR", "slug": "vetkclor",
         "product_code": "VM-VKC", "image": IMG["vetkclor"], "category_id": "cat-large",
         "subcategory_id": "sub-antibiotics",
         "short_description": "Broad-spectrum oral antibacterial solution.",
         "full_description": "VETKCLOR is a broad-spectrum oral antibacterial solution effective against gastrointestinal and respiratory infections in livestock and poultry.",
         "composition": "Each ml contains: Enrofloxacin 100mg.",
         "indications": "Bacterial enteritis, respiratory infections, CRD in poultry.",
         "dosage": "1 ml per 10 kg body weight for 3-5 days.",
         "storage": "Store in a cool, dry place.",
         "badges": {"best_seller": True, "offer": True},
         "variants": [_variant("100 ml", "Bottle", "VKC-100", 210, 185, gst=12),
                      _variant("500 ml", "Bottle", "VKC-500", 950, 860),
                      _variant("1 L", "Bottle", "VKC-1000", 1800, 1650)],
         "related_product_ids": ["prod-nerviphos-bm", "prod-mastobliss-tsc"]},
        {"id": "prod-mastobliss-tsc", "name": "MASTOBLISS-TSC", "slug": "mastobliss-tsc",
         "product_code": "VM-MBT", "image": IMG["mastobliss"], "category_id": "cat-large",
         "subcategory_id": "sub-mastitis",
         "short_description": "Herbal mastitis support powder for dairy cattle.",
         "full_description": "MASTOBLISS-TSC is a herbal supplement that supports udder health and helps manage sub-clinical mastitis in dairy animals.",
         "composition": "Polyherbal blend with Curcuma longa, Silybum marianum and trace minerals.",
         "dosage": "50 g twice daily for 5-7 days.",
         "benefits": "Supports udder health, improves milk quality.",
         "storage": "Keep container tightly closed in a dry place.",
         "badges": {"new": True},
         "variants": [_variant("500 g", "Pack", "MBT-500", 340, 300, gst=5),
                      _variant("1 Kg", "Pack", "MBT-1000", 640, 580, gst=5)],
         "related_product_ids": ["prod-vetkclor"]},
    ]
    for i, p in enumerate(products):
        p.setdefault("sku", "")
        p.setdefault("brand_id", "brand-vetmech")
        p.setdefault("brand_name", "VETMECH")
        p.setdefault("images", [p["image"]])
        p.setdefault("indications", "")
        p.setdefault("precautions", "")
        p.setdefault("additional_info", "")
        p.setdefault("brochure_url", "")
        p.setdefault("visual_aid_url", "")
        p.setdefault("seo", {})
        p["active"] = True
        p["order"] = i
        p["is_demo"] = True
        p["created_at"] = now_iso()
        await db.products.insert_one(p)


async def seed_schemes(db):
    p_nbm = await db.products.find_one({"id": "prod-nerviphos-bm"})
    p_vkc = await db.products.find_one({"id": "prod-vetkclor"})
    p_mbt = await db.products.find_one({"id": "prod-mastobliss-tsc"})
    schemes = [
        {"name": "NERVIPHOS-BM 10+5 Free", "scheme_type": "free_qty",
         "product_id": "prod-nerviphos-bm", "variant_id": p_nbm["variants"][0]["id"],
         "buy_quantity": 10, "free_quantity": 5, "min_quantity": 10},
        {"name": "VETKCLOR 5+1 Free", "scheme_type": "free_qty",
         "product_id": "prod-vetkclor", "variant_id": p_vkc["variants"][1]["id"],
         "buy_quantity": 5, "free_quantity": 1, "min_quantity": 5},
        {"name": "MASTOBLISS 30 @ Special Price", "scheme_type": "special_price",
         "product_id": "prod-mastobliss-tsc", "variant_id": p_mbt["variants"][0]["id"],
         "special_price": 270, "min_quantity": 30},
    ]
    for s in schemes:
        s.update({"id": new_id(), "customer_type": "all",
                  "start_date": None, "end_date": None, "active": True,
                  "is_demo": True, "created_at": now_iso()})
        s.setdefault("buy_quantity", None)
        s.setdefault("free_quantity", None)
        s.setdefault("special_price", None)
        s.setdefault("max_quantity", None)
        await db.schemes.insert_one(s)


async def seed_pages(db):
    pages = [
        {"slug": "about", "title": "About VETMECH Pharmaceuticals",
         "subtitle": "Advancing animal health across India",
         "banner": IMG["manufacturing"],
         "content": "VETMECH Pharmaceuticals Private Limited is a leading Indian veterinary pharmaceutical company committed to improving animal health and farmer prosperity. Founded on the principles of quality, science and integrity, we manufacture a comprehensive range of veterinary formulations for large animals, companion animals and poultry.\n\nOur WHO-GMP compliant manufacturing facility, experienced R&D team and pan-India distribution network make us a trusted partner for veterinarians, distributors, medical shops and farms.",
         "seo": {"title": "About Us | VETMECH Pharmaceuticals"}},
        {"slug": "quality", "title": "Quality Control",
         "subtitle": "Uncompromising quality at every step",
         "banner": IMG["lab"],
         "content": "Quality is the foundation of everything we do. Our accredited quality control laboratory tests every batch — from raw materials to finished products — ensuring consistent efficacy, safety and compliance with regulatory standards.\n\nWe follow strict WHO-GMP guidelines, maintain complete batch traceability and conduct stability studies for all formulations.",
         "seo": {"title": "Quality Control | VETMECH"}},
        {"slug": "infrastructure", "title": "Infrastructure & Manufacturing",
         "subtitle": "State-of-the-art manufacturing",
         "banner": IMG["manufacturing"],
         "content": "Our modern manufacturing facility is equipped with automated production lines for liquids, injectables, powders and premixes. Dedicated clean rooms, validated equipment and trained personnel ensure high-quality output at scale.",
         "seo": {"title": "Infrastructure | VETMECH"}},
        {"slug": "research", "title": "Research & Development",
         "subtitle": "Science-led innovation",
         "banner": IMG["rd"],
         "content": "Our R&D team continuously develops innovative, effective and affordable veterinary formulations. We collaborate with veterinary institutions and field experts to address emerging animal health challenges.",
         "seo": {"title": "R&D | VETMECH"}},
        {"slug": "privacy", "title": "Privacy Policy", "subtitle": "", "banner": "",
         "content": "VETMECH Pharmaceuticals respects your privacy. We collect only the information necessary to process your orders and provide support. Your data is never sold to third parties.",
         "seo": {}},
        {"slug": "terms", "title": "Terms & Conditions", "subtitle": "", "banner": "",
         "content": "By using this website you agree to our terms. Products are sold for veterinary use only. Orders are subject to confirmation. Prices and schemes may change without notice.",
         "seo": {}},
    ]
    for p in pages:
        p.update({"is_demo": True, "updated_at": now_iso()})
        await db.pages.insert_one(p)


async def seed_news(db):
    articles = [
        {"title": "VETMECH launches new large-animal tonic range",
         "slug": "vetmech-launches-large-animal-tonic-range",
         "excerpt": "Our latest phosphorus-B complex range is now available across India.",
         "content": "VETMECH is proud to announce the launch of our upgraded large-animal tonic range, formulated to improve fertility and milk yield in dairy cattle...",
         "category": "Product News", "featured_image": IMG["cattle"]},
        {"title": "Managing sub-clinical mastitis in dairy herds",
         "slug": "managing-subclinical-mastitis-dairy-herds",
         "excerpt": "Expert tips on early detection and herbal support for udder health.",
         "content": "Sub-clinical mastitis silently reduces milk yield. Early detection through regular testing and supportive herbal therapy can protect your herd...",
         "category": "Veterinary Care", "featured_image": IMG["lab"]},
        {"title": "Poultry health during seasonal transitions",
         "slug": "poultry-health-seasonal-transitions",
         "excerpt": "How to keep flocks healthy when the weather changes.",
         "content": "Seasonal changes stress poultry flocks. Proper supplementation and biosecurity help maintain productivity...",
         "category": "Poultry", "featured_image": IMG["poultry"]},
    ]
    for i, a in enumerate(articles):
        a.update({"id": new_id(), "author": "VETMECH Team",
                  "publish_date": (datetime.now(timezone.utc) - timedelta(days=i * 7)).isoformat(),
                  "seo": {}, "active": True, "is_demo": True, "created_at": now_iso()})
        await db.news.insert_one(a)


async def seed_gallery(db):
    imgs = [("Manufacturing Facility", IMG["manufacturing"], "Facility"),
            ("Quality Laboratory", IMG["lab"], "Facility"),
            ("R&D Center", IMG["rd"], "Facility"),
            ("Field Team with Farmers", IMG["hero"], "Field"),
            ("Cattle Care Program", IMG["cattle"], "Field"),
            ("Poultry Health Camp", IMG["poultry"], "Field")]
    for i, (t, url, album) in enumerate(imgs):
        await db.gallery.insert_one({"id": new_id(), "title": t, "description": "",
                                     "image": url, "album": album, "active": True,
                                     "order": i, "is_demo": True, "created_at": now_iso()})


async def seed_careers(db):
    jobs = [
        {"title": "Area Sales Manager", "department": "Sales", "location": "Ahmedabad, Gujarat",
         "experience": "3-5 years", "qualification": "B.V.Sc / B.Sc / MBA",
         "description": "Drive sales of veterinary products across assigned territory.",
         "requirements": "Experience in veterinary/pharma sales, own vehicle, good communication."},
        {"title": "QC Chemist", "department": "Quality Control", "location": "Ahmedabad, Gujarat",
         "experience": "2-4 years", "qualification": "M.Sc Chemistry",
         "description": "Perform quality testing of raw materials and finished products.",
         "requirements": "Knowledge of HPLC, GMP documentation, analytical testing."},
    ]
    for j in jobs:
        j.update({"id": new_id(), "active": True, "is_demo": True, "created_at": now_iso()})
        await db.careers.insert_one(j)
