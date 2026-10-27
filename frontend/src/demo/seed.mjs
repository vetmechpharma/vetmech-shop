import { productProfileExample } from "./productProfileExample.mjs";

export const DEMO_SCHEMA = 1;
export const DEMO_KEY = "vetmech_shop_development_v1";
export const DEMO_PASSWORD = "Demo@123";
export const DEMO_OTP = "123456";

export function seedDemo() {
  const now = new Date();
  const date = days => new Date(now.getTime() - days * 86400000).toISOString();
  const address = { id: "demo-address", line1: "Sample Clinic, Demo Road", line2: "", line3: "", district: "Tirupur", state: "Tamil Nadu", pincode: "638751" };
  const categories = [
    { id: "large-animal", name: "Large Animal", slug: "large-animal", parent_id: null, description: "Explore the sample livestock portfolio.", image: "/demo/hero.svg", order: 1, active: true, seo: {} },
    { id: "metabolic", name: "Metabolic Support", slug: "metabolic-support", parent_id: "large-animal", order: 2, active: true, image: "", seo: {} },
    { id: "udder", name: "Udder Health", slug: "udder-health", parent_id: "large-animal", order: 3, active: true, image: "", seo: {} },
  ];
  const specs = [
    ["nerviphos-bm", "NERVIPHOS-BM", "Butaphosphan + Mecobalamin Injection", "Each ml: Butaphosphan 100 mg + Mecobalamin 100 mcg.", "100 ml", 950, 650, "metabolic"],
    ["nerviphos-m", "NERVIPHOS-M", "Sodium Acid Phosphate + Methylcobalamin Injection", "Each ml: Sodium Acid Phosphate 400 mg + Methylcobalamin 100 mcg.", "100 ml", 680, 450, "metabolic"],
    ["mastobliss-tsc", "MASTOBLISS-TSC", "Tri Sodium Citrate Dihydrate Powder", "Tri Sodium Citrate Dihydrate 100% w/w.", "500 g", 450, 300, "udder"],
    ["vetkclor", "VETKCLOR", "Potassium Chloride Oral Solution", "Potassium chloride oral preparation. Refer to the approved product label for strength.", "100 ml", 260, 170, "metabolic"],
  ];
  const products = specs.map(([slug, name, generic, composition, pack, mrp, price, subcategory_id], i) => ({
    id: `p${i + 1}`, name, slug, generic_name: generic,
    brand_id: "vetmech", brand_name: "VETMECH", category_id: "large-animal", subcategory_id,
    category_ids: ["large-animal"], subcategory_ids: [subcategory_id],
    image: `/demo/product-${i + 1}.svg`, images: [`/demo/product-${i + 1}.svg`],
    short_description: generic, full_description: `<p>${generic}. This is a development catalogue entry. Prices and transactions are sample data.</p>`,
    composition, indications: "Refer to the approved product label.", dosage: "As directed by the attending veterinarian and the approved label.",
    seo: { title: `${name} | Development Demo`, meta_description: generic, focus_keyword: generic, faqs: [] },
    badges: { featured: true, new: i === 1, best_seller: i === 0, offer: i === 0 },
    variants: [{ id: `v${i + 1}`, pack_size: pack, unit: "Bottle", mrp, selling_price: price, gst_percent: 12, gst_inclusive: false, stock_status: "in_stock", units_per_case: 24, min_order_qty: 1, max_order_qty: 0 }],
    active: true, is_demo: true, created_at: date(20), order: i,
  }));
  products.push(JSON.parse(JSON.stringify({ ...productProfileExample, created_at: date(20) })));
  const customers = [
    { id: "c1", prefix: "Dr.", name: "Demo Veterinarian", company_name: "Sample Veterinary Clinic", mobile: "0000000001", email: "clinic@example.com", category: "doctor", status: "active" },
    { id: "c2", prefix: "Mr.", name: "Demo Distributor", company_name: "Sample Veterinary Agency", mobile: "0000000002", email: "agency@example.com", category: "agency", status: "active" },
    { id: "c3", prefix: "Mr.", name: "New Demo Partner", company_name: "Sample Dairy Farm", mobile: "0000000003", email: "farm@example.com", category: "farm", status: "pending" },
  ].map(c => ({ ...c, normalized_mobile: c.mobile, whatsapp: c.mobile, active: true, status_label: c.status === "active" ? "Active" : "Pending Approval", password: DEMO_PASSWORD, address: address.line1, district: address.district, state: address.state, pincode: address.pincode, addresses: [address], default_address: address, license_number: "DEMO-LICENCE", price_protected: false, created_at: date(18) }));
  const orders = ["new", "confirmed", "processing", "dispatched", "delivered", "delivered"].map((status, i) => {
    const p = products[i % products.length], v = p.variants[0], c = customers[i % 2], qty = (i + 1) * 2;
    const line = { product_id: p.id, product_name: p.name, brand_name: "VETMECH", image: p.image, slug: p.slug, variant_id: v.id, pack_size: v.pack_size, unit: v.unit, sku: v.sku, mrp: v.mrp, unit_price: v.selling_price, selling_price: v.selling_price, qty, free_qty: 0, dispatch_qty: qty, net_rate: v.selling_price, gst_percent: 12, scheme_label: null, price_source: "category" };
    return { id: `o${i + 1}`, order_number: `DEMO-2026-${String(i + 1).padStart(5, "0")}`, customer_id: c.id, customer_name: c.name, customer_mobile: c.mobile, customer_whatsapp: c.mobile, company_name: c.company_name, customer_category: c.category, address, items: [line], status, total_qty: qty, total_free: 0, total_dispatch: qty, sales_value: qty * line.unit_price, cash_discount: false, notes: "Sample order for development.", activity: [{ id: `a${i}`, text: "Demo order created", actor: "Demo Admin", at: date(i * 2) }], dispatch: ["dispatched", "delivered"].includes(status) ? { cases: 1, transport_id: "tr1", transport_name: "Demo Logistics", freight: "to_pay", dispatch_date: date(i), lr_number: `DEMO-LR-${i}`, invoice_number: `DEMO-INV-${i}` } : null, origin: { device: "Demo", browser: "Demo", os: "Demo", location: "Sample data", ip: "", captured_at: date(i) }, created_at: date(i * 2), updated_at: date(i) };
  });
  const admin = { id: "demo-admin", name: "Demo Admin", email: "demo@vetmech.local", role: "super_admin", permissions: ["*"], active: true, designation: "Development Admin", created_at: date(30) };
  const crm_customers = customers.map(c => ({ ...c, phone: c.mobile, contact_name: c.name, customer_type: "Veterinary Clinic", company_name: c.company_name, notes: "Sample CRM contact", source: "demo", total_tickets: 1, open_tickets: 1, total_orders: 2, total_value: 3000 }));
  const tickets = ["open", "in_progress", "closed"].map((status, i) => ({ id: `t${i + 1}`, ticket_number: `DEMO-T-${101 + i}`, title: ["Product availability enquiry", "Sample dispatch follow-up", "Quotation clarification"][i], description: "Sample follow-up for testing the support workflow.", type: "Enquiry", priority: ["medium", "high", "low"][i], status, effective_status: status, is_overdue: false, days_overdue: 0, customer_id: customers[i].id, customer_name: customers[i].name, customer_phone: customers[i].mobile, customer_email: customers[i].email, company_name: customers[i].company_name, assignee_id: admin.id, assignee_name: admin.name, due_date: date(-3), created_at: date(i + 1), updated_at: date(0), activity: [], updates: [], attachments: [] }));
  const company = { id: "company", name: "VETMECH PHARMACEUTICALS PRIVATE LIMITED", tagline: "The Science of Animal Health", logo: "/demo/logo.svg", favicon: "/demo/logo.svg", address: "Uthukuli, Tirupur, Tamil Nadu — development demo", phone: "", whatsapp: "", email: "demo@example.com", gst_number: "", social: {}, business_hours: "Development demo" };
  return {
    schema: DEMO_SCHEMA, product_profile_demo_v2: true, created_at: date(0), products, customers, orders, crm_customers, tickets,
    admin_users: [admin], categories, brands: [{ id: "vetmech", name: "VETMECH", active: true }],
    units: ["Bottle", "Vial", "Pack", "Box", "Pcs"].map((name, i) => ({ id: `unit${i}`, name })),
    schemes: [{ id: "offer1", name: "Sample 10+2 offer", scheme_type: "free_qty", product_id: "p1", variant_id: "v1", buy_quantity: 10, free_quantity: 2, min_quantity: 1, customer_type: "all", active: true }],
    category_prices: products.flatMap(p => ["doctor", "agency", "medical_shop", "distributor", "farm", "other"].map(category => ({ id: `${p.id}-${category}`, product_id: p.id, variant_id: p.variants[0].id, category, rate: Math.round(p.variants[0].selling_price * (category === "agency" ? 0.9 : 1)), active: true }))),
    customer_prices: [], transports: [{ id: "tr1", name: "Demo Logistics", active: true, contact: "", address: "Sample transport" }],
    quotations: [{ id: "q1", number: "DEMO-Q-0001", customer_id: "c1", customer: crm_customers[0], company_snapshot: company, status: "draft", quote_date: date(0).slice(0, 10), valid_until: date(-15).slice(0, 10), validity_days: 15, items: [{ product_id: "p1", variant_id: "v1", name: "NERVIPHOS-BM", packing: "100 ml", unit: "Bottle", qty: 4, mrp: 950, rate: 650, discount: 0, discount_type: "percent", discount_amount: 0, gst: 12, gst_amount: 312, total: 2912 }], summary: { subtotal: 2600, total: 2600, discount: 0, gst: 312, grand_total: 2912, amount_words: "INR 2912.00 (sample)" }, total: 2912, grand_total: 2912, amount_words: "INR 2912.00 (sample)", notes: "Editable sample quotation.", terms: ["Development demo. Illustrative prices only."], signatory: { name: "Demo Admin", designation: "Development Admin" }, history: [{ at: date(0), user: "Demo Admin", action: "Created sample quotation" }], created_at: date(0) }], reviews: [], gallery: [], careers: [], applications: [], enquiries: [], notification_logs: [], audit_logs: [], ticket_notifications: [], pricing_audit: [], catalog_downloads: [],
    news: [{ id: "news1", title: "Welcome to the VETMECH development demo", slug: "welcome-to-development-demo", image: "/demo/hero.svg", short_description: "Explore the catalogue, sample orders and administration tools.", excerpt: "Explore the catalogue, sample orders and administration tools.", content: "<p>This private demo uses sample records. All messaging is simulated.</p>", active: true, publish_date: date(0), created_at: date(0), seo: {} }],
    pages: ["about", "quality", "infrastructure", "research", "privacy", "terms"].map(slug => ({ id: slug, slug, title: slug === "about" ? "About VETMECH" : slug[0].toUpperCase() + slug.slice(1), content: "<p>This is editable sample website content. Update it from Admin → Website Pages.</p>", image: "/demo/hero.svg", active: true, seo: {} })),
    settings: {
      company, homepage: { id: "homepage", hero: { title: "Advancing animal health.\nConnected to your business.", subtitle: "Explore your VETMECH catalogue, B2B ordering and administration workspace with sample data.", image: "/demo/hero.svg", cta_text: "Explore Products", cta_link: "/products" }, intro: { title: "Your shop. Ready to develop.", text: "A working development space for your veterinary product catalogue, customer pricing, order management and business workflows." }, strengths: [{ icon: "Package", title: "Product Catalogue", text: "Edit products and variants." }, { icon: "Users", title: "B2B Accounts", text: "Try approvals and customer pricing." }, { icon: "Truck", title: "Orders & Dispatch", text: "Test the complete sample workflow." }, { icon: "ShieldCheck", title: "Isolated Demo", text: "Changes stay on this device." }], quality: { title: "One workspace for your team", text: "Explore quotations, reports and follow-up tickets alongside the storefront.", image: "/demo/hero.svg" }, cta: { title: "Try a sample order", text: "Enter the customer demo, add products and test checkout." } },
      website: { id: "website", footer_about: "VETMECH Shop development demo. Sample records and illustrative prices; all notifications are simulated.", social: {}, checkout_terms: "This is a sample order in a development demo. No payment is collected and no goods are dispatched." },
      seo: { id: "seo", default_title: "VETMECH Shop | Development Demo", default_description: "Private development demo with sample records.", robots: "noindex, nofollow" },
      whatsapp: { id: "whatsapp", api_url: "", api_key: "", session_id: "", admin_numbers: [] }, smtp: { id: "smtp", host: "", port: 587, username: "", password: "", sender_email: "demo@example.com", sender_name: "Demo", admin_email: "demo@example.com" },
      pricing_engine: { id: "pricing_engine", enable_customer_pricing: true, enable_customer_specific_pricing: true, enable_otp: false, enable_password_login: true, require_approval: true, enable_offers: true },
      quotation: { id: "quotation", prefix: "DEMO-Q", digits: 4, start: 1, default_validity: 15, terms: ["Development demo quotation. Sample prices only."] },
      ticket_config: { id: "ticket_config", types: ["Enquiry", "Order", "Complaint", "WhatsApp"], priorities: ["low", "medium", "high", "urgent"], channels: { in_app: true, whatsapp: false, email: false, sms: false } },
      message_templates: { order_received: "Demo order {order} received.", order_confirmed: "Demo order {order} confirmed.", order_dispatched: "Demo order {order} dispatched." }, email_templates: {}, menu: { items: [{ label: "Home", url: "/" }, { label: "About Us", url: "/about" }, { label: "Contact", url: "/contact" }] },
    },
  };
}
