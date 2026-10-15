# Copy the complete running VETMECH Shop

GitHub supplies the source and tracked files. To reproduce the current shop,
also transfer the current database, latest local uploads, private configuration
and any media that only exists on the original external image host.

## 1. Capture the source

Sync newer changes from Emergent to GitHub first if they exist. Preserve the
current Git commit ID. Fetch the selected revision into the destination checkout.
Use a separate database and domain for a trial copy.

## 2. Export the live data

Stop order entry and background writers for a consistent final export. These
exports are not a live point-in-time database snapshot.

With this version deployed on the source, a super-admin can download both files
from **Admin → Backup & Migration**. Version 2 includes every collection, MongoDB
IDs/types and index definitions. Quotations, customer/category prices, reviews,
transports, counters and future collections are included automatically.

Alternatively, run on the source machine:

```bash
backend/venv/bin/python backend/manage.py backup --output /path/to/private-backups
```

It creates a dated directory containing `database.json` and `uploads.zip`.
Keep it private: the database includes password hashes and integration settings.
Back up `backend/.env` and `frontend/.env` through the server's private file
transfer separately. Never commit their values to GitHub.

Older JSON exports are accepted for compatibility, but their hard-coded collection
list may be missing quotations, customer prices and other modules. Create a new
version 2 export or use MongoDB's `mongodump`/`mongorestore` for a complete transfer.

## 3. Validate before importing

On the destination, install backend requirements, configure `MONGO_URL` and choose
a new `DB_NAME` in `backend/.env`. Do not start the web application yet.

```bash
backend/venv/bin/python backend/manage.py check \
  --database /path/to/database.json --uploads /path/to/uploads.zip
```

Validation reports collection counts and checks every uploaded file for unsafe
paths, archive expansion limits and filename conflicts. No data is written.

## 4. Restore into an empty target

```bash
backend/venv/bin/python backend/manage.py restore \
  --database /path/to/database.json --uploads /path/to/uploads.zip
```

Restore refuses any target with existing collections. It never merges with live
data or replaces a conflicting upload. Identical tracked uploads are reusable.
If an import fails, collections and uploads created by that attempt are removed.
The application must remain stopped during import; do not run multiple importers.

For Docker Compose, put the two backup files in the local `backups/` directory
and run the migration command without starting the application entrypoint:

```bash
docker compose up -d mongo
docker compose build backend
docker compose run --rm backend python manage.py check \
  --database /backups/database.json --uploads /backups/uploads.zip
docker compose run --rm backend python manage.py restore \
  --database /backups/database.json --uploads /backups/uploads.zip
docker compose up -d --build
```

The read-only `check` command does not need a database connection. The `backups`
directory must be readable by the container's UID 10001; restrict access to that
service account instead of making the backups public.

## 5. Verify the trial copy

- Compare collection counts, product variants, media, quotation numbers and all
  customer/category prices against the original.
- Check admin login, customer password/OTP login, approval rules and order history.
- Place an explicit test order; verify price/offer, dispatch and quotation PDF.
- Check uploaded images/documents, public product pages, SEO and social previews.
- Use a test WhatsApp session and SMTP destination while evaluating the copy.
  A copied database contains the original integration configuration.
- Configure HTTPS, domain routing and the desired review-reminder scheduler on
  the new host. Change public URLs/webhook destinations only at the final move.

The original shop continues serving until you deliberately switch its domain
or deployment. Keep the source backup and export revision for rollback.
