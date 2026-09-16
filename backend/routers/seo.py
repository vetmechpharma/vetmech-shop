"""SEO server-side services:
- GET /api/seo/render?path=...   -> crawler/social HTML with baked-in meta + JSON-LD (dynamic rendering)
- GET /api/feed/google.xml       -> MRP-only Google Merchant Center product feed
- GET /api/admin/seo/audit       -> SEO health report (missing/duplicate/broken checks)
"""
import os
import html as _html
import json
from fastapi import APIRouter, Depends, Query, Body
from fastapi.responses import HTMLResponse, Response

from db import db
from security import require_module
from helpers import now_iso

router = APIRouter(prefix="/api", tags=["seo"])
ORG_NAME = "VETMECH PHARMACEUTICALS PRIVATE LIMITED"


def _base():
    return os.environ.get("SITE_URL", "").rstrip("/")


def site_url(path=""):
    base = _base()
    if not path:
        return base + "/"
    if str(path).startswith("http"):
        return path
    return base + (path if path.startswith("/") else "/" + path)


def esc(s):
    return _html.escape(str(s if s is not None else ""), quote=True)


def media_abs(u):
    if not u:
        return ""
    if str(u).startswith("http"):
        return u
    base = _base()
    if str(u).startswith("/api/"):
        return base + u
    return u


def _org_ld(company):
    social = [v for v in (company.get("social") or {}).values() if v and v != "#"]
    ld = {"@context": "https://schema.org", "@type": "Organization", "name": company.get("name") or ORG_NAME,
          "url": _base() or None, "logo": media_abs(company.get("logo")) or site_url("/logo.png")}
    if company.get("phone"):
        ld["telephone"] = company["phone"]
    if company.get("email"):
        ld["email"] = company["email"]
    if company.get("address"):
        ld["address"] = {"@type": "PostalAddress", "streetAddress": company["address"]}
    if social:
        ld["sameAs"] = social
    return ld


def _website_ld():
    return {"@context": "https://schema.org", "@type": "WebSite", "name": ORG_NAME, "url": _base() or None,
            "potentialAction": {"@type": "SearchAction", "target": f"{site_url('/products')}?q={{search_term_string}}",
                                "query-input": "required name=search_term_string"}}


def _breadcrumb_ld(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": it["name"], "item": site_url(it["path"])}
                                for i, it in enumerate(items)]}


def _faq_ld(faqs):
    lst = [f for f in (faqs or []) if f and f.get("q") and f.get("a")]
    if not lst:
        return None
    return {"@context": "https://schema.org", "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in lst]}


def _doc(title, description, canonical, og_image, jsonld, robots="index, follow", og_type="website", body=""):
    m = [
        f"<title>{esc(title)}</title>",
        f'<meta name="description" content="{esc(description)}"/>',
        f'<meta name="robots" content="{esc(robots)}"/>',
        f'<link rel="canonical" href="{esc(canonical)}"/>',
        f'<meta property="og:site_name" content="{esc(ORG_NAME)}"/>',
        f'<meta property="og:type" content="{esc(og_type)}"/>',
        f'<meta property="og:title" content="{esc(title)}"/>',
        f'<meta property="og:description" content="{esc(description)}"/>',
        f'<meta property="og:url" content="{esc(canonical)}"/>',
        '<meta name="twitter:card" content="summary_large_image"/>',
        f'<meta name="twitter:title" content="{esc(title)}"/>',
        f'<meta name="twitter:description" content="{esc(description)}"/>',
    ]
    if og_image:
        m.append(f'<meta property="og:image" content="{esc(og_image)}"/>')
        m.append(f'<meta name="twitter:image" content="{esc(og_image)}"/>')
    for ld in (jsonld or []):
        if ld:
            m.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>")
    return HTMLResponse(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"/>'
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
        + "".join(m) + f'</head><body>{body}</body></html>')


def _title(t):
    if not t:
        return ORG_NAME
    return t if "VETMECH" in t else f"{t} | VETMECH"


@router.get("/seo/render", response_class=HTMLResponse)
async def seo_render(path: str = Query("/")):
    p = (path or "/").split("?")[0]
    if len(p) > 1:
        p = p.rstrip("/") or "/"
    seo = await db.settings.find_one({"id": "seo"}, {"_id": 0}) or {}
    company = await db.settings.find_one({"id": "company"}, {"_id": 0}) or {}
    default_img = media_abs(seo.get("default_og_image"))
    org, website = _org_ld(company), _website_ld()

    # ---- Product ----
    if p.startswith("/products/") and len(p) > len("/products/"):
        slug = p[len("/products/"):]
        prod = await db.products.find_one({"slug": slug, "active": True}, {"_id": 0})
        if prod:
            s = prod.get("seo") or {}
            v0 = (prod.get("variants") or [{}])[0]
            img = media_abs((prod.get("images") or [prod.get("image")])[0] if (prod.get("images") or prod.get("image")) else "")
            oos = bool((prod.get("badges") or {}).get("out_of_stock") or v0.get("stock_status") == "out_of_stock")
            title = _title(s.get("title") or prod["name"])
            desc = s.get("meta_description") or prod.get("short_description") or prod.get("full_description") or prod["name"]
            canonical = s.get("canonical") or site_url(f"/products/{slug}")
            cat = await db.categories.find_one({"id": prod.get("category_id")}, {"_id": 0, "name": 1, "slug": 1}) if prod.get("category_id") else None
            crumbs = [{"name": "Home", "path": "/"}, {"name": "Products", "path": "/products"}]
            if cat:
                crumbs.append({"name": cat["name"], "path": f"/categories/{cat['slug']}"})
            crumbs.append({"name": prod["name"], "path": f"/products/{slug}"})
            product_ld = {"@context": "https://schema.org", "@type": "Product", "name": prod["name"],
                          "image": img or default_img, "description": desc,
                          "sku": v0.get("sku") or prod.get("product_code") or "",
                          "brand": {"@type": "Brand", "name": prod.get("brand_name") or "VETMECH"},
                          "offers": {"@type": "Offer", "priceCurrency": "INR", "price": v0.get("mrp") or 0, "url": canonical,
                                     "availability": "https://schema.org/OutOfStock" if oos else "https://schema.org/InStock"}}
            extra = "".join(f"<h2>{esc(l)}</h2><p>{esc(prod.get(k))}</p>" for l, k in
                            [("Composition", "composition"), ("Indications", "indications"), ("Dosage", "dosage")] if prod.get(k))
            body = (f"<h1>{esc(prod['name'])}</h1><p>{esc(desc)}</p>"
                    f"<p>Brand: {esc(prod.get('brand_name') or 'VETMECH')} | MRP: Rs.{esc(v0.get('mrp'))} / {esc(v0.get('pack_size'))}</p>"
                    f"{('<p>'+esc(prod.get('full_description'))+'</p>') if prod.get('full_description') else ''}{extra}")
            return _doc(title, desc, canonical, img or default_img,
                        [product_ld, _breadcrumb_ld(crumbs), _faq_ld(s.get("faqs"))],
                        robots=s.get("robots", "index, follow"), og_type="product", body=body)

    # ---- Category ----
    if p.startswith("/categories/") and len(p) > len("/categories/"):
        slug = p[len("/categories/"):]
        cat = await db.categories.find_one({"slug": slug, "active": True}, {"_id": 0})
        if cat:
            s = cat.get("seo") or {}
            title = _title(s.get("title") or cat["name"])
            desc = s.get("meta_description") or s.get("intro") or cat.get("description") or cat["name"]
            canonical = s.get("canonical") or site_url(f"/categories/{slug}")
            crumbs = [{"name": "Home", "path": "/"}, {"name": "Products", "path": "/products"}]
            if cat.get("parent_id"):
                par = await db.categories.find_one({"id": cat["parent_id"]}, {"_id": 0, "name": 1, "slug": 1})
                if par:
                    crumbs.append({"name": par["name"], "path": f"/categories/{par['slug']}"})
            crumbs.append({"name": cat["name"], "path": f"/categories/{slug}"})
            coll = {"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "description": desc, "url": canonical}
            return _doc(title, desc, canonical, default_img, [_breadcrumb_ld(crumbs), coll],
                        body=f"<h1>{esc(cat['name'])}</h1><p>{esc(desc)}</p>")

    # ---- News ----
    if p.startswith("/news/") and len(p) > len("/news/"):
        slug = p[len("/news/"):]
        art = await db.news.find_one({"slug": slug, "active": True}, {"_id": 0})
        if art:
            s = art.get("seo") or {}
            img = media_abs(art.get("featured_image")) or default_img
            title = _title(s.get("title") or art["title"])
            desc = s.get("meta_description") or art.get("excerpt") or art["title"]
            canonical = s.get("canonical") or site_url(f"/news/{slug}")
            article_ld = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": art["title"],
                          "description": desc, "datePublished": art.get("publish_date"),
                          "dateModified": art.get("updated_at") or art.get("publish_date"),
                          "author": {"@type": "Person" if art.get("author") else "Organization", "name": art.get("author") or ORG_NAME},
                          "publisher": {"@type": "Organization", "name": ORG_NAME, "logo": {"@type": "ImageObject", "url": site_url("/logo.png")}},
                          "mainEntityOfPage": canonical}
            if img:
                article_ld["image"] = [img]
            crumbs = [{"name": "Home", "path": "/"}, {"name": "News", "path": "/news"}, {"name": art["title"], "path": f"/news/{slug}"}]
            return _doc(title, desc, canonical, img, [article_ld, _breadcrumb_ld(crumbs)], og_type="article",
                        body=f"<h1>{esc(art['title'])}</h1><p>{esc(desc)}</p>{art.get('content') or ''}")

    # ---- Home + static fallback ----
    static_titles = {
        "/": seo.get("default_title") or _title("Veterinary Medicines India"),
        "/products": "Veterinary Products", "/about": "About Us", "/quality": "Quality Assurance",
        "/infrastructure": "Infrastructure", "/research": "Research & Development", "/news": "News & Articles",
        "/gallery": "Gallery", "/careers": "Careers", "/contact": "Contact Us",
    }
    title = _title(static_titles.get(p, static_titles["/"]))
    desc = seo.get("default_description") or "Premium veterinary pharmaceuticals for large animals, small animals and poultry."
    canonical = site_url(p if p != "/" else "/")
    return _doc(title, desc, canonical, default_img, [org, website],
                body=f"<h1>{esc(company.get('name') or ORG_NAME)}</h1><p>{esc(desc)}</p>")


@router.get("/feed/google.xml")
async def google_feed():
    base = _base()
    default_img = media_abs((await db.settings.find_one({"id": "seo"}, {"_id": 0}) or {}).get("default_og_image"))
    products = await db.products.find({"active": True}, {"_id": 0}).to_list(5000)
    items = []
    for prod in products:
        for v in prod.get("variants", []):
            mrp = v.get("mrp")
            if not mrp:
                continue
            oos = bool((prod.get("badges") or {}).get("out_of_stock") or v.get("stock_status") == "out_of_stock")
            gid = v.get("sku") or f"{prod['id']}-{v.get('id')}"
            title = f"{prod['name']} {v.get('pack_size', '')} {v.get('unit', '')}".strip()
            desc = prod.get("short_description") or prod.get("full_description") or prod["name"]
            img = media_abs((prod.get("images") or [prod.get("image")])[0] if (prod.get("images") or prod.get("image")) else "") or default_img
            items.append(
                "<item>"
                f"<g:id>{esc(gid)}</g:id>"
                f"<title>{esc(title)}</title>"
                f"<description>{esc(desc)}</description>"
                f"<link>{esc(base)}/products/{esc(prod.get('slug'))}</link>"
                f"<g:image_link>{esc(img)}</g:image_link>"
                f"<g:availability>{'out of stock' if oos else 'in stock'}</g:availability>"
                f"<g:price>{esc(mrp)} INR</g:price>"
                f"<g:brand>{esc(prod.get('brand_name') or 'VETMECH')}</g:brand>"
                f"<g:condition>new</g:condition>"
                f"<g:identifier_exists>no</g:identifier_exists>"
                f"<g:mpn>{esc(v.get('sku') or prod.get('product_code') or gid)}</g:mpn>"
                "</item>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>'
           '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>'
           f"<title>{esc(ORG_NAME)}</title><link>{esc(base)}</link>"
           "<description>VETMECH veterinary product catalog (MRP listing)</description>"
           + "".join(items) + "</channel></rss>")
    return Response(content=xml, media_type="application/xml")


def _trim(s, n):
    s = " ".join(str(s or "").split())
    if len(s) <= n:
        return s
    return s[:n - 1].rsplit(" ", 1)[0] + "…"


def generate_seo(prod):
    """Template-based SEO draft from EXISTING approved product fields only (no invented claims)."""
    name = prod.get("name") or "Product"
    brand = prod.get("brand_name") or "VETMECH"
    short = prod.get("short_description") or ""
    comp = prod.get("composition") or ""
    ind = prod.get("indications") or ""
    dose = prod.get("dosage") or ""
    storage = prod.get("storage") or ""
    full = prod.get("full_description") or ""
    variants = prod.get("variants") or []
    packs = ", ".join(f"{v.get('pack_size', '')} {v.get('unit', '')}".strip() for v in variants if v.get("pack_size"))

    title = _trim(f"{name} - {short}" if short else f"{name} | {brand} Veterinary", 60)
    md_parts = [short] if short else []
    if ind:
        md_parts.append(f"Indicated for {ind}" if len(ind) < 80 else ind)
    elif comp:
        md_parts.append(f"Contains {comp}")
    if not md_parts:
        md_parts.append(f"{name} from {brand}.")
    meta_description = _trim(". ".join(p.rstrip('.') for p in md_parts) + ".", 155)

    faqs = []
    if short or full:
        faqs.append({"q": f"What is {name}?", "a": _trim(short or full, 300)})
    if comp:
        faqs.append({"q": f"What is the composition of {name}?", "a": _trim(comp, 300)})
    if ind:
        faqs.append({"q": f"What is {name} used for?", "a": _trim(ind, 300)})
    if dose:
        faqs.append({"q": f"What is the recommended dosage of {name}?", "a": _trim(dose, 300)})
    if packs:
        faqs.append({"q": f"What pack sizes is {name} available in?", "a": f"{name} is available in: {packs}."})
    if storage:
        faqs.append({"q": f"How should {name} be stored?", "a": _trim(storage, 300)})
    return {"title": title, "meta_description": meta_description, "focus_keyword": name.lower(), "faqs": faqs}


@router.post("/admin/seo/suggest")
async def seo_suggest(body: dict = Body(...), admin=Depends(require_module("products"))):
    """Return an SEO draft for the given product fields WITHOUT saving (for the product editor)."""
    return generate_seo(body)


@router.post("/admin/seo/autofill-all")
async def seo_autofill_all(overwrite: bool = False, admin=Depends(require_module("products"))):
    """Fill empty SEO fields (title, meta description, focus keyword, FAQ) for all active products."""
    prods = await db.products.find({"active": True}, {"_id": 0}).to_list(5000)
    updated = 0
    for prod in prods:
        seo = dict(prod.get("seo") or {})
        gen = generate_seo(prod)
        changed = False
        for k in ("title", "meta_description", "focus_keyword"):
            if (overwrite or not seo.get(k)) and gen.get(k) and seo.get(k) != gen[k]:
                seo[k] = gen[k]
                changed = True
        has_faq = bool([f for f in (seo.get("faqs") or []) if f and f.get("q") and f.get("a")])
        if gen.get("faqs") and (overwrite or not has_faq):
            seo["faqs"] = gen["faqs"]
            changed = True
        if changed:
            await db.products.update_one({"id": prod["id"]}, {"$set": {"seo": seo, "updated_at": now_iso()}})
            updated += 1
    return {"updated": updated, "total": len(prods)}


@router.get("/admin/seo/audit")
async def seo_audit(admin=Depends(require_module("products"))):
    products = await db.products.find({"active": True}, {"_id": 0}).to_list(5000)
    title_map, desc_map, prod_issues = {}, {}, []
    CHECKS = 7
    for prod in products:
        s = prod.get("seo") or {}
        issues = []
        if not s.get("title"):
            issues.append("Missing SEO title")
        if not s.get("meta_description"):
            issues.append("Missing meta description")
        if not prod.get("slug"):
            issues.append("Missing URL slug")
        if not (prod.get("image") or prod.get("images")):
            issues.append("Missing product image")
        if not prod.get("short_description"):
            issues.append("Missing short description")
        if not s.get("focus_keyword"):
            issues.append("Missing focus keyword")
        if not [f for f in (s.get("faqs") or []) if f and f.get("q") and f.get("a")]:
            issues.append("No FAQ")
        t = (s.get("title") or prod.get("name") or "").strip().lower()
        d = (s.get("meta_description") or "").strip().lower()
        if t:
            title_map.setdefault(t, []).append(prod.get("name"))
        if d:
            desc_map.setdefault(d, []).append(prod.get("name"))
        if issues:
            prod_issues.append({"id": prod["id"], "name": prod.get("name"), "slug": prod.get("slug"),
                                "issues": issues, "score": round(100 * (CHECKS - len(issues)) / CHECKS)})
    dup_titles = [{"value": k, "products": v} for k, v in title_map.items() if len(v) > 1]
    dup_descs = [{"value": k, "products": v} for k, v in desc_map.items() if len(v) > 1]

    def _light(coll_items, kind):
        out = []
        for c in coll_items:
            s = c.get("seo") or {}
            iss = []
            if not s.get("title"):
                iss.append("Missing SEO title")
            if not s.get("meta_description"):
                iss.append("Missing meta description")
            if iss:
                out.append({"name": c.get("name") or c.get("title"), "slug": c.get("slug"), "issues": iss})
        return out

    cats = await db.categories.find({"active": True}, {"_id": 0}).to_list(2000)
    news = await db.news.find({"active": True}, {"_id": 0}).to_list(2000)
    cat_issues, news_issues = _light(cats, "category"), _light(news, "news")
    total = len(products)
    return {
        "summary": {
            "total_products": total,
            "products_ok": total - len(prod_issues),
            "products_with_issues": len(prod_issues),
            "duplicate_titles": len(dup_titles),
            "duplicate_descriptions": len(dup_descs),
            "categories_with_issues": len(cat_issues),
            "news_with_issues": len(news_issues),
            "sitemap": f"{_base()}/sitemap.xml",
            "feed": f"{_base()}/api/feed/google.xml",
        },
        "products": sorted(prod_issues, key=lambda x: x["score"]),
        "duplicate_titles": dup_titles,
        "duplicate_descriptions": dup_descs,
        "categories": cat_issues,
        "news": news_issues,
    }
