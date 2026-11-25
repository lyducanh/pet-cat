"""Local dev server: serves the project folder, and accepts PUT uploads into assets/top/out/ only.

usage: python tools/devserver.py [port]
"""
import http.server, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'top', 'out')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_PUT(self):
        name = os.path.basename(self.path.split('?')[0])
        if not name or not self.path.startswith('/assets/top/out/'):
            self.send_error(403, 'uploads only allowed into /assets/top/out/')
            return
        os.makedirs(OUT, exist_ok=True)
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(data)
        self.send_response(201)
        self.end_headers()
        self.wfile.write(b'ok')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
