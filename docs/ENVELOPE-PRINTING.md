# Colour envelope (Type 1)

Admin → Orders → open order → Prepare for Dispatch → Colour envelope.

Enter cases and select freight using the dispatch form. Open Delivery address to edit and save the order's delivery address, recipient mobile and main area. Order addresses are retained for reprinting; existing customer address-book behavior is unchanged. Open Preview / Print Envelope and print at 100% (Actual size), paper 220 × 140 mm, no margins and no browser headers/footers. Confirm “Envelope printed and checked” only after a successful physical print. Changing dispatch values or the address clears that confirmation.

Dimensions, from the landscape top-left corner:

- Paper: 220 × 140 mm.
- Address: left 40 mm, top 56 mm, width 60 mm, height 24 mm.
- Cases: left 55 mm, top 30 mm, width 25 mm, height 10 mm.
- Freight: provisional left 120 mm, top 30 mm, adjustable in preview. Exact pre-printed PAID/TO PAY box coordinates were not supplied; print selected text, rather than guessing a mark inside a box.

Only variable text is printed, in black. Recipient name, main area, PIN and mobile are bold. No sender, background artwork or order number is added to the printable surface. The address reduces from 8 pt body / 10 pt name to a minimum 6.5 pt body / 8.5 pt name. If it still overflows, printing is blocked and the operator must shorten the address. PIN, address, cases and freight are validated before a preview opens. Blocked popups produce an error, and opening a preview never marks printing complete.

Reprints are available from dispatched orders and posted-invoice orders. Posted-invoice orders can enter print-only cases/freight without editing their accounting record.

Physical printer calibration remains necessary: print one test envelope first. A browser cannot verify paper feeding, printer scaling, or successful physical printing. Type 2 is deferred until its dimensions and sample are supplied.

## Browser demo fixtures

Demo tools → Sample envelope order opens SAMPLE-ENV-TO-PAY directly. The synthetic customer is Dr. Sample Customer (mobile 0000000004), with a saved Koduvai delivery address and three 24-unit sample product lines. Preparation is prefilled with three cases, Demo Logistics and TO PAY. SAMPLE-ENV-PAID provides a dispatched order with three cases, PAID, sample invoice reference and sample LR for reprinting. These records live only in browser-demo storage. Existing demo users receive them once without resetting existing edits; deleting a sample does not recreate it on every reload.
