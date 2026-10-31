# Colour envelope (Type 1)

Admin → Orders → open order → Prepare for Dispatch → Colour envelope.

Enter cases and select freight using the dispatch form. Open Delivery address to edit and save the order's delivery address, recipient mobile and main area. Order addresses are retained for reprinting; existing customer address-book behavior is unchanged. Open Preview / Print Envelope and print at 100% (Actual size), paper 220 × 140 mm, no margins and no browser headers/footers. Confirm “Envelope printed and checked” only after a successful physical print. Changing dispatch values or the address clears that confirmation.

Dimensions, from the landscape top-left corner:

- Paper: 220 × 140 mm.
- Address: left 40 mm, top 56 mm, width 130 mm, height 40 mm.
- Cases: left 20 mm, top 30 mm, width 25 mm, height 10 mm; print only the number.
- Freight: PAID defaults to left 120 mm / top 30 mm; TO PAY to 148 mm / 30 mm. Both positions are adjustable in preview. Exact pre-printed PAID/TO PAY box coordinates were not supplied; print selected text, rather than guessing a mark inside a box.

After the first physical test, all positions and address dimensions can be changed under Adjust print alignment and saved on the current browser. Case placement at 20 mm / 30 mm is the revised correction from the second physical test photograph, and still requires physical calibration. Changing printers/browsers requires calibration again. Only variable text is printed, in black. Recipient name, main area, PIN and mobile are bold. No sender, background artwork or order number is added to the printable surface. The address starts at 12 pt body / 16 pt name, with main area, PIN and mobile at 14 pt bold. It reduces only to a minimum 10 pt body / 14 pt name / 12 pt highlighted fields. If it still overflows, printing is blocked and the operator must shorten the address. PIN, address, cases and freight are validated before a preview opens. Blocked popups produce an error, and opening a preview never marks printing complete.

Reprints are available from dispatched orders and posted-invoice orders. Posted-invoice orders can enter print-only cases/freight without editing their accounting record.

Physical printer calibration remains necessary: print one test envelope first. A browser cannot verify paper feeding, printer scaling, or successful physical printing. Type 2 is deferred until its dimensions and sample are supplied.

## Browser demo fixtures

Demo tools → Sample envelope order opens SAMPLE-ENV-TO-PAY directly. The synthetic customer is Dr. Sample Customer (mobile 0000000004), with a saved Koduvai delivery address and three 24-unit sample product lines. Preparation is prefilled with three cases, Demo Logistics and TO PAY. SAMPLE-ENV-PAID provides a dispatched order with three cases, PAID, sample invoice reference and sample LR for reprinting. These records live only in browser-demo storage. Existing demo users receive them once without resetting existing edits; deleting a sample does not recreate it on every reload.

## Add print-test records to the actual VPS database

Deployment alone does not insert data. After deploying the latest code, run the maintenance command using the application's virtual-environment Python:

```bash
cd /opt/vetmech-shop
backend/venv/bin/python backend/manage.py add-envelope-samples --apply
```

Use `.venv/bin/python` instead if that is the existing installation's virtual environment. Omit `--apply` for a read-only preview. The command reads `backend/.env`; never paste its contents into a terminal transcript.

Creates one customer named SAMPLE — Dr. Sample Customer and SAMPLE-ENV-TO-PAY / SAMPLE-ENV-PAID. Both contain three print-only product snapshots, 72 units, a saved Koduvai address and three cases; the first has dispatch preparation prefilled and the second has dispatch references for reprinting. Rates and references are fictional. No public products, stock changes, posted invoices or ledger entries are created. No sample login/password is added. The reserved invalid mobile 0000000004 is blocked before WhatsApp gateway access, and no customer email is stored. Review reminders skip sample orders.

The operation is explicit and repeatable: it inserts missing records only, never resets sample edits, and refuses conflicting non-sample IDs or mobile numbers before writing. Samples are marked `sample_data=envelope-print-v1` and SAMPLE in their names/order numbers. They are real database records and appear in ordinary order/customer reports; remove them through the existing Admin delete actions after testing if no longer needed. Existing non-sample records and settings are unchanged.

Saved v2 alignment retains all custom coordinates. An old case-left value of 32 mm migrates to 20 mm on first use of v3; other custom case positions remain unchanged. Save alignment to retain the revised settings. Reset clears both the old and current saved alignment.
