# Corporate website and separate Partner Shop

The public website uses an original black, white and red visual identity, Manrope typography and editorial animal-health imagery. Carus Laboratories (https://www.caruslab.com/) was reviewed as a structural reference; this implementation uses VETMECH's own content and original visual assets.

## Public and ordering routes

- `/`: corporate homepage, purpose, species segments, approach and selected portfolio products.
- `/products`, `/categories/:slug`: product portfolio with search, category/species filtering and pagination.
- `/products/:slug`: product information, composition, pack sizes and an enquiry link. The information projection excludes prices, MRP, schemes and cart controls, even for signed-in customers. Product JSON-LD and crawler HTML omit offers and prices.
- `/about`, `/research`, `/quality`, `/contact`: corporate company, approach and enquiry pages; existing news, gallery, careers and policy pages remain available.
- `/shop`, `/shop/products/:slug`, `/shop/categories/:slug`, `/shop/quick-order`: dedicated partner ordering. Cart, checkout, registration and customer account URLs continue to work in the Shop layout. `/quick-order` redirects to the new Shop route.

Product enquiries prefill the contact form subject. Customer pricing, approvals, cart calculations and order APIs retain their existing business rules. All demo requests continue to use the browser-local adapter; messaging is simulated there.

Shop product cards have a single View link for every visitor, including signed-in partners. Listings, category pages, homepage product rows and related-product cards no longer add the first variant directly to the cart. Customers open the individual product page, select the pack size and add that selected variant there. Quick Order continues to use its dedicated variant selector.

## Product information layout

Public product pages use a large image gallery with thumbnails and an accessible enlargement dialog, a clear product title and pack summary, an enquiry action, and section navigation. The section index stays beside the content on desktop and becomes a horizontal strip on phones. Empty information sections are omitted.

Composition text with dotted quantity leaders is presented as formulation rows, with separate vial panels when those labels exist in the source. Colon-labelled dosage lines become readable definition rows. Paragraphs, lists, emphasis and tables retain their structure; rich HTML is rebuilt from an allowlist without scripts, event handlers or unsafe links. The presentation preserves the supplied clinical wording, quantities and routes. Content still comes from the existing product record.

The product editor and both product page layouts omit Product Code, product/variant SKU, Benefits, Precautions, Storage and Additional Information. The Details tab retains Full Description, Composition, Indications and Dosage. Crawler HTML and product JSON-LD follow the same reduced field set, and SEO drafts no longer add a Storage question. Existing database records and order snapshots are not purged; variants continue to use their stable internal IDs for pricing and ordering.

Variants no longer have a Selling Price input or an automatic zero selling price. Rates are entered through Pricing & Offers or Pricing Manager; assigned customer/category rates and explicit price offers continue to determine ordering prices. A new pack with no applicable rate shows an enquiry message and cannot produce a zero-priced order. Brochure and Visual Aid PDF inputs and their public download links have been removed from both page layouts. Previously uploaded files are not deleted.

The isolated browser demo includes a QUINOTAZ snapshot and the product's published pack images, so `/products/quino-taz-cefquinome-tazobactam-injection-562-5mg` can be reviewed directly. This sample is added once to older demo data without replacing edits. It is not imported into the production database. `frontend/tests/product-formatting.test.cjs` covers content preservation and safe rich-text formatting; demo tests cover the additive sample update.

## Content and deployment

The corporate defaults are shipped with the frontend, so this redesign appears after a normal deployment without replacing live MongoDB content. Existing product records, prices and transactions are retained. Admin → Homepage edits `homepage.corporate.hero`, `intro` and `science`, plus the selected featured products. Company contact details still use Admin → Company settings. CMS page body content can continue to be edited under Website Pages.

Run on the existing VPS:

```bash
cd /opt/vetmech-shop && git pull --ff-only origin main && sudo bash deploy-vps.sh
```

The old `--refresh-homepage` option targets the earlier green homepage's settings and is not required for the new corporate theme. The native Nginx configuration must retain the SPA fallback (`try_files $uri /index.html`) for direct product and Shop URLs. The Docker Nginx configuration already provides this.

## Original assets

Created with the built-in image-generation tool, then encoded as WebP for delivery without changing the composition or dimensions. The original PNG outputs are retained separately. The science photo is illustrative and does not represent a VETMECH-owned facility.

- `frontend/public/corporate/animal-care.webp` — original veterinary/cattle hero photograph.
- `frontend/public/corporate/science.webp` — original illustrative science photograph.
- `frontend/public/corporate/brand.svg`, `favicon.svg` — repo-native vector wordmark and favicon.

Hero prompt:

Use case: photorealistic-natural. Asset type: a premium veterinary pharmaceutical corporate website hero photograph. Create an original, editorial-quality, cinematic ultra-wide landscape photograph, 1920 by 1080 composition. Close three-quarter portrait of a healthy beautiful Indian dairy cow with a soft brown-and-white face and calm intelligent eyes, standing in a clean spacious modern dairy environment in Tamil Nadu. A veterinary professional's hand gently rests on the cow's neck at the edge of frame, no procedure. Authentic anatomy, natural skin and coat texture, understated documentary realism. Place the cow on the RIGHT half; the LEFT half has out-of-focus dark charcoal farm architecture with ample negative space for white headline typography to be added in code. Palette: near-black, warm grey, natural muted brown and ivory, tiny restrained deep red accents in environment. Soft directional morning light, sophisticated international animal-health company campaign, shot on an 85 mm lens, not oversaturated, no visible buildings claimed as any actual company facility. No text, no numbers, no logos, no watermark, no borders, no graphic overlays, no collage.

Science prompt:

Use case: photorealistic-natural. Asset type: original editorial photograph for a black-and-red international-standard veterinary pharmaceutical corporate website. Landscape 3:2 composition. Close-up of a gloved scientist's hand carefully holding a clear glass vial in a calm modern life-science setting, with an optical microscope softly out of focus in background and subtle reflections on a black work surface. No visible face, no medical procedure, no animal testing, no branding, no readable labels, no claims of any specific company facility. Neutral near-black, white, silver grey and a restrained warm red reflection. Extremely realistic glass, latex and metal textures, precise natural anatomy, directional soft daylight, elegant photographic depth of field, high-end commercial editorial image. No text, no logos, no watermark, no numbers, no collage, no abstract blobs.

## Preview

The existing public development demo is updated in place. Use Demo tools for sample admin or customer access; the tools start closed. `npm run start:demo` starts the sample API development server with SPA fallback. Production `npm run build` keeps the real API. Browser QA exercises corporate navigation, price-free product information, the enquiry handoff, responsive layouts and Shop ordering access.
