#!/usr/bin/env python3
"""Install SEO routing into one existing VETMECH HTTPS virtual host.

Dry-run by default. Requires root for --apply. Does not create a virtual host,
replace certificates, change redirects, or edit the other applications' hosts.
"""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


class Node:
    def __init__(self, words, start=0, close=None):
        self.words, self.start, self.close = words, start, close
        self.children = []


def tokens(source):
    """Tokenize nginx syntax while ignoring quoted/commented braces."""
    i = 0
    while i < len(source):
        if source[i].isspace():
            i += 1
        elif source[i] == "#":
            end = source.find("\n", i)
            i = len(source) if end < 0 else end + 1
        elif source[i] in "{};":
            yield source[i], i
            i += 1
        else:
            start, value, quote = i, [], None
            while i < len(source):
                char = source[i]
                if char == "\\" and i + 1 < len(source):
                    value.append(source[i + 1])
                    i += 2
                    continue
                if quote:
                    if char == quote:
                        quote = None
                    else:
                        value.append(char)
                elif char in "\"'":
                    quote = char
                elif char.isspace() or char in "{};#":
                    break
                else:
                    value.append(char)
                i += 1
            if quote:
                raise ValueError("Unclosed quoted nginx value; configuration retained")
            yield "".join(value), start


def parse(source):
    root, words, start = Node([]), [], 0
    stack = [root]
    for value, offset in tokens(source):
        if value == "{" and source[offset] == "{":
            if not words:
                raise ValueError("Unsupported nginx block; configuration retained")
            node = Node(words, start)
            stack[-1].children.append(node)
            stack.append(node)
            words = []
        elif value == "}" and source[offset] == "}":
            if words or len(stack) == 1:
                raise ValueError("Unbalanced nginx configuration; configuration retained")
            stack.pop().close = offset
        elif value == ";" and source[offset] == ";":
            if words:
                stack[-1].children.append(Node(words, start))
            words = []
        else:
            if not words:
                start = offset
            words.append(value)
    if len(stack) != 1 or words:
        raise ValueError("Incomplete nginx configuration; configuration retained")
    return root


def walk(node):
    for child in node.children:
        yield child
        yield from walk(child)


def choose_server(configurations, domain, frontend_root):
    candidates = []
    for path, source in configurations.items():
        for node in walk(parse(source)):
            if node.words != ["server"]:
                continue
            names = [word for child in node.children if child.words[:1] == ["server_name"] for word in child.words[1:]]
            if domain not in names:
                continue
            # A shared host serving unrelated domains needs a manual review.
            if not set(names) <= {domain, "www." + domain}:
                raise ValueError("The VETMECH server also serves unrelated names; no configuration was changed")
            listens = [child.words[1] for child in node.children if child.words[:1] == ["listen"] and len(child.words) > 1]
            if not any(value == "443" or value.endswith(":443") for value in listens):
                continue
            if any(child.words[:1] == ["return"] for child in node.children):
                continue  # Preserve an HTTPS redirect-only host.
            roots = [child.words[1] for child in walk(node) if child.words[:1] == ["root"] and len(child.words) == 2]
            if str(frontend_root).rstrip("/") not in {root.rstrip("/") for root in roots}:
                raise ValueError("VETMECH's existing frontend root differs from this checkout; no configuration was changed")
            candidates.append((path, source, node))
    if len(candidates) != 1:
        raise ValueError(f"Expected one VETMECH HTTPS content server, found {len(candidates)}; no configuration was changed")
    return candidates[0]


def add_include(source, node, snippet):
    include = ["include", str(snippet)]
    if any(child.words == include for child in node.children):
        return source
    for child in walk(node):
        if child.words[:2] == ["location", "="] and child.words[2:3] in [["/robots.txt"], ["/sitemap.xml"]]:
            raise ValueError("Existing SEO locations require review; no configuration was changed")
    return source[:node.close] + f"\n    include {snippet};  # VETMECH SEO\n" + source[node.close:]


def atomic_write(path, content):
    old = path.stat() if path.exists() else None
    fd, tmp = tempfile.mkstemp(prefix=".vetmech-seo-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(content)
        os.chmod(tmp, old.st_mode & 0o777 if old else 0o644)
        if old:
            os.chown(tmp, old.st_uid, old.st_gid)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def install(config_path, original, updated, snippet, snippet_text, backup_root, run=subprocess.run):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_root / ("nginx-seo-" + stamp)
    backup.mkdir(mode=0o700, parents=True)
    shutil.copy2(config_path, backup / "site.conf")
    previous_snippet = snippet.read_text() if snippet.exists() else None
    if snippet.exists():
        shutil.copy2(snippet, backup / "seo-snippet.conf")
    (backup / "restore.txt").write_text(f"Site configuration: {config_path}\nSEO snippet: {snippet}\n")
    snippet.parent.mkdir(parents=True, exist_ok=True)
    try:
        atomic_write(snippet, snippet_text)
        atomic_write(config_path, updated)
        run(["nginx", "-t"], check=True, capture_output=True, text=True)
        run(["systemctl", "reload", "nginx"], check=True, capture_output=True, text=True)
    except Exception:
        atomic_write(config_path, original)
        if previous_snippet is None:
            snippet.unlink(missing_ok=True)
        else:
            atomic_write(snippet, previous_snippet)
        try:
            run(["nginx", "-t"], check=True, capture_output=True, text=True)
            run(["systemctl", "reload", "nginx"], check=True, capture_output=True, text=True)
        except Exception:
            raise RuntimeError(f"Previous nginx files restored, but validation/reload needs review. Backup: {backup}") from None
        raise RuntimeError(f"SEO activation failed; previous nginx configuration restored. Backup: {backup}") from None
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--domain", default="vetmechpharma.in")
    parser.add_argument("--app-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--backend-port", type=int, default=8010)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", args.domain) or not 1 <= args.backend_port <= 65535:
        parser.error("Provide a hostname and a valid backend port")
    if args.apply and os.geteuid() != 0:
        parser.error("Use sudo python3 scripts/install_nginx_seo.py --apply")
    app_dir = args.app_dir.resolve()
    if any(char in str(app_dir) for char in '\n\r"$;\\'):
        parser.error("Unsupported application directory")
    # nginx -T identifies only files in the active configuration, including symlinks.
    dump = subprocess.run(["nginx", "-T"], capture_output=True, text=True, check=True).stdout
    paths = {Path(path).resolve() for path in re.findall(r"^# configuration file (.+):$", dump, re.M)}
    configurations = {path: path.read_text() for path in sorted(paths)}
    path, source, node = choose_server(configurations, args.domain, app_dir / "frontend/build")
    snippet = Path("/etc/nginx/snippets") / (args.domain + "-vetmech-seo.conf")
    updated = add_include(source, node, snippet)
    template = (app_dir / "deploy/nginx-seo-locations.conf.template").read_text()
    snippet_text = template.replace("@BACKEND_PORT@", str(args.backend_port)).replace("@SITE_ORIGIN@", "https://" + args.domain).replace("@FRONTEND_ROOT@", str(app_dir / "frontend/build"))
    if updated == source and snippet.exists() and snippet.read_text() == snippet_text:
        print("VETMECH SEO routing is already installed; no changes needed.")
        return
    print(f"Target: {args.domain} HTTPS host in {path}\nSEO snippet: {snippet}")
    if not args.apply:
        print("Dry run only. Use --apply to back up, validate and reload this website's routing.")
        return
    backup = install(path, source, updated, snippet, snippet_text, Path("/opt/_backups"))
    print(f"nginx validation passed and routing reloaded. Backup: {backup}")
    print(f"Submit https://{args.domain}/sitemap.xml in Search Console and run URL Inspection on a real /products/ URL.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from None
