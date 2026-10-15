// Playground mats and auto-graded challenges.
'use strict';

const PAL = {
  black: '#141414', white: '#ffffff', red: '#d8232a', green: '#00a651', blue: '#0060c0', yellow: '#ffd500', brown: '#7a4a1e',
  wall: '#6b5b4b', box: '#8a96a8',
};

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = '#e4ecf3';
  ctx.lineWidth = 0.25;
  for (let x = 10; x < w; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 10; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = '#c7d3df';
  ctx.font = '2.6px sans-serif';
  for (let x = 50; x < w; x += 50) ctx.fillText(x + ' cm', x + 0.6, 3);
}
function stadiumPath(ctx, cx, cy, half, r) {
  ctx.beginPath();
  ctx.moveTo(cx - half, cy + r);
  ctx.lineTo(cx + half, cy + r);
  ctx.arc(cx + half, cy, r, Math.PI / 2, -Math.PI / 2, true);
  ctx.lineTo(cx - half, cy - r);
  ctx.arc(cx - half, cy, r, -Math.PI / 2, Math.PI / 2, true);
  ctx.closePath();
}
const wall = (x, y, w, h, color = PAL.wall) => ({ poly: rectPoly(x, y, w, h), color });
const box = (x, y, w, h, movable = true) => ({ poly: rectPoly(x, y, w, h), color: PAL.box, movable });
const label = (ctx, text, x, y, size = 4, color = '#333') => { ctx.fillStyle = color; ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; };

// ---------- Playground mats ----------
const MAZE_WALLS = [wall(44, 45, 3, 90), wall(89, 0, 3, 90), wall(134, 45, 3, 90)];

const SANDBOX_MATS = [
  { id: 'blank', name: 'Blank table (grid)', w: 200, h: 140, start: { x: 40, y: 70, th: 0 }, draw(ctx) { drawGrid(ctx, this.w, this.h); } },
  {
    id: 'oval', name: 'Oval track (line following)', w: 220, h: 150, start: { x: 90, y: 115, th: 0 },
    draw(ctx) { drawGrid(ctx, this.w, this.h); stadiumPath(ctx, 110, 75, 50, 40); ctx.strokeStyle = PAL.black; ctx.lineWidth = 2.5; ctx.stroke(); },
  },
  {
    id: 'colors', name: 'Colors', w: 200, h: 140, start: { x: 20, y: 70, th: 0 },
    draw(ctx) {
      drawGrid(ctx, this.w, this.h);
      const cs = ['red', 'green', 'blue', 'yellow', 'black', 'brown'];
      cs.forEach((c, i) => { ctx.fillStyle = PAL[c]; ctx.fillRect(45 + i * 25, 55, 20, 30); });
      cs.forEach((c, i) => { ctx.fillStyle = PAL[cs[(i + 2) % 6]]; ctx.fillRect(45 + i * 25, 10, 20, 20); ctx.fillStyle = PAL[cs[(i + 4) % 6]]; ctx.fillRect(45 + i * 25, 110, 20, 20); });
    },
  },
  {
    id: 'obstacles', name: 'Obstacle arena', w: 200, h: 140, start: { x: 25, y: 70, th: 0 },
    draw(ctx) { drawGrid(ctx, this.w, this.h); },
    obstacles: [box(80, 20, 20, 20), box(120, 85, 25, 20), box(160, 40, 15, 30), box(60, 100, 15, 15)],
  },
  {
    id: 'maze', name: 'Maze', w: 180, h: 135, start: { x: 22.5, y: 112, th: -Math.PI / 2 },
    draw(ctx) { drawGrid(ctx, this.w, this.h); ctx.fillStyle = '#bfe8cc'; ctx.fillRect(137, 0, 43, 45); label(ctx, 'EXIT', 158, 22, 5, '#1b7a3a'); },
    obstacles: MAZE_WALLS,
  },
  {
    id: 'lines', name: 'Lines to count', w: 260, h: 70, start: { x: 20, y: 35, th: 0 },
    draw(ctx) {
      drawGrid(ctx, this.w, this.h);
      [60, 95, 120, 160, 190].forEach((x) => { ctx.fillStyle = PAL.black; ctx.fillRect(x, 0, 2.5, 70); });
      ctx.fillStyle = PAL.red; ctx.fillRect(225, 0, 35, 70);
    },
  },
  {
    id: 'beacon', name: 'Beacon hunt (infrared)', w: 200, h: 140, start: { x: 30, y: 110, th: -Math.PI / 4 },
    draw(ctx) { drawGrid(ctx, this.w, this.h); },
    obstacles: [box(95, 85, 20, 20)],
    beacon: { x: 165, y: 30, channel: 1 },
  },
];

// ---------- Evaluation helpers (independent of the port configuration) ----------
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const angDiff = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d); };
const crit = (label, ok, max, partial = null) => ({ label, max, points: ok ? max : partial !== null ? partial : 0, ok: !!ok });
const isStopped = (ctx) => ctx.programEnded || ctx.sim.vel < 0.5;
// Secondary criteria only score if the robot really moved.
const moved = (ctx, d = 20) => Math.hypot(ctx.sim.robot.x - ctx.start.x, ctx.sim.robot.y - ctx.start.y) >= d;
const anyColorSees = (ctx, c) => ctx.sim.sensorPorts('color').some((p) => ctx.sim.colorKey(p) === c);
const anyTouchPressed = (ctx) => ctx.sim.sensorPorts('touch').some((p) => ctx.sim.touchPressed(p));
const frontGap = (ctx) => ctx.sim.rayDistance(ctx.sim.worldPoint([ROBOT.body.x1, 0]), ctx.sim.robot.th);
const zoneOverlay = (z, color, text) => (c) => {
  c.fillStyle = color; c.globalAlpha = 0.25; c.fillRect(z.x, z.y, z.w, z.h); c.globalAlpha = 1;
  c.strokeStyle = color; c.lineWidth = 0.6; c.setLineDash([2, 1.5]); c.strokeRect(z.x, z.y, z.w, z.h); c.setLineDash([]);
  if (text) label(c, text, z.x + z.w / 2, z.y + 4, 3.5, color);
};
const ring = (x, y, r, color, done) => (c) => {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = done ? 'rgba(0,166,81,0.25)' : 'rgba(255,171,25,0.15)'; c.fill();
  c.strokeStyle = done ? '#00a651' : color; c.lineWidth = 0.6; c.setLineDash([1.5, 1]); c.stroke(); c.setLineDash([]);
};

// ---------- Challenges ----------
const CHALLENGES = [
  {
    id: 'first-steps', hints: ["Use a Movement block: \"move ⬆ for … rotations\".", "One wheel rotation moves the robot about 17.6 cm. How many rotations make 70 cm? (70 ÷ 17.6)"], title: '1. First steps', level: 1, timeLimit: 20, trials: 1, noise: 0,
    skills: 'Movement',
    description: 'Program the robot to <b>drive 70 cm forward</b> and stop in the green zone. The center of the wheels must end inside the zone. Tip: one wheel rotation moves the robot about 17.6 cm.',
    setup() {
      return { mat: { w: 200, h: 100, draw(ctx) { drawGrid(ctx, 200, 100); } }, start: { x: 25, y: 50, th: 0 }, data: { zone: { x: 90, y: 20, w: 10, h: 60 } } };
    },
    overlay(c, d) { zoneOverlay(d.zone, '#00a651', 'FINISH')(c); },
    evaluate(ctx) {
      const { x, y } = ctx.sim.robot;
      return [
        crit('The robot stops in the green zone', inRect(x, y, ctx.data.zone), 60),
        crit('The robot is not moving at the end', moved(ctx) && isStopped(ctx), 20),
        crit('No collision', moved(ctx) && ctx.sim.collisions === 0, 20),
      ];
    },
  },
  {
    id: 'square', hints: ["A square = 4 × (drive one side, then turn 90° left). Use \"repeat 4\".", "To turn on the spot, use \"move ↺ left for … degrees\". The wheels must travel a quarter of a circle of 12 cm diameter: about 190 motor degrees. Test and adjust!"], title: '2. The square', level: 1, timeLimit: 45, trials: 1, noise: 0.01,
    skills: 'Movement, loops',
    description: 'Drive a <b>50 cm square</b> turning <b>left</b>, then come back to the starting point facing the same way as at the start. Tip: use a "repeat" block.',
    setup() {
      return { mat: { w: 160, h: 130, draw(ctx) { drawGrid(ctx, 160, 130); } }, start: { x: 50, y: 95, th: 0 }, data: { corners: [[100, 95], [100, 45], [50, 45]] } };
    },
    init(ctx) { ctx.state.visited = [false, false, false]; },
    step(ctx) {
      const { x, y } = ctx.sim.robot;
      ctx.data.corners.forEach(([cx, cy], i) => { if (Math.hypot(x - cx, y - cy) < 8) ctx.state.visited[i] = true; });
    },
    overlay(c, d, s) {
      c.strokeStyle = '#ffab19'; c.lineWidth = 0.5; c.setLineDash([2, 2]); c.strokeRect(50, 45, 50, 50); c.setLineDash([]);
      d.corners.forEach(([x, y], i) => ring(x, y, 8, '#ffab19', s && s.visited && s.visited[i])(c));
      ring(50, 95, 7, '#0090f5', false)(c);
    },
    evaluate(ctx) {
      const { x, y } = ctx.sim.robot;
      const v = ctx.state.visited, all = v.every(Boolean);
      return [
        crit('Goes through corner 1', v[0], 15), crit('Goes through corner 2', v[1], 15), crit('Goes through corner 3', v[2], 15),
        crit('Back at the starting point (± 7 cm)', all && Math.hypot(x - 50, y - 95) < 7, 35),
        crit('Same heading as at the start (± 15°)', all && angDiff(ctx.sim.robot.th / DEG, 0) < 15, 15),
        crit('No collision', v[0] && ctx.sim.collisions === 0, 5),
      ];
    },
  },
  {
    id: 'stop-wall', hints: ["The wall moves in every trial: you cannot use a fixed distance. Use the ultrasonic sensor (port 4 by default).", "Start moving, then \"wait until distance is less than … cm\", then \"stop moving\"."], title: '3. Stop before the wall', level: 2, timeLimit: 25, trials: 3, noise: 0.02,
    skills: 'Ultrasonic sensor',
    description: 'The wall is placed at a <b>different distance in each trial</b>. Drive forward and stop <b>between 3 and 12 cm</b> from the wall without touching it. Use the ultrasonic sensor.',
    setup(rng) {
      const wx = Math.round(90 + rng() * 100);
      return { mat: { w: 230, h: 80, draw(ctx) { drawGrid(ctx, 230, 80); }, obstacles: [wall(wx, 0, 6, 80)] }, start: { x: 25, y: 40, th: 0 }, data: { wx } };
    },
    overlay(c, d) { zoneOverlay({ x: d.wx - 12, y: 0, w: 9, h: 80 }, '#00a651')(c); },
    step(ctx) { if (anyTouchPressed(ctx)) ctx.state.touched = true; },
    evaluate(ctx) {
      const gap = frontGap(ctx);
      return [
        crit('The robot does not touch the wall', moved(ctx) && ctx.sim.collisions === 0 && !ctx.state.touched, 30),
        crit(`Stops 3 to 12 cm from the wall (measured: ${gap.toFixed(1)} cm)`, gap >= 3 && gap <= 12, 50, gap > 12 && gap < 25 ? 20 : 0),
        crit('The robot is not moving at the end', moved(ctx) && isStopped(ctx), 20),
      ];
    },
  },
  {
    id: 'stop-line', hints: ["Use the color sensor (port 3 by default), it looks at the floor.", "\"start moving\", then \"wait until color is black\", then \"stop moving\"."], title: '4. Stop on the line', level: 2, timeLimit: 25, trials: 3, noise: 0.02,
    skills: 'Color sensor',
    description: 'A black line is placed at a <b>different distance in each trial</b>. Stop with your <b>color sensor right above the line</b>.',
    setup(rng) {
      const lx = Math.round(60 + rng() * 110);
      return { mat: { w: 230, h: 80, draw(ctx) { drawGrid(ctx, 230, 80); ctx.fillStyle = PAL.black; ctx.fillRect(lx, 0, 3, 80); } }, start: { x: 25, y: 40, th: 0 }, data: { lx } };
    },
    evaluate(ctx) {
      return [
        crit('A color sensor is above the black line', anyColorSees(ctx, 'black'), 60),
        crit('The robot is not moving at the end', moved(ctx) && isStopped(ctx), 20),
        crit('No collision', moved(ctx) && ctx.sim.collisions === 0, 20),
      ];
    },
  },
  {
    id: 'touch-return', hints: ["Drive until the touch sensor is pressed: \"wait until pressed\".", "To come back the same distance, reset the motor position at the start and read \"B relative position\" when you touch the wall. Or simply drive back with a timer."], title: '5. Touch and come back', level: 2, timeLimit: 40, trials: 3, noise: 0.02,
    skills: 'Touch sensor, waiting',
    description: 'Drive until the <b>touch sensor hits the wall</b>, then <b>come back into the blue start zone</b>. The wall moves in each trial.',
    setup(rng) {
      const wx = Math.round(80 + rng() * 110);
      return {
        mat: { w: 230, h: 80, draw(ctx) { drawGrid(ctx, 230, 80); }, obstacles: [wall(wx, 0, 6, 80)] },
        start: { x: 30, y: 40, th: 0 }, data: { wx, zone: { x: 10, y: 15, w: 35, h: 50 } },
      };
    },
    overlay(c, d) { zoneOverlay(d.zone, '#0090f5', 'START')(c); },
    step(ctx) { if (anyTouchPressed(ctx)) ctx.state.touched = true; },
    evaluate(ctx) {
      const { x, y } = ctx.sim.robot;
      return [
        crit('The touch sensor touched the wall', ctx.state.touched, 40),
        crit('Back in the start zone', ctx.state.touched && inRect(x, y, ctx.data.zone), 40),
        crit('Program finished within the time limit', ctx.state.touched && ctx.programEnded, 20),
      ];
    },
  },
  {
    id: 'gyro-turn', hints: ["The wheels slip, so \"move … degrees\" will not give exactly 90°. Use the gyro sensor angle.", "Reset the angle, start turning right slowly (speed 15–20 %), \"wait until angle is greater than 88\", stop, then drive forward."], title: '6. Precise gyro turn', level: 3, timeLimit: 30, trials: 3, noise: 0.08,
    skills: 'Gyro sensor',
    description: 'The wheels <b>slip</b> a little (differently in each trial): counting rotations is not enough! Turn <b>90° right</b> on the spot, then drive <b>60 cm</b> into the green zone. Use the gyro sensor. Tolerance: ± 4°.',
    setup() {
      return { mat: { w: 140, h: 150, draw(ctx) { drawGrid(ctx, 140, 150); } }, start: { x: 40, y: 35, th: 0 }, data: { zone: { x: 28, y: 85, w: 24, h: 24 } } };
    },
    overlay(c, d) { zoneOverlay(d.zone, '#00a651', 'ZONE')(c); },
    evaluate(ctx) {
      const th = ctx.sim.robot.th / DEG;
      const { x, y } = ctx.sim.robot;
      const err = angDiff(th, 90);
      return [
        crit(`Final heading 90° ± 4° (measured: ${th.toFixed(1)}°)`, err <= 4, 50, err <= 8 ? 20 : 0),
        crit('The robot stops in the green zone', inRect(x, y, ctx.data.zone), 40),
        crit('No collision', moved(ctx) && ctx.sim.collisions === 0, 10),
      ];
    },
  },
  {
    id: 'line-follow', hints: ["Follow one edge of the line: when the sensor sees dark, turn one way; when it sees white, turn the other way.", "Inside a \"forever\" loop: if reflected light < 50 then \"start moving at 10 40 % speed\" else \"start moving at 40 10 % speed\". Then tune the numbers!"], title: '7. Line following', level: 3, timeLimit: 60, trials: 1, noise: 0.02,
    skills: 'Color sensor, loops, conditions',
    description: 'Do <b>one full lap</b> of the track following the black line (counter-clockwise), passing every checkpoint in order. Bonus if the lap takes less than 30 s.',
    setup() {
      return { mat: SANDBOX_MATS[1], start: { x: 90, y: 115, th: 0 }, data: { cps: [[160, 115], [200, 75], [160, 35], [60, 35], [20, 75], [60, 115]] } };
    },
    init(ctx) { ctx.state.next = 0; ctx.state.lapT = null; },
    step(ctx) {
      const { x, y } = ctx.sim.robot, s = ctx.state, cps = ctx.data.cps;
      if (s.next < cps.length && Math.hypot(x - cps[s.next][0], y - cps[s.next][1]) < 13) s.next++;
      if (s.next === cps.length && s.lapT === null && Math.hypot(x - 90, y - 115) < 13) s.lapT = ctx.sim.t;
    },
    overlay(c, d, s) {
      d.cps.forEach(([x, y], i) => ring(x, y, 13, '#ffab19', s && s.next > i)(c));
      ring(90, 115, 13, '#0090f5', s && s.lapT !== null && s.lapT !== undefined)(c);
    },
    done(ctx) { return ctx.state.lapT !== null; },
    evaluate(ctx) {
      const s = ctx.state, out = [];
      ctx.data.cps.forEach((_, i) => out.push(crit(`Checkpoint ${i + 1}`, s.next > i, 10)));
      out.push(crit('Full lap', s.lapT !== null, 20));
      out.push(crit(s.lapT !== null ? `Lap time: ${s.lapT.toFixed(1)} s (< 30 s: 20 pts, < 45 s: 10 pts)` : 'Lap time', s.lapT !== null && s.lapT < 30, 20, s.lapT !== null && s.lapT < 45 ? 10 : 0));
      return out;
    },
  },
  {
    id: 'count-lines', hints: ["Make a variable, set it to 0, and add 1 each time the color sensor sees black.", "After counting a line, wait until the sensor sees white again, otherwise you count the same line many times. Repeat until the color is red, then write the variable on the display."], title: '8. Count the lines', level: 4, timeLimit: 40, trials: 3, noise: 0.02,
    skills: 'Variables, color sensor, display',
    description: 'Drive to the <b>red zone</b> counting the black lines you cross (their number changes in each trial), stop in the red zone, then <b>show the number of lines</b> on the brick display.',
    setup(rng) {
      const n = 2 + Math.floor(rng() * 5);
      const xs = [];
      while (xs.length < n) {
        const x = 55 + Math.round(rng() * 150);
        if (xs.every((o) => Math.abs(o - x) > 16)) xs.push(x);
      }
      return {
        mat: { w: 270, h: 70, draw(ctx) { drawGrid(ctx, 270, 70); xs.forEach((x) => { ctx.fillStyle = PAL.black; ctx.fillRect(x, 0, 2.5, 70); }); ctx.fillStyle = PAL.red; ctx.fillRect(225, 0, 45, 70); } },
        start: { x: 20, y: 35, th: 0 }, data: { n, zone: { x: 214, y: 0, w: 56, h: 70 } },
      };
    },
    evaluate(ctx) {
      const nums = (ctx.screen.match(/-?\d+(?:[.,]\d+)?/g) || []).map(Number);
      const distinct = [...new Set(nums)];
      const { x, y } = ctx.sim.robot;
      return [
        crit(`The display shows the right number of lines (${ctx.data.n})`, distinct.length === 1 && distinct[0] === ctx.data.n, 50),
        crit('The robot stops in the red zone', inRect(x, y, ctx.data.zone) && isStopped(ctx), 30),
        crit('No collision', moved(ctx) && ctx.sim.collisions === 0, 20),
      ];
    },
  },
  {
    id: 'detect-color', hints: ["Drive until the color sensor no longer sees white, then stop on the colored zone.", "Use the \"3 color\" reporter inside \"write … at line 1\" to show the color name."], title: '9. Detect the color', level: 3, timeLimit: 25, trials: 3, noise: 0.02,
    skills: 'Color sensor, conditions, display',
    description: 'Drive to the <b>colored zone</b> (its color changes in each trial), stop on it and <b>write the name of the color</b> on the display (red, green, blue or yellow).',
    setup(rng) {
      const colors = ['red', 'green', 'blue', 'yellow'];
      const color = colors[Math.floor(rng() * 4)];
      const px = Math.round(70 + rng() * 40);
      return {
        mat: { w: 180, h: 60, draw(ctx) { drawGrid(ctx, 180, 60); ctx.fillStyle = PAL[color]; ctx.fillRect(px, 10, 30, 40); } },
        start: { x: 20, y: 30, th: 0 }, data: { color },
      };
    },
    evaluate(ctx) {
      const s = ctx.screen.toLowerCase();
      const shown = ['red', 'green', 'blue', 'yellow', 'black', 'white', 'brown'].filter((n) => s.includes(n));
      return [
        crit(`The display shows the right color (${ctx.data.color})`, shown.length === 1 && shown[0] === ctx.data.color, 60),
        crit('The robot stops on the colored zone', anyColorSees(ctx, ctx.data.color) && isStopped(ctx), 40),
      ];
    },
  },
  {
    id: 'maze', hints: ["Plan the path on paper first: forward, turn, forward…", "Make your own blocks (My Blocks) for \"turn right 90°\" and \"turn left 90°\" with the gyro sensor, then chain them."], title: '10. Maze', level: 4, timeLimit: 120, trials: 1, noise: 0.04,
    skills: 'All sensors, strategy',
    description: 'Find the exit of the maze (green zone, top right). Every collision costs points. Speed bonus.',
    setup() { return { mat: SANDBOX_MATS[4], start: SANDBOX_MATS[4].start, data: { zone: { x: 137, y: 0, w: 43, h: 45 } } }; },
    step(ctx) { const { x, y } = ctx.sim.robot; if (!ctx.state.exitT && inRect(x, y, ctx.data.zone)) ctx.state.exitT = ctx.sim.t; },
    done(ctx) { return !!ctx.state.exitT; },
    evaluate(ctx) {
      const t = ctx.state.exitT, c = ctx.sim.collisions;
      return [
        crit('Exit reached', !!t, 60),
        crit(`Collisions: ${c} (0: 20 pts, ≤ 2: 10 pts)`, !!t && c === 0, 20, t && c <= 2 ? 10 : 0),
        crit(t ? `Time: ${t.toFixed(1)} s (< 60 s: 20 pts, < 90 s: 10 pts)` : 'Time', !!t && t < 60, 20, t && t < 90 ? 10 : 0),
      ];
    },
  },
];

// Swiss grade (1 to 6, half points) from a percentage.
function swissGrade(pct) { return Math.round((1 + 5 * pct / 100) * 2) / 2; }
