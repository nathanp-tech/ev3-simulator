#!/usr/bin/env python3
"""Runs the app like on Vercel, on this computer, to test api/index.py before deploying.

    python3 tests/vercel_local.py [port]

- static files served like Vercel (files listed in .vercelignore are not served)
- /api/* rewritten to api/index.py (same rule as vercel.json)
- an in-memory stand-in for the Upstash Redis REST API (nothing is written to disk)
Teacher code: 123456.
"""
import http.server, importlib.util, json, os, socketserver, sys, threading, time
from fnmatch import fnmatch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
REDIS_PORT = PORT + 1


# ---------- fake Upstash Redis (REST /pipeline), using the in-memory store of api/_core.py ----------
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _core import MemStore  # noqa: E402
MEM = MemStore()


class RedisHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.headers.get('Authorization') != 'Bearer test-token':
            self.send_response(401); self.end_headers(); return
        cmds = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        out = [r if isinstance(r, dict) and 'error' in r else {'result': r} for r in MEM.run(cmds)]
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# ---------- the Vercel API ----------
os.environ.update({'KV_REST_API_URL': f'http://127.0.0.1:{REDIS_PORT}', 'KV_REST_API_TOKEN': 'test-token'})
os.environ.setdefault('TEACHER_CODE', '123456')
spec = importlib.util.spec_from_file_location('vercel_api', os.path.join(ROOT, 'api', 'index.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
IGNORED = [l.strip() for l in open(os.path.join(ROOT, '.vercelignore')) if l.strip() and not l.startswith('#')]


class Site(api.handler, http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        http.server.SimpleHTTPRequestHandler.__init__(self, *a, directory=ROOT, **kw)

    def _rewrite(self):
        path, _, query = self.path.partition('?')
        if path.startswith('/api/') and path != '/api/index':
            self.path = '/api/index?route=' + path[len('/api/'):] + ('&' + query if query else '')
            return True
        return False

    def do_GET(self):
        if self._rewrite():
            return api.handler.do_GET(self)
        rel = self.path.split('?')[0].lstrip('/')
        if rel.startswith('api/') or any(fnmatch(rel, p.rstrip('/')) or rel.startswith(p.rstrip('/') + '/') for p in IGNORED):
            self.send_error(404)
            return
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        self._rewrite()
        return api.handler.do_POST(self)


if __name__ == '__main__':
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    rs = socketserver.ThreadingTCPServer(('127.0.0.1', REDIS_PORT), RedisHandler)
    threading.Thread(target=rs.serve_forever, daemon=True).start()
    with socketserver.ThreadingTCPServer(('', PORT), Site) as httpd:
        print(f'Vercel-like test server: http://localhost:{PORT}/  (teacher code 123456)', flush=True)
        httpd.serve_forever()
