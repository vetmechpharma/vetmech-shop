# Customer ledger

Admin → Sales & Pricing → Customer Ledger is a transaction workspace. Select a
registered customer by name, mobile or company. Customers also have a Ledger link
beside their row and in their details panel.

1. Set the opening balance and as-of date. Choose **Customer owes us** for a debit
   or **Customer advance** for a credit. Zero is allowed. Enter only a carried
   balance that is not already represented by a posted invoice. Corrections require
   a reason and retain the previous value and revision in the database audit history.
2. In Orders → View, choose **Close order & post invoice**. Enter the issued invoice
   number, date and final billed amount, including GST and adjustments. This amount
   is the ledger debit; it is not recalculated from catalogue rates. The order and
   invoice are saved atomically. Repeating the same close request does not post a
   second debit. Invoice numbers are unique within the Indian April–March financial
   year. Existing dispatch invoice fields are drafts until explicitly posted.
3. Choose **Record payment** for a selected customer. Enter the amount, payment date,
   GPay / UPI / Net banking, transaction ID or UTR, and optional notes. An Admin entry
   is a confirmed credit immediately. Transaction references are normalized and
   cannot be reused across customers or payment modes. This records a payment that
   was received; it does not initiate a bank or UPI transfer.

Customers see **My Account → My Ledger** with dated debits, credits, references,
running balances and current outstanding. A negative balance is shown as advance
credit. They can report a payment they already made; it remains **Pending** and has
no effect on the balance until Admin confirms receipt. Pending reports also appear
at the top of the Admin ledger workspace. Admin can reject a report with a reason.

Confirmed payments can be voided with a reason. Invoices can be voided from the
order panel and reissued with corrected details; voided records stay visible and
are excluded from the balance. Orders containing invoice history cannot be deleted.
Posted invoices lock order status, pricing and dispatch edits until voided. Normal
customer deletion retains ledger history and blocks customer access. Retained
deleted-customer ledgers are read-only, and permanent deletion with ledger history
is blocked.

Dates and amounts are mandatory. Future dates, non-positive payments/invoices and
fractions smaller than one paise are rejected. Financial values are stored and
summed as integer paise. Statements paginate newest first after calculating the
running balance across the complete history; backdated entries are ordered by
transaction date. There is no global outstanding dashboard or automatic allocation
of a payment to individual invoices.

Customer ledger endpoints always use the authenticated customer identity. Admin
ledger and payment actions require the existing **customers** permission; closing
and voiding order invoices require **orders**. The new `ledger_entries` collection
is included automatically in the existing database backup system. No historical
orders, dispatch records or customer balances are automatically imported.

Deploy frontend and backend together:

```bash
cd /opt/vetmech-shop &&
git pull --ff-only origin main &&
sudo bash deploy-vps.sh
```

Startup creates indexes for customer statements and unique invoice keys. Existing
data is preserved. The browser development demo uses the same ledger rules with
sample records stored on the current device, and never contacts a payment service.
