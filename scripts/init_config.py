"""Create private first-run config without replacing any existing config file."""
import argparse
import os
from pathlib import Path
import secrets
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def generate(root, site_url, email):
    parsed = urlsplit(site_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("SITE_URL must be an HTTP(S) origin, such as https://shop.example.com")
    if any(c in email + site_url for c in "\r\n") or "@" not in email:
        raise ValueError("Enter a valid administrator email and site URL.")
    targets = [root / ".env", root / "backend/.env", root / "frontend/.env"]
    if any(path.exists() for path in targets):
        raise ValueError("Configuration already exists. Update the existing files; nothing was overwritten.")
    site_url = site_url.rstrip("/")
    common = {
        "DB_NAME": "VETMECH_SHOP", "JWT_SECRET": secrets.token_urlsafe(48),
        "ADMIN_EMAIL": email, "ADMIN_PASSWORD": secrets.token_urlsafe(24),
        "WEBHOOK_CRON_SECRET": secrets.token_urlsafe(32),
        "SITE_URL": site_url, "CORS_ORIGINS": site_url,
    }
    configs = [
        {**common, "WEB_PORT": "8080"},
        {**common, "MONGO_URL": "mongodb://127.0.0.1:27017", "APP_BASE_URL": site_url,
         "APP_ENV": "production", "SEED_DEMO_DATA": "false", "ALLOW_DEV_OTP": "false"},
        {"REACT_APP_BACKEND_URL": "", "REACT_APP_SITE_URL": site_url},
    ]
    written = []
    try:
        for path, values in zip(targets, configs):
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("x") as file:
                written.append(path)
                os.chmod(path, 0o600)
                file.write("\n".join(f"{k}={v}" for k, v in values.items()) + "\n")
    except Exception:
        for path in written:
            path.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-url", default="http://localhost:8080")
    parser.add_argument("--admin-email", default="vetmechpharma@gmail.com")
    args = parser.parse_args()
    try:
        generate(ROOT, args.site_url, args.admin_email)
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    print("Created private configuration files. Initial login credentials are in backend/.env.")
