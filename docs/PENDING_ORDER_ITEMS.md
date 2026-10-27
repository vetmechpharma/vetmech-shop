# Missed order items and customer stock follow-up

This is customer demand tracking, independent of catalogue availability and stock
quantities. No product, variant stock status or inventory quantity is changed.

## Processing an order

In Admin → Orders → View → Edit Pricing, select **Out of stock** for items the
customer requested but that cannot be supplied in that order. Save the order with
the WhatsApp notification checkbox enabled. One message lists all currently
waiting items from that order, including product name, pack and requested quantity:

> Dear {name}, regarding your VETMECH order {order}, the following items are currently OUT OF STOCK:
> {items}
> We will notify you once they are available. The other items in your order will be processed.

Notifications run after the order has saved successfully. Repeating an unchanged
save does not send the same notice again. Failed notices can be retried by saving
with the notification option selected. Unavailable lines keep the ordered quantity
but have a dispatch quantity of zero. The final issued invoice amount remains a
separate Admin entry; this feature does not create invoices or adjust ledger entries.

## Stock received

Admin → Sales & Pricing → Pending Items lists customers, product packs, missed
quantities, source orders, follow-up state and notification outcome. Select rows
across products, or use **Stock received · notify all** for a product pack. Review
the actual customer messages before confirming. No received-stock quantity is
requested. Each customer receives one message containing all their selected items;
requests for the same pack across multiple orders are combined in that message.

> Dear {name}, the following items missed from your previous VETMECH order(s) {order} are now IN STOCK:
> {items}
> You can add them again at your next checkout. Thank you!

This marks only the selected customer requests available. It does not change the
old order's historical flag, send the old order for dispatch, or create a new order.
Gateway failures remain visible and can be retried. Previously notified requests
are skipped, and repeating the same notification request ID returns the saved
batch result. A process interrupted while a batch is sending needs review of the
notification log before any manual retry; the system does not blindly resend an
unknown delivery outcome. Gateway acceptance is recorded as sent, not proof that
the customer has read or received the message.

Both templates are editable under Message Templates. Old saved stock templates
that exactly match the previous defaults are upgraded; genuine custom text is
preserved. Product/pack/quantity lines are appended if a custom template omits the
`{items}` placeholder.

## Customer reorder

My Account → Missed items and Checkout show the signed-in customer's requests.
Stock-received items show **Now in stock**. Other requests show **Awaiting stock
confirmation**, and can still be ordered. Customers can also request a catalogue
item labelled out of stock; this label does not block adding it to the cart.
Existing coming-soon and account/rate requirements still apply.

Adding a missed item carries a customer-owned reference with the cart. If that
variant is already in the cart without a missed-item reference, the customer can
use the existing quantity instead of adding twice. Checkout uses current prices
and offers. A new order records how much of each selected request was reordered;
partial quantities leave the remainder pending. Cancelling the replacement order
restores its unmet quantity. Removing a variant from a replacement order also
restores demand not covered by its remaining lines. No previous order or product
stock record is rewritten by checkout.

If the original order will now supply an item, uncheck its out-of-stock flag and
save: that source follow-up is resolved. For a later reorder, leave the historical
flag and use Pending Items instead. Orders with pending-item history are retained;
cancelling a source order removes it from active follow-up.

## Deployment and access

Deploy frontend and backend together using the existing deploy-vps.sh procedure.
Startup backfills only explicit historical order-line `out_of_stock` flags without
sending messages or changing the catalogue. Pending requests are embedded in order
records; notification batches are included by the existing database backup process.
Admin actions require the existing orders permission. Customer endpoints and cart
references are checked against the authenticated customer, never a client-supplied
customer selector. Deleted, rejected and suspended customers are not notified.
The browser demo follows these rules with isolated sample data and simulated messages.
