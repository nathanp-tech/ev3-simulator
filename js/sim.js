// 2D physics simulation of an EV3 robot and its sensors.
// Units: cm, seconds, degrees. Screen frame: x to the right, y down,
// heading (th) in radians, positive = clockwise (same sign as the EV3 gyro).
// Robot frame: x forward, y to the right.
'use strict';

const DEG = Math.PI / 180;
const DT = 0.005; // simulation step: 200 Hz
const MAT_SCALE = 4; // px per cm in the sampled mat

const ROBOT = { wheelD: 5.6, track: 12, body: { x0: -6, x1: 11, y0: -7.5, y1: 7.5 } };

const SENSOR_TYPES = { none: 'None', touch: 'Touch Sensor', color: 'Color Sensor', ultrasonic: 'Ultrasonic Sensor', gyro: 'Gyro Sensor', infrared: 'Infrared Sensor' };
const MOTOR_KINDS = { none: 'None', large: 'Large Motor', medium: 'Medium Motor' };
const MOTOR_ROLES = { left: 'Left wheel', right: 'Right wheel', arm: 'Front arm', free: 'Not attached' };
const MOUNTS = { front: 'Front', 'front-left': 'Front left', 'front-right': 'Front right', left: 'Left side', right: 'Right side', back: 'Back' };

// Distance sensors (ultrasonic, infrared): [x, y, direction in degrees]
const MOUNT_GEO = {
  front: [11, 0, 0], 'front-left': [11, -5, 0], 'front-right': [11, 5, 0],
  left: [2.5, -7.5, -90], right: [2.5, 7.5, 90], back: [-6, 0, 180],
};
// Color sensors look down at: [x, y]
const COLOR_GEO = { front: [7.5, 0], 'front-left': [7.5, -5], 'front-right': [7.5, 5], left: [5, -6.5], right: [5, 6.5], back: [-4.5, 0] };
// Touch sensor bumpers: [x0, y0, x1, y1]
const BUMPER_GEO = {
  front: [11, -3.5, 12.4, 3.5], 'front-left': [11, -7, 12.4, -3], 'front-right': [11, 3, 12.4, 7],
  left: [3.5, -8.9, 9.5, -7.5], right: [3.5, 7.5, 9.5, 8.9], back: [-7.4, -3.5, -6, 3.5],
};

const DEFAULT_CONFIG = {
  sensors: { 1: { type: 'touch', mount: 'front' }, 2: { type: 'gyro', mount: 'front' }, 3: { type: 'color', mount: 'front' }, 4: { type: 'ultrasonic', mount: 'front' } },
  motors: { A: { type: 'medium', role: 'arm' }, B: { type: 'large', role: 'left' }, C: { type: 'large', role: 'right' }, D: { type: 'none', role: 'free' } },
};

const ROBOT_PRESETS = {
  'Driving Base (default)': DEFAULT_CONFIG,
  'Line follower (2 color sensors)': {
    sensors: { 1: { type: 'color', mount: 'front-left' }, 2: { type: 'gyro', mount: 'front' }, 3: { type: 'color', mount: 'front-right' }, 4: { type: 'ultrasonic', mount: 'front' } },
    motors: DEFAULT_CONFIG.motors,
  },
  'Wall follower (side ultrasonic)': {
    sensors: { 1: { type: 'touch', mount: 'front' }, 2: { type: 'gyro', mount: 'front' }, 3: { type: 'ultrasonic', mount: 'right' }, 4: { type: 'ultrasonic', mount: 'front' } },
    motors: DEFAULT_CONFIG.motors,
  },
  'Explorer (infrared + beacon)': {
    sensors: { 1: { type: 'touch', mount: 'front' }, 2: { type: 'gyro', mount: 'front' }, 3: { type: 'color', mount: 'front' }, 4: { type: 'infrared', mount: 'front' } },
    motors: DEFAULT_CONFIG.motors,
  },
};

function normalizeConfig(cfg) {
  const out = { sensors: {}, motors: {} };
  for (const p of ['1', '2', '3', '4']) {
    const s = (cfg && cfg.sensors && cfg.sensors[p]) || DEFAULT_CONFIG.sensors[p];
    out.sensors[p] = { type: SENSOR_TYPES[s.type] ? s.type : 'none', mount: MOUNTS[s.mount] ? s.mount : 'front' };
  }
  for (const p of ['A', 'B', 'C', 'D']) {
    const m = (cfg && cfg.motors && cfg.motors[p]) || DEFAULT_CONFIG.motors[p];
    out.motors[p] = { type: MOTOR_KINDS[m.type] ? m.type : 'none', role: MOTOR_ROLES[m.role] ? m.role : 'free' };
  }
  return out;
}

class Motor {
  constructor(name) {
    this.name = name;
    this.setKind('large');
    this.reset();
  }
  setKind(kind) {
    this.kind = kind;
    this.maxSpeed = kind === 'medium' ? 1560 : 1050; // deg/s at 100 %
  }
  reset() {
    this.pos = 0; this.offset = 0; this.speed = 0;
    this.mode = 'stop'; this.stopMode = 'coast';
    this.cmd = 0; this.target = null; this.endT = null;
    this.token = 0; this.speedPct = 75; this.stopAction = 'brake'; this.holdPos = 0;
  }
  _new() { return ++this.token; }
  runDegrees(pct, deg) {
    const tok = this._new();
    if (deg < 0) { deg = -deg; pct = -pct; }
    this.cmd = clamp(pct, -100, 100) / 100 * this.maxSpeed;
    if (this.cmd === 0 || deg === 0) { this.target = null; this._finish(); return tok; }
    this.target = this.pos + Math.sign(this.cmd) * deg;
    this.mode = 'to';
    return tok;
  }
  goTo(pct, position) {
    const tok = this._new();
    const goal = position + this.offset;
    const rem = goal - this.pos;
    this.cmd = Math.abs(clamp(pct, -100, 100)) / 100 * this.maxSpeed * Math.sign(rem);
    if (this.cmd === 0 || Math.abs(rem) < 0.5) { this.target = null; this._finish(); return tok; }
    this.target = goal; this.mode = 'to';
    return tok;
  }
  runTimed(pct, secs, now) {
    const tok = this._new();
    this.cmd = clamp(pct, -100, 100) / 100 * this.maxSpeed;
    this.target = null;
    if (secs <= 0) { this._finish(); return tok; }
    this.mode = 'run'; this.endT = now + secs;
    return tok;
  }
  start(pct) {
    this._new();
    this.cmd = clamp(pct, -100, 100) / 100 * this.maxSpeed;
    this.mode = 'run'; this.endT = null; this.target = null;
  }
  stop(action) {
    this._new();
    this.mode = 'stop'; this.stopMode = action || this.stopAction; this.holdPos = this.pos;
    if (this.stopMode !== 'coast') this.speed = 0;
  }
  _finish() {
    this.mode = 'stop'; this.stopMode = this.stopAction; this.endT = null;
    this.holdPos = this.target !== null ? this.target : this.pos;
    if (this.stopMode !== 'coast') this.speed = 0;
  }
  isDone(tok) { return this.token !== tok || this.mode === 'stop'; }
  position() { return this.pos - this.offset; }
  step(dt, now) {
    let desired = 0, acc = 8000;
    if (this.mode === 'run') {
      desired = this.cmd;
      if (this.endT !== null && now >= this.endT - 1e-9) { this._finish(); desired = 0; }
    }
    if (this.mode === 'to') {
      const rem = this.target - this.pos;
      const vmax = Math.sqrt(2 * 9000 * Math.abs(rem));
      desired = Math.sign(this.cmd) * Math.min(Math.abs(this.cmd), Math.max(vmax, 30));
    }
    if (this.mode === 'stop') {
      if (this.stopMode === 'coast') { desired = 0; acc = 1200; }
      else if (this.stopMode === 'hold') { desired = clamp((this.holdPos - this.pos) * 20, -300, 300); acc = 20000; }
      else { desired = 0; acc = 20000; }
    }
    this.speed += clamp(desired - this.speed, -acc * dt, acc * dt);
    let move = this.speed * dt;
    if (this.mode === 'to') {
      const rem = this.target - this.pos;
      if (Math.abs(move) >= Math.abs(rem) || Math.sign(rem) !== Math.sign(this.cmd)) {
        this.pos += rem;
        this._finish();
        return;
      }
    }
    this.pos += move;
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// ---------- Geometry ----------
function rectPoly(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function boxPoly(b) { return rectPoly(b[0], b[1], b[2] - b[0], b[3] - b[1]); }
function transformPoly(local, x, y, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return local.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}
function polysOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      const nx = y2 - y1, ny = x1 - x2;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [px, py] of a) { const d = px * nx + py * ny; amin = Math.min(amin, d); amax = Math.max(amax, d); }
      for (const [px, py] of b) { const d = px * nx + py * ny; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
      if (amax <= bmin || bmax <= amin) return false;
    }
  }
  return true;
}
function raySegment(ox, oy, dx, dy, x1, y1, x2, y2) {
  const ex = x2 - x1, ey = y2 - y1;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return Infinity;
  const t = ((x1 - ox) * ey - (y1 - oy) * ex) / den;
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : Infinity;
}
const angleWrap = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };

const BODY_POLY = boxPoly([ROBOT.body.x0, ROBOT.body.y0, ROBOT.body.x1, ROBOT.body.y1]);

// ---------- Color classification ----------
const COLOR_NAMES = { none: 'no color', black: 'black', blue: 'blue', green: 'green', yellow: 'yellow', red: 'red', white: 'white', brown: 'brown' };
function classifyColor(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, sat = mx === 0 ? 0 : (mx - mn) / mx;
  if (sat < 0.3) return v < 0.42 ? 'black' : 'white';
  if (v < 0.18) return 'black';
  let h;
  if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6);
  else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
  else h = 60 * ((r - g) / (mx - mn) + 4);
  if (h < 0) h += 360;
  if (h < 18 || h >= 330) return 'red';
  if (h < 45) return v < 0.7 ? 'brown' : 'yellow';
  if (h < 72) return 'yellow';
  if (h < 170) return 'green';
  if (h < 265) return 'blue';
  return 'red';
}

// Infrared remote buttons (EV3 IR beacon remote)
const BEACON_BUTTONS = ['none', 'top left', 'bottom left', 'top right', 'bottom right', 'top left + top right', 'top left + bottom right',
  'bottom left + top right', 'bottom left + bottom right', 'beacon', 'top left + bottom left', 'top right + bottom right'];
function beaconCode(pressed) {
  if (pressed.has('beacon')) return 'beacon';
  const order = ['top left', 'bottom left', 'top right', 'bottom right'].filter((b) => pressed.has(b));
  if (order.length === 0) return 'none';
  if (order.length === 1) return order[0];
  const name = order.slice(0, 2).join(' + ');
  return BEACON_BUTTONS.includes(name) ? name : 'none';
}

class Sim {
  constructor() {
    this.motors = {};
    for (const n of ['A', 'B', 'C', 'D']) this.motors[n] = new Motor(n);
    this.t = 0;
    this.stepIndex = 0;
    this.robot = { x: 30, y: 30, th: 0 };
    this.noise = { turn: 1, lin: 1 };
    this.trail = [];
    this.mat = null;
    this.beacon = null; // { x, y, channel }
    this.remote = { channel: 1, pressed: new Set() };
    this.manual = {}; // manual touch presses per port
    this.setConfig(DEFAULT_CONFIG);
  }

  setConfig(cfg) {
    this.config = normalizeConfig(cfg);
    for (const [p, m] of Object.entries(this.config.motors)) this.motors[p].setKind(m.type === 'none' ? 'large' : m.type);
    this.gyroOffset = {};
    this.calib = {};
    this._cache = {};
    if (this.gyroRaw === undefined) { this.gyroRaw = 0; this.gyroZero = 0; }
  }
  wheelPort(role) {
    for (const [p, m] of Object.entries(this.config.motors)) if (m.role === role && m.type !== 'none') return p;
    return null;
  }

  loadMat(mat) {
    this.mat = mat;
    const c = document.createElement('canvas');
    c.width = Math.round(mat.w * MAT_SCALE);
    c.height = Math.round(mat.h * MAT_SCALE);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.scale(MAT_SCALE, MAT_SCALE);
    mat.draw(ctx);
    ctx.restore();
    this.matCanvas = c;
    this.matPixels = ctx.getImageData(0, 0, c.width, c.height).data;
    this.obstacles = (mat.obstacles || []).map((o) => ({ ...o, poly: o.poly.map((p) => p.slice()) }));
    this.beacon = mat.beacon ? { ...mat.beacon } : null;
    this.hook = null;
    this._rebuildSegments();
  }

  _rebuildSegments() {
    const { w, h } = this.mat;
    const segs = [[0, 0, w, 0], [w, 0, w, h], [w, h, 0, h], [0, h, 0, 0]];
    for (const o of this.obstacles) {
      for (let i = 0; i < o.poly.length; i++) {
        const a = o.poly[i], b = o.poly[(i + 1) % o.poly.length];
        segs.push([a[0], a[1], b[0], b[1]]);
      }
    }
    this.segments = segs;
    this._cache = {};
  }

  moveObstacle(o, dx, dy) {
    o.poly.forEach((p) => { p[0] += dx; p[1] += dy; });
    this._rebuildSegments();
  }

  resetRobot(pose) {
    this.robot = { x: pose.x, y: pose.y, th: pose.th || 0 };
    for (const m of Object.values(this.motors)) m.reset();
    this.t = 0;
    this.stepIndex = 0;
    this.gyroRaw = (pose.th || 0) / DEG;
    this.gyroZero = this.gyroRaw;
    this.gyroOffset = {};
    this.calib = {};
    this.gyroRateVal = 0;
    this.vel = 0;
    this.contact = false;
    this.collisions = 0;
    this.trail = [[pose.x, pose.y]];
    this._cache = {};
  }

  setNoise(turn = 1, lin = 1) { this.noise = { turn, lin }; }

  stopAllMotors(action) { for (const m of Object.values(this.motors)) m.stop(action); }

  bodyPoly(x = this.robot.x, y = this.robot.y, th = this.robot.th) { return transformPoly(BODY_POLY, x, y, th); }

  outside(poly) {
    const { w, h } = this.mat;
    return poly.some(([px, py]) => px < 0 || py < 0 || px > w || py > h);
  }
  collides(x, y, th) {
    const poly = this.bodyPoly(x, y, th);
    if (this.outside(poly)) return true;
    return this.obstacles.some((o) => polysOverlap(poly, o.poly));
  }

  step(dt = DT) {
    for (const m of Object.values(this.motors)) m.step(dt, this.t);
    const r = ROBOT.wheelD / 2;
    const lp = this.wheelPort('left'), rp = this.wheelPort('right');
    const vL = lp ? this.motors[lp].speed * DEG * r : 0;
    const vR = rp ? this.motors[rp].speed * DEG * r : 0;
    const v = (vL + vR) / 2 * this.noise.lin;
    const w = (vL - vR) / ROBOT.track * this.noise.turn; // rad/s, positive = clockwise
    const { x, y, th } = this.robot;
    const nth = th + w * dt;
    const mid = th + w * dt / 2;
    const nx = x + v * Math.cos(mid) * dt, ny = y + v * Math.sin(mid) * dt;
    let hit = false;
    if (v !== 0 || w !== 0) {
      if (!this.collides(nx, ny, nth)) {
        this.robot = { x: nx, y: ny, th: nth };
      } else {
        hit = true;
        if (w !== 0 && !this.collides(x, y, nth)) this.robot = { x, y, th: nth };
        else if (!this.collides(nx, ny, th)) this.robot = { x: nx, y: ny, th };
      }
    }
    if (hit && !this.contact) this.collisions++;
    this.contact = hit;
    const dth = this.robot.th - th;
    this.gyroRaw += dth / DEG;
    this.gyroRateVal = dth / DEG / dt;
    this.vel = Math.hypot(this.robot.x - x, this.robot.y - y) / dt;
    this.t += dt;
    this.stepIndex++;
    this._cache = {};
    if (this.hook) this.hook(this, dt);
    const last = this.trail[this.trail.length - 1];
    if (Math.hypot(this.robot.x - last[0], this.robot.y - last[1]) > 0.7) {
      this.trail.push([this.robot.x, this.robot.y]);
      if (this.trail.length > 6000) this.trail.shift();
    }
  }

  worldPoint(local) {
    const { x, y, th } = this.robot;
    const c = Math.cos(th), s = Math.sin(th);
    return [x + local[0] * c - local[1] * s, y + local[0] * s + local[1] * c];
  }

  sensorPorts(type) { return Object.keys(this.config.sensors).filter((p) => this.config.sensors[p].type === type); }
  _mount(port) { return this.config.sensors[port].mount; }
  _cached(key, fn) {
    if (!(key in this._cache)) this._cache[key] = fn();
    return this._cache[key];
  }

  // ---------- Touch ----------
  bumperPoly(port) {
    const { x, y, th } = this.robot;
    return transformPoly(boxPoly(BUMPER_GEO[this._mount(port)]), x, y, th);
  }
  touchPressed(port) {
    if (this.manual[port]) return true;
    return this._cached('touch' + port, () => {
      const poly = this.bumperPoly(port);
      return this.outside(poly) || this.obstacles.some((o) => polysOverlap(poly, o.poly));
    });
  }

  // ---------- Color ----------
  colorPoint(port) { return this.worldPoint(COLOR_GEO[this._mount(port)]); }
  colorRGB(port) {
    return this._cached('rgb' + port, () => {
      const [cx, cy] = this.colorPoint(port);
      const W = this.matCanvas.width, H = this.matCanvas.height, px = this.matPixels;
      let r = 0, g = 0, b = 0, n = 0, out = 0;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          if (i * i + j * j > 5) continue;
          const sx = Math.floor((cx + i * 0.35) * MAT_SCALE), sy = Math.floor((cy + j * 0.35) * MAT_SCALE);
          n++;
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) { out++; continue; }
          const k = (sy * W + sx) * 4;
          r += px[k]; g += px[k + 1]; b += px[k + 2];
        }
      }
      return out === n ? null : [r / n, g / n, b / n];
    });
  }
  colorKey(port) {
    const rgb = this.colorRGB(port);
    return rgb ? classifyColor(...rgb) : 'none';
  }
  reflectRaw(port) {
    const rgb = this.colorRGB(port);
    if (!rgb) return 0;
    return 3 + 92 * (0.55 * rgb[0] + 0.3 * rgb[1] + 0.15 * rgb[2]) / 255;
  }
  reflect(port) {
    const raw = this.reflectRaw(port);
    const c = this.calib[port];
    if (c && c.max > c.min) return Math.round(clamp((raw - c.min) / (c.max - c.min) * 100, 0, 100));
    return Math.round(raw);
  }
  calibrate(port, which) {
    const c = this.calib[port] || { min: 0, max: 100 };
    c[which === 'max' ? 'max' : 'min'] = this.reflectRaw(port);
    this.calib[port] = c;
  }
  resetCalibration(port) { delete this.calib[port]; }
  ambient() { return this.mat && this.mat.ambient !== undefined ? this.mat.ambient : 12; }

  // ---------- Ultrasonic / infrared ----------
  rayDistance(origin, angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let best = Infinity;
    for (const s of this.segments) best = Math.min(best, raySegment(origin[0], origin[1], dx, dy, s[0], s[1], s[2], s[3]));
    return best;
  }
  eye(port) {
    const g = MOUNT_GEO[this._mount(port)];
    return { origin: this.worldPoint(g), angle: this.robot.th + g[2] * DEG };
  }
  _coneDistance(port, spread) {
    const { origin, angle } = this.eye(port);
    let d = Infinity;
    for (const a of [-spread, 0, spread]) d = Math.min(d, this.rayDistance(origin, angle + a * DEG));
    return d;
  }
  ultrasonic(port) {
    return this._cached('us' + port, () => Math.round(clamp(this._coneDistance(port, 7), 3, 255) * 10) / 10);
  }
  irProximity(port) {
    return this._cached('ir' + port, () => Math.round(clamp(this._coneDistance(port, 10) / 0.7, 0, 100)));
  }
  beaconInfo(port, channel) {
    return this._cached(`bc${port}_${channel}`, () => {
      const b = this.beacon;
      const none = { active: false, heading: 0, proximity: 100 };
      if (!b || Number(b.channel) !== Number(channel)) return none;
      const { origin, angle } = this.eye(port);
      const dx = b.x - origin[0], dy = b.y - origin[1];
      const dist = Math.hypot(dx, dy);
      const rel = angleWrap(Math.atan2(dy, dx) / DEG - angle / DEG);
      if (Math.abs(rel) > 90 || dist > 200) return none;
      if (this.rayDistance(origin, Math.atan2(dy, dx)) < dist - 2) return none; // blocked
      return { active: true, heading: Math.round(clamp(rel * 25 / 90, -25, 25)), proximity: Math.round(clamp(dist / 2, 0, 100)) };
    });
  }
  beaconButtons(channel) {
    return Number(this.remote.channel) === Number(channel) ? beaconCode(this.remote.pressed) : 'none';
  }

  // ---------- Gyro ----------
  gyroAngle(port) { return Math.round(this.gyroRaw - (this.gyroOffset[port] !== undefined ? this.gyroOffset[port] : this.gyroZero)); }
  gyroRate() { return Math.round(this.gyroRateVal); }
  gyroReset(port) { this.gyroOffset[port] = this.gyroRaw; }
}
