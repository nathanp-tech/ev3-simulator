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


# ---------- fake Upstash Redis (REST /pipeline) ----------
DB, EXP = {}, {}
dblock = threading.Lock()


def run_cmd(c):
    op, a = c[0].upper(), c[1:]
    if op == 'GET':
        v = DB.get(a[0])
        return v if isinstance(v, str) else None
    if op == 'SET':
        DB[a[0]] = a[1]
        if len(a) > 3 and a[2].upper() == 'EX':
            EXP[a[0]] = int(a[3])
        return 'OK'
    if op == 'MGET':
        return [DB.get(k) if isinstance(DB.get(k), str) else None for k in a]
    if op == 'DEL':
        return sum(1 for k in a if DB.pop(k, None) is not None)
    if op == 'HSET':
        h = DB.setdefault(a[0], {})
        for i in range(1, len(a), 2):
            h[a[i]] = a[i + 1]
        return 1
    if op == 'HGET':
        return (DB.get(a[0]) or {}).get(a[1])
    if op == 'HGETALL':
        return [x for kv in (DB.get(a[0]) or {}).items() for x in kv]
    if op == 'HDEL':
        h = DB.get(a[0]) or {}
        return sum(1 for k in a[1:] if h.pop(k, None) is not None)
    return {'error': 'unknown command ' + op}


class RedisHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.headers.get('Authorization') != 'Bearer test-token':
            self.send_response(401); self.end_headers(); return
        cmds = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with dblock:
            out = []
            for c in cmds:
                r = run_cmd(c)
                out.append(r if isinstance(r, dict) and 'error' in r else {'result': r})
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
