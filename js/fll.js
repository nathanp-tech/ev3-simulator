// FIRST LEGO League Challenge practice field: BIOGLOW (2026-2027 season, FIRST CANOPY).
// Unofficial 2D adaptation for training. Layout from the official wireframe (20 cm grid), missions and points
// from the official Robot Game Rulebook. The mat artwork is drawn by us (not the official art).
// Mechanisms are simplified for a top-down simulator: push a part, swing the arm (motor A) in front of
// a model, or bring loose objects into an area.
'use strict';

const FLL = (() => {
  const MX = 17.1;           // left storage strip: the mat starts here (cm)
  const MW = 202, MH = 114.3; // mat size (cm)
  const W = MW + 2 * MX, H = MH;
  const HOME_R = 48.2;        // launch area radius (quarter circle)
  const MATCH_TIME = 150;     // 2.5 minutes
  const TOKEN_POINTS = [0, 10, 15, 25, 35, 50, 50];
  const HOMES = {
    left: { cx: MX, cy: MH, color: '#e3262f', start: { x: MX + 20, y: MH - 20, th: 0 } },
    right: { cx: MX + MW, cy: MH, color: '#1f6fd1', start: { x: MX + MW - 20, y: MH - 20, th: Math.PI } },
  };
  const DOCKS = {
    mine: { x: 190, y: 10.5, front: 150, label: 'Mine dock' },
    farm: { x: 99.8, y: 52.4, front: 180, label: 'Farm dock' },
    city: { x: 128.6, y: 104, front: -90, label: 'City dock' },
  };
  const BONUS_BY_DOCK = { mine: 'canopy', city: 'skylight', farm: 'hatch' };

  // ---------- geometry helpers (mat coordinates in cm, converted to world with +MX) ----------
  const wx = (x) => x + MX;
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  function rect(cx, cy, w, h, deg = 0) {
    const a = deg * DEG;
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => {
      const [rx, ry] = rot(x, y, a);
      return [wx(cx) + rx, cy + ry];
    });
  }
  // Point in the local frame of a model (u along its "front" direction, v sideways) -> world.
  function local(cx, cy, deg, u, v) {
    const [rx, ry] = rot(u, v, deg * DEG);
    return [wx(cx) + rx, cy + ry];
  }
  function zoneFront(cx, cy, deg, depth, from, to, v0, v1) {
    return [local(cx, cy, deg, depth / 2 + from, v0), local(cx, cy, deg, depth / 2 + to, v0), local(cx, cy, deg, depth / 2 + to, v1), local(cx, cy, deg, depth / 2 + from, v1)];
  }
  function inPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function closestOnPoly(p, poly) {
    let best = null, bd = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      const q = [a[0] + t * dx, a[1] + t * dy];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) { bd = d; best = q; }
    }
    return { q: best, d: bd };
  }
  const inHome = (p) => Object.values(HOMES).some((h) => Math.hypot(p[0] - h.cx, p[1] - h.cy) <= HOME_R);
  // Home = launch area: a quarter circle in a bottom corner of the mat.
  const homeOf = (poly) => Object.entries(HOMES).find(([side, h]) => poly.every((p) => Math.hypot(p[0] - h.cx, p[1] - h.cy) <= HOME_R + 0.01
    && (side === 'left' ? p[0] >= MX - 0.01 : p[0] <= MX + MW + 0.01)));

  // ---------- Mat artwork (procedural rainforest, own drawing) ----------
  function drawMat(ctx) {
    ctx.fillStyle = '#5b6168';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(MX, 0);
    ctx.beginPath(); ctx.rect(0, 0, MW, MH); ctx.clip();
    // forest floor
    const g = ctx.createLinearGradient(0, 0, MW, MH);
    g.addColorStop(0, '#6aa84f'); g.addColorStop(1, '#5e9a46');
    ctx.fillStyle = g; ctx.fillRect(0, 0, MW, MH);
    // dirt trails (left)
    ctx.fillStyle = '#d99a5b';
    blob(ctx, [[18, 22], [40, 18], [48, 30], [36, 44], [24, 58], [14, 52], [20, 38]]);
    blob(ctx, [[60, 64], [74, 60], [80, 74], [70, 86], [58, 80]]);
    // tree crowns
    const rng = mulberry32(2026);
    const shades = ['#3f8a3a', '#4f9c3f', '#66b04a', '#8cc45a', '#2f7a3c', '#a6d36b', '#3b9150'];
    for (let i = 0; i < 1700; i++) {
      const x = rng() * MW, y = rng() * MH, r = 1 + rng() * 2.6;
      ctx.fillStyle = shades[Math.floor(rng() * shades.length)];
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (r > 2.2) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
    }
    // rivers
    const river = (pts, w) => {
      for (const [col, lw] of [['#4aa3dc', w], ['#7cc6ee', w * 0.55]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(...pts[0]);
        for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(...pts[i], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
        ctx.lineTo(...pts[pts.length - 1]); ctx.stroke();
      }
    };
    river([[49, 114], [58, 98], [70, 84], [92, 70], [108, 62], [116, 46], [120, 30], [132, 14], [146, 0]], 6);
    river([[118, 40], [140, 34], [168, 30], [190, 28], [202, 26]], 4.5);
    river([[104, 114], [110, 96], [116, 80], [118, 62]], 4);
    river([[168, 0], [178, 12], [192, 18], [202, 16]], 3.5);
    // farm (center)
    ctx.fillStyle = '#e2b57f'; ctx.fillRect(76, 38, 30, 26);
    ctx.fillStyle = '#c98a4b';
    for (let i = 0; i < 6; i++) ctx.fillRect(78, 40 + i * 4, 12, 2);
    ctx.fillStyle = '#9cc96b'; ctx.fillRect(92, 40, 12, 10);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(80, 58, 8, 4);
    // city (bottom right)
    ctx.fillStyle = '#a7adb3'; ctx.fillRect(118, 68, 56, 46);
    ctx.fillStyle = '#6f757c';
    ctx.fillRect(118, 86, 56, 3); ctx.fillRect(146, 68, 3, 46); ctx.fillRect(126, 68, 2.5, 46);
    const bcol = ['#e8eaed', '#d5d9de', '#f2c94c', '#eb5757', '#56ccf2', '#bdbdbd'];
    for (let i = 0; i < 26; i++) {
      const bx = 119 + (i * 13.7) % 54, by = 69 + Math.floor(i / 4) * 6.4;
      if ((bx > 124 && bx < 130) || (bx > 143 && bx < 151) || (by > 84 && by < 90)) continue;
      ctx.fillStyle = bcol[i % bcol.length]; ctx.fillRect(bx, by, 4.2, 3.6);
    }
    // mine (top right)
    ctx.fillStyle = '#d98e4f'; blob(ctx, [[176, 0], [202, 0], [202, 22], [184, 24], [174, 14]]);
    ctx.strokeStyle = '#b8743c'; ctx.lineWidth = 0.6;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.arc(194, 4, i * 5, Math.PI * 0.5, Math.PI * 1.05); ctx.stroke(); }
    // black guide lines (positions from the official wireframe)
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const line of [[[47.2, 32.4], [52, 24.2], [75.2, 24.2]], [[133.3, 16.2], [143.8, 26.3], [168.6, 26.3]], [[94.3, 71.8], [100.9, 83.4]]]) {
      ctx.beginPath(); ctx.moveTo(...line[0]); line.slice(1).forEach((p) => ctx.lineTo(...p)); ctx.stroke();
    }
    // marked areas: survey area (M01) and leaf habitat (M04)
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.5;
    ctx.save(); ctx.translate(105.1, 91.4); ctx.rotate(25 * DEG); ctx.strokeRect(-4.5, -4.5, 9, 9); ctx.restore();
    ctx.strokeRect(10, 10, 8, 8);
    // launch areas (home)
    for (const [side, h] of Object.entries(HOMES)) {
      const cx = h.cx - MX, cy = h.cy;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, HOME_R, side === 'left' ? -Math.PI / 2 : Math.PI, side === 'left' ? 0 : -Math.PI / 2); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.clip();
      ctx.strokeStyle = '#dde6f2'; ctx.lineWidth = 0.25;
      for (let i = 0; i <= 50; i += 2.5) { ctx.beginPath(); ctx.moveTo(cx + (side === 'left' ? i : -i), cy); ctx.lineTo(cx + (side === 'left' ? i : -i), cy - 50); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 50, cy - i); ctx.lineTo(cx + 50, cy - i); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = h.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, HOME_R, side === 'left' ? -Math.PI / 2 : Math.PI, side === 'left' ? 0 : -Math.PI / 2); ctx.stroke();
      ctx.lineWidth = 0.5; ctx.strokeStyle = '#555';
      for (let k = 1; k < 9; k++) {
        const a = (side === 'left' ? -Math.PI / 2 : Math.PI) + k * Math.PI / 18;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (HOME_R - 1.6), cy + Math.sin(a) * (HOME_R - 1.6)); ctx.lineTo(cx + Math.cos(a) * HOME_R, cy + Math.sin(a) * HOME_R); ctx.stroke();
      }
    }
    // left / right side lines of the mat (team colors)
    ctx.fillStyle = HOMES.left.color; ctx.fillRect(0, 0, 0.6, MH - HOME_R);
    ctx.fillStyle = HOMES.right.color; ctx.fillRect(MW - 0.6, 0, 0.6, MH - HOME_R);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 2.4px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('BIOGLOW practice field · unofficial', MW / 2, MH - 1.5);
    ctx.restore();
  }
  function blob(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(...pts[0]);
    for (let i = 1; i <= pts.length; i++) {
      const p = pts[i % pts.length], q = pts[(i + 1) % pts.length];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.fill();
  }

  // ---------- Missions ----------
  const MISSIONS = [
    { n: 1, name: 'Drone Survey', story: 'Help the pilot launch the drone to create a LiDAR map of the rainforest.',
      howto: 'Push the launcher slider (at the bottom wall, between the red block and the pilot) all the way to the right to launch the drone. Bonus: swing the arm in front of the grey LiDAR map frame (south side) to flip it into the survey area.' },
    { n: 2, name: 'Exploding Seeds', story: 'Release the seeds from the seed pod, propelling them to new ground.',
      howto: 'Push the seed pod (diamond model left of the farm) to release its 3 seeds. Loose seeds can then be pushed to the Seeds of Renewal station (M14).' },
    { n: 3, name: 'Flip the Rock', story: 'Flip the rock to discover what lives underneath, then put it back as you found it.',
      howto: 'Swing the arm in front of the rock (east side, at the left wall) to flip it: the research flag goes down. Swing the arm again to put the rock back (bonus).' },
    { n: 4, name: 'Lucky Leaves', story: 'Collect the leaves without disturbing the katydid. Its position is random at each match!',
      howto: 'The nest (top-left corner) has 3 slots: 2 leaves and the katydid, placed at random. Swing the arm in front of a slot to remove what is in it. Remove both leaves but never the katydid. Tip: use the brick buttons to tell your program which slot holds the katydid.' },
    { n: 5, name: 'Reaching Roots', story: 'Help the plant cross the forest boundary in search of symbiosis.',
      howto: 'Push the root lever (top wall, left) towards the wall: a little for "partially extended", all the way for "completely extended".' },
    { n: 6, name: 'Leafcutter Frenzy', story: 'Guide the ants back to their nest, but move too quickly and you may scatter the leaves.',
      howto: 'Push the ant (south of the ant nest, top right) north into the nest. Push slowly (less than about 12 cm/s): pushing fast scatters the 4 leaf fragments.' },
    { n: 7, name: 'Humongous Fungus', story: 'Form a new connection between the mycelium and a neighbouring tree root.',
      howto: 'Push the red mycelium handle (south side, right of the ant nest). The connection bonus needs an opposing team, so it cannot be scored in practice.' },
    { n: 8, name: 'Tangled', story: 'Gently untangle the vines so the tree has space and sunlight to grow again.',
      howto: 'Swing the arm in front of the leftmost part of the big tree\'s south side (top left of the mat) to bring the vine down to the mat.' },
    { n: 9, name: 'Research Platform', story: 'Deploy equipment to monitor activity high above the forest floor.',
      howto: 'Same big tree. Its south side has 4 parts of 4 cm, from left to right: vine (M08, arm), camera trap (arm), seed (arm, the seed falls and can be used for M14), platform (push).' },
    { n: 10, name: 'Fragile Microhabitats', story: 'Move through the area without damaging the tiny creatures\' homes.',
      howto: 'Do not touch the spider habitat (top, right of the big tree) and the snail habitat (centre of the mat). They must stay in their original position.' },
    { n: 11, name: 'Window to the Past', story: 'Open the root window and document what you see.',
      howto: 'Swing the arm in front of the south-west side of the root window (diamond model right of the centre) to bring the root cover down.' },
    { n: 12, name: 'Forest Elder', story: 'Add a support to stabilise the aging tree for years to come.',
      howto: 'At the right wall: swing the arm in front of the tree (west side) to raise the cane, and in front of the post below it to put the support tie around the post.' },
    { n: 13, name: 'Keystone Species', story: 'Build and deliver a keystone species to this newly protected habitat.',
      howto: 'Push your keystone species (the orange animal, starting in the left home) onto the restoration platform: the green area right in front of the model. Its weight raises the young trees.' },
    { n: 14, name: 'Seeds of Renewal', story: 'Place the seeds your team has collected in the soil and watch them take root.',
      howto: 'Push loose seeds (from M02 and M09) into the replantation station, the area in front of the model. Each seed in the station touching the mat scores 5 + 5 bonus.' },
    { n: 15, name: 'Biocentric Architecture', story: 'Create homes for wildlife, restore soil health and bring natural light to green spaces.',
      howto: 'The building front has 3 parts: swing the arm at the left part (nesting canopy), push the middle part (garden skylight), swing the arm at the right part (compost hatch). +10 bonus for the greatest need of its dock: mine → canopy, city → skylight, farm → hatch.' },
  ];

  // ---------- Match state ----------
  function newMatch({ seed = Date.now(), docks = { mine: 13, city: 14, farm: 15 } } = {}) {
    const rng = mulberry32(seed);
    const katydid = Math.floor(rng() * 3);
    const S = {
      seed, docks, katydid, tokens: 6, clock: 0, started: false, ended: false, launches: 0,
      models: [], zones: [], items: [], flags: {}, log: [],
    };
    const F = S.flags;
    Object.assign(F, {
      droneLaunched: false, mapFlipped: false, rockFlipped: false, rockBack: false, flagDown: false,
      slots: [0, 1, 2].map((i) => (i === katydid ? 'katydid' : 'leaf')), removed: [false, false, false], katydidOut: false,
      rootT: 0, antT: 0, antMaxSpeed: 0, myceliumExt: false, vineDown: false, platformRaised: false, cameraDeployed: false,
      treeSeedDropped: false, coverDown: false, caneRaised: false, tieOn: false, treesRaised: false,
      canopy: false, skylight: false, hatch: false, seedsReleased: false,
    });
    const model = (id, poly, color, extra = {}) => { const m = { id, poly, color, hidden: true, ...extra }; S.models.push(m); return m; };
    const zone = (id, poly, kind, action) => S.zones.push({ id, poly, kind, action, armRef: null, dwell: 0, count: 0 });

    // M01 Drone Survey: rail along the bottom wall, launcher slider, pilot pad and LiDAR map frame
    model('m01-pilot', rect(117, 108, 7, 8), '#8a8f96');
    model('m01-map', rect(105.1, 91.4, 8, 8, 25), '#7d8288');
    zone('m01-map', zoneFront(105.1, 91.4, 25 + 90, 8, -1.5, 5, -4, 4), 'arm', () => { F.mapFlipped = true; });
    S.items.push({ id: 'm01-slider', kind: 'slider', x: wx(88), y: 108.3, r: 2.6, axis: { ox: wx(88), oy: 108.3, dx: 1, dy: 0, min: 0, max: 22 }, t: 0, color: '#2d3238' });
    // M02 Exploding Seeds
    model('m02', rect(64.5, 60, 7, 7, 45), '#9acd32');
    zone('m02', [[wx(56), 64], [wx(73), 64], [wx(73), 71], [wx(56), 71]], 'push', () => releaseSeeds(S));
    // M03 Flip the Rock
    model('m03', rect(7.5, 49.5, 9, 7), '#8c8c8c');
    zone('m03', [[wx(12), 44], [wx(18), 44], [wx(18), 55], [wx(12), 55]], 'arm', (z) => {
      if (z.count === 1) { F.rockFlipped = true; F.flagDown = true; } else if (F.rockFlipped) { F.rockBack = true; }
    });
    // M04 Lucky Leaves: nest with 3 slots in the top-left corner, opening south-east
    const slotC = [[4.5, 12.5], [8.5, 8.5], [12.5, 4.5]];
    slotC.forEach(([x, y], i) => {
      model('m04-' + i, rect(x, y, 5, 5, 45), '#2e7d32');
      zone('m04-' + i, zoneFront(x, y, 45, 5, -1.5, 5, -2.4, 2.4), 'arm', () => {
        if (F.removed[i]) return;
        F.removed[i] = true;
        if (F.slots[i] === 'katydid') F.katydidOut = true;
        const [dx, dy] = rot(7, 0, 45 * DEG);
        S.items.push({ id: 'm04-out-' + i, kind: F.slots[i], x: wx(x) + dx, y: y + dy, r: 1.6, color: F.slots[i] === 'katydid' ? '#7cb342' : '#1b5e20', loose: true });
      });
    });
    // M05 Reaching Roots: lever pushed towards the top wall
    model('m05', rect(41, 3.5, 6, 7), '#8d6e63');
    S.items.push({ id: 'm05-lever', kind: 'slider', x: wx(41), y: 10.5, r: 2.3, axis: { ox: wx(41), oy: 10.5, dx: 0, dy: -1, min: 0, max: 3.4 }, t: 0, color: '#6d4c41' });
    // M08 / M09: big tree with the research platform
    model('m08-09', rect(57.6, 7, 16, 12), '#33691e');
    // south side of the tree, from left to right: vine | camera trap | seed | platform (4 cm each)
    const southZone = (x0) => [[wx(x0), 11.5], [wx(x0 + 4), 11.5], [wx(x0 + 4), 18], [wx(x0), 18]];
    zone('m08', southZone(49.6), 'arm', () => { F.vineDown = true; });
    zone('m09-camera', southZone(53.6), 'arm', () => { F.cameraDeployed = true; });
    zone('m09-seed', southZone(57.6), 'arm', () => {
      if (F.treeSeedDropped) return;
      F.treeSeedDropped = true;
      S.items.push({ id: 'seed-tree', kind: 'seed', x: wx(69.5), y: 15, r: 1.5, color: '#8d5524', loose: true });
    });
    zone('m09-platform', southZone(61.6), 'push', () => { F.platformRaised = true; });
    // M10 Fragile Microhabitats (loose, must not move)
    S.items.push({ id: 'm10-spider', kind: 'spider', x: wx(77), y: 9, r: 2.3, color: '#455a64', fragile: true });
    S.items.push({ id: 'm10-snail', kind: 'snail', x: wx(104.8), y: 41.4, r: 2.5, color: '#f9a825', fragile: true });
    // M06 / M07: ant nest and mycelium
    model('m06-07', rect(154, 6, 16, 10), '#d7ccc8');
    S.items.push({ id: 'm06-ant', kind: 'slider', x: wx(150), y: 16.5, r: 2.2, axis: { ox: wx(150), oy: 16.5, dx: 0, dy: -1, min: 0, max: 5 }, t: 0, color: '#c62828', ant: true });
    zone('m07', [[wx(157), 11], [wx(162.5), 11], [wx(162.5), 17], [wx(157), 17]], 'push', () => { F.myceliumExt = true; });
    // M11 Window to the Past
    model('m11', rect(139.5, 50.3, 9, 9, 45), '#6d4c41');
    zone('m11', zoneFront(139.5, 50.3, 135, 9, -1.5, 5, -4, 4), 'arm', () => { F.coverDown = true; });
    // M12 Forest Elder (tree and post at the right wall)
    model('m12-tree', rect(197, 39, 8, 9), '#2e7d32');
    model('m12-post', rect(198.5, 61.7, 3, 8), '#795548');
    zone('m12-tree', [[wx(186.5), 34.5], [wx(193.2), 34.5], [wx(193.2), 43.5], [wx(186.5), 43.5]], 'arm', () => { F.caneRaised = true; });
    zone('m12-post', [[wx(190.5), 57.5], [wx(197.2), 57.5], [wx(197.2), 66], [wx(190.5), 66]], 'arm', () => { F.tieOn = true; });
    // Interchangeable docks (M13-M15): the team chooses which model goes on which dock
    for (const [dock, d] of Object.entries(DOCKS)) {
      const m = docks[dock];
      model('dock-' + dock, rect(d.x, d.y, 10, 14, d.front), m === 13 ? '#8bc34a' : m === 14 ? '#a1887f' : '#90a4ae', { dock, mission: m });
      if (m === 13) S.platform = zoneFront(d.x, d.y, d.front, 10, 0, 6, -5, 5); // pushing the keystone onto it raises the young trees
      if (m === 14) S.station = zoneFront(d.x, d.y, d.front, 10, 0.5, 11, -6.5, 6.5);
      if (m === 15) {
        S.m15dock = dock;
        zone('m15-canopy', zoneFront(d.x, d.y, d.front, 10, -1.5, 5, -7, -2.4), 'arm', () => { F.canopy = true; });
        zone('m15-skylight', zoneFront(d.x, d.y, d.front, 10, -1.5, 5, -2.3, 2.3), 'push', () => { F.skylight = true; });
        zone('m15-hatch', zoneFront(d.x, d.y, d.front, 10, -1.5, 5, 2.4, 7), 'arm', () => { F.hatch = true; });
      }
    }
    // Keystone species (team equipment, starts in the left home)
    S.items.push({ id: 'keystone', kind: 'keystone', x: wx(30), y: MH - 8, r: 2.8, color: '#ff9800', loose: true });
    for (const it of S.items) { it.x0 = it.x; it.y0 = it.y; }
    S.obstacles = S.models;
    return S;
  }

  function releaseSeeds(S) {
    if (S.flags.seedsReleased) return;
    S.flags.seedsReleased = true;
    [[8, -3], [10, 4], [3, 9]].forEach(([dx, dy], i) => {
      S.items.push({ id: 'seed-' + i, kind: 'seed', x: wx(64.5) + dx, y: 60 + dy, r: 1.5, color: '#8d5524', loose: true });
    });
  }

  // ---------- Interactions, called after every physics step ----------
  function step(S, sim, dt) {
    if (S.ended) return;
    if (S.running) S.clock += dt;
    const body = sim.bodyPoly();
    const speed = sim.vel;
    // pushable items
    for (const it of S.items) {
      const inside = inPoly([it.x, it.y], body);
      const c = closestOnPoly([it.x, it.y], body);
      if (!inside && c.d >= it.r) { if (it.ant) it.touch = false; continue; }
      let nx, ny, pen;
      if (inside) { nx = it.x - sim.robot.x; ny = it.y - sim.robot.y; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; pen = it.r + c.d; }
      else { nx = (it.x - c.q[0]) / c.d; ny = (it.y - c.q[1]) / c.d; pen = it.r - c.d; }
      if (it.axis) {
        const a = it.axis, along = (nx * a.dx + ny * a.dy) * pen;
        if (along <= 0) continue;
        it.t = Math.min(a.max, Math.max(a.min, it.t + along));
        it.x = a.ox + a.dx * it.t; it.y = a.oy + a.dy * it.t;
        if (it.ant) { S.flags.antMaxSpeed = Math.max(S.flags.antMaxSpeed, speed); S.flags.antT = it.t; }
        if (it.id === 'm05-lever') S.flags.rootT = it.t;
        if (it.id === 'm01-slider' && it.t >= a.max - 1) S.flags.droneLaunched = true;
      } else {
        it.x += nx * pen; it.y += ny * pen;
        // keep items on the table and out of solid models
        it.x = Math.max(it.r, Math.min(W - it.r, it.x)); it.y = Math.max(it.r, Math.min(H - it.r, it.y));
        for (const m of S.models) {
          if (inPoly([it.x, it.y], m.poly)) { const q = closestOnPoly([it.x, it.y], m.poly).q; const vx = q[0] - it.x, vy = q[1] - it.y, l = Math.hypot(vx, vy) || 1; it.x = q[0] + vx / l * it.r; it.y = q[1] + vy / l * it.r; }
        }
      }
    }
    // zones: arm swings or pushes in front of a model
    const tip = sim.worldPoint([12, 0]);
    const armPort = Object.keys(sim.config.motors).find((p) => sim.config.motors[p].role === 'arm' && sim.config.motors[p].type !== 'none');
    const arm = armPort ? sim.motors[armPort].pos : 0;
    for (const z of S.zones) {
      const inZone = inPoly(tip, z.poly);
      if (!inZone) { z.armRef = null; z.dwell = 0; continue; }
      if (z.kind === 'arm') {
        if (z.armRef === null) z.armRef = arm;
        if (Math.abs(arm - z.armRef) >= 60) { z.armRef = arm; z.count++; z.action(z); }
      } else {
        z.dwell += dt;
        if (z.dwell >= 0.15 && z.count === 0) { z.count++; z.action(z); }
      }
    }
  }

  function onLaunch(S) { for (const z of S.zones) { z.armRef = null; z.dwell = 0; } }

  // ---------- Scoring (official points) ----------
  function score(S) {
    const F = S.flags, rows = [];
    const add = (n, parts) => rows.push({ n, name: MISSIONS[n - 1].name, parts, points: parts.reduce((a, p) => a + (p.ok ? p.pts : 0), 0), max: parts.reduce((a, p) => a + p.pts, 0) });
    const item = (id) => S.items.find((i) => i.id === id);
    add(1, [{ label: 'Drone no longer touching the mat', pts: 20, ok: F.droneLaunched }, { label: 'Bonus: LiDAR map flipped, scan marker in the survey area', pts: 10, ok: F.droneLaunched && F.mapFlipped }]);
    add(2, [{ label: 'Seeds no longer touching the stalk (10 each)', pts: 30, ok: false, partial: F.seedsReleased ? 30 : 0 }]);
    add(3, [{ label: 'Research flag down', pts: 20, ok: F.flagDown }, { label: 'Bonus: rock back in its original position', pts: 10, ok: F.flagDown && F.rockBack }]);
    const leavesOut = F.slots.filter((s, i) => s === 'leaf' && F.removed[i]).length;
    add(4, F.katydidOut
      ? [{ label: 'Katydid outside the leaf habitat: 0 points for this mission', pts: 30, ok: false }]
      : [{ label: 'One leaf removed from the nest', pts: 10, ok: leavesOut >= 1 }, { label: 'Bonus: second leaf removed, katydid in place', pts: 20, ok: leavesOut === 2 }]);
    add(5, [{ label: F.rootT >= 3.2 ? 'Root completely extended' : 'Root partially (10) or completely (20) extended', pts: 20, ok: F.rootT >= 3.2, partial: F.rootT >= 1.2 && F.rootT < 3.2 ? 10 : 0 }]);
    const antHome = F.antT >= 4.5;
    const fragments = !antHome ? 0 : F.antMaxSpeed <= 12 ? 4 : F.antMaxSpeed <= 20 ? 2 : 0;
    add(6, [{ label: antHome ? `Ant touching the nest, ${fragments} leaf fragment(s) in the nest (10 each)` : 'Ant touching the nest, leaf fragments in the nest (10 each)', pts: 40, ok: false, partial: fragments * 10 }]);
    add(7, [{ label: 'Mycelium completely extended', pts: 20, ok: F.myceliumExt }, { label: 'Bonus: connection with the opposing team (not possible in practice)', pts: 0, ok: false, na: true }]);
    add(8, [{ label: 'Vine touching the mat', pts: 30, ok: F.vineDown }]);
    add(9, [{ label: 'Research platform raised', pts: 10, ok: F.platformRaised }, { label: 'Camera trap deployed', pts: 10, ok: F.cameraDeployed }, { label: 'Seed no longer touching the tree', pts: 10, ok: F.treeSeedDropped }]);
    const still = (id) => { const it = item(id); return Math.hypot(it.x - it.x0, it.y - it.y0) < 1; };
    add(10, [{ label: 'Spider habitat in its original position', pts: 10, ok: still('m10-spider') }, { label: 'Snail habitat in its original position', pts: 10, ok: still('m10-snail') }]);
    add(11, [{ label: 'Root cover down, touching the mat', pts: 20, ok: F.coverDown }]);
    add(12, [{ label: 'Cane completely raised, touching the tree', pts: 20, ok: F.caneRaised }, { label: 'Support tie around the post', pts: 10, ok: F.tieOn }]);
    const ks = item('keystone');
    F.treesRaised = !!S.platform && inPoly([ks.x, ks.y], S.platform);
    add(13, [{ label: 'Keystone species on the restoration platform, young trees raised', pts: 30, ok: F.treesRaised }]);
    const seedsIn = S.items.filter((i) => i.kind === 'seed' && S.station && inPoly([i.x, i.y], S.station)).length;
    add(14, [{ label: `Seeds in the replantation station (5 each): ${seedsIn}`, pts: 20, ok: false, partial: seedsIn * 5 }, { label: 'Bonus: those seeds touching the mat (5 each)', pts: 20, ok: false, partial: seedsIn * 5 }]);
    const need = BONUS_BY_DOCK[S.m15dock];
    add(15, [{ label: 'Nesting canopy raised', pts: 10, ok: F.canopy }, { label: 'Garden skylight completely in', pts: 10, ok: F.skylight }, { label: 'Compost hatch opened, touching the mat', pts: 10, ok: F.hatch },
      { label: `Environmental bonus (${DOCKS[S.m15dock].label}: ${need === 'canopy' ? 'nesting canopy' : need === 'skylight' ? 'garden skylight' : 'compost hatch'})`, pts: 10, ok: !!F[need] }]);
    for (const r of rows) r.points = r.parts.reduce((a, p) => a + (p.ok ? p.pts : p.partial || 0), 0);
    const inspection = 20;
    const tokens = TOKEN_POINTS[Math.max(0, S.tokens)];
    const total = rows.reduce((a, r) => a + r.points, 0) + inspection + tokens;
    const max = rows.reduce((a, r) => a + r.max, 0) + inspection + 50;
    return { rows, inspection, tokens, total, max };
  }

  // ---------- Drawing of the models (overlay above the mat) ----------
  function badge(ctx, n, x, y) {
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.35; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 2.3px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n).padStart(2, '0'), x, y + 0.1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  function poly(ctx, p, fill, stroke = 'rgba(0,0,0,0.45)') {
    ctx.beginPath(); ctx.moveTo(...p[0]); p.slice(1).forEach((q) => ctx.lineTo(...q)); ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 0.5; ctx.shadowOffsetY = 0.5;
    ctx.fillStyle = fill; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = stroke; ctx.lineWidth = 0.35; ctx.stroke();
  }
  function studs(ctx, p, color) {
    const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
    ctx.fillStyle = color;
    for (const [dx, dy] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 0.6, 0, Math.PI * 2); ctx.fill(); }
  }
  const center = (p) => [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];

  function draw(S, ctx, { showZones = false } = {}) {
    const F = S.flags;
    // rails of M01
    ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5;
    for (const y of [106.6, 110]) { ctx.beginPath(); ctx.moveTo(wx(61), y); ctx.lineTo(wx(114), y); ctx.stroke(); }
    ctx.fillStyle = '#c0392b'; ctx.fillRect(wx(58.5), 106, 5, 4.6); // red end block of the launcher (low, decorative)
    if (showZones) {
      for (const z of S.zones) {
        ctx.fillStyle = z.kind === 'arm' ? 'rgba(255,193,7,0.28)' : 'rgba(3,169,244,0.28)';
        ctx.beginPath(); ctx.moveTo(...z.poly[0]); z.poly.slice(1).forEach((q) => ctx.lineTo(...q)); ctx.closePath(); ctx.fill();
      }
      for (const a of [S.platform, S.station]) if (a) { ctx.strokeStyle = '#fff'; ctx.setLineDash([1, 1]); ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(...a[0]); a.slice(1).forEach((q) => ctx.lineTo(...q)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); }
    }
    // platform / station areas are visible on the field
    if (S.platform) { ctx.fillStyle = 'rgba(139,195,74,0.55)'; ctx.beginPath(); ctx.moveTo(...S.platform[0]); S.platform.slice(1).forEach((q) => ctx.lineTo(...q)); ctx.closePath(); ctx.fill(); }
    if (S.station) { ctx.fillStyle = 'rgba(121,85,72,0.55)'; ctx.beginPath(); ctx.moveTo(...S.station[0]); S.station.slice(1).forEach((q) => ctx.lineTo(...q)); ctx.closePath(); ctx.fill(); }
    for (const m of S.models) {
      let fill = m.color;
      if (m.id.startsWith('m04-')) { const i = Number(m.id.slice(4)); fill = F.removed[i] ? '#9e9e9e' : F.slots[i] === 'katydid' ? '#aed581' : '#1b5e20'; }
      poly(ctx, m.poly, fill);
      studs(ctx, m.poly, 'rgba(255,255,255,0.25)');
      const [cx, cy] = center(m.poly);
      ctx.font = 'bold 1.8px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      if (m.id.startsWith('m04-')) { const i = Number(m.id.slice(4)); ctx.fillText(F.removed[i] ? '' : F.slots[i] === 'katydid' ? 'katydid' : 'leaf', cx, cy + 0.6); }
      if (m.id === 'm03') { ctx.fillText(F.rockFlipped && !F.rockBack ? 'flipped' : 'rock', cx, cy - 1); ctx.fillStyle = F.flagDown ? '#bdbdbd' : '#ffeb3b'; ctx.fillRect(cx + 2, cy, 1.5, F.flagDown ? 1 : 3.5); }
      if (m.id === 'm01-pilot') ctx.fillText(F.droneLaunched ? 'drone ✈' : 'drone', cx, cy + 0.6);
      if (m.id === 'm01-map') ctx.fillText(F.mapFlipped ? 'map ✔' : 'LiDAR', cx, cy + 0.6);
      if (m.id === 'm11') ctx.fillText(F.coverDown ? 'open' : 'window', cx, cy + 0.6);
      if (m.id === 'm12-tree') ctx.fillText(F.caneRaised ? 'cane ✔' : 'elder', cx, cy + 0.6);
      if (m.id === 'm12-post') ctx.fillText(F.tieOn ? '✔' : '', cx, cy + 0.6);
      if (m.id === 'm08-09') ctx.fillText(`vine ${F.vineDown ? '✔' : '·'}  cam ${F.cameraDeployed ? '✔' : '·'}  plat ${F.platformRaised ? '✔' : '·'}`, cx, cy + 0.6);
      if (m.id === 'm06-07') ctx.fillText(F.myceliumExt ? 'nest · mycelium ✔' : 'ant nest · fungus', cx, cy + 0.6);
      if (m.dock) {
        ctx.fillText(m.mission === 13 ? 'keystone' : m.mission === 14 ? 'seeds' : 'building', cx, cy - 0.6);
        ctx.font = '1.4px sans-serif'; ctx.fillText(DOCKS[m.dock].label, cx, cy + 1.6);
        if (m.mission === 15) { ctx.fillText(`${F.canopy ? '✔' : '·'} ${F.skylight ? '✔' : '·'} ${F.hatch ? '✔' : '·'}`, cx, cy + 3.4); }
        if (m.mission === 13 && F.treesRaised) ctx.fillText('trees ✔', cx, cy + 3.4);
      }
      ctx.textAlign = 'left';
    }
    // loose items
    for (const it of S.items) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 2;
      ctx.fillStyle = it.color;
      if (it.kind === 'keystone') {
        ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#5d4037'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(it.x + s * 1.6, it.y - 2.1, 0.9, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#212121'; ctx.beginPath(); ctx.arc(it.x - 0.8, it.y - 0.4, 0.35, 0, Math.PI * 2); ctx.arc(it.x + 0.8, it.y - 0.4, 0.35, 0, Math.PI * 2); ctx.fill();
      } else if (it.kind === 'slider') {
        ctx.fillRect(it.x - it.r, it.y - it.r, it.r * 2, it.r * 2);
        ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = 'bold 1.6px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(it.ant ? 'ant' : '⇆', it.x, it.y + 0.6);
      } else if (it.kind === 'snail') {
        ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 0.35; ctx.beginPath();
        for (let a = 0; a < 10; a += 0.3) ctx.lineTo(it.x + Math.cos(a) * a * 0.22, it.y + Math.sin(a) * a * 0.22);
        ctx.stroke();
      } else if (it.kind === 'spider') {
        ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 0.2;
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x + Math.cos(a) * it.r, it.y + Math.sin(a) * it.r); ctx.stroke(); }
      } else {
        ctx.beginPath(); ctx.ellipse(it.x, it.y, it.r, it.r * 0.75, 0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // mission number badges
    for (const b of badgeSpots(S)) badge(ctx, b.n, b.x, b.y);
  }

  // Where the mission number badges go (world coordinates); also used by the 3D view.
  const BADGES = [[1, 70, 101], [1, 112, 86], [2, 64.5, 53], [3, 7.5, 42], [4, 18, 3], [5, 47, 3.5], [8, 50, 3], [9, 66, 3], [10, 77, 4], [10, 104.8, 35.5], [6, 147, 13], [7, 164, 13], [11, 139.5, 42], [12, 190, 36]];
  function badgeSpots(S) {
    const out = BADGES.map(([n, x, y]) => ({ n, x: wx(x), y }));
    for (const [dock, d] of Object.entries(DOCKS)) { const [x, y] = local(d.x, d.y, d.front, -7, 0); out.push({ n: S.docks[dock], x, y, dock }); }
    return out;
  }

  return {
    W, H, MX, MW, MH, HOME_R, HOMES, DOCKS, MISSIONS, MATCH_TIME, TOKEN_POINTS,
    mat: { id: 'fll', name: 'FLL BIOGLOW', w: W, h: H, draw: drawMat, ambient: 14 },
    newMatch, step, score, draw, onLaunch, inHome, homeOf, badgeSpots, wx, local,
  };
})();
