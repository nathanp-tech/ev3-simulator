"""EV3 Simulator class API: shared by server.py (class server on the teacher's computer) and api/index.py (Vercel).

All the data goes through a small key-value store that speaks a subset of the Redis commands:
- RedisStore: Upstash Redis (REST API), online on Vercel
- FileStore:  the same commands kept in memory and saved in data/db/ on the teacher's computer

Keys (prefix ev3:):
  snap            hash   student id -> progress snapshot without programs (live dashboard)
  work:ID                full work of a student (programs included)
  st:ID                  what the student's browser polls: validated, rev, deleted, helpDone, notesRev
  hist:ID         hash   slot -> compressed list of program versions (history)
  notes:ID               teacher comments on the student's blocks
  help            hash   student id -> help request
  roster                 class lists {class: [names]}
  classctl        hash   class -> {message, paused, closed, exam}
  exams           hash   exam id -> exam
  examres:EXAM    hash   student id -> exam result
  settings               class settings
  backup:DATE            compressed daily backup (30 days), index in "backups"
  archive:NAME           copy of everything before a delete / reset (180 days)
  stats:YYYY-MM   hash   day -> number of database commands (quota gauge, online only)
"""
import base64, json, os, random, re, threading, time, unicodedata, urllib.parse, urllib.request, zlib

P = 'ev3:'
ID = re.compile(r'[\w-]{4,64}')
SLOT = re.compile(r'[\w-]{1,40}')
DEFAULT_SETTINGS = {'passScore': 80, 'saveReminderMinutes': 20, 'allowGuided': True, 'allowFree': True, 'allowFLL': True, 'dbQuota': 500000}
# Online, browsers talk to the server less often than with the class server (database quotas).
HOSTED_SYNC = {'syncPushSeconds': 8, 'syncHeartbeatSeconds': 20, 'syncPollSeconds': 8}
HISTORY_MAX = 25        # program versions kept per student and per program
BACKUP_DAYS = 30
EXAM_GRACE = 90         # seconds after the end of an exam during which results are still accepted


# ---------- Stores ----------
class MemStore:
    """In-memory store understanding the Redis commands used here (also used by the local tests)."""

    def __init__(self):
        self.data, self.exp = {}, {}
        self.lock = threading.RLock()
        self.changed = set()

    def _alive(self, k):
        e = self.exp.get(k)
        if e and e < time.time():
            self.data.pop(k, None)
            self.exp.pop(k, None)
            self.changed.add(k)
        return k in self.data

    def _touch(self, k):
        self.changed.add(k)

    def run(self, cmds):
        with self.lock:
            return [self.cmd([str(x) for x in c]) for c in cmds]

    def cmd(self, c):
        op, a = c[0].upper(), c[1:]
        if op == 'GET':
            return self.data[a[0]] if self._alive(a[0]) and isinstance(self.data[a[0]], str) else None
        if op == 'SET':
            self.data[a[0]] = a[1]
            self.exp.pop(a[0], None)
            if len(a) > 3 and a[2].upper() == 'EX':
                self.exp[a[0]] = time.time() + int(a[3])
            self._touch(a[0])
            return 'OK'
        if op == 'MGET':
            return [self.data[k] if self._alive(k) and isinstance(self.data[k], str) else None for k in a]
        if op == 'DEL':
            n = 0
            for k in a:
                if self.data.pop(k, None) is not None:
                    n += 1
                    self.exp.pop(k, None)
                    self._touch(k)
            return n
        if op == 'EXISTS':
            return sum(1 for k in a if self._alive(k))
        if op == 'EXPIRE':
            if self._alive(a[0]):
                self.exp[a[0]] = time.time() + int(a[1])
                self._touch(a[0])
                return 1
            return 0
        if op in ('HSET', 'HGET', 'HGETALL', 'HDEL', 'HINCRBY'):
            h = self.data.get(a[0]) if self._alive(a[0]) else None
            if op == 'HGET':
                return (h or {}).get(a[1])
            if op == 'HGETALL':
                return [x for kv in (h or {}).items() for x in kv]
            if op == 'HDEL':
                n = sum(1 for f in a[1:] if h and h.pop(f, None) is not None)
                if n:
                    self._touch(a[0])
                return n
            h = self.data.setdefault(a[0], {})
            self._touch(a[0])
            if op == 'HSET':
                for i in range(1, len(a), 2):
                    h[a[i]] = a[i + 1]
                return 1
            h[a[1]] = str(int(h.get(a[1], 0)) + int(a[2]))
            return int(h[a[1]])
        if op in ('RPUSH', 'LRANGE', 'LTRIM'):
            l = self.data.get(a[0]) if self._alive(a[0]) else None
            if op == 'LRANGE':
                l = l or []
                s, e = int(a[1]), int(a[2])
                e = len(l) - 1 if e == -1 else e
                return l[s if s >= 0 else max(0, len(l) + s):e + 1]
            if op == 'RPUSH':
                l = self.data.setdefault(a[0], [])
                l.extend(a[1:])
                self._touch(a[0])
                return len(l)
            if l is not None:
                s = int(a[1])
                self.data[a[0]] = l[s:] if s < 0 else l[s:int(a[2]) + 1 if a[2] != '-1' else None]
                self._touch(a[0])
            return 'OK'
        return {'error': 'unknown command ' + op}


class FileStore(MemStore):
    """MemStore saved in a folder (one file per key), written at most once per second."""

    def __init__(self, folder):
        super().__init__()
        self.folder = folder
        os.makedirs(folder, exist_ok=True)
        for name in os.listdir(folder):
            if name.endswith('.json'):
                try:
                    rec = json.load(open(os.path.join(folder, name), encoding='utf-8'))
                    k = urllib.parse.unquote(name[:-5])
                    self.data[k] = rec['v']
                    if rec.get('exp'):
                        self.exp[k] = rec['exp']
                except (OSError, ValueError, KeyError):
                    pass
        self.changed = set()
        threading.Thread(target=self._loop, daemon=True).start()

    def _path(self, k):
        return os.path.join(self.folder, urllib.parse.quote(k, safe='') + '.json')

    def flush(self):
        with self.lock:
            todo = {k: (self.data.get(k), self.exp.get(k)) for k in self.changed}
            self.changed = set()
        for k, (v, e) in todo.items():
            p = self._path(k)
            if v is None:
                if os.path.exists(p):
                    os.remove(p)
                continue
            tmp = p + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump({'v': v, 'exp': e}, f)
            os.replace(tmp, p)

    def _loop(self):
        while True:
            time.sleep(1)
            try:
                self.flush()
            except OSError:
                pass


class RedisStore:
    """Upstash Redis through its REST API. Also counts the commands (quota gauge)."""

    def __init__(self, url, token):
        self.url, self.token = url.rstrip('/'), token
        self.pending, self.flushed = 0, time.time()

    def run(self, cmds):
        cmds = [[str(x) for x in c] for c in cmds]
        # The usage counter is written at most every 30 s (it costs one command itself).
        self.pending += len(cmds)
        count = time.time() - self.flushed > 30 or self.pending > 200
        if count:
            day = time.strftime('%Y-%m-%d', time.gmtime())
            cmds.append(['HINCRBY', P + 'stats:' + day[:7], day, self.pending + 1])
            self.pending, self.flushed = 0, time.time()
        req = urllib.request.Request(self.url + '/pipeline', data=json.dumps(cmds).encode(),
                                     headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=20) as r:
            out = json.loads(r.read())
        for o in out:
            if isinstance(o, dict) and 'error' in o:
                raise RuntimeError('database error: ' + o['error'])
        res = [o.get('result') for o in out]
        return res[:-1] if count else res


def migrate_legacy(store, data_dir):
    """Imports the data of the former class server (data/progress.json, data/work/) into an empty store."""
    if store.run([['EXISTS', P + 'snap', P + 'settings']])[0]:
        return 0
    cmds, n = [], 0
    try:
        saved = json.load(open(os.path.join(data_dir, 'progress.json'), encoding='utf-8'))
    except (OSError, ValueError):
        saved = {}
    for sid, snap in (saved.get('students') or {}).items():
        cmds.append(['HSET', P + 'snap', sid, json.dumps(snap)])
    sts = {}
    for sid, v in (saved.get('validations') or {}).items():
        sts.setdefault(sid, {})['validated'] = sorted(v)
    for sid, r in (saved.get('revs') or {}).items():
        sts.setdefault(sid, {})['rev'] = r
    for sid in saved.get('tombstones') or []:
        sts[sid] = {'deleted': True}
    for sid, st in sts.items():
        cmds.append(['SET', P + 'st:' + sid, json.dumps(st)])
    work_dir = os.path.join(data_dir, 'work')
    if os.path.isdir(work_dir):
        for name in os.listdir(work_dir):
            if name.endswith('.json'):
                try:
                    cmds.append(['SET', P + 'work:' + name[:-5], open(os.path.join(work_dir, name), encoding='utf-8').read()])
                    n += 1
                except OSError:
                    pass
    try:
        cmds.append(['SET', P + 'settings', json.dumps(json.load(open(os.path.join(data_dir, 'settings.json'), encoding='utf-8')))])
    except (OSError, ValueError):
        pass
    if cmds:
        store.run(cmds)
    return n


# ---------- helpers ----------
def jload(s, default=None):
    try:
        return json.loads(s) if s else default
    except (TypeError, ValueError):
        return default


def pack(obj):
    return base64.b64encode(zlib.compress(json.dumps(obj).encode('utf-8'), 6)).decode('ascii')


def unpack(s, default=None):
    try:
        return json.loads(zlib.decompress(base64.b64decode(s)).decode('utf-8')) if s else default
    except (ValueError, zlib.error, TypeError):
        return default


def hash_dict(flat):
    flat = flat or []
    return {flat[i]: jload(flat[i + 1]) for i in range(0, len(flat), 2)}


def norm(s):
    # "Léa " == "lea": ignore accents, case and extra spaces.
    s = unicodedata.normalize('NFD', str(s or ''))
    return ' '.join(''.join(c for c in s if not unicodedata.combining(c)).split()).casefold()


def strip_programs(data):
    snap = dict(data)
    snap['challenges'] = {k: {kk: vv for kk, vv in v.items() if kk not in ('program', 'robot')} for k, v in (data.get('challenges') or {}).items()}
    free = dict(data.get('free') or {})
    free.pop('program', None)
    free.pop('robot', None)
    snap['free'] = free
    if data.get('fll'):
        snap['fll'] = {k: v for k, v in data['fll'].items() if k not in ('program', 'robot')}
    snap.pop('exams', None)
    snap['events'] = (data.get('events') or [])[-60:]
    return snap


def validated_count(s):
    return sum(1 for c in (s.get('challenges') or {}).values() if c.get('status') == 'validated')


def clean_text(s, n=500):
    return str(s or '').strip()[:n]


class Api:
    def __init__(self, store, teacher_code, hosted=False):
        self.store, self.teacher_code, self.hosted = store, teacher_code, hosted
        self.backup_checked = ''

    # small wrappers
    def r(self, *cmds):
        return self.store.run(list(cmds))

    def get_json(self, key, default=None):
        return jload(self.r(['GET', P + key])[0], default)

    def status(self, sid):
        return jload(self.r(['GET', P + 'st:' + sid])[0], {}) or {}

    def update_status(self, sid, **changes):
        st = self.status(sid)
        st.update(changes)
        self.r(['SET', P + 'st:' + sid, json.dumps(st)])
        return st

    def settings(self, teacher=False):
        raw = self.get_json('settings', {}) or {}
        s = {**DEFAULT_SETTINGS, **{k: v for k, v in raw.items() if k != 'studentCode'}}
        if teacher:
            s['studentCode'] = self.student_code()
        return {**s, **HOSTED_SYNC} if self.hosted else s

    # Class code: students need it (link / QR code of the dashboard, or typed once) to use the app.
    # Online, one is created automatically; the teacher can change it or remove it (empty = open).
    def student_code(self):
        raw = self.get_json('settings', {}) or {}
        if 'studentCode' not in raw and self.hosted:
            raw['studentCode'] = ''.join(random.choice('23456789') for _ in range(6))
            self.r(['SET', P + 'settings', json.dumps(raw)])
        return str(raw.get('studentCode') or '')

    def is_student(self, ctx, params, body=None):
        if ctx.get('local') or self.is_teacher(ctx, params, body):
            return True
        code = self.student_code()
        given = str(ctx['headers'].get('X-Class-Code') or (params or {}).get('c') or (body or {}).get('classCode') or '').strip()
        return not code or given == code

    def snaps(self):
        return hash_dict(self.r(['HGETALL', P + 'snap'])[0])

    def all_works(self, sids):
        keys = [P + 'work:' + sid for sid in sids]
        return [w for w in (jload(x) for x in (self.r(['MGET', *keys])[0] if keys else [])) if w]

    # ---------- backups ----------
    def make_backup(self, force=False):
        day = time.strftime('%Y-%m-%d')
        if not force and self.backup_checked == day:
            return None
        self.backup_checked = day
        if not force and self.r(['EXISTS', P + 'backup:' + day])[0]:
            return None
        snaps = self.snaps()
        body = {'type': 'ev3-class-backup', 'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'works': self.all_works(sorted(snaps)),
                'roster': self.get_json('roster'), 'settings': self.get_json('settings')}
        packed = pack(body)
        index = [b for b in (jload(x) for x in self.r(['LRANGE', P + 'backups', 0, -1])[0] or []) if b and b.get('date') != day]
        index = (index + [{'date': day, 'students': len(body['works']), 'size': len(json.dumps(body)), 'packed': len(packed), 'at': body['exportedAt']}])[-BACKUP_DAYS:]
        self.r(['SET', P + 'backup:' + day, packed, 'EX', (BACKUP_DAYS + 1) * 86400], ['DEL', P + 'backups'],
               ['RPUSH', P + 'backups', *[json.dumps(b) for b in index]])
        return day

    def archive(self, reason):
        snaps = self.snaps()
        name = time.strftime('%Y-%m-%d_%H%M%S') + '_' + reason
        self.r(['SET', P + 'archive:' + name, pack({'students': snaps, 'works': self.all_works(snaps)}), 'EX', 180 * 86400])
        return 'archive ' + name

    def remove_cmds(self, sid):
        return [['HDEL', P + 'snap', sid], ['DEL', P + 'work:' + sid, P + 'hist:' + sid, P + 'notes:' + sid], ['HDEL', P + 'help', sid],
                ['SET', P + 'st:' + sid, json.dumps({'deleted': True})]]

    def roster(self):
        r = self.get_json('roster')
        if r is None:
            try:
                r = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_roster.json'), encoding='utf-8'))
            except (OSError, ValueError):
                r = {}
        return r

    # ---------- request handling ----------
    def is_teacher(self, ctx, params, body=None):
        code = str(ctx['headers'].get('X-Teacher-Code') or (params or {}).get('code') or (body or {}).get('code') or '').strip()
        return ctx.get('local') or code == self.teacher_code

    def handle(self, method, path, params, body, ctx):
        """Returns (http status, json object)."""
        try:
            if method == 'GET':
                return self.get(path, params, ctx)
            return self.post(path, body, ctx)
        except Exception as e:  # noqa: BLE001 - always answer in JSON
            return 500, {'error': str(e)}

    def get(self, path, params, ctx):
        teacher = self.is_teacher(ctx, params)
        if path == '/api/ping':
            return 200, {'ok': True, 'time': time.time()}
        if path == '/api/info':
            code = str(params.get('code', '')).strip()
            info = {**ctx.get('info', {}), 'hosted': self.hosted, 'needsCode': not ctx.get('local'), 'teacher': teacher,
                    'passwordOk': code == self.teacher_code, 'codeConfigured': True, 'studentCodeRequired': bool(self.student_code()) and not ctx.get('local')}
            if teacher:
                info['studentCode'] = self.student_code()
            return 200, info
        if path == '/api/settings':
            return 200, self.settings(teacher)
        if path == '/api/join':
            return 200, {'ok': self.is_student(ctx, params)}
        # ----- students of the class (class code) -----
        if not self.is_student(ctx, params):
            return 401, {'error': 'class code required', 'needCode': True}
        if path == '/api/roster':
            return 200, {'roster': self.roster()}
        if path == '/api/classctl':
            # public: what the welcome page needs (closed classes, running exams)
            ctl = hash_dict(self.r(['HGETALL', P + 'classctl'])[0])
            return 200, {'classes': {c: {'closed': bool(v.get('closed')), 'paused': bool(v.get('paused')), 'exam': bool((v.get('exam') or {}).get('active'))}
                                     for c, v in ctl.items() if v}, 'now': time.time()}
        if path == '/api/work/find' or path == '/api/names':
            snaps = [s for s in self.snaps().values() if s]
            if path == '/api/work/find':
                # A student = class + first name (accents, case and spaces ignored). Old work without a class still matches.
                name, cls = norm(params.get('name', '')), norm(params.get('className', ''))
                found = sorted((s for s in snaps if norm(s.get('name')) == name and (not cls or norm(s.get('className')) in ('', cls))),
                               key=lambda s: s.get('updatedAt', ''), reverse=True)
                return 200, {'matches': [{'studentId': s['studentId'], 'name': s.get('name'), 'className': s.get('className'), 'mode': s.get('mode'),
                                          'updatedAt': s.get('updatedAt'), 'current': s.get('current'), 'validated': validated_count(s)} for s in found]}
            prefix = norm(params.get('prefix', ''))
            names = {}
            for s in sorted((s for s in snaps if prefix and norm(s.get('name')).startswith(prefix)), key=lambda s: s.get('updatedAt', '')):
                names[norm(s.get('name'))] = {'name': s.get('name'), 'mode': s.get('mode'), 'validated': validated_count(s)}
            return 200, {'names': sorted(names.values(), key=lambda n: norm(n['name']))[:8]}
        m = re.fullmatch(r'/api/work/([\w-]+)', path)
        if m:
            w = self.get_json('work:' + m.group(1))
            return (200, w) if w else (404, {'error': 'not found'})
        m = re.fullmatch(r'/api/student/([\w-]+)', path)
        if m:
            # Polled by the student's browser: teacher decisions + class controls (message, pause, closed, exam).
            sid, cls = m.group(1), str(params.get('className', ''))
            raw = self.r(['GET', P + 'st:' + sid], ['HGET', P + 'classctl', cls or '_none'])
            st = jload(raw[0], {}) or {}
            return 200, {'validated': st.get('validated', []), 'rev': st.get('rev', 0), 'deleted': bool(st.get('deleted')),
                         'helpDone': st.get('helpDone', 0), 'notesRev': st.get('notesRev', 0), 'classctl': jload(raw[1], {}) or {}, 'now': time.time()}
        m = re.fullmatch(r'/api/notes/([\w-]+)', path)
        if m:
            return 200, {'notes': self.get_json('notes:' + m.group(1), []) or []}
        # ----- teacher only -----
        if not teacher:
            return 403, {'error': 'teacher code required'}
        if path == '/api/progress':
            raw = self.r(['HGETALL', P + 'snap'], ['HGETALL', P + 'help'], ['HGETALL', P + 'classctl'])
            out = {'students': list(hash_dict(raw[0]).values()), 'help': [h for h in hash_dict(raw[1]).values() if h],
                   'classctl': hash_dict(raw[2]), 'now': time.time()}
            try:
                self.make_backup()  # once a day (also done by the Vercel cron job)
            except Exception:  # noqa: BLE001 - a failed backup must not break the dashboard
                pass
            return 200, out
        if path == '/api/admin/backup':
            date = params.get('date')
            if date:
                b = unpack(self.r(['GET', P + 'backup:' + date])[0])
                return (200, b) if b else (404, {'error': 'no backup for this day'})
            snaps = self.snaps()
            return 200, {'type': 'ev3-class-backup', 'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'works': self.all_works(sorted(snaps)),
                         'roster': self.roster()}
        if path == '/api/solutions':
            # answer key of the guided challenges (teacher preview); generated from tests/solutions_src.js
            try:
                sol = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_solutions.json'), encoding='utf-8'))
            except (OSError, ValueError):
                sol = {}
            return 200, {'solutions': sol}
        if path == '/api/backups':
            return 200, {'backups': [b for b in (jload(x) for x in self.r(['LRANGE', P + 'backups', 0, -1])[0] or []) if b][::-1]}
        if path == '/api/stats':
            month = time.strftime('%Y-%m', time.gmtime())
            days = {k: int(v) for k, v in hash_dict(self.r(['HGETALL', P + 'stats:' + month])[0]).items()} if self.hosted else {}
            last = [b for b in (jload(x) for x in self.r(['LRANGE', P + 'backups', -1, -1])[0] or []) if b]
            return 200, {'hosted': self.hosted, 'month': month, 'monthTotal': sum(days.values()), 'days': days,
                         'today': days.get(time.strftime('%Y-%m-%d', time.gmtime()), 0), 'quota': self.settings().get('dbQuota'),
                         'dataSize': last[0]['size'] if last else None, 'students': len(self.snaps())}
        m = re.fullmatch(r'/api/history/([\w-]+)/([\w-]+)', path)
        if m:
            versions = unpack(self.r(['HGET', P + 'hist:' + m.group(1), m.group(2)])[0], []) or []
            return 200, {'versions': versions}
        if path == '/api/exams':
            exams = sorted((e for e in hash_dict(self.r(['HGETALL', P + 'exams'])[0]).values() if e), key=lambda e: e.get('startedAt', 0), reverse=True)
            return 200, {'exams': exams, 'now': time.time()}
        if path == '/api/exam/results':
            eid = str(params.get('examId', ''))
            raw = self.r(['HGET', P + 'exams', eid], ['HGETALL', P + 'examres:' + eid])
            return 200, {'exam': jload(raw[0]), 'results': [x for x in hash_dict(raw[1]).values() if x], 'now': time.time()}
        return 404, {'error': 'not found'}

    def post(self, path, data, ctx):
        teacher = self.is_teacher(ctx, None, data)
        if not self.is_student(ctx, None, data):
            return 401, {'error': 'class code required', 'needCode': True}
        if path in ('/api/progress', '/api/work'):
            sid = str(data.get('studentId', ''))
            if not ID.fullmatch(sid):
                return 400, {'error': 'bad id'}
            st = self.status(sid)
            if st.get('deleted'):
                return 410, {'error': 'deleted by the teacher', 'deleted': True}
            if int(data.get('adminRev') or 0) < st.get('rev', 0):
                return 409, {'error': 'changed by the teacher', 'rev': st.get('rev', 0)}
            snap = strip_programs(data)
            snap['receivedAt'] = time.time()
            cmds = [['HSET', P + 'snap', sid, json.dumps(snap)]]
            if path == '/api/work':
                cmds.append(['SET', P + 'work:' + sid, json.dumps({k: v for k, v in data.items() if k != 'live'})])
            self.r(*cmds)
            return 200, {'ok': True, 'savedAt': time.time(), 'validated': st.get('validated', []), 'rev': st.get('rev', 0),
                         'helpDone': st.get('helpDone', 0), 'notesRev': st.get('notesRev', 0)}
        if path == '/api/help':
            # Student: on = true asks for help, false cancels. Teacher: on = false marks it as done.
            sid = str(data.get('studentId', ''))
            if not ID.fullmatch(sid):
                return 400, {'error': 'bad id'}
            if data.get('on'):
                req = {'studentId': sid, 'name': clean_text(data.get('name'), 60), 'className': clean_text(data.get('className'), 20),
                       'where': clean_text(data.get('where'), 120), 'message': clean_text(data.get('message'), 200), 'since': time.time()}
                self.r(['HSET', P + 'help', sid, json.dumps(req)])
                return 200, {'ok': True, 'since': req['since']}
            self.r(['HDEL', P + 'help', sid])
            if teacher and data.get('by') == 'teacher':
                self.update_status(sid, helpDone=time.time())
            return 200, {'ok': True}
        if path == '/api/history':
            # A new version of a program (on "Run" or "Check my solution"), kept compressed, HISTORY_MAX per program.
            sid, slot = str(data.get('studentId', '')), str(data.get('slot', ''))
            if not ID.fullmatch(sid) or not SLOT.fullmatch(slot) or not isinstance(data.get('program'), dict):
                return 400, {'error': 'bad request'}
            if self.status(sid).get('deleted'):
                return 410, {'error': 'deleted'}
            versions = unpack(self.r(['HGET', P + 'hist:' + sid, slot])[0], []) or []
            v = {'t': data.get('t') or time.strftime('%Y-%m-%dT%H:%M:%S'), 'kind': clean_text(data.get('kind'), 10), 'score': data.get('score'),
                 'program': data['program'], 'robot': data.get('robot')}
            versions = (versions + [v])[-HISTORY_MAX:]
            self.r(['HSET', P + 'hist:' + sid, slot, pack(versions)])
            return 200, {'ok': True, 'count': len(versions)}
        if path == '/api/notes':
            # Teacher comments pinned to a block. Teacher: add / delete. Student: done ("Got it").
            sid, action = str(data.get('studentId', '')), data.get('action')
            if not ID.fullmatch(sid):
                return 400, {'error': 'bad id'}
            if action in ('add', 'delete') and not teacher:
                return 403, {'error': 'teacher code required'}
            notes = self.get_json('notes:' + sid, []) or []
            if action == 'add':
                notes.append({'id': '%x' % int(time.time() * 1000), 'slot': clean_text(data.get('slot'), 40), 'blockId': clean_text(data.get('blockId'), 40),
                              'text': clean_text(data.get('text'), 500), 'at': time.time(), 'done': False})
            elif action == 'delete':
                notes = [n for n in notes if n['id'] != data.get('noteId')]
            elif action == 'done':
                for n in notes:
                    if n['id'] == data.get('noteId'):
                        n['done'] = True
                        n['doneAt'] = time.time()
            else:
                return 400, {'error': 'unknown action'}
            notes = notes[-200:]
            st = self.status(sid)
            st['notesRev'] = st.get('notesRev', 0) + 1
            self.r(['SET', P + 'notes:' + sid, json.dumps(notes)], ['SET', P + 'st:' + sid, json.dumps(st)])
            return 200, {'ok': True, 'notes': notes}
        if path == '/api/exam/result':
            # A student checked a solution during an exam: keep the best score (and its program) per challenge.
            sid, eid, chid = str(data.get('studentId', '')), str(data.get('examId', '')), str(data.get('challengeId', ''))
            if not ID.fullmatch(sid) or not ID.fullmatch(eid) or not SLOT.fullmatch(chid):
                return 400, {'error': 'bad request'}
            raw = self.r(['HGET', P + 'exams', eid], ['HGET', P + 'examres:' + eid, sid])
            exam, res = jload(raw[0]), jload(raw[1], {}) or {}
            if not exam or chid not in exam.get('challenges', []):
                return 404, {'error': 'no such exam'}
            if time.time() > (exam.get('stoppedAt') or exam['endsAt']) + EXAM_GRACE:
                return 409, {'error': 'the exam is over'}
            res.update({'studentId': sid, 'name': clean_text(data.get('name'), 60), 'className': clean_text(data.get('className'), 20), 'updatedAt': time.time()})
            best = res.setdefault('challenges', {}).get(chid)
            score = max(0, min(100, int(data.get('score') or 0)))
            if not best or score > best.get('score', -1):
                res['challenges'][chid] = {'score': score, 'at': time.time(), 'program': data.get('program'), 'robot': data.get('robot'), 'checks': (best or {}).get('checks', 0) + 1}
            else:
                best['checks'] = best.get('checks', 0) + 1
            self.r(['HSET', P + 'examres:' + eid, sid, json.dumps(res)])
            return 200, {'ok': True, 'best': res['challenges'][chid]['score']}
        # ----- teacher only -----
        if not teacher:
            return 403, {'error': 'teacher code required'}
        if path == '/api/validate':
            sid = str(data.get('studentId'))
            st = self.status(sid)
            self.update_status(sid, validated=sorted(set(st.get('validated', [])) | {str(data.get('challengeId'))}))
            return 200, {'ok': True}
        if path == '/api/forget':
            sid = str(data.get('studentId'))
            self.r(['HDEL', P + 'snap', sid])
            return 200, {'ok': True}
        if path == '/api/settings':
            cur = {**DEFAULT_SETTINGS, **(self.get_json('settings', {}) or {})}
            new = {**cur, **{k: data[k] for k in DEFAULT_SETTINGS if k in data}}
            if 'studentCode' in data:
                new['studentCode'] = re.sub(r'\s+', '', str(data['studentCode'] or ''))[:30]
            self.r(['SET', P + 'settings', json.dumps(new)])
            return 200, self.settings(True)
        if path == '/api/roster':
            roster = data.get('roster')
            if not isinstance(roster, dict):
                return 400, {'error': 'bad roster'}
            clean = {clean_text(c, 20): [clean_text(n, 60) for n in names if clean_text(n, 60)] for c, names in roster.items() if clean_text(c, 20) and isinstance(names, list)}
            self.r(['SET', P + 'roster', json.dumps(clean)])
            return 200, {'ok': True, 'roster': clean}
        if path == '/api/classctl':
            # Live commands for one or several classes: message, pause the screens, open / close the access.
            classes = [clean_text(c, 20) for c in (data.get('classes') or [data.get('className')]) if clean_text(c, 20)]
            raw = self.r(*[['HGET', P + 'classctl', c] for c in classes]) if classes else []
            cmds = []
            for c, cur in zip(classes, raw):
                ctl = jload(cur, {}) or {}
                if 'message' in data:
                    ctl['message'] = {'id': '%x' % int(time.time() * 1000), 'text': clean_text(data['message'], 500), 'at': time.time()} if clean_text(data['message']) else None
                for k in ('paused', 'closed'):
                    if k in data:
                        ctl[k] = bool(data[k])
                cmds.append(['HSET', P + 'classctl', c, json.dumps(ctl)])
            if cmds:
                self.r(*cmds)
            return 200, {'ok': True}
        if path == '/api/exam':
            action = data.get('action')
            if action == 'start':
                cls = clean_text(data.get('className'), 20)
                chs = [clean_text(c, 40) for c in data.get('challenges') or [] if SLOT.fullmatch(clean_text(c, 40))]
                minutes = max(1, min(240, int(data.get('minutes') or 30)))
                if not cls or not chs:
                    return 400, {'error': 'choose a class and at least one challenge'}
                now = time.time()
                exam = {'id': 'x%x' % int(now * 1000), 'className': cls, 'title': clean_text(data.get('title'), 80) or 'Exam', 'challenges': chs,
                        'minutes': minutes, 'hints': bool(data.get('hints')), 'startedAt': now, 'endsAt': now + minutes * 60, 'stoppedAt': None}
                ctl = jload(self.r(['HGET', P + 'classctl', cls])[0], {}) or {}
                ctl['exam'] = {**exam, 'active': True}
                self.r(['HSET', P + 'exams', exam['id'], json.dumps(exam)], ['HSET', P + 'classctl', cls, json.dumps(ctl)])
                return 200, {'ok': True, 'exam': exam}
            eid = str(data.get('examId', ''))
            exam = jload(self.r(['HGET', P + 'exams', eid])[0])
            if not exam:
                return 404, {'error': 'no such exam'}
            if action in ('stop', 'close'):
                if not exam.get('stoppedAt'):
                    exam['stoppedAt'] = min(time.time(), exam['endsAt'])
                ctl = jload(self.r(['HGET', P + 'classctl', exam['className']])[0], {}) or {}
                cmds = [['HSET', P + 'exams', eid, json.dumps(exam)]]
                if (ctl.get('exam') or {}).get('id') == eid:
                    # "stop": the students see the end screen; "close": back to normal work
                    ctl['exam'] = {**exam, 'active': False} if action == 'stop' else None
                    cmds.append(['HSET', P + 'classctl', exam['className'], json.dumps(ctl)])
                self.r(*cmds)
                return 200, {'ok': True, 'exam': exam}
            if action == 'delete':
                self.r(['HDEL', P + 'exams', eid], ['DEL', P + 'examres:' + eid])
                return 200, {'ok': True}
            return 400, {'error': 'unknown action'}
        if path == '/api/backup/now':
            return 200, {'ok': True, 'date': self.make_backup(force=True)}
        if path == '/api/admin':
            action = data.get('action')
            if action == 'put-work':
                # The teacher changed a student's work (rename, class, unlock, reset): new revision, the student's browser reloads it.
                work = data.get('work') or {}
                sid = str(work.get('studentId', ''))
                st = self.status(sid) if ID.fullmatch(sid) else {'deleted': True}
                if st.get('deleted'):
                    return 400, {'error': 'bad student'}
                rev = st.get('rev', 0) + 1
                work['adminRev'] = rev
                old = jload(self.r(['HGET', P + 'snap', sid])[0], {}) or {}
                snap = strip_programs(work)
                snap['receivedAt'] = old.get('receivedAt', 0)
                snap['live'] = old.get('live')
                st.update({'rev': rev, 'validated': []})
                self.r(['SET', P + 'work:' + sid, json.dumps(work)], ['HSET', P + 'snap', sid, json.dumps(snap)], ['SET', P + 'st:' + sid, json.dumps(st)])
                return 200, {'ok': True, 'rev': rev}
            if action == 'clear-extras':
                # Part of "reset a student": program history, teacher comments, help request.
                sid = str(data.get('studentId', ''))
                if not ID.fullmatch(sid):
                    return 400, {'error': 'bad id'}
                cmds = []
                if data.get('history'):
                    cmds.append(['DEL', P + 'hist:' + sid])
                if data.get('notes'):
                    st = self.status(sid)
                    st['notesRev'] = st.get('notesRev', 0) + 1
                    cmds += [['DEL', P + 'notes:' + sid], ['SET', P + 'st:' + sid, json.dumps(st)]]
                cmds.append(['HDEL', P + 'help', sid])
                self.r(*cmds)
                return 200, {'ok': True}
            if action == 'delete':
                ids = [str(i) for i in data.get('studentIds') or [] if ID.fullmatch(str(i))]
                dest = self.archive('deleted')
                cmds = [c for sid in ids for c in self.remove_cmds(sid)]
                if cmds:
                    self.r(*cmds)
                return 200, {'ok': True, 'archive': dest}
            if action == 'restore':
                works = [w for w in data.get('works') or [] if ID.fullmatch(str(w.get('studentId', ''))) and w.get('type') == 'ev3-progress']
                sts = self.r(*[['GET', P + 'st:' + w['studentId']] for w in works]) if works else []
                cmds = []
                for work, raw in zip(works, sts):
                    sid = work['studentId']
                    st = jload(raw, {}) or {}
                    rev = max(st.get('rev', 0), int(work.get('adminRev') or 0)) + 1
                    work['adminRev'] = rev
                    snap = strip_programs(work)
                    snap['receivedAt'] = 0
                    cmds += [['SET', P + 'work:' + sid, json.dumps(work)], ['HSET', P + 'snap', sid, json.dumps(snap)], ['SET', P + 'st:' + sid, json.dumps({'rev': rev})]]
                if isinstance(data.get('roster'), dict) and data.get('withRoster'):
                    cmds.append(['SET', P + 'roster', json.dumps(data['roster'])])
                for i in range(0, len(cmds), 60):
                    self.r(*cmds[i:i + 60])
                return 200, {'ok': True, 'restored': len(works)}
            if action == 'reset-all':
                dest = self.archive('reset')
                cmds = [c for sid in self.snaps() for c in self.remove_cmds(sid)] + [['DEL', P + 'help']]
                for i in range(0, len(cmds), 60):
                    self.r(*cmds[i:i + 60])
                return 200, {'ok': True, 'archive': dest}
            return 400, {'error': 'unknown action'}
        return 404, {'error': 'not found'}
