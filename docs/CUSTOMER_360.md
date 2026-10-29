# Customer 360

In Admin → Customers, click a customer name or **360 view**. Each customer has a bookmarkable `/admin/customers/<id>/360` page.

- Overview: profile, contact details, saved addresses, current account status, order totals, last order, frequent products, ledger balance and pending missed-item requests.
- History timeline: account audit activity, order changes, invoices and voids, opening balances, payments and reviews, missed items and stock received notices, and quotations linked to the account. Filter by activity type, date range and text; navigate all matching records with pagination or export the current page as CSV.
- Orders, missed items and quotations have dedicated history tabs and links to original records. Cancelled orders remain visible and are excluded from ordered value and frequent products. Historical resolved/reordered/cancelled missed items remain visible without reopening demand.
- Ledger & payments uses the existing ledger component and its exact integer-paise totals. Opening balances, invoice posting and payment confirmation still use the existing workflows. A reported payment remains pending until Admin confirms it.

History is customer-ID scoped, including for deleted accounts. No records are matched by name or phone number. Separate CRM records without a direct link to this customer ID are not merged. Module permissions still apply to orders, pending items and quotations. Account credentials, OTPs, message bodies and arbitrary audit metadata are not returned by Customer 360.

The overview and timeline only read records and never create invoices, orders, payments, notifications or inventory changes. Source history that was never recorded cannot be reconstructed; missing dates are labelled rather than invented. Customer 360 date filters use India local dates. Summary cards show lifetime totals; filters apply to the history list.

Deploy with the normal `git pull --ff-only origin main` and `sudo bash deploy-vps.sh` workflow in `/opt/vetmech-shop`.
