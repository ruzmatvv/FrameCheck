"""Run Framecheck locally with Python 3 and no external packages."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen
from urllib.error import URLError
import json
import os
import re
import subprocess
import time
from functools import lru_cache
import sys
import webbrowser

ROOT = Path(__file__).resolve().parent
PORT = 4672
COVER_HOSTS = ("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/",
               "https://cdn.cloudflare.steamstatic.com/steam/apps/",
               "https://cdn.akamai.steamstatic.com/steam/apps/")

def fetch_image(url):
    try:
        with urlopen(Request(url), timeout=8) as res:
            kind = res.headers.get("Content-Type", "")
            if kind.startswith("image/"):
                return res.read(), kind
    except (URLError, TimeoutError, ValueError, OSError):
        pass
    return None

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
    def respond(self, value, status=200, content_type="application/json; charset=utf-8", cache="no-store"):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def prices(self, args):
        ids = list(dict.fromkeys(i for i in args.get("ids", [""])[0].split(",") if i))
        if not ids or len(ids) > 25 or not all(i.isascii() and i.isdigit() and len(i) <= 10 for i in ids):
            return self.respond({"code": "invalid"}, 400)
        language = "russian" if args.get("lang", [""])[0] == "ru" else "english"
        query = {"ids": [{"appid": int(i)} for i in ids], "context": {"language": language, "country_code": "UZ"},
                 "data_request": {"include_all_purchase_options": True, "include_release": True}}
        url = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?" + urlencode({"input_json": json.dumps(query, separators=(",", ":"))})
        try:
            with urlopen(Request(url, headers={"Accept": "application/json"}), timeout=12) as res:
                items = json.load(res)["response"]["store_items"]
            if not isinstance(items, list):
                raise ValueError
            return self.respond({"response": {"store_items": items}, "checkedAt": int(time.time() * 1000)})
        except (URLError, TimeoutError, ValueError, TypeError, KeyError, OSError):
            return self.respond({"code": "steam_unavailable"}, 503)

    def cover(self, key):
        """Game covers are proxied so they still show when the Steam CDN is blocked or slow."""
        if not key.isascii() or not key.isdigit() or len(key) > 10:
            return self.respond({"code": "invalid"}, 400)
        urls = [base + key + "/header.jpg" for base in COVER_HOSTS]
        for url in urls:
            image = fetch_image(url)
            if image:
                return self.respond(image[0], content_type=image[1], cache="public, max-age=604800")
        try:
            info = "https://store.steampowered.com/api/appdetails/?" + urlencode({"appids": key, "filters": "basic", "cc": "uz", "l": "english"})
            with urlopen(Request(info, headers={"Accept": "application/json"}), timeout=8) as res:
                address = json.load(res)[key]["data"]["header_image"]
            if isinstance(address, str) and re.match(r"^https://[\w.-]+\.steamstatic\.com/", address):
                image = fetch_image(address)
                if image:
                    return self.respond(image[0], content_type=image[1], cache="public, max-age=86400")
        except (URLError, TimeoutError, ValueError, TypeError, KeyError, OSError):
            pass
        return self.respond({"code": "not_found"}, 404)

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
        if route.path == "/api/prices":
            return self.prices(args)
        if route.path.startswith("/img/"):
            return self.cover(route.path[5:].removesuffix(".jpg"))
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

