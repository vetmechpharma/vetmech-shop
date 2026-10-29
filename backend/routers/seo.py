"""SEO server-side services:
- GET /api/seo/render?path=...   -> crawler/social HTML with baked-in meta + JSON-LD (dynamic rendering)
- GET /api/feed/google.xml       -> MRP-only Google Merchant Center product feed
- GET /api/admin/seo/audit       -> SEO health report (missing/duplicate/broken checks)
"""
import os
import html as _html
import json
import re
from urllib.parse import urlsplit
import io
from pathlib import Path
from fastapi import APIRouter, Depends, Query, Body
from fastapi.responses import HTMLResponse, Response
from PIL import Image, ImageOps, UnidentifiedImageError

from db import db
from security import require_module
from helpers import now_iso
from company_profile import company_profile

router = APIRouter(prefix="/api", tags=["seo"])
ORG_NAME = "VETMECH PHARMACEUTICALS PRIVATE LIMITED"
SITE_NAME = "VETMECH Pharmaceuticals"


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
    return site_url(str(u))


def _upload_image(name):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:webp|png|jpe?g)", name, re.I):
        return None
    root = Path(os.environ.get("UPLOAD_DIR", str(Path(__file__).resolve().parents[1] / "uploads"))).resolve()
    source = (root / name).resolve()
    return source if source.parent == root and source.is_file() else None


def share_image(url):
    """Give uploaded WebP images a JPEG URL; never fetch arbitrary remote URLs."""
    parsed = urlsplit(str(url or ""))
    origin = urlsplit(_base()).hostname
    if parsed.hostname and parsed.hostname not in {origin, "www." + origin if origin else None}:
        return url
    if parsed.path.startswith("/api/uploads/") and parsed.path.lower().endswith(".webp"):
        name = parsed.path.removeprefix("/api/uploads/")
        if _upload_image(name):
            return site_url("/api/seo/image/" + name + ".jpg")
    return url


@router.get("/seo/image/{name}.jpg", include_in_schema=False)
async def social_image(name: str):
    source = _upload_image(name)
    if not source:
        return Response(status_code=404)
    try:
        with Image.open(source) as opened:
            if opened.width * opened.height > 25_000_000:
                return Response(status_code=404)
            image = ImageOps.exif_transpose(opened).convert("RGBA")
            image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
            background = Image.new("RGB", image.size, "white")
            background.paste(image, mask=image.getchannel("A"))
            data = io.BytesIO()
            background.save(data, format="JPEG", quality=90, optimize=True)
        return Response(data.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        return Response(status_code=404)


def _org_ld(company):
    company = company_profile(company)
    social = [v for v in (company.get("social") or {}).values() if v and v != "#"]
    ld = {"@context": "https://schema.org", "@type": "Organization", "name": company.get("name") or ORG_NAME,
          "@id": site_url("/#organization"), "alternateName": [SITE_NAME, "VETMECH"],
          "url": _base() or None, "logo": media_abs(company.get("logo")) or site_url("/corporate/brand.svg")}
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
    return {"@context": "https://schema.org", "@type": "WebSite", "@id": site_url("/#website"),
            "name": SITE_NAME, "alternateName": ["VETMECH", ORG_NAME], "url": _base() or None,
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


def search_robots(value):
    value = str(value or "index, follow")
    if re.search(r"\b(?:noindex|none|nosnippet|noimageindex)\b|max-image-preview\s*:", value, re.I):
        return value
    return value + ", max-image-preview:large"


def image_html(image, label):
    if not image:
        return ""
    parsed = urlsplit(str(image))
    if parsed.scheme not in {"", "http", "https"} or parsed.username or parsed.password or str(image).startswith("//"):
        return ""
    return f'<figure><img src="{esc(media_abs(image))}" alt="{esc(label)}" style="max-width:100%;height:auto"/></figure>'


def _doc(title, description, canonical, og_image, jsonld, robots="index, follow", og_type="website", body="", status_code=200,
         og_title=None, og_description=None):
    robots = search_robots(robots)
    m = [
        f"<title>{esc(title)}</title>",
        f'<link rel="icon" type="image/png" sizes="96x96" href="{esc(site_url("/corporate/favicon.png"))}"/>',
        f'<meta name="description" content="{esc(description)}"/>',
        f'<meta name="robots" content="{esc(robots)}"/>',
        f'<link rel="canonical" href="{esc(canonical)}"/>',
        f'<meta property="og:site_name" content="{esc(SITE_NAME)}"/>',
        f'<meta property="og:type" content="{esc(og_type)}"/>',
        f'<meta property="og:title" content="{esc(og_title or title)}"/>',
        f'<meta property="og:description" content="{esc(og_description or description)}"/>',
        f'<meta property="og:url" content="{esc(canonical)}"/>',
        '<meta name="twitter:card" content="summary_large_image"/>',
        f'<meta name="twitter:title" content="{esc(og_title or title)}"/>',
        f'<meta name="twitter:description" content="{esc(og_description or description)}"/>',
    ]
    if og_image:
        m.append(f'<meta property="og:image" content="{esc(og_image)}"/>')
        m.append(f'<meta name="twitter:image" content="{esc(og_image)}"/>')
    for ld in (jsonld or []):
        if ld:
            # Product/CMS text must not be able to close the JSON-LD script tag.
            m.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("<", "\\u003c") + "</script>")
    return HTMLResponse(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"/>'
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
        + "".join(m) + f'</head><body>{body}</body></html>', status_code=status_code,
        headers={"Vary": "User-Agent", "Cache-Control": "no-cache"})


def _title(t):
    if not t:
        return ORG_NAME
    return t if "vetmech" in t.lower() else f"{t} | VETMECH"


def text(value):
    """Plain text matching the public product information view."""
    value = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", "", str(value or ""), flags=re.I | re.S)
    value = re.sub(r"<br\s*/?\s*>|</(?:p|li)>", "\n", value, flags=re.I)
    return _html.unescape(re.sub(r"<[^>]*>", "", value)).strip()


def indexable(item):
    return not re.search(r"\b(?:noindex|none)\b", str((item.get("seo") or {}).get("robots") or ""), re.I)


def _not_found(path, label):
    return _doc(_title(f"{label} not found"), f"This {label.lower()} is unavailable.", site_url(path), "", [],
                robots="noindex, follow", body=f"<h1>{esc(label)} not found</h1>", status_code=404)


@router.get("/seo/render", response_class=HTMLResponse)
async def seo_render(path: str = Query("/")):
    p = urlsplit(path or "/").path or "/"
    if not p.startswith("/") or p.startswith("//"):
        return _not_found("/", "Page")
    if len(p) > 1:
        p = p.rstrip("/") or "/"
    seo = await db.settings.find_one({"id": "seo"}, {"_id": 0}) or {}
    company = company_profile(await db.settings.find_one({"id": "company"}, {"_id": 0}))
    default_img = media_abs(seo.get("default_og_image"))
    org, website = _org_ld(company), _website_ld()

    # Product ordering links still need product-specific social previews.
    # Their public canonical and noindex directive are independent of Open Graph.
    shop_product = p.startswith("/shop/products/") and len(p) > len("/shop/products/")
    product_path = p.removeprefix("/shop") if shop_product else p
    # Other ordering/account URLs are not separate public search landing pages.
    if ((p == "/shop" or p.startswith("/shop/")) and not shop_product) or p.split("/")[1] in {
        "cart", "checkout", "account", "register", "quick-order", "order-confirmed", "admin"
    }:
        canonical = site_url(p.replace("/shop/products/", "/products/", 1) if p.startswith("/shop/products/") else p)
        return _doc(_title("Partner Shop"), "VETMECH partner ordering and account access.", canonical, "", [],
                    robots="noindex, follow", body='<h1>VETMECH Partner Shop</h1><a href="/products">Public product portfolio</a>')

    # ---- Product ----
    if product_path.startswith("/products/") and len(product_path) > len("/products/"):
        slug = product_path[len("/products/"):]
        prod = await db.products.find_one({"slug": slug, "active": True}, {"_id": 0})
        if prod:
            s = prod.get("seo") or {}
            v0 = (prod.get("variants") or [{}])[0]
            image_candidates = [s.get("og_image"), *(prod.get("images") or []), prod.get("image")]
            image_candidates += [image for variant in (prod.get("variants") or []) for image in (variant.get("images") or [])]
            img = next((media_abs(image) for image in image_candidates if image and str(image).strip()), "")
            title = _title(s.get("title") or prod["name"])
            desc = text(s.get("meta_description") or prod.get("short_description") or prod.get("full_description") or prod["name"])
            canonical = site_url(f"/products/{slug}")
            cat = await db.categories.find_one({"id": prod.get("category_id")}, {"_id": 0, "name": 1, "slug": 1}) if prod.get("category_id") else None
            crumbs = [{"name": "Home", "path": "/"}, {"name": "Products", "path": "/products"}]
            if cat:
                crumbs.append({"name": cat["name"], "path": f"/categories/{cat['slug']}"})
            crumbs.append({"name": prod["name"], "path": f"/products/{slug}"})
            product_ld = {"@context": "https://schema.org", "@type": "Product", "name": prod["name"],
                          "image": img, "description": desc, "url": canonical,
                          "@id": canonical + "#product", "mainEntityOfPage": canonical,
                          "brand": {"@type": "Brand", "name": prod.get("brand_name") or "VETMECH"}}
            extra = "".join(f"<h2>{esc(l)}</h2><p>{esc(text(prod.get(k)))}</p>" for l, k in
                            [("Composition", "composition"), ("Indications", "indications"), ("Dosage", "dosage")] if prod.get(k))
            seo_copy = text(s.get("seo_content") or s.get("extra_content"))
            if seo_copy:
                extra += f"<h2>More product information</h2><p>{esc(seo_copy)}</p>"
            extra += "".join(f"<h2>{esc(f['q'])}</h2><p>{esc(text(f['a']))}</p>" for f in (s.get("faqs") or [])
                             if f and f.get("q") and f.get("a"))
            body = (f"<h1>{esc(prod['name'])}</h1><p>{esc(desc)}</p>"
                    f"{image_html(img, prod['name'])}"
                    f"<p>Brand: {esc(prod.get('brand_name') or 'VETMECH')} | Pack: {esc(v0.get('pack_size'))}</p>"
                    f"{('<p>'+esc(text(prod.get('full_description')) )+'</p>') if prod.get('full_description') else ''}{extra}")
            page_ld = {"@context": "https://schema.org", "@type": "WebPage", "@id": canonical,
                       "url": canonical, "name": title, "mainEntity": {"@id": canonical + "#product"}}
            if img:
                page_ld["primaryImageOfPage"] = {"@type": "ImageObject", "url": img}
            return _doc(title, desc, canonical, share_image(img or default_img),
                        [product_ld, page_ld, _breadcrumb_ld(crumbs), _faq_ld(s.get("faqs"))],
                        robots="noindex, follow" if shop_product else s.get("robots", "index, follow"),
                        og_type="product", body=body,
                        og_title=text(s.get("og_title")), og_description=text(s.get("og_description")))
        return _not_found(p, "Product")

    # ---- Category ----
    if p.startswith("/categories/") and len(p) > len("/categories/"):
        slug = p[len("/categories/"):]
        cat = await db.categories.find_one({"slug": slug, "active": True}, {"_id": 0})
        if cat:
            s = cat.get("seo") or {}
            title = _title(s.get("title") or cat["name"])
            desc = s.get("meta_description") or s.get("intro") or cat.get("description") or cat["name"]
            canonical = site_url(f"/categories/{slug}")
            crumbs = [{"name": "Home", "path": "/"}, {"name": "Products", "path": "/products"}]
            if cat.get("parent_id"):
                par = await db.categories.find_one({"id": cat["parent_id"]}, {"_id": 0, "name": 1, "slug": 1})
                if par:
                    crumbs.append({"name": par["name"], "path": f"/categories/{par['slug']}"})
            crumbs.append({"name": cat["name"], "path": f"/categories/{slug}"})
            coll = {"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "description": desc, "url": canonical}
            # List products (incl. multi-category members) so all their categories get indexable copy.
            prods = await db.products.find(
                {"active": True, "$or": [{"category_id": cat["id"]}, {"category_ids": cat["id"]},
                                         {"subcategory_id": cat["id"]}, {"subcategory_ids": cat["id"]}]},
                {"_id": 0, "name": 1, "slug": 1, "short_description": 1}).limit(100).to_list(100)
            item_els = []
            li_parts = []
            for i, pr in enumerate(prods):
                if not pr.get("slug"):
                    continue
                purl = site_url("/products/" + pr["slug"])
                item_els.append({"@type": "ListItem", "position": len(item_els) + 1, "name": pr["name"], "url": purl})
                sd = (" — " + esc(pr["short_description"])) if pr.get("short_description") else ""
                li_parts.append("<li><a href=\"" + esc(purl) + "\">" + esc(pr["name"]) + "</a>" + sd + "</li>")
            item_list = {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": item_els}
            plist = "".join(li_parts)
            body = f"<h1>{esc(cat['name'])}</h1><p>{esc(desc)}</p>"
            if plist:
                body += f"<h2>Products in {esc(cat['name'])}</h2><ul>{plist}</ul>"
            return _doc(title, desc, canonical, default_img, [_breadcrumb_ld(crumbs), coll, item_list],
                        robots=s.get("robots", "index, follow"), body=body)
        return _not_found(p, "Category")

    # ---- News ----
    if p.startswith("/news/") and len(p) > len("/news/"):
        slug = p[len("/news/"):]
        art = await db.news.find_one({"slug": slug, "active": True}, {"_id": 0})
        if art:
            s = art.get("seo") or {}
            img = media_abs(art.get("featured_image")) or default_img
            title = _title(s.get("title") or art["title"])
            desc = s.get("meta_description") or art.get("excerpt") or art["title"]
            canonical = site_url(f"/news/{slug}")
            article_ld = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": art["title"],
                          "description": desc, "datePublished": art.get("publish_date"),
                          "dateModified": art.get("updated_at") or art.get("publish_date"),
                          "author": {"@type": "Person" if art.get("author") else "Organization", "name": art.get("author") or ORG_NAME},
                          "publisher": {"@type": "Organization", "name": ORG_NAME, "logo": {"@type": "ImageObject", "url": site_url("/corporate/brand.svg")}},
                          "mainEntityOfPage": canonical}
            if img:
                article_ld["image"] = [img]
            crumbs = [{"name": "Home", "path": "/"}, {"name": "News", "path": "/news"}, {"name": art["title"], "path": f"/news/{slug}"}]
            return _doc(title, desc, canonical, img, [article_ld, _breadcrumb_ld(crumbs)], og_type="article", robots=s.get("robots", "index, follow"),
                        body=f"<h1>{esc(art['title'])}</h1><p>{esc(desc)}</p>{art.get('content') or ''}")
        return _not_found(p, "Article")

    # ---- Home + static fallback ----
    static_titles = {
        "/": seo.get("default_title") or _title("Veterinary Medicines India"),
        "/products": "Veterinary Products", "/about": "About Us", "/quality": "Quality Assurance",
        "/infrastructure": "Infrastructure", "/research": "Research & Development", "/news": "News & Articles",
        "/gallery": "Gallery", "/careers": "Careers", "/contact": "Contact Us", "/privacy": "Privacy Policy", "/terms": "Terms & Conditions",
    }
    if p not in static_titles:
        return _not_found(p, "Page")
    page = await db.pages.find_one({"slug": p.lstrip("/")}, {"_id": 0}) or {}
    s = page.get("seo") or {}
    heading = page.get("title") or static_titles[p]
    title = _title(s.get("title") or heading)
    descriptions = {
        "/": seo.get("default_description") or "Discover VETMECH Pharmaceuticals, our veterinary product portfolio and our commitment to animal health.",
        "/products": "Explore VETMECH veterinary products, compositions, pack sizes and product information.",
        "/about": "Discover the purpose and people behind VETMECH Pharmaceuticals Private Limited.",
        "/quality": "Learn about VETMECH's approach to veterinary product quality and clear product information.",
        "/infrastructure": "Explore VETMECH Pharmaceuticals company infrastructure and operational information.",
        "/research": "Explore VETMECH's approach to veterinary formulations, product information and professional collaboration.",
        "/news": "Read the latest news, articles and product updates from VETMECH Pharmaceuticals.",
        "/gallery": "Explore the VETMECH Pharmaceuticals gallery, company events and activities.",
        "/careers": "Explore career opportunities and current vacancies at VETMECH Pharmaceuticals.",
        "/contact": "Contact VETMECH Pharmaceuticals for veterinary product information and professional partnerships.",
        "/privacy": "Read how VETMECH Pharmaceuticals handles personal information and website privacy.",
        "/terms": "Read the terms and conditions for using the VETMECH Pharmaceuticals website and partner ordering services.",
    }
    desc = text(s.get("meta_description") or page.get("subtitle") or descriptions[p])
    canonical = site_url(p if p != "/" else "/")
    body = f"<h1>{esc(heading)}</h1><p>{esc(desc)}</p>"
    page_img = media_abs(s.get("og_image")) or default_img
    if p == "/":
        homepage = await db.settings.find_one({"id": "homepage"}, {"_id": 0}) or {}
        hero = ((homepage.get("corporate") or {}).get("hero") or {}).get("image") or "/corporate/animal-care.webp"
        page_img = media_abs(s.get("og_image") or hero)
        body += image_html(hero, "VETMECH veterinary animal care")
    if p == "/contact":
        body += "<address>" + f"<p>{esc(company.get('name') or ORG_NAME)}</p>"
        if company.get("address"):
            body += f"<p>{esc(company['address'])}</p>"
        if company.get("phone"):
            body += f"<p>Phone: {esc(company['phone'])}</p>"
        if company.get("email"):
            body += f"<p>Email: {esc(company['email'])}</p>"
        body += "</address>"
    if page.get("content"):
        body += f"<p>{esc(text(page['content']))}</p>"
    if p in {"/", "/products", "/news"}:
        coll = db.news if p == "/news" else db.products
        prefix = "/news/" if p == "/news" else "/products/"
        items = await coll.find({"active": True}, {"_id": 0}).limit(5000).to_list(5000)
        links = []
        for index, item in enumerate(item for item in items if item.get("slug") and indexable(item)):
            label = item.get("name") or item.get("title")
            image = next((value for value in [*(item.get("images") or []), item.get("image"), item.get("featured_image")] if value), "")
            photo = image_html(image, label) if index < 8 else ""
            links.append(f'<li><a href="{esc(site_url(prefix + item["slug"]))}">{esc(label)}</a>{photo}</li>')
        body += "<ul>" + "".join(links) + "</ul>"
    return _doc(title, desc, canonical, page_img, [org, website] if p == "/" else [org],
                robots=s.get("robots", "index, follow"), body=body)


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
    CHECKS = 10
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
        expected = site_url("/products/" + prod["slug"]) if prod.get("slug") else None
        if s.get("canonical") and expected and s["canonical"].rstrip("/") != expected.rstrip("/"):
            issues.append("Saved canonical differs from the public product URL; the public URL is used")
        if not indexable(prod):
            issues.append("Product has a noindex directive and is excluded from the sitemap")
        name_token = re.sub(r"[^a-z0-9]", "", (prod.get("name") or "").split(" ")[0].lower())
        title_token = re.sub(r"[^a-z0-9]", "", (s.get("title") or "").lower())
        if name_token and title_token and name_token not in title_token:
            issues.append("SEO title does not mention the current product name; review copied or outdated text")
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
