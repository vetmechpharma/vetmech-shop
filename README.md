# VETMECH Shop

Corporate veterinary website, B2B product ordering and administration application.
This repository contains the React frontend, FastAPI backend, tracked media and
the original Git history exported from Emergent. Development can continue here
without an Emergent subscription or private build packages.

## Existing modules

- Public website, product catalogue, categories, product SEO and social previews.
- Customer registration/approval, password and WhatsApp OTP login, customer pricing,
  quantity offers, cart, orders, dispatch and reorder.
- Admin CMS, users/permissions, quotations/PDF, customer reports, CRM and tickets.
- Configurable WhatsApp gateway, SMTP, notification templates and database/media backups.

The source is a copy of the GitHub snapshot dated **2 October 2026**. A code copy
does not contain the running MongoDB database, private environment configuration,
or uploads created after the last GitHub sync. Follow [the migration guide](docs/MIGRATION.md)
to transfer those separately. Images stored as remote URLs remain remote until
they are uploaded locally; export the original media if you plan to close that host.

## First-run configuration

```bash
python3 scripts/init_config.py --site-url https://your-shop-domain.example --admin-email owner@example.com
```

This writes private `.env`, `backend/.env` and `frontend/.env` files, generates
unique secrets and an initial admin password, and refuses to overwrite existing
configuration. Read `backend/.env` locally for the initial login. For a restored
database, the original administrator password remains in effect.

Production does **not** create demo staff, demo customers or demo medicines and
never returns OTPs in API responses. An empty install needs `ADMIN_EMAIL` and
`ADMIN_PASSWORD`; an existing super-admin account does not need bootstrap credentials.

## Independent deployment with Docker Compose

Requires Docker with the Compose plugin on the destination machine.

```bash
docker compose up -d --build
docker compose ps
```

The frontend listens on `127.0.0.1:8080` by default, for use behind the destination
server's HTTPS reverse proxy. MongoDB is internal to the Compose network. Database
and uploaded files have persistent volumes. The web server includes API proxying,
sitemaps, robots and social-crawler preview routing. Set `SITE_URL` to the actual
public origin in `.env` before building. A reverse proxy on the host can route the
chosen domain to `http://127.0.0.1:8080`.

Restore the original database **before** starting the backend; see the migration
guide for the Compose restore command. Starting an empty backend first creates
an admin and the restore tool will then refuse that populated target.

## Native development / existing VPS

Requires Python 3.12, Node.js 20.20+ and a MongoDB server. This update was checked
with Python 3.12 and Node.js 24. Use the committed npm lockfile.

```bash
python3 -m venv backend/venv
backend/venv/bin/python -m pip install -r backend/requirements.txt
cd frontend
npm ci
npm run build
```

Start the backend from `backend/`:

```bash
venv/bin/uvicorn server:app --host 127.0.0.1 --port 8010
```

For frontend development, run `npm run start:local` from `frontend/`. Production
uses same-origin `/api` requests by default. If frontend and backend are hosted
separately, set `REACT_APP_BACKEND_URL` to the backend origin before building.

On the existing native VPS, the update script expects `/opt/vetmech-shop`, the
`backend/venv` Python environment and systemd service `vetmech-shop-backend`.
It makes a complete database/uploads backup, pulls with `--ff-only`, installs
dependencies, builds alongside the currently served frontend, checks database
health after restarting the backend and then activates the new frontend.

```bash
cd /opt/vetmech-shop
sudo bash deploy-vps.sh
```

Overrides: `VETMECH_APP_DIR`, `VETMECH_SERVICE`, `VETMECH_HEALTH_URL` and
`VETMECH_BACKUP_DIR`. It preserves existing `.env` files. It does not create DNS,
certificates, a systemd service or a first-time host reverse proxy.

## Integrations

Configure WhatsApp API URL/key/session and SMTP credentials in Admin. Production
OTP login returns a delivery error if neither WhatsApp nor registered-email
delivery succeeds; password login remains available. Test with an explicit test
recipient before enabling customer notifications.

Review reminders previously scheduled by Emergent need a scheduler on the new
host. The existing endpoint is `POST /api/cron/review-reminders`, authenticated
with `Authorization: Bearer <WEBHOOK_CRON_SECRET>`. The previous schedule was
daily at 10:00 Asia/Kolkata. Migration does not automatically enable a job that
sends messages.

## Checks

```bash
backend/venv/bin/python -m pip install -r backend/requirements-test.txt
backend/venv/bin/python -m pytest backend/tests/unit -q
npm --prefix frontend run test:smoke
CI=true GENERATE_SOURCEMAP=false npm --prefix frontend run build
bash -n deploy-vps.sh
```

The isolated regression suite uses an in-memory MongoDB test double and never
contacts the live database, WhatsApp or SMTP. The older `backend/tests/test_*.py`
files are integration suites designed for the original seeded preview. Run
them only against an isolated deployment with explicitly configured test data.

## Private development demo

A sample-data development demo is available at
https://vetmech-shop-dev-demo.vetmechpharma.chatgpt.site .
Use **Demo tools** to enter the admin, doctor or agency workspace. Demo edits
persist in that browser; the live database is not connected and messaging is
simulated.

To build the same optional demo from this repository, run `npm run build:demo`
inside `frontend/`. Normal `npm run build` retains the production API client.
See [demo development](docs/DEMO.md) for implementation details.
