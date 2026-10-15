"""EV3 Simulator API for Vercel (serverless).

Same endpoints as server.py, but the data is kept in an Upstash Redis database instead of the data/ folder
(Vercel has no permanent disk). Only the Python standard library is used.

Environment variables (Vercel project settings):
  KV_REST_API_URL / KV_REST_API_TOKEN   added automatically when the Upstash Redis database is connected
                                        (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN also work)
  TEACHER_CODE                          code asked by the teacher dashboard (always needed online)

Redis keys (prefix ev3:):
  snap    hash  student id -> progress snapshot without programs (live dashboard)
  work:ID       full work of a student (programs included)
  st:ID         {"validated": [...], "rev": n, "deleted": bool}: what the student's browser polls
  settings      class settings
  archive:DATE  copy of everything before a delete / reset (kept 180 days)
"""
from http.server import BaseHTTPRequestHandler
import json, os, re, time, unicodedata, urllib.request
from urllib.parse import unquote_plus

P = 'ev3:'
DEFAULT_SETTINGS = {'passScore': 80, 'saveReminderMinutes': 20, 'allowGuided': True, 'allowFree': True, 'allowFLL': True}
# Online, the browsers talk to the server less often than in class on the local server (database quotas).
HOSTED_SYNC = {'syncPushSeconds': 8, 'syncHeartbeatSeconds': 30, 'syncPollSeconds': 10}
ID = re.compile(r'[\w-]{4,64}')


# ---------- Upstash Redis (REST API) ----------
def _redis_conf():
    url = os.environ.get('KV_REST_API_URL') or os.environ.get('UPSTASH_REDIS_REST_URL')
    token = os.environ.get('KV_REST_API_TOKEN') or os.environ.get('UPSTASH_REDIS_REST_TOKEN')
    if not url or not token:
        raise RuntimeError('No database: connect an Upstash Redis database to this Vercel project.')
    return url.rstrip('/'), token


def redis(*cmds):
    """Runs one or several Redis commands in one request (pipeline). Returns the list of results."""
    url, token = _redis_conf()
    req = urllib.request.Request(url + '/pipeline', data=json.dumps([list(map(str, c)) for c in cmds]).encode(),
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        out = json.loads(r.read())
    for o in out:
        if 'error' in o:
            raise RuntimeError('database error: ' + o['error'])
    return [o.get('result') for o in out]


def jload(s, default=None):
    try:
        return json.loads(s) if s else default
    except ValueError:
        return default


def hash_dict(flat):
    """HGETALL result [k1, v1, k2, v2…] -> {k: parsed value}."""
    flat = flat or []
    return {flat[i]: jload(flat[i + 1]) for i in range(0, len(flat), 2)}


def status(sid):
    return jload(redis(['GET', P + 'st:' + sid])[0], {}) or {}


def set_status(sid, st):
    return ['SET', P + 'st:' + sid, json.dumps(st)]


# ---------- helpers (same as server.py) ----------
def strip_programs(data):
    snap = dict(data)
    snap['challenges'] = {k: {kk: vv for kk, vv in v.items() if kk not in ('program', 'robot')} for k, v in (data.get('challenges') or {}).items()}
    free = dict(data.get('free') or {})
    free.pop('program', None)
    free.pop('robot', None)
    snap['free'] = free
    if data.get('fll'):
        snap['fll'] = {k: v for k, v in data['fll'].items() if k not in ('program', 'robot')}
    snap['events'] = (data.get('events') or [])[-60:]
    return snap


def norm(s):
    # "Léa " == "lea": ignore accents, case and extra spaces.
    s = unicodedata.normalize('NFD', str(s or ''))
    return ' '.join(''.join(c for c in s if not unicodedata.combining(c)).split()).casefold()


def validated_count(s):
    return sum(1 for c in (s.get('challenges') or {}).values() if c.get('status') == 'validated')


def load_settings():
    return {**DEFAULT_SETTINGS, **(jload(redis(['GET', P + 'settings'])[0], {}) or {}), **HOSTED_SYNC}


def archive(reason):
    """Copies all student data into one archive key before a destructive action."""
    snaps = hash_dict(redis(['HGETALL', P + 'snap'])[0])
    keys = [P + 'work:' + sid for sid in snaps]
    works = [jload(w) for w in (redis(['MGET', *keys])[0] if keys else [])]
    name = time.strftime('%Y-%m-%d_%H%M%S') + '_' + reason
    redis(['SET', P + 'archive:' + name, json.dumps({'students': snaps, 'works': [w for w in works if w]}), 'EX', 180 * 86400])
    return 'database archive ' + name


def remove_cmds(sid):
    return [['HDEL', P + 'snap', sid], ['DEL', P + 'work:' + sid], set_status(sid, {'deleted': True})]


class handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _route(self):
        path, _, query = self.path.partition('?')
        params = {k: unquote_plus(v) for k, v in (p.split('=', 1) for p in query.split('&') if '=' in p)}
        # vercel.json rewrites /api/xyz to /api/index?route=xyz
        if path.rstrip('/') in ('/api/index', '/api/index.py') and 'route' in params:
            path = '/api/' + params.pop('route')
        return path.rstrip('/') or '/', params

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 4_000_000:
            raise ValueError('too large')
        return json.loads(self.rfile.read(n) or b'{}')

    def _teacher(self, params=None):
        expected = os.environ.get('TEACHER_CODE', '').strip()
        code = (self.headers.get('X-Teacher-Code') or (params or {}).get('code', '')).strip()
        return bool(expected) and code == expected

    def do_GET(self):
        try:
            self._get()
        except Exception as e:  # noqa: BLE001 - always answer in JSON
            self._json({'error': str(e)}, 500)

    def do_POST(self):
        try:
            self._post()
        except Exception as e:  # noqa: BLE001
            self._json({'error': str(e)}, 500)

    def _get(self):
        path, params = self._route()
        if path == '/api/ping':
            return self._json({'ok': True, 'time': time.time()})
        if path == '/api/info':
            host = self.headers.get('X-Forwarded-Host') or self.headers.get('Host') or ''
            return self._json({'ips': [], 'host': None, 'port': None, 'hosted': True, 'publicUrl': f'https://{host}/' if host else None,
                               'needsCode': True, 'teacher': self._teacher(params), 'codeConfigured': bool(os.environ.get('TEACHER_CODE', '').strip())})
        if path == '/api/progress':
            if not self._teacher(params):
                return self._json({'error': 'teacher code required'}, 403)
            return self._json({'students': list(hash_dict(redis(['HGETALL', P + 'snap'])[0]).values()), 'now': time.time()})
        if path in ('/api/work/find', '/api/names'):
            snaps = [s for s in hash_dict(redis(['HGETALL', P + 'snap'])[0]).values() if s]
            if path == '/api/work/find':
                # The first name is the only identifier (accents, case and spaces ignored).
                name = norm(params.get('name', ''))
                found = sorted((s for s in snaps if norm(s.get('name')) == name), key=lambda s: s.get('updatedAt', ''), reverse=True)
                return self._json({'matches': [{'studentId': s['studentId'], 'name': s.get('name'), 'className': s.get('className'), 'mode': s.get('mode'),
                                                'updatedAt': s.get('updatedAt'), 'current': s.get('current'), 'validated': validated_count(s)} for s in found]})
            prefix = norm(params.get('prefix', ''))
            if not prefix:
                return self._json({'names': []})
            names = {}
            for s in sorted((s for s in snaps if norm(s.get('name')).startswith(prefix)), key=lambda s: s.get('updatedAt', '')):
                names[norm(s.get('name'))] = {'name': s.get('name'), 'mode': s.get('mode'), 'validated': validated_count(s)}
            return self._json({'names': sorted(names.values(), key=lambda n: norm(n['name']))[:8]})
        m = re.fullmatch(r'/api/work/([\w-]+)', path)
        if m:
            w = jload(redis(['GET', P + 'work:' + m.group(1)])[0])
            return self._json(w) if w else self._json({'error': 'not found'}, 404)
        m = re.fullmatch(r'/api/student/([\w-]+)', path)
        if m:
            st = status(m.group(1))
            return self._json({'validated': st.get('validated', []), 'rev': st.get('rev', 0), 'deleted': bool(st.get('deleted'))})
        if path == '/api/settings':
            return self._json(load_settings())
        if path == '/api/admin/backup':
            if not self._teacher(params):
                return self._json({'error': 'teacher code required'}, 403)
            snaps = hash_dict(redis(['HGETALL', P + 'snap'])[0])
            keys = [P + 'work:' + sid for sid in sorted(snaps)]
            works = [jload(w) for w in (redis(['MGET', *keys])[0] if keys else [])]
            return self._json({'type': 'ev3-class-backup', 'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'works': [w for w in works if w]})
        return self._json({'error': 'not found'}, 404)

    def _post(self):
        path, _ = self._route()
        try:
            data = self._body()
        except ValueError:
            return self._json({'error': 'bad request'}, 400)
        if path in ('/api/progress', '/api/work'):
            sid = str(data.get('studentId', ''))
            if not ID.fullmatch(sid):
                return self._json({'error': 'bad id'}, 400)
            st = status(sid)
            if st.get('deleted'):
                return self._json({'error': 'deleted by the teacher', 'deleted': True}, 410)
            if int(data.get('adminRev') or 0) < st.get('rev', 0):
                return self._json({'error': 'changed by the teacher', 'rev': st.get('rev', 0)}, 409)
            snap = strip_programs(data)
            snap['receivedAt'] = time.time()
            cmds = [['HSET', P + 'snap', sid, json.dumps(snap)]]
            if path == '/api/work':
                cmds.append(['SET', P + 'work:' + sid, json.dumps({k: v for k, v in data.items() if k != 'live'})])
            redis(*cmds)
            # The answer also carries what the poll would say: the browser can skip a request.
            return self._json({'ok': True, 'savedAt': time.time(), 'validated': st.get('validated', []), 'rev': st.get('rev', 0)})
        if path in ('/api/validate', '/api/forget'):
            if not self._teacher(data):
                return self._json({'error': 'teacher code required'}, 403)
            sid = str(data.get('studentId'))
            if path == '/api/validate':
                st = status(sid)
                st['validated'] = sorted(set(st.get('validated', [])) | {str(data.get('challengeId'))})
                redis(set_status(sid, st))
            else:
                st = status(sid)
                st.pop('validated', None)
                redis(['HDEL', P + 'snap', sid], set_status(sid, st))
            return self._json({'ok': True})
        if path == '/api/settings':
            if not self._teacher(data):
                return self._json({'error': 'teacher code required'}, 403)
            cur = {**DEFAULT_SETTINGS, **(jload(redis(['GET', P + 'settings'])[0], {}) or {})}
            new = {**cur, **{k: data[k] for k in DEFAULT_SETTINGS if k in data}}
            redis(['SET', P + 'settings', json.dumps(new)])
            return self._json({**new, **HOSTED_SYNC})
        if path == '/api/admin':
            if not self._teacher(data):
                return self._json({'error': 'teacher code required'}, 403)
            action = data.get('action')
            if action == 'put-work':
                # The teacher changed a student's work (rename, class, unlock, reset): new revision, the student's browser reloads it.
                work = data.get('work') or {}
                sid = str(work.get('studentId', ''))
                st = status(sid) if ID.fullmatch(sid) else {'deleted': True}
                if st.get('deleted'):
                    return self._json({'error': 'bad student'}, 400)
                rev = st.get('rev', 0) + 1
                work['adminRev'] = rev
                old = jload(redis(['HGET', P + 'snap', sid])[0], {}) or {}
                snap = strip_programs(work)
                snap['receivedAt'] = old.get('receivedAt', 0)
                snap['live'] = old.get('live')
                redis(['SET', P + 'work:' + sid, json.dumps(work)], ['HSET', P + 'snap', sid, json.dumps(snap)], set_status(sid, {'rev': rev}))
                return self._json({'ok': True, 'rev': rev})
            if action == 'delete':
                ids = [str(i) for i in data.get('studentIds') or [] if ID.fullmatch(str(i))]
                dest = archive('deleted')
                cmds = [c for sid in ids for c in remove_cmds(sid)]
                if cmds:
                    redis(*cmds)
                return self._json({'ok': True, 'archive': dest})
            if action == 'restore':
                cmds, restored = [], 0
                works = [w for w in data.get('works') or [] if ID.fullmatch(str(w.get('studentId', ''))) and w.get('type') == 'ev3-progress']
                sts = redis(*[['GET', P + 'st:' + w['studentId']] for w in works]) if works else []
                for work, raw in zip(works, sts):
                    sid = work['studentId']
                    st = jload(raw, {}) or {}
                    rev = max(st.get('rev', 0), int(work.get('adminRev') or 0)) + 1
                    work['adminRev'] = rev
                    snap = strip_programs(work)
                    snap['receivedAt'] = 0
                    cmds += [['SET', P + 'work:' + sid, json.dumps(work)], ['HSET', P + 'snap', sid, json.dumps(snap)], set_status(sid, {'rev': rev})]
                    restored += 1
                for i in range(0, len(cmds), 60):
                    redis(*cmds[i:i + 60])
                return self._json({'ok': True, 'restored': restored})
            if action == 'reset-all':
                dest = archive('reset')
                sids = list(hash_dict(redis(['HGETALL', P + 'snap'])[0]).keys())
                cmds = [c for sid in sids for c in remove_cmds(sid)]
                for i in range(0, len(cmds), 60):
                    redis(*cmds[i:i + 60])
                return self._json({'ok': True, 'archive': dest})
            return self._json({'error': 'unknown action'}, 400)
        return self._json({'error': 'not found'}, 404)
