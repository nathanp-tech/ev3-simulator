// Program execution: deterministic scheduler driven by simulation steps.
// Each stack (hat block) is an async "thread"; threads take turns between two physics steps.
'use strict';

class StopSignal extends Error {}

const macrotask = (() => {
  const ch = new MessageChannel();
  const queue = [];
  ch.port1.onmessage = () => { const r = queue.shift(); if (r) r(); };
  return () => new Promise((r) => { queue.push(r); ch.port2.postMessage(0); });
})();

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOOP_BATCH = 20; // loop iterations allowed before yielding to the next step

class Runtime {
  constructor(sim, brick, hooks = {}) {
    this.sim = sim;
    this.brick = brick;
    this.hooks = hooks; // onLog(msg, kind), onEnd(reason)
    this.running = false;
    this.threads = new Set();
    this.V = Object.create(null);
    this.L = Object.create(null);
  }

  // ---------- Lifecycle ----------
  start(code, { seed = Date.now(), variables = [], lists = [] } = {}) {
    const fn = new Function('R', 'V', code); // may throw a SyntaxError
    this.threads = new Set();
    this.waiting = new Set();
    this.startHats = []; this.condHats = []; this.msgHats = [];
    this.V = Object.create(null);
    this.L = Object.create(null);
    for (const v of variables) this.V[v] = 0;
    for (const l of lists) this.L[l] = [];
    this.tid = 0;
    this.read = {}; // sensors the program has read (a challenge can require one)
    this.timerStart = this.sim.t;
    this.rng = mulberry32(seed);
    this.move = { pair: ['B', 'C'], speed: 50, rotCm: 17.6 };
    this.endReason = null;
    this.running = true;
    fn(this, this.V);
    for (const h of this.condHats) h.prev = h.initPrev;
    for (const h of this.startHats) this._spawn(h);
  }

  stopAll(reason = 'stopped') {
    if (!this.running) return;
    this.running = false;
    this.endReason = reason;
    this.motorsWereRunning = Object.values(this.sim.motors).some((m) => m.mode !== 'stop');
    for (const T of [...this.threads]) this._cancel(T);
    this.sim.stopAllMotors();
    this.brick.sound.stopAll();
    if (this.hooks.onEnd) this.hooks.onEnd(reason);
  }

  // One step: event hats, wake up threads, run them, then physics.
  async tick() {
    if (!this.running) return;
    for (const h of this.condHats) {
      let v = false;
      try { v = !!h.cond(); } catch (e) { this._error(e); return; }
      if (v && !h.prev && !h.thread) this._spawn(h);
      h.prev = v;
    }
    for (const T of [...this.waiting]) {
      const w = T.waiter;
      let ready = true;
      if (w.pred) {
        try { ready = w.pred(); } catch (e) { this.waiting.delete(T); T.waiter = null; w.rej(e); continue; }
      }
      if (ready) { this.waiting.delete(T); T.waiter = null; T.iter = 0; w.res(); }
    }
    await macrotask();
    if (!this.running) return;
    this.sim.step(DT);
    if (this.threads.size === 0 && this.condHats.length === 0) this.stopAll('done');
  }

  activeBlocks() {
    const ids = new Set();
    for (const T of this.threads) if (T.block) ids.add(T.block);
    return ids;
  }

  // ---------- Threads ----------
  _spawn(hat) {
    const T = { id: ++this.tid, hat, cancelled: false, iter: 0, block: null, waiter: null, done: false };
    hat.thread = T;
    this.threads.add(T);
    // A stack restarted in the same step (e.g. "when I receive go … broadcast go") waits for the next step: no endless loop.
    const again = hat.spawnStep === this.sim.stepIndex;
    Promise.resolve()
      .then(() => (again ? this.waitFor(T, null) : null))
      .then(() => { hat.spawnStep = this.sim.stepIndex; return hat.fn(T); })
      .catch((e) => { if (!(e instanceof StopSignal)) this._error(e, T); })
      .finally(() => {
        T.done = true;
        this.threads.delete(T);
        this.waiting.delete(T);
        if (hat.thread === T) hat.thread = null;
      });
    return T;
  }
  _cancel(T) {
    T.cancelled = true;
    if (T.waiter) {
      const w = T.waiter;
      T.waiter = null;
      this.waiting.delete(T);
      w.rej(new StopSignal());
    }
  }
  _error(e, T) {
    let msg = e && e.message ? e.message : String(e);
    if (e instanceof RangeError && /call stack/i.test(msg)) msg = 'Too many My Blocks calling each other (a My Block that calls itself without end?)';
    this.errorBlock = T ? T.block : null;
    this.lastError = msg;
    if (this.hooks.onLog) this.hooks.onLog('Error: ' + msg, 'error');
    this.stopAll('error');
  }
  waitFor(T, pred) {
    if (T.cancelled || !this.running) throw new StopSignal();
    return new Promise((res, rej) => { T.waiter = { pred, res, rej }; this.waiting.add(T); });
  }

  // ---------- API used by the generated code ----------
  step(T, id) {
    if (T.cancelled || !this.running) throw new StopSignal();
    T.block = id;
  }
  yield(T) {
    if (++T.iter < LOOP_BATCH) return undefined;
    return this.waitFor(T, null);
  }
  wait(T, secs) {
    const end = this.sim.t + Math.max(0, secs) - 1e-9;
    return this.waitFor(T, () => this.sim.t >= end);
  }
  async waitUntil(T, fn) {
    while (!fn()) await this.waitFor(T, null);
  }
  onStart(id, fn) { this.startHats.push({ id, fn, thread: null }); }
  onCond(id, cond, fn, initPrev) { this.condHats.push({ id, cond, fn, initPrev, prev: initPrev, thread: null }); }
  onMsg(id, msg, fn) { this.msgHats.push({ id, msg: String(msg).trim().toLowerCase(), fn, thread: null }); }
  broadcast(T, msg, wait) {
    const key = String(msg).trim().toLowerCase();
    const started = [];
    for (const h of this.msgHats) {
      if (h.msg !== key) continue;
      if (h.thread) this._cancel(h.thread);
      started.push(this._spawn(h));
    }
    if (wait) return this.waitFor(T, () => started.every((t) => t.done));
    return undefined;
  }
  stop(T, what) {
    if (what === 'exit') { this.stopAll('stopped-by-program'); throw new StopSignal(); }
    if (what === 'this') throw new StopSignal();
    for (const o of [...this.threads]) if (o !== T) this._cancel(o);
  }

  // ---------- Scratch-like conversions ----------
  num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const t = String(v).trim().replace(/^(-?\d*),(\d+)$/, '$1.$2');
    const n = Number(t);
    return t !== '' && isFinite(n) ? n : 0;
  }
  str(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return v.map((x) => this.str(x)).join(' ');
    return v === undefined || v === null ? '' : String(v);
  }
  // Comparison like Scratch: numeric when both look like numbers, otherwise case-insensitive text.
  compare(a, op, b) {
    const na = Number(a), nb = Number(b);
    const numeric = String(a).trim() !== '' && String(b).trim() !== '' && isFinite(na) && isFinite(nb) && typeof a !== 'boolean' && typeof b !== 'boolean';
    let c;
    if (numeric) c = na - nb;
    else { const sa = this.str(a).toLowerCase(), sb = this.str(b).toLowerCase(); c = sa < sb ? -1 : sa > sb ? 1 : 0; }
    if (op === '<') return c < 0;
    if (op === '>') return c > 0;
    return numeric ? Math.abs(c) < 1e-9 : c === 0;
  }
  cmp(a, op, b) {
    if (op === '<') return a < b;
    if (op === '>') return a > b;
    return Math.abs(a - b) < 1e-9;
  }
  random(a, b) {
    const x = this.num(a), y = this.num(b);
    const lo = Math.min(x, y), hi = Math.max(x, y);
    if (Number.isInteger(lo) && Number.isInteger(hi) && !/\./.test(String(a) + String(b))) return lo + Math.floor(this.rng() * (hi - lo + 1));
    return lo + this.rng() * (hi - lo);
  }
  mod(a, b) { return b === 0 ? NaN : ((a % b) + b) % b; }
  math(op, a) {
    switch (op) {
      case 'abs': return Math.abs(a);
      case 'floor': return Math.floor(a);
      case 'ceiling': return Math.ceil(a);
      case 'sqrt': return Math.sqrt(a);
      case 'sin': return Math.round(Math.sin(a * DEG) * 1e10) / 1e10;
      case 'cos': return Math.round(Math.cos(a * DEG) * 1e10) / 1e10;
      case 'tan': return Math.tan(a * DEG);
      case 'asin': return Math.asin(a) / DEG;
      case 'acos': return Math.acos(a) / DEG;
      case 'atan': return Math.atan(a) / DEG;
      case 'ln': return Math.log(a);
      case 'log': return Math.log10(a);
      case 'e ^': return Math.exp(a);
      case '10 ^': return Math.pow(10, a);
    }
    return 0;
  }

  // ---------- Lists (Scratch-like, 1-based) ----------
  _list(name) { if (!this.L[name]) this.L[name] = []; return this.L[name]; }
  _idx(list, i) { const n = Math.round(this.num(i)); return n >= 1 && n <= list.length ? n - 1 : -1; }
  listAdd(name, v) { this._list(name).push(v); }
  listDelete(name, i) { const l = this._list(name), k = this._idx(l, i); if (k >= 0) l.splice(k, 1); }
  listDeleteAll(name) { this._list(name).length = 0; }
  listInsert(name, v, i) { const l = this._list(name), n = Math.round(this.num(i)); if (n >= 1 && n <= l.length + 1) l.splice(n - 1, 0, v); }
  listReplace(name, i, v) { const l = this._list(name), k = this._idx(l, i); if (k >= 0) l[k] = v; }
  listItem(name, i) { const l = this._list(name), k = this._idx(l, i); return k >= 0 ? l[k] : ''; }
  listIndexOf(name, v) { const l = this._list(name); const k = l.findIndex((x) => this.compare(x, '=', v)); return k + 1; }
  listLength(name) { return this._list(name).length; }
  listContains(name, v) { return this._list(name).some((x) => this.compare(x, '=', v)); }
  listText(name) { return this._list(name).map((x) => this.str(x)).join(' '); }

  // ---------- Motors ----------
  _ports(spec) {
    const ports = String(spec).split('+');
    for (const p of ports) {
      if (this.sim.config.motors[p].type === 'none') throw new Error(`No motor is connected to port ${p}. Check the robot configuration in Port View.`);
    }
    return ports;
  }
  _waitMotors(T, ports, tokens) {
    return this.waitFor(T, () => ports.every((p, i) => this.sim.motors[p].isDone(tokens[i])));
  }
  motorRunFor(T, spec, dir, amount, unit) {
    const ports = this._ports(spec), sign = dir === 'ccw' ? -1 : 1;
    const tokens = ports.map((p) => {
      const m = this.sim.motors[p], pct = m.speedPct * sign;
      if (unit === 'seconds') return m.runTimed(pct, amount, this.sim.t);
      return m.runDegrees(pct, unit === 'rotations' ? amount * 360 : amount);
    });
    return this._waitMotors(T, ports, tokens);
  }
  motorGoTo(T, spec, pos) {
    const ports = this._ports(spec);
    const tokens = ports.map((p) => this.sim.motors[p].goTo(this.sim.motors[p].speedPct, pos));
    return this._waitMotors(T, ports, tokens);
  }
  motorStart(spec, dir) {
    for (const p of this._ports(spec)) { const m = this.sim.motors[p]; m.start(m.speedPct * (dir === 'ccw' ? -1 : 1)); }
  }
  motorStartSpeed(spec, pct) { for (const p of this._ports(spec)) this.sim.motors[p].start(pct); }
  motorStop(spec) { for (const p of this._ports(spec)) this.sim.motors[p].stop(); }
  motorSetSpeed(spec, pct) { for (const p of this._ports(spec)) this.sim.motors[p].speedPct = clamp(pct, -100, 100); }
  motorSetStopAction(spec, a) { for (const p of this._ports(spec)) this.sim.motors[p].stopAction = a; }
  motorSetPosition(spec, v) { for (const p of this._ports(spec)) { const m = this.sim.motors[p]; m.offset = m.pos - v; } }
  motorPosition(p) { this._ports(p); return Math.round(this.sim.motors[p].position()); }
  motorSpeed(p) { this._ports(p); const m = this.sim.motors[p]; return Math.round(m.speed / m.maxSpeed * 100); }

  // ---------- Movement ----------
  _pair() { return this._ports(this.move.pair.join('+')).map((p) => this.sim.motors[p]); }
  _toDeg(amount, unit) {
    if (unit === 'cm') return amount / this.move.rotCm * 360;
    if (unit === 'in') return amount * 2.54 / this.move.rotCm * 360;
    if (unit === 'rotations') return amount * 360;
    return amount;
  }
  _dirSpeeds(dir) {
    const s = this.move.speed;
    return { forward: [s, s], backward: [-s, -s], right: [s, -s], left: [-s, s] }[dir];
  }
  _steerSpeeds(steer, speed = null) {
    const s = speed === null ? this.move.speed : clamp(speed, -100, 100), st = clamp(steer, -100, 100);
    return st >= 0 ? [s, s * (100 - 2 * st) / 100] : [s * (100 + 2 * st) / 100, s];
  }
  _moveFor(T, l, r, amount, unit) {
    const [mL, mR] = this._pair();
    let tokens;
    if (unit === 'seconds') {
      tokens = [mL.runTimed(l, amount, this.sim.t), mR.runTimed(r, amount, this.sim.t)];
    } else {
      const deg = this._toDeg(amount, unit);
      const mx = Math.max(Math.abs(l), Math.abs(r)) || 1;
      tokens = [mL.runDegrees(l, deg * Math.abs(l) / mx), mR.runDegrees(r, deg * Math.abs(r) / mx)];
    }
    return this._waitMotors(T, this.move.pair, tokens);
  }
  moveDirFor(T, dir, amount, unit) { const [l, r] = this._dirSpeeds(dir); return this._moveFor(T, l, r, amount, unit); }
  moveSteerFor(T, steer, amount, unit) { const [l, r] = this._steerSpeeds(steer); return this._moveFor(T, l, r, amount, unit); }
  moveTankFor(T, amount, unit, l, r) { return this._moveFor(T, clamp(l, -100, 100), clamp(r, -100, 100), amount, unit); }
  _start(l, r) { const [mL, mR] = this._pair(); mL.start(l); mR.start(r); }
  moveDirStart(dir) { this._start(...this._dirSpeeds(dir)); }
  moveSteerStart(steer, speed = null) { this._start(...this._steerSpeeds(steer, speed)); }
  moveTankStart(l, r) { this._start(clamp(l, -100, 100), clamp(r, -100, 100)); }
  moveStop() { this._pair().forEach((m) => m.stop()); }
  moveSetSpeed(pct) { this.move.speed = clamp(pct, -100, 100); }
  moveSetPair(spec) { this.move.pair = String(spec).split('+'); }
  moveSetRotation(cm) { if (cm > 0) this.move.rotCm = cm; }
  moveSetStopAction(a) { this._pair().forEach((m) => { m.stopAction = a; }); }

  // ---------- Display and light ----------
  dispImage(name) { this.brick.lcd.image(name); }
  dispImageFor(T, name, secs) { this.brick.lcd.image(name); return this.wait(T, secs).then(() => this.brick.lcd.clear()); }
  dispTextLine(t, line) { this.brick.lcd.textLine(t, line); }
  dispTextXY(t, x, y) { this.brick.lcd.textXY(t, x, y); }
  dispClear() { this.brick.lcd.clear(); }
  dispFont(f) { this.brick.lcd.font = f; }
  dispPen(c) { this.brick.lcd.pen = c; }
  dispPixel(x, y) { this.brick.lcd.pixel(x, y); }
  dispLine(x1, y1, x2, y2) { this.brick.lcd.line(x1, y1, x2, y2); }
  dispCircle(f, x, y, r) { this.brick.lcd.circle(f, x, y, r); }
  dispRect(f, x, y, w, h) { this.brick.lcd.rect(f, x, y, w, h); }
  light(color, mode) { this.brick.light = color ? { color, mode } : { color: null, mode: 'off' }; }

  // ---------- Sound ----------
  soundPlay(T, name, wait) {
    this.brick.sound.play(name);
    return wait ? this.wait(T, this.brick.sound.duration(name)) : undefined;
  }
  beep(T, note, secs, wait) {
    this.brick.sound.beep(note, secs);
    return wait ? this.wait(T, secs) : undefined;
  }
  soundStop() { this.brick.sound.stopAll(); }
  setVolume(v) { this.brick.sound.volume = clamp(v, 0, 100); }
  volume() { return this.brick.sound.volume; }

  // ---------- Sensors ----------
  _sensor(port, type) {
    const c = this.sim.config.sensors[port];
    if (c.type !== type) {
      const name = SENSOR_TYPES[c.type];
      const has = c.type === 'none' ? 'nothing is connected to it' : `it has ${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
      throw new Error(`No ${SENSOR_TYPES[type]} on port ${port} (${has}). Check the robot configuration in Port View.`);
    }
  }
  touch(port) { this._sensor(port, 'touch'); this.read.touch = true; return this.sim.touchPressed(port); }
  color(port) { this._sensor(port, 'color'); this.read.color = true; return COLOR_NAMES[this.sim.colorKey(port)]; }
  colorIs(port, c) { this._sensor(port, 'color'); this.read.color = true; return this.sim.colorKey(port) === c; }
  reflect(port) { this._sensor(port, 'color'); this.read.color = true; return this.sim.reflect(port); }
  ambient(port) { this._sensor(port, 'color'); return this.sim.ambient(); }
  calibrate(port, which) { this._sensor(port, 'color'); this.sim.calibrate(port, which); }
  resetCalibration(port) { this._sensor(port, 'color'); this.sim.resetCalibration(port); }
  distance(port, unit) {
    this._sensor(port, 'ultrasonic');
    this.read.distance = true;
    const d = this.sim.ultrasonic(port);
    return unit === 'in' ? Math.round(d / 2.54 * 10) / 10 : d;
  }
  proximity(port) { this._sensor(port, 'infrared'); this.read.distance = true; return this.sim.irProximity(port); }
  beaconHeading(port, ch) { this._sensor(port, 'infrared'); return this.sim.beaconInfo(port, ch).heading; }
  beaconProximity(port, ch) { this._sensor(port, 'infrared'); return this.sim.beaconInfo(port, ch).proximity; }
  beaconActive(port, ch) { this._sensor(port, 'infrared'); return this.sim.beaconInfo(port, ch).active; }
  beaconButtons(port, ch) { this._sensor(port, 'infrared'); return this.sim.beaconButtons(ch); }
  gyroAngle(port) { this._sensor(port, 'gyro'); return this.sim.gyroAngle(port); }
  gyroRate(port) { this._sensor(port, 'gyro'); return this.sim.gyroRate(port); }
  gyroReset(port) { this._sensor(port, 'gyro'); this.sim.gyroReset(port); }
  button(name) { return !!this.brick.buttons[name]; }
  timer() { return Math.round((this.sim.t - this.timerStart) * 1000) / 1000; }
  timerReset() { this.timerStart = this.sim.t; }
}
