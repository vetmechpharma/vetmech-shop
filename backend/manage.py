"""Offline maintenance: python backend/manage.py --help."""
import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

from backup import (export_database, export_uploads, read_backup, restore_database,
                    restore_uploads, validate_uploads)
from homepage_presentation import HERO_IMAGE, refresh_homepage, restore_homepage

ROOT = Path(__file__).resolve().parent


async def main(args):
    load_dotenv(ROOT / ".env")
    uploads = Path(os.environ.get("UPLOAD_DIR", str(ROOT / "uploads")))
    if args.command == "check":
        payload = read_backup(Path(args.database).read_text())
        print(f"Backup version: {payload.get('version', 1)}")
        for name, docs in payload["data"].items():
            print(f"  {name}: {len(docs)} records")
        if args.uploads:
            files = validate_uploads(Path(args.uploads).read_bytes(), uploads)
            print(f"Uploads validated: {len(files)} files")
        return
    if args.command == "refresh-homepage" and args.apply:
        asset = ROOT.parent / "frontend" / "build" / HERO_IMAGE.lstrip("/")
        if not asset.is_file():
            raise ValueError("Build and activate the frontend before applying homepage content. Use deploy-vps.sh --refresh-homepage.")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=10000)
    try:
        db = client[os.environ["DB_NAME"]]
        await client.admin.command("ping")
        if args.command == "refresh-homepage":
            print(json.dumps(await refresh_homepage(db, args.output, args.apply), indent=2))
        elif args.command == "restore-homepage":
            print(json.dumps(await restore_homepage(db, args.backup, args.apply), indent=2))
        elif args.command == "backup":
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            output = Path(args.output) / f"vetmech-{stamp}"
            output.mkdir(parents=True, mode=0o700)
            # Credentials can be part of settings. Keep backups private on disk.
            for name, content in (("database.json", await export_database(db)),
                                  ("uploads.zip", export_uploads(uploads))):
                with (output / name).open("xb") as file:
                    os.chmod(file.name, 0o600)
                    file.write(content)
            print(f"Backup saved: {output}")
        elif args.command == "restore":
            payload = read_backup(Path(args.database).read_text())
            files = validate_uploads(Path(args.uploads).read_bytes(), uploads) if args.uploads else {}
            # Check the target before copying media. Restore itself checks again.
            if await db.list_collection_names():
                raise ValueError("Restore requires an empty target database; use a new DB_NAME and stop the app.")
            written = restore_uploads(files, uploads)
            try:
                counts = await restore_database(db, payload)
            except Exception:
                for path in written:
                    path.unlink(missing_ok=True)
                raise
            print(f"Restored {sum(counts.values())} records across {len(counts)} collections and {len(files)} uploads.")
    finally:
        client.close()


def parser():
    root = argparse.ArgumentParser(description="VETMECH Shop backup, validation and empty-database restore")
    commands = root.add_subparsers(dest="command", required=True)
    backup = commands.add_parser("backup", help="Export every collection, index and local upload")
    backup.add_argument("--output", default="backups")
    homepage = commands.add_parser("refresh-homepage", help="Preview or apply the connected homepage presentation")
    homepage.add_argument("--apply", action="store_true", help="Write the homepage update after saving a private snapshot")
    homepage.add_argument("--output", default="backups", help="Private snapshot parent directory")
    restore_home = commands.add_parser("restore-homepage", help="Preview or restore a homepage presentation snapshot")
    restore_home.add_argument("--backup", required=True, help="homepage.json snapshot from refresh-homepage")
    restore_home.add_argument("--apply", action="store_true", help="Restore the managed homepage fields")
    for command in ("check", "restore"):
        sub = commands.add_parser(command, help="Validate a backup" if command == "check" else "Restore into an EMPTY database; stop the app first")
        sub.add_argument("--database", required=True, help="Database JSON backup")
        sub.add_argument("--uploads", help="Uploads ZIP backup")
    return root


if __name__ == "__main__":
    try:
        asyncio.run(main(parser().parse_args()))
    except (ValueError, KeyError) as error:
        raise SystemExit(f"Maintenance command failed: {error}") from None
