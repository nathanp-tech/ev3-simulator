// Port View: one tile per port showing live values, also used to configure the robot.
'use strict';

const SENSOR_ICON = { touch: 'touch', color: 'color', ultrasonic: 'ultrasonic', gyro: 'gyro', infrared: 'infrared' };
const SWATCH = { none: 'transparent', black: '#141414', white: '#fff', red: '#d8232a', green: '#00a651', blue: '#0060c0', yellow: '#ffd500', brown: '#7a4a1e' };
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const options = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${escHtml(v)}</option>`).join('');

class PortView {
  constructor(grid, sim, { onConfigChange }) {
    this.grid = grid;
    this.sim = sim;
    this.onConfigChange = onConfigChange;
    this.cache = new Map();
    this.editable = true;
    grid.addEventListener('change', (e) => this._onChange(e));
    grid.addEventListener('pointerdown', (e) => this._onPress(e, true));
    grid.addEventListener('pointerup', (e) => this._onPress(e, false));
    grid.addEventListener('pointerleave', (e) => this._onPress(e, false), true);
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="gyro-reset"]');
      if (b) this.sim.gyroReset(b.dataset.port);
    });
  }

  render() {
    const cfg = this.sim.config;
    const tiles = [];
    for (const p of ['1', '2', '3', '4']) tiles.push(this._sensorTile(p, cfg.sensors[p]));
    for (const p of ['A', 'B', 'C', 'D']) tiles.push(this._motorTile(p, cfg.motors[p]));
    this.grid.innerHTML = tiles.join('');
    this.cache.clear();
    this.setEditable(this.editable);
  }

  setEditable(on) {
    this.editable = on;
    this.grid.querySelectorAll('select[data-cfg]').forEach((s) => { s.disabled = !on; });
  }

  warnings() {
    const out = [];
    const roles = Object.values(this.sim.config.motors).filter((m) => m.type !== 'none').map((m) => m.role);
    if (!roles.includes('left') || !roles.includes('right')) out.push('The robot needs a left and a right wheel motor to drive.');
    if (roles.filter((r) => r === 'left').length > 1 || roles.filter((r) => r === 'right').length > 1) out.push('Two motors drive the same wheel.');
    return out;
  }

  _icon(name, color) {
    return `<span class="ticon" style="background:${color}"><img src="${iconURI(name, color)}" alt=""></span>`;
  }

  _sensorTile(p, s) {
    const typeSel = `<select data-cfg="type" data-port="${p}">${options(SENSOR_TYPES, s.type)}</select>`;
    let bottom = '';
    if (s.type !== 'none' && s.type !== 'gyro') bottom += `<select data-cfg="mount" data-port="${p}" title="Where the sensor is mounted">${options(MOUNTS, s.mount)}</select>`;
    if (s.type === 'touch') bottom += `<button class="mini hold" data-hold="touch" data-port="${p}" title="Hold to press the sensor">Press</button>`;
    if (s.type === 'gyro') bottom += `<button class="mini" data-act="gyro-reset" data-port="${p}">Reset angle</button>`;
    if (s.type === 'infrared') {
      bottom += `<div class="remote"><select data-remote="channel" title="Remote channel">${[1, 2, 3, 4].map((c) => `<option value="${c}"${Number(this.sim.remote.channel) === c ? ' selected' : ''}>CH ${c}</option>`).join('')}</select>
        <div class="rbtns"><button class="mini hold" data-hold="top left">TL</button><button class="mini hold" data-hold="top right">TR</button>
        <button class="mini hold" data-hold="bottom left">BL</button><button class="mini hold" data-hold="bottom right">BR</button>
        <button class="mini hold beaconbtn" data-hold="beacon" title="Beacon mode button">●</button></div></div>`;
    }
    const icon = s.type === 'none' ? '<span class="ticon empty"></span>' : this._icon(SENSOR_ICON[s.type], EV3_COLORS.sensors);
    return `<div class="tile ${s.type === 'none' ? 'off' : ''}" data-port="${p}">
      <div class="tile-top"><span class="pnum s">${p}</span>${typeSel}</div>
      <div class="tile-main">${icon}<div class="tile-val" id="tv-${p}">—</div></div>
      <div class="tile-sub" id="ts-${p}"></div>
      <div class="tile-bottom">${bottom}</div>
    </div>`;
  }

  _motorTile(p, m) {
    const typeSel = `<select data-cfg="mtype" data-port="${p}">${options(MOTOR_KINDS, m.type)}</select>`;
    const roleSel = m.type === 'none' ? '' : `<select data-cfg="role" data-port="${p}" title="What the motor is connected to">${options(MOTOR_ROLES, m.role)}</select>`;
    const icon = m.type === 'none' ? '<span class="ticon empty"></span>' : `<span class="dial" id="dial-${p}"><span class="needle"></span></span>`;
    return `<div class="tile motor ${m.type === 'none' ? 'off' : ''}" data-port="${p}">
      <div class="tile-top"><span class="pnum m">${p}</span>${typeSel}</div>
      <div class="tile-main">${icon}<div class="tile-val" id="tv-${p}">—</div></div>
      <div class="tile-sub" id="ts-${p}"></div>
      <div class="tile-bottom">${roleSel}</div>
    </div>`;
  }

  _onChange(e) {
    const t = e.target;
    if (t.dataset.remote === 'channel') { this.sim.remote.channel = Number(t.value); return; }
    if (!t.dataset.cfg || !this.editable) return;
    const cfg = JSON.parse(JSON.stringify(this.sim.config));
    const p = t.dataset.port;
    if (t.dataset.cfg === 'type') {
      cfg.sensors[p].type = t.value;
      if (t.value === 'color' && cfg.sensors[p].mount === 'back') cfg.sensors[p].mount = 'front';
    }
    if (t.dataset.cfg === 'mount') cfg.sensors[p].mount = t.value;
    if (t.dataset.cfg === 'mtype') cfg.motors[p].type = t.value;
    if (t.dataset.cfg === 'role') cfg.motors[p].role = t.value;
    this.onConfigChange(cfg);
  }

  _onPress(e, down) {
    const b = e.target.closest && e.target.closest('[data-hold]');
    if (!b) return;
    if (down) e.preventDefault();
    b.classList.toggle('pressed', down);
    if (b.dataset.hold === 'touch') this.sim.manual[b.dataset.port] = down;
    else if (down) this.sim.remote.pressed.add(b.dataset.hold);
    else this.sim.remote.pressed.delete(b.dataset.hold);
  }

  _set(id, html) {
    if (this.cache.get(id) === html) return;
    this.cache.set(id, html);
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  update() {
    const sim = this.sim, cfg = sim.config;
    for (const p of ['1', '2', '3', '4']) {
      const s = cfg.sensors[p];
      let v = '<span class="muted">No sensor</span>', sub = '';
      if (s.type === 'touch') {
        const on = sim.touchPressed(p);
        v = on ? '<b class="on">Pressed</b>' : 'Released';
      } else if (s.type === 'color') {
        const c = sim.colorKey(p);
        v = `<span class="swatch" style="background:${SWATCH[c]}"></span>${COLOR_NAMES[c]}`;
        sub = `reflected ${sim.reflect(p)} % · ambient ${sim.ambient()} %`;
      } else if (s.type === 'ultrasonic') {
        const d = sim.ultrasonic(p);
        v = `${d.toFixed(1)} cm`;
        sub = `${(d / 2.54).toFixed(1)} in`;
      } else if (s.type === 'gyro') {
        v = `${sim.gyroAngle(p)}°`;
        sub = `angular velocity ${sim.gyroRate(p)} °/s`;
      } else if (s.type === 'infrared') {
        v = `${sim.irProximity(p)} %`;
        const b = sim.beaconInfo(p, sim.remote.channel);
        sub = `beacon CH${sim.remote.channel}: ${b.active ? `heading ${b.heading}, prox. ${b.proximity}` : 'not seen'} · buttons: ${sim.beaconButtons(sim.remote.channel)}`;
      }
      this._set('tv-' + p, v);
      this._set('ts-' + p, sub);
    }
    for (const p of ['A', 'B', 'C', 'D']) {
      const m = cfg.motors[p];
      if (m.type === 'none') { this._set('tv-' + p, '<span class="muted">No motor</span>'); this._set('ts-' + p, ''); continue; }
      const mo = sim.motors[p];
      this._set('tv-' + p, `${Math.round(mo.position())}°`);
      this._set('ts-' + p, `speed ${Math.round(mo.speed / mo.maxSpeed * 100)} %`);
      const dial = document.getElementById('dial-' + p);
      if (dial) dial.firstChild.style.transform = `rotate(${mo.position() % 360}deg)`;
    }
  }
}

// ---------- Port View diagram (like EV3 Classroom): brick in the middle, devices around it ----------
const PV_MODES = {
  motor: [['deg', 'Degrees'], ['rot', 'Rotations'], ['speed', 'Current Speed']],
  touch: [['state', 'Pressed / Released']],
  color: [['reflect', 'Reflected Light Intensity'], ['ambient', 'Ambient Light Intensity'], ['color', 'Color']],
  ultrasonic: [['cm', 'Distance (cm)'], ['in', 'Distance (inches)']],
  gyro: [['angle', 'Angle'], ['rate', 'Rate']],
  infrared: [['prox', 'Proximity'], ['heading', 'Beacon Heading'], ['bprox', 'Beacon Proximity'], ['buttons', 'Remote Buttons']],
};
const PV_W = 560, PV_H = 440;
const PV_BRICK = { x: 205, y: 120, w: 150, h: 200 };
const PV_PORTX = [235, 265, 295, 325];
const PV_NODEX = [62, 188, 372, 498];

class PortDiagram {
  constructor(el, sim, brick) {
    this.el = el;
    this.sim = sim;
    this.brick = brick;
    this.modes = {};
    this.cache = new Map();
    el.addEventListener('change', (e) => {
      const s = e.target.closest('select[data-mode]');
      if (s) { this.modes[s.dataset.mode] = s.value; this.cache.clear(); this.update(); }
    });
  }

  kind(port) {
    const cfg = this.sim.config;
    if (cfg.motors[port]) return cfg.motors[port].type === 'none' ? null : 'motor';
    const t = cfg.sensors[port].type;
    return t === 'none' ? null : t;
  }

  node(port, cx, cy) {
    const kind = this.kind(port);
    const isMotor = 'ABCD'.includes(port);
    const pos = `left:${cx - 60}px;top:${cy - 34}px`;
    if (!kind) {
      return `<div class="pv-node empty" style="${pos}"><span class="pv-circle"></span><span class="pv-badge ${isMotor ? 'm' : 's'}">${port}</span><div class="pv-val muted">empty</div></div>`;
    }
    const modes = PV_MODES[kind];
    if (!this.modes[port] || !modes.some(([k]) => k === this.modes[port])) this.modes[port] = modes[0][0];
    const iconName = kind === 'motor' ? 'motor' : SENSOR_ICON[kind];
    const color = isMotor ? EV3_COLORS.motors : EV3_COLORS.sensors;
    const label = isMotor ? MOTOR_KINDS[this.sim.config.motors[port].type] : SENSOR_TYPES[kind];
    return `<div class="pv-node" style="${pos}" title="Port ${port}: ${escHtml(label)}">
      <span class="pv-circle" style="background:${color}"><img src="${iconURI(iconName, color)}" alt=""></span>
      <span class="pv-badge ${isMotor ? 'm' : 's'}">${port}</span>
      <label class="pv-val"><span id="dv-${port}">—</span> <span class="pv-caret">▾</span>
        <select data-mode="${port}" title="What to show">${modes.map(([k, n]) => `<option value="${k}"${k === this.modes[port] ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </label>
    </div>`;
  }

  render() {
    const B = PV_BRICK, top = 50, bottom = 392;
    const lines = [];
    ['A', 'B', 'C', 'D'].forEach((p, i) => {
      if (!this.kind(p)) return;
      const nx = PV_NODEX[i], px = PV_PORTX[i], mid = [90, 104, 104, 90][i];
      lines.push(`M${nx} ${top + 26} V${mid} H${px} V${B.y}`);
    });
    ['1', '2', '3', '4'].forEach((p, i) => {
      if (!this.kind(p)) return;
      const nx = PV_NODEX[i], px = PV_PORTX[i], mid = [350, 336, 336, 350][i];
      lines.push(`M${nx} ${bottom - 26} V${mid} H${px} V${B.y + B.h}`);
    });
    this.el.style.width = PV_W + 'px';
    this.el.style.height = PV_H + 'px';
    this.el.innerHTML = `
      <svg class="pv-lines" width="${PV_W}" height="${PV_H}">${lines.map((d) => `<path d="${d}"/>`).join('')}</svg>
      <div class="pv-brick" style="left:${B.x}px;top:${B.y}px;width:${B.w}px;height:${B.h}px">
        <div class="pv-ports top">${['A', 'B', 'C', 'D'].map((p) => `<span>${p}</span>`).join('')}</div>
        <div class="pv-screen"><canvas id="pvLcd" width="178" height="128"></canvas></div>
        <div class="pv-pad" id="pvPad"><span></span></div>
        <div class="pv-logo">EV3</div>
        <div class="pv-ports bottom">${['1', '2', '3', '4'].map((p) => `<span>${p}</span>`).join('')}</div>
      </div>
      ${['A', 'B', 'C', 'D'].map((p, i) => this.node(p, PV_NODEX[i], top)).join('')}
      ${['1', '2', '3', '4'].map((p, i) => this.node(p, PV_NODEX[i], bottom)).join('')}`;
    this.cache.clear();
    this.update();
  }

  value(port) {
    const sim = this.sim, kind = this.kind(port), mode = this.modes[port];
    if (kind === 'motor') {
      const m = sim.motors[port];
      if (mode === 'rot') return (m.position() / 360).toFixed(2);
      if (mode === 'speed') return Math.round(m.speed / m.maxSpeed * 100) + ' %';
      return Math.round(m.position()) + '°';
    }
    if (kind === 'touch') return sim.touchPressed(port) ? 'Pressed' : 'Released';
    if (kind === 'color') {
      if (mode === 'ambient') return sim.ambient() + ' %';
      if (mode === 'color') { const c = sim.colorKey(port); return `<span class="swatch" style="background:${SWATCH[c]}"></span>${COLOR_NAMES[c]}`; }
      return sim.reflect(port) + ' %';
    }
    if (kind === 'ultrasonic') { const d = sim.ultrasonic(port); return mode === 'in' ? (d / 2.54).toFixed(1) + ' in' : d.toFixed(1) + ' cm'; }
    if (kind === 'gyro') return mode === 'rate' ? sim.gyroRate(port) + ' °/s' : sim.gyroAngle(port) + '°';
    if (kind === 'infrared') {
      const ch = sim.remote.channel, b = sim.beaconInfo(port, ch);
      if (mode === 'heading') return b.active ? String(b.heading) : 'no beacon';
      if (mode === 'bprox') return b.active ? b.proximity + ' %' : 'no beacon';
      if (mode === 'buttons') return sim.beaconButtons(ch);
      return sim.irProximity(port) + ' %';
    }
    return '—';
  }

  update() {
    if (!this.sim.mat || this.el.offsetParent === null) return;
    for (const p of ['A', 'B', 'C', 'D', '1', '2', '3', '4']) {
      if (!this.kind(p)) continue;
      const v = this.value(p);
      if (this.cache.get(p) === v) continue;
      this.cache.set(p, v);
      const el = document.getElementById('dv-' + p);
      if (el) el.innerHTML = v;
    }
    const lcd = document.getElementById('pvLcd');
    if (lcd) lcd.getContext('2d').drawImage(this.brick.lcd.canvas, 0, 0);
    const pad = document.getElementById('pvPad');
    if (pad) {
      const lv = lightVisible(this.brick.light, this.sim.t);
      const col = lv > 0 ? LIGHT_COLORS[this.brick.light.color] : '#9aa1a8';
      pad.style.boxShadow = `0 0 0 3px ${col}${lv > 0 ? `, 0 0 ${8 * lv}px ${col}` : ''}`;
    }
  }
}
