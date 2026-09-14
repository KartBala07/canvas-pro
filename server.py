import os, sys, socketserver, threading, webbrowser, json
import urllib.request, urllib.parse

import http.server

PORT_START = 8000
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(PROJECT_DIR)

def rewrite_pagelink(value, host):
    """Rewrite Canvas pagination Link header to point back at this proxy."""
    parts = []
    for link in value.split(","):
        link = link.strip()
        m = urllib.parse.urlsplit(link)
        if not m.path:
            continue
        # everything after the host (path?query) becomes the proxied path
        path = m.path
        if m.query:
            path += "?" + m.query
        proxied = "http://" + host + "/api/canvas?p=" + urllib.parse.quote(path, safe="")
        parts.append(f"<{proxied}>; {link.split('>')[1].strip()}" if ";" in link else f"<{proxied}>")
    return ", ".join(parts)

class Handler(http.server.SimpleHTTPRequestHandler):
    server_version = "CanvasPro/0.2"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=PROJECT_DIR, **kw)

    def end_headers(self):
        # Dev server: never cache, so updated JS always loads without hard refreshes.
        try:
            self.send_header("Cache-Control", "no-store")
        except Exception:
            pass
        super().end_headers()

    def log_message(self, fmt, *args):
        msg = fmt % args
        if "/api/canvas" not in msg:
            sys.stderr.write("  %s\n" % msg)

    # ---- Canvas API proxy (local only; token never leaves this machine) ----
    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(length) if length else None

    def do_CANVAS(self, method="GET", body=None):
        parsed = urllib.parse.urlsplit(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        canvas_path = qs.get("p", [""])[0]
        token = self.headers.get("X-Canvas-Token", "")
        base = self.headers.get("X-Canvas-Base", "").rstrip("/")

        if not canvas_path or not token or not base:
            self.send_error(400, "Missing p / X-Canvas-Token / X-Canvas-Base")
            return

        target = base + canvas_path
        headers = {"Authorization": "Bearer " + token}
        ct = self.headers.get("Content-Type")
        if ct:
            headers["Content-Type"] = ct
        req = urllib.request.Request(target, data=body, method=method, headers=headers)
        try:
            resp = urllib.request.urlopen(req, timeout=60)
        except urllib.error.HTTPError as e:
            body_resp = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body_resp)))
            self.end_headers()
            self.wfile.write(body_resp)
            return
        except Exception as e:
            self.send_error(502, "Proxy to Canvas failed: %s" % e)
            return

        body_out = resp.read()
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.headers.get_content_type() or "application/json")
        rel = resp.headers.get("Link")
        if rel:
            host = self.headers.get("Host", "localhost:" + str(PORT_START))
            self.send_header("Link", rewrite_pagelink(rel, host))
        self.send_header("Content-Length", str(len(body_out)))
        self.end_headers()
        self.wfile.write(body_out)

    # ---- file download passthrough (token-authenticated, streams bytes) ----
    def do_DL(self):
        parsed = urllib.parse.urlsplit(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        u = qs.get("u", [""])[0]
        token = self.headers.get("X-Canvas-Token", "")
        if not u or not token:
            self.send_error(400, "Missing u / X-Canvas-Token")
            return
        req = urllib.request.Request(u, headers={"Authorization": "Bearer " + token})
        try:
            resp = urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        except Exception as e:
            self.send_error(502, "File proxy failed: %s" % e)
            return
        data = resp.read()
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.headers.get_content_type() or "application/octet-stream")
        self.send_header("Content-Disposition", "inline")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/canvas") or self.path.startswith("/api/canvas?"):
            return self.do_CANVAS()
        if self.path.startswith("/api/dl?") or self.path.startswith("/api/dl"):
            return self.do_DL()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/canvas"):
            return self.do_CANVAS(method="POST", body=self._read_body())
        return super().do_POST()

    def do_PUT(self):
        if self.path.startswith("/api/canvas"):
            return self.do_CANVAS(method="PUT", body=self._read_body())
        return super().do_PUT()

    def do_DELETE(self):
        if self.path.startswith("/api/canvas"):
            return self.do_CANVAS(method="DELETE", body=self._read_body())
        return super().do_DELETE()

def pick_port():
    for port in range(PORT_START, PORT_START + 20):
        try:
            with socketserver.TCPServer(("0.0.0.0", port), Handler) as probe:
                pass
        except OSError:
            continue
        return port
    return None

def main():
    port = pick_port()
    if port is None:
        print("No free port found in 8000-8019. Close something and retry.")
        sys.exit(1)

    class ThreadingServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    httpd = ThreadingServer(("0.0.0.0", port), Handler)
    url = f"http://localhost:{port}"
    print(f"\nCanvas Pro is running at  {url}", flush=True)
    print("Keep this window open. Press Ctrl+C to stop.\n", flush=True)

    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()