"""Run Framecheck locally with Python 3 and no external packages."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen
from urllib.error import URLError
import json
import os
import subprocess
from functools import lru_cache
import sys
import webbrowser

ROOT = Path(__file__).resolve().parent
PORT = 4672

@lru_cache(maxsize=1)
def device_report():
    if os.name != "nt":
        return None
    try:
        script = (ROOT / "windows-profile.ps1").read_text(encoding="utf-8-sig")
        run = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                             capture_output=True, timeout=7, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        result = json.loads(run.stdout.decode("utf-8-sig"))
        return result if result.get("os") else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None

class Site(BaseHTTPRequestHandler):
    def respond(self, value, status=200, content_type="application/json; charset=utf-8"):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = urlsplit(self.path)
        host = self.headers.get("Host", "")
        if host not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            return self.respond({}, 403)
        if route.path == "/api/device":
            if self.headers.get("Sec-Fetch-Site") == "cross-site" or self.headers.get("Origin") not in (None, "http://"+host):
                return self.respond({}, 403)
            return self.respond(device_report())
        args = parse_qs(route.query)
        if route.path in ("/", "/index.html"):
            return self.respond((ROOT / "Framecheck.html").read_bytes(), content_type="text/html; charset=utf-8")
        if route.path == "/favicon.ico":
            return self.respond(b"", 204)
        if route.path == "/api/game":
            key = args.get("id", [""])[0]
            if not key.isascii() or not key.isdigit() or len(key) > 10:
                return self.respond({"code": "invalid"}, 400)
            endpoint, params = "appdetails", {"appids": key}
        elif route.path == "/api/search":
            key = args.get("q", [""])[0].strip()
            if not 1 <= len(key) <= 180:
                return self.respond({"code": "invalid"}, 400)
            endpoint, params = "storesearch", {"term": key}
        else:
            return self.respond({"code": "not_found"}, 404)
        params.update(l="english", cc="uz")
        url = "https://store.steampowered.com/api/" + endpoint + "/?" + urlencode(params)
        try:
            with urlopen(Request(url, headers={"Accept":"application/json"}), timeout=9) as res:
                payload = json.load(res)
            if endpoint == "storesearch":
                items = [{"name": item["name"], "id": int(item["id"])} for item in payload["items"][:14]]
                return self.respond({"items": items})
            record = payload.get(key, {})
            if not record.get("success"):
                return self.respond({"code":"not_found"}, 404)
            data = record["data"]
            if data.get("type") not in ("game", "demo"):
                return self.respond({"code":"not_game"}, 422)
            fields = ("steam_appid", "name", "pc_requirements", "mac_requirements", "linux_requirements", "genres", "platforms", "header_image", "release_date")
            return self.respond({field:data.get(field) for field in fields})
        except (URLError, TimeoutError, ValueError, TypeError, KeyError, OSError):
            return self.respond({"code":"steam_unavailable"}, 503)

if __name__ == "__main__":
    url = "http://127.0.0.1:" + str(PORT)
    with ThreadingHTTPServer(("127.0.0.1", PORT), Site) as server:
        print("Framecheck: " + url, flush=True)
        if "--open" in sys.argv:
            webbrowser.open(url)
        server.serve_forever()

