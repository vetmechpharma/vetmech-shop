# Admin workspace and customer access

The Admin workspace uses the corporate black, red and white identity, with a dark navigation rail, readable forms, a responsive drawer, red actions and a revised business dashboard. The same brand colors apply to dialogs and customer account screens.

## Customer access

- Sign in with the registered mobile number and password. OTP is no longer a login or checkout method.
- New self-registrations must request and verify a WhatsApp OTP before submitting account details. A registration verification grant is bound to that mobile number, expires after 15 minutes, and can be consumed once. Resending the OTP invalidates the previous grant. OTP verification never issues a customer login token.
- A password of at least 8 characters is compulsory at signup, with confirmation in the form. Passwords are hashed in the backend; the 72-byte bcrypt input limit is checked before hashing. Existing valid passwords continue to work.
- Admin approval remains configurable. Pending accounts may sign in, but cannot place orders or see approved partner rates.
- Existing customers who previously used OTP without a password need an administrator to set one under **Customers → View → Reset Password**. Customer details flag accounts without a password. There is no automatic default password. Admin-created customer accounts also require a password.
- Production registration requires the configured WhatsApp gateway to deliver the OTP. A failed delivery returns an error and invalidates the code. Development OTP visibility still requires explicit non-production settings; the browser demo simulates delivery without contacting the gateway.

Legacy `enable_otp` and `enable_password_login` settings can no longer restore OTP login or disable password sign-in. Registration OTP remains required independently of those old settings.

## Review fixes

- Admin login and session responses now include the server's resolved role permissions, so staff with default role permissions see the appropriate navigation. Schemes is included in Catalog navigation. Only the deepest matching destination is highlighted; collapsed links are removed from keyboard navigation.
- Customer-dependent catalogue, product, quick-order and order-history queries use the customer identity. Private customer queries are cleared at logout; Admin query caches are cleared when switching Admin sessions.
- Checkout uses the signed-in customer directly, blocks unapproved ordering, and does not retain a separate stale verification state after logout. The customer category shown there cannot be changed to select another rate category.
- Shop descriptions and information sections use the existing safe rich-content renderer instead of showing literal HTML tags.
- Common listing requests display a retry action on failure. The overview distinguishes a load error from loading forever. Account and Admin pages carry noindex metadata.
- Dashboard sales and product/category totals exclude cancelled orders. Repeat customers are counted by identity instead of name. Category totals use one product lookup instead of a database query for every order line. Incomplete legacy order records do not break the overview.
- Customer edits validate the mobile number, hash new passwords and do not persist plaintext password fields. Admin account creation requires an explicit password and valid email. Admin edits prevent duplicate email addresses and disabling/demoting the last active Super Admin. Admin password attempts now use a lockout after five failures, matching customer login protection.

Customer rows and the customer details panel provide a visible **Delete** action. Its confirmation identifies the customer by name and mobile number. Deleting marks the account deleted, blocks access and moves it out of the default customer list into the **Deleted** tab. Administrators can still view that customer's retained order history there; this action does not permanently remove the customer record or orders.

## Deployment

Deploy the frontend and backend together because registration now requires `verification_token` and `password`:

```bash
cd /opt/vetmech-shop
git pull --ff-only origin main
sudo bash deploy-vps.sh
```

No customer records, existing passwords, approvals, prices or orders are replaced. Live WhatsApp delivery and the VPS environment must be verified on the actual installation; automated tests use an isolated database and browser-local demo records.
