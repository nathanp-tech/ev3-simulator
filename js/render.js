// Scene drawing: mat, obstacles, trail, beacon and the robot seen from above (drawn from its configuration).
'use strict';

const LIGHT_COLORS = { green: '#2ecc40', orange: '#ff9f1a', red: '#ff3b30' };

function lightVisible(light, t) {
  if (!light || !light.color) return 0;
  if (light.mode === 'flash') return Math.floor(t * 4) % 2 ? 1 : 0.15;
  if (light.mode === 'pulse') return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 1.2));
  return 1;
}

function computeView(canvas, mat) {
  const pad = 10;
  const s = Math.min((canvas.width - 2 * pad) / mat.w, (canvas.height - 2 * pad) / mat.h);
  return { s, ox: (canvas.width - mat.w * s) / 2, oy: (canvas.height - mat.h * s) / 2 };
}

function renderScene(canvas, sim, brick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const mat = sim.mat;
  const view = computeView(canvas, mat);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2b3036';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.s, view.s);

  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 12;
  ctx.drawImage(sim.matCanvas, 0, 0, mat.w, mat.h);
  ctx.shadowBlur = 0;

  if (opts.overlay) opts.overlay(ctx);

  if (opts.trail && sim.trail.length > 1) {
    ctx.strokeStyle = 'rgba(61,140,245,0.75)';
    ctx.lineWidth = 0.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...sim.trail[0]);
    for (const p of sim.trail) ctx.lineTo(...p);
    ctx.lineTo(sim.robot.x, sim.robot.y);
    ctx.stroke();
  }

  for (const o of sim.obstacles) {
    if (o.hidden) continue;
    ctx.beginPath();
    ctx.moveTo(...o.poly[0]);
    o.poly.slice(1).forEach((p) => ctx.lineTo(...p));
    ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6; ctx.shadowOffsetX = 0.8; ctx.shadowOffsetY = 0.8;
    ctx.fillStyle = o.color || PAL.box;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  if (sim.beacon) drawBeacon(ctx, sim.beacon);

  if (opts.sensors) {
    ctx.setLineDash([1.5, 1.5]);
    ctx.lineWidth = 0.5;
    for (const p of sim.sensorPorts('ultrasonic')) {
      const { origin, angle } = sim.eye(p);
      const d = sim.ultrasonic(p);
      ctx.strokeStyle = 'rgba(40,197,201,0.6)';
      ctx.beginPath(); ctx.moveTo(...origin); ctx.lineTo(origin[0] + Math.cos(angle) * d, origin[1] + Math.sin(angle) * d); ctx.stroke();
    }
    for (const p of sim.sensorPorts('infrared')) {
      const { origin, angle } = sim.eye(p);
      const d = Math.min(70, sim.irProximity(p) * 0.7);
      ctx.strokeStyle = 'rgba(255,80,80,0.55)';
      ctx.beginPath(); ctx.moveTo(...origin); ctx.lineTo(origin[0] + Math.cos(angle) * d, origin[1] + Math.sin(angle) * d); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawRobot(ctx, sim, brick, opts.time !== undefined ? opts.time : sim.t);
  ctx.restore();
  return view;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBeacon(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 5;
  ctx.fillStyle = '#d9dde1';
  roundRect(ctx, -4, -6, 8, 12, 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#c0392b';
  roundRect(ctx, -3, -5, 6, 3, 1); ctx.fill();
  ctx.fillStyle = '#555';
  for (const [x, y] of [[-1.6, 1], [1.6, 1], [-1.6, 3.6], [1.6, 3.6]]) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#c0392b';
  ctx.font = 'bold 3px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('CH ' + b.channel, 0, 10);
  ctx.restore();
}

function portTag(ctx, text, x, y) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.font = 'bold 2.2px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function drawRobot(ctx, sim, brick, t) {
  const { x, y, th } = sim.robot;
  const cfg = sim.config;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(th);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 5; ctx.shadowOffsetX = 0.6; ctx.shadowOffsetY = 0.6;

  // Wheels (only where a motor drives them)
  for (const [role, side] of [['left', -1], ['right', 1]]) {
    const p = sim.wheelPort(role);
    ctx.fillStyle = p ? '#1b1b1b' : '#777';
    roundRect(ctx, -2.9, side > 0 ? 5.6 : -8.4, 5.8, 2.8, 0.8);
    ctx.fill();
  }
  // Chassis
  ctx.fillStyle = '#3d434a';
  roundRect(ctx, ROBOT.body.x0, -5.6, ROBOT.body.x1 - ROBOT.body.x0 - 1, 11.2, 1.5);
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  // Brick
  ctx.fillStyle = '#e1e4e8';
  roundRect(ctx, -5.5, -4.8, 10, 9.6, 1);
  ctx.fill();
  ctx.fillStyle = '#9aa3ad';
  ctx.fillRect(1.2, -2.6, 2.6, 5.2);
  const lv = lightVisible(brick.light, t);
  ctx.fillStyle = '#5c636b';
  ctx.beginPath(); ctx.arc(-2, 0, 1.9, 0, Math.PI * 2); ctx.fill();
  if (lv > 0) {
    ctx.globalAlpha = lv;
    ctx.fillStyle = LIGHT_COLORS[brick.light.color];
    ctx.shadowColor = LIGHT_COLORS[brick.light.color]; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(-2, 0, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#2d3238';
  ctx.beginPath(); ctx.arc(-2, 0, 1.0, 0, Math.PI * 2); ctx.fill();

  // Motor ports: wheel labels and front arm
  for (const [p, m] of Object.entries(cfg.motors)) {
    if (m.type === 'none') continue;
    if (m.role === 'left') portTag(ctx, p, 0, -7);
    if (m.role === 'right') portTag(ctx, p, 0, 7);
    if (m.role === 'arm') {
      ctx.save();
      ctx.translate(5.5, 0);
      ctx.rotate(sim.motors[p].pos * DEG);
      ctx.fillStyle = '#f2c200';
      ctx.fillRect(-0.4, -0.4, 3.4, 0.8);
      ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // Sensors
  for (const [p, s] of Object.entries(cfg.sensors)) {
    if (s.type === 'none') continue;
    if (s.type === 'color') {
      const [cx, cy] = COLOR_GEO[s.mount];
      ctx.fillStyle = '#26292d';
      ctx.fillRect(cx - 1.2, cy - 1.3, 2.4, 2.6);
      ctx.fillStyle = '#ff2b2b'; ctx.shadowColor = '#ff2b2b'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(cx, cy, 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      portTag(ctx, p, cx - 2.6, cy);
    } else if (s.type === 'touch') {
      const b = BUMPER_GEO[s.mount];
      const pressed = sim.touchPressed(p);
      ctx.fillStyle = pressed ? '#ff6b6b' : '#c0392b';
      roundRect(ctx, b[0], b[1], b[2] - b[0], b[3] - b[1], 0.4);
      ctx.fill();
      portTag(ctx, p, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    } else if (s.type === 'ultrasonic' || s.type === 'infrared') {
      const [gx, gy, dir] = MOUNT_GEO[s.mount];
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(dir * DEG);
      ctx.fillStyle = '#26292d';
      roundRect(ctx, -2, -3.6, 2, 7.2, 0.6); ctx.fill();
      ctx.fillStyle = s.type === 'ultrasonic' ? '#28c5c9' : '#7a1d1d';
      for (const yy of [-1.9, 1.9]) { ctx.beginPath(); ctx.arc(-0.8, yy, 1.15, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      const back = [gx - Math.cos(dir * DEG) * 3.2, gy - Math.sin(dir * DEG) * 3.2];
      portTag(ctx, p, back[0], back[1]);
    } else if (s.type === 'gyro') {
      ctx.fillStyle = '#26292d';
      roundRect(ctx, -6.8, 2, 2.6, 2.6, 0.5); ctx.fill();
      ctx.fillStyle = '#f2c200';
      ctx.beginPath(); ctx.arc(-5.5, 3.3, 0.6, 0, Math.PI * 2); ctx.fill();
      portTag(ctx, p, -5.5, 6);
    }
  }
  ctx.restore();
}
