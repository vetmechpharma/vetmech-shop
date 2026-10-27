# Automatic related products

Public portfolio and Partner Shop product pages show up to four other active products.
Each product request samples products at random, prioritising matches in any of the
product's assigned categories. If fewer than four match, other active products fill
the remaining spaces. A small catalogue shows only the available alternatives.

The current product, inactive products and duplicate items are excluded. Product
creation and editing require no related-product selections. Existing saved
`related_product_ids` do not control the automatic selection; no data migration is
needed. New active products participate immediately in subsequent API requests.
The selection remains stable while a page uses its cached response and can change
on a later request; a different selection on every refresh is not guaranteed.

Corporate cards remain information-only. Shop cards retain the View action so the
customer chooses a variant on the individual product page before adding to cart.
The development demo follows the same selection rules with browser-local data.

Deploy to the VPS using the existing procedure:

```bash
cd /opt/vetmech-shop &&
git pull --ff-only origin main &&
sudo bash deploy-vps.sh
```
