"""Runtime flags shared by startup, authentication and maintenance commands."""
import os


def is_production():
    return os.environ.get("APP_ENV", "production").strip().lower() == "production"


def enabled(name):
    return os.environ.get(name, "").strip().lower() in {"true", "1", "yes"}


def demo_enabled():
    return not is_production() and enabled("SEED_DEMO_DATA")


def dev_otp_enabled():
    return not is_production() and enabled("ALLOW_DEV_OTP")
