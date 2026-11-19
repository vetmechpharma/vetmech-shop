# Product deletion and animal categories

Main categories are fixed: Ruminants, Companion Pets, Poultry, Pig, Horses and Exotic Birds. Admin → Categories allows SEO, description, image and display-order edits for these groups, but prevents adding, renaming, disabling, moving or deleting a main group. Create subcategories manually under one main group; nesting below a subcategory is not supported. A subcategory must be unassigned from products before moving or deleting it.

Admin → Products → Add/Edit → Basic shows checkboxes for multiple main groups and multiple subcategories. For example, select Ruminants and Pig, then any manually-created subcategories under either. Removing a main group removes its subcategory selections. Empty subcategory arrays really clear the selection. The first selected main/subcategory remains in the singular legacy field for compatibility. The list shows all assigned main groups.

The product-list trash button opens a confirmation. Delete removes the product from the public catalogue, new orders and the Admin product list. The underlying product, negotiated-rate records and historical order/invoice snapshots are retained; deletion does not alter existing invoices or stock. This is separate from the existing Active toggle. Deleted products cannot be reactivated by a stale edit or ordered from a saved cart.

## Existing installations

The normal VPS deployment backs up the database before restarting. At startup a one-time migration creates missing main groups. Recognised legacy main groups (for example Large Animal → Ruminants, Small Animal → Companion Pets) retain their IDs, URL slugs and SEO content. Duplicate recognised groups map product assignments to the retained group; their subcategory parents are remapped too. No default subcategories are created by this migration.

Unknown legacy main groups are retained and shown under Admin → Categories → Subcategories as Needs reassignment. Old IDs are saved in product `legacy_category_ids` / `legacy_subcategory_ids`; they are not guessed into an animal group. Existing products with no recognised animal group need manual assignment. Review these products and subcategories after deployment; a legacy category with children must have those children reassigned before it can itself become a direct subcategory. No prices, variants, orders or customer records are changed by taxonomy migration. The migration marker prevents startup from resetting later edits.

The hosted browser demo follows the same rules and receives its own one-time migration without clearing saved data.

Deploy on the existing VPS:

```bash
cd /opt/vetmech-shop &&
git pull --ff-only origin main &&
sudo bash deploy-vps.sh
```
