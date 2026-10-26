# Search indexing and page titles

## Verified live issues, 26 October 2026

The live `https://vetmechpharma.in/robots.txt` and `/sitemap.xml` returned the
React HTML document with `Content-Type: text/html`, instead of text and XML.
The backend equivalents under `/api/` returned valid robots and sitemap data.
Product and article URLs initially returned the homepage title and a canonical
pointing to the homepage. Search and social crawler routing was not activated
in the native VPS configuration.

PROSTAMEG's stored canonical pointed at the old `www.../product/.../` route,
instead of its current `/products/prostameg-adv-flunixin-veterinary-bolus` URL.
Some sample records also contain placeholder text or an SEO title belonging to
another medicine. Review those records in Admin; code does not replace their
medical content or overwrite the live database.

## Corrections

- The shared SPA shell no longer supplies a homepage canonical or `og:url` for
  every route. Route metadata sets the correct URL and clears stale images.
- Public product, category and article crawler pages use their actual public
  URL, independent of copied canonical settings. Missing entities return HTTP
  404 and `noindex` rather than a homepage document with HTTP 200.
- Server-rendered CMS pages use page-specific titles and headings. Product
  information and article lists include crawlable links.
- Saved product `seo_content` is visible in product information and crawler
  HTML. Public pages remain free of MRP, selling prices and offers.
- Sitemap entries exclude inactive/noindex products, categories and articles.
  Ordering/account pages remain outside the sitemap. Product audit warnings
  identify copied canonical URLs, noindex settings and mismatched titles.
- Product links under `/shop/products/` provide the product's title, description
  and absolute image URL to social/WhatsApp crawlers, while keeping `noindex`
  and the corresponding `/products/` canonical. Custom Open Graph fields are
  honored; missing custom images fall back to available product/variant images.
  Uploaded WebP pictures receive a public JPEG preview URL for sharing, with
  transparency flattened against white. Original uploads remain untouched;
  external image URLs are not fetched or converted by this endpoint.
- Native nginx routing is installed separately from the application update;
  the Docker configuration already routes root sitemap/robots requests and now
  excludes static assets from crawler rendering.

## Deploy on the existing native VPS

```bash
cd /opt/vetmech-shop
git pull --ff-only origin main
sudo bash deploy-vps.sh
sudo python3 scripts/install_nginx_seo.py --apply
```

The installer reads the active nginx configuration, selects one existing HTTPS
content server for `vetmechpharma.in`, and verifies that it serves this checkout's
frontend build. It backs up the selected file and any prior managed snippet
under `/opt/_backups/nginx-seo-*`, inserts one include, runs `nginx -t`, and reloads
nginx. Failed validation or reload restores the old configuration. Repeating the
command is idempotent. It refuses ambiguous virtual hosts, unrelated shared
server names, a different frontend root or existing conflicting SEO locations.
Run without `--apply` to inspect the target. Adjust `--domain`, `--app-dir` or
`--backend-port` only for an intentionally different installation.

If the installer refuses an existing custom configuration, retain its output
and review that virtual host before making a manual change. Do not replace a
whole nginx configuration on a server that hosts the MR or WhatsApp applications.

After deployment, verify:

```bash
curl -fsS https://vetmechpharma.in/robots.txt
curl -fsS https://vetmechpharma.in/sitemap.xml
curl -fsS -A Googlebot 'https://vetmechpharma.in/products/prostameg-adv-flunixin-veterinary-bolus'
```

The first response must be robots text, the second a `<urlset>` XML document,
and the third must contain the product title, its `/products/` canonical and
product information. The backend `/api/sitemap.xml` is also a valid sitemap URL.
For a CDN, ensure crawler/non-crawler HTML variants are not mixed in its cache.
Crawler rendering is a compatibility workaround for the existing React SPA;
server rendering or prerendering for all visitors is the longer-term alternative.

## Search Console and content review

1. Submit `https://vetmechpharma.in/sitemap.xml` after confirming XML output.
2. Inspect a real `/products/` URL and one `/news/` URL using **Test live URL**.
   Check the rendered HTML title, robots directive and canonical. Request indexing
   for corrected priority pages. A live test is not proof of current indexing.
3. Review **Page indexing**, including duplicate/canonical, discovered but not
   indexed, crawled but not indexed and soft-404 reasons. The site's Google
   account is needed to see the actual exclusion reasons.
4. In Admin product SEO, leave canonical blank, use a title that names the current
   product, and replace sample/placeholder descriptions and FAQs with approved
   product information. Review the SEO audit before submitting sample products.

Google's small site-name label is separate from the clickable page title. The
site-name label can remain VETMECH on every result; page titles should identify
the product, article or company page. Crawling/indexing and Google's chosen title
are not guaranteed or immediate. Requesting indexing is not a ranking guarantee.
The public portfolio does not expose prices or fabricated reviews; ordinary
organic indexing does not require adding commercial offers to these pages.

Primary references:

- https://developers.google.com/search/docs/appearance/title-link
- https://developers.google.com/search/docs/appearance/site-names
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
