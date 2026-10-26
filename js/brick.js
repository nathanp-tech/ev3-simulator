// EV3 brick: 178×128 LCD, status light, buttons and sound.
'use strict';

const LCD_W = 178, LCD_H = 128;
const LCD_BG = '#dfe5d3', LCD_FG = '#151a12';
const FONTS = { small: { px: 10, lh: 11 }, normal: { px: 14, lh: 16 }, large: { px: 22, lh: 25 } };

class Lcd {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = LCD_W;
    this.canvas.height = LCD_H;
    this.ctx = this.canvas.getContext('2d');
    this.reset();
  }
  reset() { this.font = 'normal'; this.pen = 'black'; this.clear(); }
  get fg() { return this.pen === 'white' ? LCD_BG : LCD_FG; }
  clear() {
    this.ctx.fillStyle = LCD_BG;
    this.ctx.fillRect(0, 0, LCD_W, LCD_H);
    this.texts = [];
  }
  _font() {
    const f = FONTS[this.font];
    this.ctx.font = `bold ${f.px}px "Courier New", monospace`;
    this.ctx.textBaseline = 'top';
    return f;
  }
  textLine(text, line) {
    const f = this._font();
    line = Math.max(1, Math.round(line));
    const y = (line - 1) * f.lh;
    this.ctx.fillStyle = LCD_BG;
    this.ctx.fillRect(0, y, LCD_W, f.lh);
    this.ctx.fillStyle = this.fg;
    this.ctx.fillText(text, 1, y + 1);
    this.texts = this.texts.filter((t) => !(t.y >= y && t.y < y + f.lh));
    this.texts.push({ text, y });
  }
  textXY(text, x, y) {
    const f = this._font();
    this.ctx.fillStyle = this.fg;
    this.ctx.fillText(text, x, y);
    this.texts = this.texts.filter((t) => !(t.x === x && t.y === y));
    this.texts.push({ text, x, y, h: f.lh });
  }
  pixel(x, y) { this.ctx.fillStyle = this.fg; this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  line(x1, y1, x2, y2) {
    const c = this.ctx;
    c.strokeStyle = this.fg; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x1 + 0.5, y1 + 0.5); c.lineTo(x2 + 0.5, y2 + 0.5); c.stroke();
  }
  circle(fill, x, y, r) {
    const c = this.ctx;
    c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    if (fill === 'fill') { c.fillStyle = this.fg; c.fill(); } else { c.strokeStyle = this.fg; c.lineWidth = 1; c.stroke(); }
  }
  rect(fill, x, y, w, h) {
    const c = this.ctx;
    if (fill === 'fill') { c.fillStyle = this.fg; c.fillRect(x, y, w, h); } else { c.strokeStyle = this.fg; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w, h); }
  }
  image(name) {
    this.clear();
    const c = this.ctx;
    c.save();
    c.fillStyle = LCD_FG; c.strokeStyle = LCD_FG; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
    const eye = (x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
    const pupil = (x, y, r) => { c.fillStyle = LCD_BG; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.fillStyle = LCD_FG; };
    const arc = (x, y, r, a0, a1) => { c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke(); };
    const path = (pts, close) => { c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach((p) => c.lineTo(...p)); if (close) c.closePath(); };
    const P = Math.PI;
    switch (name) {
      case 'neutral': eye(52, 64, 28, 30); eye(126, 64, 28, 30); pupil(58, 70, 9); pupil(132, 70, 9); break;
      case 'happy': c.lineWidth = 10; arc(52, 78, 26, P * 1.1, P * 1.9); arc(126, 78, 26, P * 1.1, P * 1.9); break;
      case 'sad': eye(52, 70, 26, 24); eye(126, 70, 26, 24); c.fillStyle = LCD_BG; path([[20, 30], [80, 58], [20, 58]], true); c.fill(); path([[158, 30], [98, 58], [158, 58]], true); c.fill(); break;
      case 'angry': eye(52, 72, 26, 24); eye(126, 72, 26, 24); c.fillStyle = LCD_BG; path([[20, 40], [80, 66], [80, 40]], true); c.fill(); path([[158, 40], [98, 66], [98, 40]], true); c.fill(); break;
      case 'surprised': c.lineWidth = 6; arc(52, 64, 32, 0, 2 * P); arc(126, 64, 32, 0, 2 * P); eye(52, 64, 9, 9); eye(126, 64, 9, 9); break;
      case 'sleepy': c.lineWidth = 8; path([[24, 70], [80, 70]]); c.stroke(); path([[98, 70], [154, 70]]); c.stroke(); c.font = 'bold 18px sans-serif'; c.fillText('z z Z', 120, 18); break;
      case 'wink': eye(52, 64, 28, 30); pupil(58, 70, 9); c.lineWidth = 10; arc(126, 78, 26, P * 1.1, P * 1.9); break;
      case 'smiley': c.lineWidth = 5; arc(89, 64, 54, 0, 2 * P); eye(70, 50, 7, 10); eye(108, 50, 7, 10); arc(89, 66, 32, P * 0.15, P * 0.85); break;
      case 'up': path([[89, 10], [140, 64], [108, 64], [108, 118], [70, 118], [70, 64], [38, 64]], true); c.fill(); break;
      case 'down': path([[89, 118], [140, 64], [108, 64], [108, 10], [70, 10], [70, 64], [38, 64]], true); c.fill(); break;
      case 'left': path([[20, 64], [80, 14], [80, 44], [158, 44], [158, 84], [80, 84], [80, 114]], true); c.fill(); break;
      case 'right': path([[158, 64], [98, 14], [98, 44], [20, 44], [20, 84], [98, 84], [98, 114]], true); c.fill(); break;
      case 'check': c.lineWidth = 16; path([[44, 66], [76, 98], [136, 30]]); c.stroke(); break;
      case 'cross': c.lineWidth = 16; path([[48, 24], [130, 104]]); c.stroke(); path([[130, 24], [48, 104]]); c.stroke(); break;
      case 'heart': c.beginPath(); c.moveTo(89, 116); c.bezierCurveTo(10, 60, 40, 0, 89, 38); c.bezierCurveTo(138, 0, 168, 60, 89, 116); c.fill(); break;
      case 'question': c.font = 'bold 110px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 89, 68); break;
      case 'warning': path([[89, 8], [166, 120], [12, 120]], true); c.fill(); c.fillStyle = LCD_BG; c.font = 'bold 72px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 89, 82); break;
      case 'stop': {
        const pts = []; for (let i = 0; i < 8; i++) { const a = P / 8 + i * P / 4; pts.push([89 + 58 * Math.cos(a), 64 + 58 * Math.sin(a)]); }
        path(pts, true); c.fill(); c.fillStyle = LCD_BG; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('STOP', 89, 66); break;
      }
    }
    c.restore();
  }
  screenText() { return this.texts.map((t) => t.text).join('\n'); }
}

// ---------- Sound (Web Audio + speech synthesis) ----------
const SOUND_FX = {
  'fx:beep': 0.25, 'fx:horn': 0.8, 'fx:laser': 0.5, 'fx:boing': 0.6, 'fx:siren': 1.6,
  'fx:fanfare': 1.0, 'fx:error': 0.7, 'fx:applause': 1.5,
};

class Sound {
  constructor() { this.volume = 100; this.muted = false; this.ctx = null; this.nodes = new Set(); }
  _ac() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  duration(name) {
    if (SOUND_FX[name]) return SOUND_FX[name];
    return 0.35 + 0.07 * name.length;
  }
  _tone(freq, start, dur, type = 'square', freqEnd = null) {
    const ac = this._ac();
    if (!ac || !isFinite(freq) || !isFinite(dur)) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    const t0 = ac.currentTime + start;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const vol = 0.15 * this.volume / 100;
    g.gain.setValueAtTime(vol, t0);
    g.gain.setValueAtTime(vol, t0 + dur * 0.85);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
    this.nodes.add(o);
    o.onended = () => this.nodes.delete(o);
  }
  _noise(start, dur) {
    const ac = this._ac();
    if (!ac) return;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(i / 900));
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf; g.gain.value = 0.12 * this.volume / 100;
    s.connect(g).connect(ac.destination);
    s.start(ac.currentTime + start);
    this.nodes.add(s); s.onended = () => this.nodes.delete(s);
  }
  beep(note, secs) {
    if (this.muted || this.volume <= 0) return;
    this._tone(clamp(440 * Math.pow(2, (note - 69) / 12), 20, 20000), 0, clamp(secs, 0.02, 30));
  }
  play(name) {
    if (this.muted || this.volume <= 0) return;
    switch (name) {
      case 'fx:beep': this._tone(880, 0, 0.25); break;
      case 'fx:horn': this._tone(330, 0, 0.35, 'sawtooth'); this._tone(330, 0.45, 0.35, 'sawtooth'); break;
      case 'fx:laser': this._tone(1800, 0, 0.5, 'sawtooth', 120); break;
      case 'fx:boing': this._tone(120, 0, 0.6, 'sine', 600); break;
      case 'fx:siren': for (let i = 0; i < 4; i++) this._tone(i % 2 ? 600 : 900, i * 0.4, 0.4, 'triangle'); break;
      case 'fx:fanfare': [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i * 0.2, i === 3 ? 0.4 : 0.18, 'square')); break;
      case 'fx:error': this._tone(200, 0, 0.3, 'sawtooth'); this._tone(150, 0.35, 0.35, 'sawtooth'); break;
      case 'fx:applause': this._noise(0, 1.5); break;
      default:
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(name);
          u.lang = 'en-US'; u.volume = this.volume / 100; u.rate = 1.05;
          window.speechSynthesis.speak(u);
        }
    }
  }
  stopAll() {
    for (const n of this.nodes) { try { n.stop(); } catch (e) { /* already stopped */ } }
    this.nodes.clear();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}

class Brick {
  constructor() {
    this.lcd = new Lcd();
    this.sound = new Sound();
    this.light = { color: 'green', mode: 'on' };
    this.buttons = { up: false, down: false, left: false, right: false, center: false };
  }
  reset() {
    this.lcd.reset();
    this.sound.stopAll();
    this.sound.volume = 100;
    this.light = { color: 'green', mode: 'on' };
  }
}
