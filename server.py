import os, sys, socketserver, threading, webbrowser, subprocess

import http.server

PORT_START = 8000
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(PROJECT_DIR)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=PROJECT_DIR, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

def pick_port():
    for port in range(PORT_START, PORT_START + 20):
        try:
            with socketserver.TCPServer(("0.0.0.0", port), QuietHandler) as probe:
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

    httpd = ThreadingServer(("0.0.0.0", port), QuietHandler)
    url = f"http://localhost:{port}"
    print(f"\nCanvas Pro is running at  {url}")
    print("Keep this window open. Press Ctrl+C to stop.\n")

    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()