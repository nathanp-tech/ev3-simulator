#!/usr/bin/env python3
"""EV3 Simulator class server.

    python3 server.py [port] [--public] [--no-browser]

Serves the app and a small JSON API so the teacher can follow every student live.
With --public, it also opens a free Cloudflare tunnel: students can then open the app
from any network with a public https link (shown here and in the teacher dashboard).
Student work is kept in data/ on this computer.
"""
import atexit, http.server, json, os, platform, re, shutil, signal, socket, socketserver, stat, subprocess
import sys, tarfile, threading, time, unicodedata, urllib.request, webbrowser
from urllib.parse import unquote_plus

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
args = sys.argv[1:]
PORT = next((int(a) for a in args if a.isdigit()), 8000)
PUBLIC = '--public' in args
DATA_DIR = os.environ.get('EV3_DATA_DIR') or os.path.join(ROOT, 'data')  # tests use their own folder
DATA_FILE = os.path.join(DATA_DIR, 'progress.json')
WORK_DIR = os.path.join(DATA_DIR, 'work')  # full work of each student (programs included)
TOOLS_DIR = os.path.join(ROOT, 'tools')

lock = threading.Lock()
students = {}      # student id -> latest progress snapshot (without programs)
validations = {}   # student id -> challenge ids unlocked by the teacher
revs = {}          # student id -> revision of the last change made by the teacher
tombstones = set() # deleted students: their browsers must not recreate them
public_url = None
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
ARCHIVE_DIR = os.path.join(DATA_DIR, 'archive')
DEFAULT_SETTINGS = {'passScore': 80, 'saveReminderMinutes': 20, 'allowGuided': True, 'allowFree': True, 'allowFLL': True}

os.makedirs(DATA_DIR, exist_ok=True)
if os.path.exists(DATA_FILE):
    try:
        saved = json.load(open(DATA_FILE, encoding='utf-8'))
        students, validations = saved.get('students', {}), {k: set(v) for k, v in saved.get('validations', {}).items()}
        revs, tombstones = saved.get('revs', {}), set(saved.get('tombstones', []))
    except (OSError, ValueError):
        pass

# Teacher password: protects the dashboard when it is opened from another computer (not needed on this one).
# Same as online: the TEACHER_CODE environment variable if set, otherwise prof2026.
TEACHER_CODE = os.environ.get('TEACHER_CODE', '').strip() or 'prof2026'


def persist():
    tmp = DATA_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump({'students': students, 'validations': {k: sorted(v) for k, v in validations.items()},
                   'revs': revs, 'tombstones': sorted(tombstones)}, f)
    os.replace(tmp, DATA_FILE)


def load_settings():
    try:
        return {**DEFAULT_SETTINGS, **json.load(open(SETTINGS_FILE, encoding='utf-8'))}
    except (OSError, ValueError):
        return dict(DEFAULT_SETTINGS)


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f)
    os.replace(tmp, path)


def archive(reason):
    """Copies all student data into data/archive/<date>_<reason>/ before a destructive action."""
    dest = os.path.join(ARCHIVE_DIR, time.strftime('%Y-%m-%d_%H%M%S') + '_' + reason)
    os.makedirs(dest, exist_ok=True)
    if os.path.exists(DATA_FILE):
        shutil.copy2(DATA_FILE, dest)
    if os.path.isdir(WORK_DIR):
        shutil.copytree(WORK_DIR, os.path.join(dest, 'work'), dirs_exist_ok=True)
    return dest


def remove_student(sid):
    tombstones.add(sid)
    students.pop(sid, None)
    validations.pop(sid, None)
    revs.pop(sid, None)
    if os.path.exists(work_path(sid)):
        os.remove(work_path(sid))


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


def work_path(sid):
    return os.path.join(WORK_DIR, sid + '.json')


def norm(s):
    # "Léa " == "lea": ignore accents, case and extra spaces.
    s = unicodedata.normalize('NFD', str(s or ''))
    return ' '.join(''.join(c for c in s if not unicodedata.combining(c)).split()).casefold()


def local_hostname():
    name = socket.gethostname()
    return name if name.endswith('.local') else name + '.local'


def local_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith('127.'))


# ---------- Public link (Cloudflare quick tunnel, free, no account) ----------
def cloudflared_path():
    local = os.path.join(TOOLS_DIR, 'cloudflared')
    if os.path.exists(local):
        return local
    found = shutil.which('cloudflared')
    if found:
        return found
    system, machine = platform.system().lower(), platform.machine().lower()
    arch = 'arm64' if machine in ('arm64', 'aarch64') else 'amd64'
    if system == 'darwin':
        url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-{arch}.tgz'
    elif system == 'linux':
        url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}'
    else:
        print('  Public link: please install cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)')
        return None
    print('  Downloading cloudflared (first time only, about 20 MB)…')
    os.makedirs(TOOLS_DIR, exist_ok=True)
    tmp = os.path.join(TOOLS_DIR, 'download.tmp')
    try:
        urllib.request.urlretrieve(url, tmp)
        if url.endswith('.tgz'):
            with tarfile.open(tmp) as t:
                member = next(m for m in t.getmembers() if m.name.endswith('cloudflared'))
                with t.extractfile(member) as src, open(local, 'wb') as dst:
                    shutil.copyfileobj(src, dst)
            os.remove(tmp)
        else:
            os.replace(tmp, local)
        os.chmod(local, os.stat(local).st_mode | stat.S_IEXEC)
        return local
    except Exception as e:  # noqa: BLE001 - show any download problem to the teacher
        print(f'  Could not download cloudflared: {e}')
        return None


def start_tunnel():
    global public_url
    exe = cloudflared_path()
    if not exe:
        return None
    proc = subprocess.Popen([exe, 'tunnel', '--no-autoupdate', '--url', f'http://localhost:{PORT}'],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    def read():
        global public_url
        for line in proc.stdout:
            m = re.search(r'https://[-a-z0-9]+\.trycloudflare\.com', line)
            if m and not public_url:
                public_url = m.group(0) + '/'
                print(f'\n  ✅ PUBLIC LINK for students (any network):  {public_url}\n')
    threading.Thread(target=read, daemon=True).start()
    # Close the public link whenever the server stops (Ctrl+C, window closed, kill).
    atexit.register(lambda: proc.poll() is None and proc.terminate())
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, lambda *_: sys.exit(0))
    return proc


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # always serve the latest version
        super().end_headers()

    def log_message(self, fmt, *a):
        pass  # keep the window readable

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 5_000_000:
            raise ValueError('too large')
        return json.loads(self.rfile.read(n) or b'{}')

    def _local(self):
        # Requests through the tunnel also come from 127.0.0.1, but carry Cloudflare headers.
        return self.client_address[0] in ('127.0.0.1', '::1') and not self.headers.get('Cf-Ray') and not self.headers.get('Cf-Connecting-Ip')

    def _teacher(self, params=None):
        code = self.headers.get('X-Teacher-Code') or (params or {}).get('code', '')
        return self._local() or code == TEACHER_CODE

    def do_GET(self):
        path, _, query = self.path.partition('?')
        params = {k: unquote_plus(v) for k, v in (p.split('=', 1) for p in query.split('&') if '=' in p)}
        # Never serve student data, tools or server files directly.
        if re.match(r'/(data|tools)(/|$)|/\.|.*\.(py|command|txt)$', path):
            return self._json({'error': 'not found'}, 404)
        if path == '/api/ping':
            return self._json({'ok': True, 'time': time.time()})
        if path == '/api/info':
            return self._json({'ips': local_ips(), 'host': local_hostname(), 'port': PORT, 'publicUrl': public_url,
                               'needsCode': not self._local(), 'teacher': self._teacher(params),
                               'passwordOk': params.get('code', '') == TEACHER_CODE})
        if path == '/api/progress':
            if not self._teacher(params):
                return self._json({'error': 'teacher code required'}, 403)
            with lock:
                return self._json({'students': list(students.values()), 'now': time.time()})
        if path == '/api/work/find':
            # The first name is the only identifier (accents, case and spaces ignored).
            name = norm(params.get('name', ''))
            with lock:
                found = [s for s in students.values() if norm(s.get('name')) == name and os.path.exists(work_path(s['studentId']))]
            found.sort(key=lambda s: s.get('updatedAt', ''), reverse=True)
            return self._json({'matches': [{
                'studentId': s['studentId'], 'name': s.get('name'), 'className': s.get('className'), 'mode': s.get('mode'),
                'updatedAt': s.get('updatedAt'), 'current': s.get('current'),
                'validated': sum(1 for c in (s.get('challenges') or {}).values() if c.get('status') == 'validated'),
            } for s in found]})
        if path == '/api/names':
            # Suggestions while a student types their first name (names starting with what was typed).
            prefix = norm(params.get('prefix', ''))
            if not prefix:
                return self._json({'names': []})
            with lock:
                found = [s for s in students.values() if norm(s.get('name')).startswith(prefix) and os.path.exists(work_path(s['studentId']))]
            names = {}
            for s in sorted(found, key=lambda s: s.get('updatedAt', '')):
                names[norm(s.get('name'))] = {'name': s.get('name'), 'mode': s.get('mode'),
                                              'validated': sum(1 for c in (s.get('challenges') or {}).values() if c.get('status') == 'validated')}
            return self._json({'names': sorted(names.values(), key=lambda n: norm(n['name']))[:8]})
        m = re.fullmatch(r'/api/work/([\w-]+)', path)
        if m:
            p = work_path(m.group(1))
            if not os.path.exists(p):
                return self._json({'error': 'not found'}, 404)
            with open(p, encoding='utf-8') as f:
                return self._json(json.load(f))
        m = re.fullmatch(r'/api/student/([\w-]+)', path)
        if m:
            sid = m.group(1)
            with lock:
                return self._json({'validated': sorted(validations.get(sid, set())), 'rev': revs.get(sid, 0), 'deleted': sid in tombstones})
        if path == '/api/settings':
            return self._json(load_settings())
        if path == '/api/admin/backup':
            if not self._teacher(params):
                return self._json({'error': 'teacher code required'}, 403)
            works = []
            if os.path.isdir(WORK_DIR):
                for name in sorted(os.listdir(WORK_DIR)):
                    if name.endswith('.json'):
                        with open(os.path.join(WORK_DIR, name), encoding='utf-8') as f:
                            works.append(json.load(f))
            return self._json({'type': 'ev3-class-backup', 'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'works': works})
        return super().do_GET()

    def do_POST(self):
        try:
            data = self._body()
        except ValueError:
            return self._json({'error': 'bad request'}, 400)
        if self.path in ('/api/progress', '/api/work'):
            sid = str(data.get('studentId', ''))
            if not re.fullmatch(r'[\w-]{4,64}', sid):
                return self._json({'error': 'bad id'}, 400)
            with lock:
                if sid in tombstones:
                    return self._json({'error': 'deleted by the teacher', 'deleted': True}, 410)
                if int(data.get('adminRev') or 0) < revs.get(sid, 0):
                    return self._json({'error': 'changed by the teacher', 'rev': revs.get(sid, 0)}, 409)
                if self.path == '/api/work':
                    os.makedirs(WORK_DIR, exist_ok=True)
                    tmp = work_path(sid) + '.tmp'
                    with open(tmp, 'w', encoding='utf-8') as f:
                        json.dump({k: v for k, v in data.items() if k != 'live'}, f)
                    os.replace(tmp, work_path(sid))
                snap = strip_programs(data)
                snap['receivedAt'] = time.time()
                students[sid] = snap
                persist()
            return self._json({'ok': True, 'savedAt': time.time()})
        if self.path in ('/api/validate', '/api/forget'):
            if not self._teacher(data):
                return self._json({'error': 'teacher code required'}, 403)
            sid = str(data.get('studentId'))
            with lock:
                if self.path == '/api/validate':
                    validations.setdefault(sid, set()).add(str(data.get('challengeId')))
                else:
                    students.pop(sid, None)
                    validations.pop(sid, None)
                persist()
            return self._json({'ok': True})
        if self.path == '/api/settings':
            if not self._teacher(data):
                return self._json({'error': 'teacher code required'}, 403)
            new = {**load_settings(), **{k: data[k] for k in DEFAULT_SETTINGS if k in data}}
            write_json(SETTINGS_FILE, new)
            return self._json(new)
        if self.path == '/api/admin':
            if not self._teacher(data):
                return self._json({'error': 'teacher code required'}, 403)
            action = data.get('action')
            with lock:
                if action == 'put-work':
                    # The teacher changed a student's work (rename, unlock, reset): new revision, the student's browser reloads it.
                    work = data.get('work') or {}
                    sid = str(work.get('studentId', ''))
                    if not re.fullmatch(r'[\w-]{4,64}', sid) or sid in tombstones:
                        return self._json({'error': 'bad student'}, 400)
                    revs[sid] = revs.get(sid, 0) + 1
                    work['adminRev'] = revs[sid]
                    write_json(work_path(sid), work)
                    snap = strip_programs(work)
                    snap['receivedAt'] = (students.get(sid) or {}).get('receivedAt', 0)
                    snap['live'] = (students.get(sid) or {}).get('live')
                    students[sid] = snap
                    validations.pop(sid, None)
                    persist()
                    return self._json({'ok': True, 'rev': revs[sid]})
                if action == 'delete':
                    ids = [str(i) for i in data.get('studentIds') or []]
                    dest = archive('deleted')
                    for sid in ids:
                        remove_student(sid)
                    persist()
                    return self._json({'ok': True, 'archive': os.path.relpath(dest, ROOT)})
                if action == 'restore':
                    restored = 0
                    for work in data.get('works') or []:
                        sid = str(work.get('studentId', ''))
                        if not re.fullmatch(r'[\w-]{4,64}', sid) or work.get('type') != 'ev3-progress':
                            continue
                        tombstones.discard(sid)
                        revs[sid] = max(revs.get(sid, 0), int(work.get('adminRev') or 0)) + 1
                        work['adminRev'] = revs[sid]
                        write_json(work_path(sid), work)
                        snap = strip_programs(work)
                        snap['receivedAt'] = 0
                        students[sid] = snap
                        restored += 1
                    persist()
                    return self._json({'ok': True, 'restored': restored})
                if action == 'reset-all':
                    dest = archive('reset')
                    for sid in list(students.keys()):
                        remove_student(sid)
                    if os.path.isdir(WORK_DIR):
                        for name in os.listdir(WORK_DIR):
                            tombstones.add(name[:-5]) if name.endswith('.json') else None
                            os.remove(os.path.join(WORK_DIR, name))
                    persist()
                    return self._json({'ok': True, 'archive': os.path.relpath(dest, ROOT)})
            return self._json({'error': 'unknown action'}, 400)
        return self._json({'error': 'not found'}, 404)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', PORT), Handler) as httpd:
    url = f'http://localhost:{PORT}/'
    print('EV3 Simulator class server')
    print(f'  Teacher dashboard on this computer:  {url}teacher.html')
    print(f'  Teacher password (dashboard on another computer):  {TEACHER_CODE}')
    for ip in local_ips():
        print(f'  Same Wi-Fi as this computer:  http://{ip}:{PORT}/')
    tunnel = start_tunnel() if PUBLIC else None
    if PUBLIC:
        print('  Opening the public link…')
    print('Keep this window open during the lesson. Press Ctrl+C to stop.')
    if '--no-browser' not in args:
        webbrowser.open(url + 'teacher.html')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if tunnel:
            tunnel.terminate()
