# Google search appearance

The public corporate portfolio remains information-only: no public MRP, prices, invented ratings or offer data is added.

- Both the app and crawler HTML declare the same 96 × 96 PNG VETMECH favicon.
- The preferred WebSite name is VETMECH Pharmaceuticals. VETMECH and the legal company name are alternative names; the Organization retains the legal name.
- Product crawler HTML includes the real photo, descriptive alternative text, product-specific metadata and linked Product/WebPage image data. Home and portfolio listings also expose representative visible images.
- Indexable pages allow large image previews. Existing noindex, nosnippet, noimageindex and max-image-preview restrictions are preserved. The development demo remains noindex.
- Static pages have individual fallback descriptions. An approved CMS page title/description still takes priority. Contact exposes current company contact details.

## Company address

The original starter value `Plot 42, Pharma Industrial Estate, Ahmedabad, Gujarat 382210, India` is removed at backend startup only when the entire stored address matches it (ignoring outer whitespace and case). Genuine company addresses, phone numbers, email and other settings are preserved. Public company responses and structured data also filter that exact sample value.

No replacement address is invented. In Admin → Company Settings, enter and save the full verified business contact address. Until then, the website directs visitors to contact the team and omits a postal address from structured data. The original sample string remains documented here for recovery if ever needed.

## Deploy and request recrawling

1. Pull the merged main branch and run `sudo bash deploy-vps.sh` from `/opt/vetmech-shop`. This rebuilds the frontend and restarts the backend so the address cleanup runs.
2. Confirm the homepage and a public `/products/<slug>` URL return the favicon, matching names and visible product image when fetched with a Googlebot user-agent. Confirm company settings contain the correct address.
3. In Google Search Console, use URL Inspection → Test live URL → Request indexing for the homepage, Contact and representative public product pages. Resubmit `https://vetmechpharma.in/sitemap.xml` if necessary. Partner shop/account URLs intentionally stay noindex.

Google chooses site names, snippets, thumbnails and icons; implementation does not guarantee a particular search layout or recrawl date. Marketplace company-review stars cannot simply be copied onto the company's own site. Product review markup should only be added for genuine, visible reviews of that specific product.
