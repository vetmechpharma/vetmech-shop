import importlib.util
from pathlib import Path
import subprocess

import pytest

SPEC = importlib.util.spec_from_file_location("nginx_seo_installer", Path(__file__).parents[3] / "scripts/install_nginx_seo.py")
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)

HOST = """# Ignore a commented brace: }
server {
    listen 80;
    server_name vetmechpharma.in;
    return 301 https://vetmechpharma.in$request_uri;
}
server {
    listen [::]:443 ssl;
    server_name vetmechpharma.in www.vetmechpharma.in;
    ssl_certificate /etc/ssl/vetmech.pem;
    root /opt/vetmech-shop/frontend/build;
    location / { try_files $uri /index.html; }
    location /test { return 200 "{"; }
}
server {
    listen 443 ssl;
    server_name mr.vetmechpharma.in;
    location / { proxy_pass http://127.0.0.1:8001; }
}
"""


def test_only_the_existing_content_host_is_patched_and_insertion_is_idempotent():
    path, original, server = installer.choose_server({Path("site.conf"): HOST}, "vetmechpharma.in", Path("/opt/vetmech-shop/frontend/build"))
    snippet = Path("/etc/nginx/snippets/vetmechpharma.in-vetmech-seo.conf")
    changed = installer.add_include(original, server, snippet)
    assert changed.count(f"include {snippet};") == 1
    assert changed[:server.start] == original[:server.start]
    assert changed[changed.index('server {\n    listen 443 ssl;'):] == original[original.index('server {\n    listen 443 ssl;'):]
    _, _, updated_server = installer.choose_server({path: changed}, "vetmechpharma.in", Path("/opt/vetmech-shop/frontend/build"))
    assert installer.add_include(changed, updated_server, snippet) == changed


@pytest.mark.parametrize("source", [HOST.replace("www.vetmechpharma.in", "unrelated.example"),
                                    HOST.replace("/opt/vetmech-shop/frontend/build", "/var/www/another-app"),
                                    HOST + HOST])
def test_ambiguous_or_different_hosts_are_refused(source):
    with pytest.raises(ValueError):
        installer.choose_server({Path("site.conf"): source}, "vetmechpharma.in", Path("/opt/vetmech-shop/frontend/build"))


def test_invalid_nginx_activation_restores_original_files(tmp_path):
    config = tmp_path / "site.conf"
    snippet = tmp_path / "snippet.conf"
    config.write_text("original configuration")
    snippet.write_text("original snippet")
    calls = []

    def run(command, **kwargs):
        calls.append(command)
        if len(calls) == 1:
            raise subprocess.CalledProcessError(1, command)

    with pytest.raises(RuntimeError, match="previous nginx configuration restored"):
        installer.install(config, config.read_text(), "changed config", snippet, "changed snippet", tmp_path / "backups", run=run)
    assert config.read_text() == "original configuration"
    assert snippet.read_text() == "original snippet"
    assert calls == [["nginx", "-t"], ["nginx", "-t"], ["systemctl", "reload", "nginx"]]
    assert len(list((tmp_path / "backups").glob("*/site.conf"))) == 1
