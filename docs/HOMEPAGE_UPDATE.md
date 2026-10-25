# Legacy green homepage presentation

The current black-and-red corporate website uses its own homepage defaults and
`homepage.corporate` fields. Use a normal deployment for that theme; the preset
below applies only to the earlier green homepage. See [corporate design](CORPORATE_DESIGN.md).

The browser demo has its own sample settings. A normal code deployment retains
the live MongoDB homepage, which is why the original banner can remain after
GitHub and the frontend build are up to date.

This release includes a production presentation based on the demo's green
artwork, headline, introduction and feature cards. Its headline is:

> Advancing animal health. Connected to your business.

It updates the existing `homepage` setting only. Product records and prices,
selected featured products, customers, accounts, orders, quotations, company
logo/contact details, integrations and other website settings are retained.
The banner label and multiline title remain editable under Admin → Homepage.

## Existing native VPS

```bash
cd /opt/vetmech-shop && git pull --ff-only origin main && sudo bash deploy-vps.sh --refresh-homepage
```

The updater backs up the database and uploads, builds and activates the normal
production frontend, checks backend health, and then applies the homepage content.
The green artwork is served locally at `/images/vetmech-connected-hero.svg`.
The final output includes `"status": "applied"` and the private snapshot path,
followed by the normal update completion message. Refresh the website afterward.

The content update runs once (`connected-homepage-v1`). Later deployments,
including a repeated invocation of this flag, keep subsequent admin edits.
Default demo artwork and text are included in the repository; no browser export
is needed for this preset. Personal edits made inside a demo browser still need
that browser's export if they are to be copied separately.

## Preview and rollback

Preview against the configured database without writing anything:

```bash
backend/venv/bin/python backend/manage.py refresh-homepage
```

Each applied update first saves `homepage.json` under a new private
`homepage-<timestamp>-<id>` directory inside `/opt/_backups`. It preserves MongoDB
types and the original record. To restore, use the exact backup path printed
by the command:

```bash
backend/venv/bin/python backend/manage.py restore-homepage --backup /opt/_backups/PASTE_PRINTED_DIRECTORY/homepage.json --apply
```

Rollback changes only the presentation fields and retains unrelated later
homepage edits. It refuses to replace presentation content edited by an admin
since the update. Apply and restore both check for concurrent edits before
writing; a failed backup prevents the content update.

These commands target the native VPS layout, where the backend environment and
the active `frontend/build` directory are present in the same checkout. The
apply command verifies that the new local artwork exists before writing content.
