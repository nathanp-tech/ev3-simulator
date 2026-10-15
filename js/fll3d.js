// 3D view of the FLL table. Rendering only: the simulation stays 2D and deterministic (sim + FLLUI.S),
// this module just draws the same state in 3D and animates the models when a mission is done.
// World mapping: mat x (cm) -> X, mat y (cm, south = bigger) -> Z, height -> Y.
import * as THREE from 'three';
import { OrbitControls } from '../lib/three/OrbitControls.js';

const V = {
  on: false, renderer: null, scene: null, camera: null, controls: null, wrap: null,
  root: null, S: null, upd: [], anims: {}, items: new Map(), robot: null, robotKey: '',
  pops: [], lastPts: null, badges: [], zones: null, trail: null, trailLen: -1,
  cam: 'table', camAnim: null, labels: true, last: 0, t: 0, hud: null, bar: null,
};

// ---------- small helpers ----------
const MATS = {};
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  return MATS[k] || (MATS[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.02, ...o }));
}
function mesh(geo, color, o) {
  const m = new THREE.Mesh(geo, color instanceof THREE.Material ? color : mat(color, o));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// Shapes resting on y = 0 (their local origin is at the bottom centre).
const box = (w, h, d, c, o) => mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), c, o);
const cyl = (rt, rb, h, c, seg = 18) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0), c);
const cone = (r, h, c) => mesh(new THREE.ConeGeometry(r, h, 14).translate(0, h / 2, 0), c);
const ball = (r, c, o) => mesh(new THREE.SphereGeometry(r, 18, 12), c, o);
function grp(...kids) { const g = new THREE.Group(); kids.forEach((k) => k && g.add(k)); return g; }
function pos(o, x, y, z) { o.position.set(x, y, z); return o; }
// Place an object at a mat point (world cm) with a 2D heading in degrees (local +X faces the heading).
function at(o, x, y, deg = 0, h = 0) { o.position.set(x - FLL.W / 2, h, y - FLL.H / 2); o.rotation.y = -deg * DEG; return o; }
function anim(key, target, dt, rate = 3) {
  const cur = V.anims[key] === undefined ? target : V.anims[key];
  return (V.anims[key] = cur + (target - cur) * Math.min(1, dt * rate));
}
function textSprite(lines, { bg = '#d32f2f', fg = '#fff', round = false, w = 128, h = 128, font = 'bold 64px sans-serif' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  if (round) { ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.stroke(); }
  else if (bg) { ctx.beginPath(); ctx.roundRect(4, 4, w - 8, h - 8, 22); ctx.fill(); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const L = [].concat(lines);
  L.forEach((s, i) => { ctx.font = i === 0 ? font : 'bold 30px sans-serif'; ctx.fillText(s, w / 2, h / 2 + (i - (L.length - 1) / 2) * (i === 0 ? 46 : 40) + (L.length > 1 && i === 0 ? -6 : 0)); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  return s;
}
function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material && n.material.map) { n.material.map.dispose(); n.material.dispose(); }
  });
}

// ---------- scene ----------
function init(wrap) {
  V.wrap = wrap;
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.domElement.id = 'sim3d';
  wrap.appendChild(r.domElement);
  V.renderer = r;
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#2b3036');
  sc.fog = new THREE.Fog('#2b3036', 420, 900);
  V.scene = sc;
  V.camera = new THREE.PerspectiveCamera(38, 1, 1, 2000);
  V.controls = new OrbitControls(V.camera, r.domElement);
  V.controls.enableDamping = true;
  V.controls.maxPolarAngle = Math.PI / 2 - 0.05;
  V.controls.minDistance = 25; V.controls.maxDistance = 600;
  V.controls.addEventListener('start', () => { if (V.cam !== 'robot') V.camAnim = null; });

  sc.add(new THREE.HemisphereLight('#ffffff', '#6b5a45', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.position.set(-90, 200, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 110, bottom: -110, near: 10, far: 500 });
  sun.shadow.bias = -0.0005;
  sc.add(sun);

  // HUD and camera buttons
  V.hud = document.createElement('div'); V.hud.className = 'hud3d'; wrap.appendChild(V.hud);
  V.bar = document.createElement('div'); V.bar.className = 'bar3d';
  V.bar.innerHTML = '<button data-cam="table" title="View the whole table">Table</button><button data-cam="robot" title="Camera follows the robot">Follow robot</button><button data-cam="top" title="View from above">Top</button><label title="Show the mission numbers"><input type="checkbox" checked> Labels</label>';
  wrap.appendChild(V.bar);
  V.bar.querySelectorAll('[data-cam]').forEach((b) => { b.onclick = () => setCam(b.dataset.cam); });
  V.bar.querySelector('input').onchange = (e) => { V.labels = e.target.checked; };
}

function setCam(mode) {
  V.cam = mode;
  V.bar.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === mode));
  V.controls.enabled = mode !== 'robot';
  if (mode === 'table') V.camAnim = { p: new THREE.Vector3(0, 128, 128), t: new THREE.Vector3(0, -6, 4) };
  if (mode === 'top') V.camAnim = { p: new THREE.Vector3(0, 300, 1), t: new THREE.Vector3(0, 0, 0) };
}

function buildTable() {
  const W = FLL.W, H = FLL.H, g = new THREE.Group();
  // mat texture (drawn at higher resolution than the simulator's sampled mat)
  const k = 8, c = document.createElement('canvas');
  c.width = Math.round(W * k); c.height = Math.round(H * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(k, k);
  FLL.mat.draw(ctx);
  const S = V.S;
  for (const [a, col] of [[S.platform, 'rgba(139,195,74,0.6)'], [S.station, 'rgba(121,85,72,0.6)']]) {
    if (!a) continue;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(...a[0]); a.slice(1).forEach((q) => ctx.lineTo(...q)); ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = V.renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  floor.receiveShadow = true;
  g.add(floor);
  // table top and black border walls
  const wood = '#c8a165', wall = '#2a2a2a', t = 2.5, wh = 7;
  g.add(pos(box(W + 30, 4, H + 30, wood), 0, -4.4, 0));
  g.add(pos(box(W + 2 * t, wh, t, wall), 0, 0, -H / 2 - t / 2));
  g.add(pos(box(W + 2 * t, wh, t, wall), 0, 0, H / 2 + t / 2));
  g.add(pos(box(t, wh, H, wall), -W / 2 - t / 2, 0, 0));
  g.add(pos(box(t, wh, H, wall), W / 2 + t / 2, 0, 0));
  // floor of the room
  const room = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), mat('#3a4048'));
  room.position.y = -60; room.receiveShadow = true;
  g.add(room);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(pos(box(6, 56, 6, '#8d6e4a'), x * (W / 2 + 8), -60, z * (H / 2 + 8)));
  return g;
}

// ---------- mission models (each one gets an update function animating its state) ----------
function drone() {
  const g = grp(box(3.4, 0.9, 3.4, '#eceff1'), pos(box(1.4, 0.6, 1.4, '#29b6f6', { emissive: '#0288d1', emissiveIntensity: 0.4 }), 0, 0.9, 0));
  g.userData.rotors = [];
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    g.add(pos(box(2.4, 0.3, 0.4, '#90a4ae'), x / 2, 0.3, z / 2).rotateY(Math.atan2(z, x)));
    const r = pos(box(2.8, 0.12, 0.35, '#263238'), x, 1, z);
    g.add(r); g.userData.rotors.push(r);
  }
  return g;
}

function buildModels() {
  const S = V.S, F = S.flags, R = V.root, U = V.upd, wx = FLL.wx;
  // M01 Drone Survey
  for (const y of [106.6, 110]) R.add(at(box(53, 0.8, 0.5, '#222'), wx(87.5), y));
  R.add(at(box(5, 2.2, 4.6, '#c0392b'), wx(61), 108.3));
  R.add(at(box(7, 3, 8, '#8a8f96'), wx(117), 108));
  const dr = at(drone(), wx(117), 108, 0, 3);
  R.add(dr);
  U.push((dt) => {
    const up = F.droneLaunched;
    dr.position.y = anim('drone', up ? 26 : 3, dt, 1.2) + (up ? Math.sin(V.t * 2.3) * 0.5 : 0);
    if (up) { dr.rotation.y += dt * 0.5; dr.userData.rotors.forEach((r) => { r.rotation.y += dt * 35; }); }
  });
  const mapG = at(grp(box(8, 2, 8, '#7d8288')), wx(105.1), 91.4, 25);
  const panel = grp(pos(box(6.4, 0.35, 6.4, '#37474f'), 0, 0, 0), pos(box(6.4, 0.35, 6.4, '#66bb6a', { emissive: '#2e7d32', emissiveIntensity: 0.25 }), 0, -0.35, 0));
  panel.position.y = 2.4;
  mapG.add(panel); R.add(mapG);
  U.push((dt) => { const a = anim('map', F.mapFlipped ? Math.PI : 0, dt, 3); panel.rotation.x = a; panel.position.y = 2.4 + Math.sin(a) * 3.5 + (a > Math.PI / 2 ? 0.35 : 0); });

  // M02 Exploding Seeds
  const m02 = at(grp(box(7, 1.5, 7, '#9acd32'), pos(cyl(0.5, 0.6, 11, '#558b2f'), 0, 1.5, 0)), wx(64.5), 60, 45);
  const pods = [0, 1, 2].map((i) => { const p = pos(ball(1.3, '#8d5524'), Math.cos(i * 2.1) * 1.4, 12.5, Math.sin(i * 2.1) * 1.4); m02.add(p); return p; });
  R.add(m02);
  U.push((dt) => { const s = anim('pods', F.seedsReleased ? 0.001 : 1, dt, 6); pods.forEach((p) => p.scale.setScalar(s)); });

  // M03 Flip the Rock + research flag
  const m03 = at(grp(box(9, 1, 7, '#757575')), wx(7.5), 49.5);
  const rock = pos(mesh(new THREE.DodecahedronGeometry(3.2), '#9e9e9e', { flatShading: true }), 0, 4, 0);
  rock.scale.set(1.1, 0.8, 0.95);
  const flag = grp(cyl(0.22, 0.22, 9, '#e0e0e0'), pos(box(3, 2, 0.15, '#ffeb3b'), 1.5, 6.8, 0));
  flag.position.set(3.8, 1, 2.6);
  m03.add(rock, flag); R.add(m03);
  U.push((dt) => {
    const a = anim('rock', (F.rockFlipped ? Math.PI : 0) + (F.rockBack ? Math.PI : 0), dt, 2.5);
    rock.rotation.z = a; rock.position.y = 4 + Math.abs(Math.sin(a)) * 2.5;
    flag.rotation.z = anim('flag', F.flagDown ? -Math.PI / 2 * 0.97 : 0, dt, 3);
  });

  // M04 Lucky Leaves (nest with 3 slots)
  [[4.5, 12.5], [8.5, 8.5], [12.5, 4.5]].forEach(([x, y], i) => {
    const g = at(grp(box(5, 3, 5, '#6d4c41')), wx(x), y, 45);
    const top = F.slots[i] === 'katydid' ? katydidMesh() : leafMesh();
    top.position.y = 3.2;
    g.add(top); R.add(g);
    U.push((dt) => { top.scale.setScalar(anim('slot' + i, F.removed[i] ? 0.001 : 1, dt, 6)); });
  });

  // M05 Reaching Roots: the root grows along the wall while the lever is pushed
  R.add(at(cyl(3, 3.3, 5, '#8d6e63'), wx(41), 3.5));
  const root = at(mesh(new THREE.CylinderGeometry(0.55, 0.8, 1, 10).translate(0, 0.5, 0), '#a1887f'), wx(43.5), 3.5, 0, 0.8);
  root.rotation.z = -Math.PI / 2;
  R.add(root);
  U.push((dt) => { root.scale.y = 0.5 + 11 * anim('root', Math.min(1, F.rootT / 3.4), dt, 4); });

  // M08 / M09: big tree with the vine, camera trap, seed and research platform on its south side
  const tree = at(grp(box(16, 1.5, 12, '#33691e')), wx(57.6), 7);
  tree.add(pos(cyl(2.2, 2.9, 24, '#6d4c41'), 0, 1.5, -1));
  for (const [x, y, z, r] of [[0, 28, -1, 8], [-6, 23, 1, 5.5], [6.5, 24, -2, 6], [1, 32, 1, 5]]) tree.add(pos(ball(r, '#2e7d32'), x, y, z));
  tree.add(pos(box(16, 1, 1, '#5d4037'), 0, 19, 5.5));
  R.add(tree);
  const sx = (x) => wx(x) - FLL.W / 2, sz = 12.5 - FLL.H / 2;
  const vine = mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 8).translate(0, -0.5, 0), '#43a047');
  pos(vine, sx(51.6), 19, sz);
  const cam = grp(box(1.6, 2.2, 1.4, '#3e2723'), pos(cyl(0.45, 0.45, 0.5, '#111'), 0, 1.2, 0.9).rotateX(Math.PI / 2));
  const seed = pos(ball(1, '#8d5524'), sx(59.6), 17.5, sz);
  const plat = pos(box(4, 0.6, 4, '#ffb300'), sx(63.6), 1, sz + 1.5);
  R.add(vine, cam, seed, plat);
  U.push((dt) => {
    vine.scale.y = anim('vine', F.vineDown ? 19 : 6, dt, 2.5);
    const c = anim('cam', F.cameraDeployed ? 1 : 0, dt, 2.5);
    cam.position.set(sx(55.6), 15.5 - c * 15.5, sz + c * 2.5);
    seed.scale.setScalar(anim('tseed', F.treeSeedDropped ? 0.001 : 1, dt, 6));
    plat.position.y = anim('plat', F.platformRaised ? 15 : 1, dt, 2.5);
  });

  // M06 / M07: ant nest and mycelium
  const nest = at(mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#d7ccc8'), wx(154), 6);
  nest.scale.set(8, 6, 5);
  R.add(nest, at(pos(cyl(1.6, 1.6, 0.3, '#3e2723'), 0, 0, 0).rotateX(Math.PI / 2), wx(150), 10.6, 0, 1.6));
  const myc = at(grp(), wx(160), 11, 0, 0.15);
  for (const a of [-50, -20, 10, 40, 70]) {
    const s = mesh(new THREE.BoxGeometry(0.3, 0.3, 6).translate(0, 0, 3), '#fafafa', { emissive: '#fff59d', emissiveIntensity: 0.35 });
    s.rotation.y = a * DEG; myc.add(s);
  }
  R.add(myc);
  U.push((dt) => { const s = anim('myc', F.myceliumExt ? 1 : 0.12, dt, 2); myc.scale.set(s, 1, s); });

  // M11 Window to the Past: the cover falls forward to reveal the soil layers
  const win = at(grp(box(9, 8, 9, '#6d4c41')), wx(139.5), 50.3, 135);
  win.add(pos(box(0.3, 4, 5.5, '#ffcc80'), 4.6, 2, 0), pos(box(0.3, 1, 5.5, '#8d6e63'), 4.7, 3.6, 0), pos(box(0.3, 0.8, 5.5, '#bcaaa4'), 4.7, 2.2, 0));
  const cover = grp(pos(box(0.5, 6.8, 7, '#a1887f'), 0.25, 0, 0));
  cover.position.set(4.6, 0.6, 0);
  win.add(cover); R.add(win);
  U.push((dt) => { cover.rotation.z = anim('cover', F.coverDown ? -Math.PI / 2 : 0, dt, 3); });

  // M12 Forest Elder: cane raised against the tree, support tie around the post
  const elder = at(grp(cyl(2.8, 3.6, 26, '#5d4037')), wx(197), 39);
  for (const [x, y, z, r] of [[0, 29, 0, 7.5], [-4, 25, 3, 5], [3, 26, -3, 5.5]]) elder.add(pos(ball(r, '#1b5e20'), x, y, z));
  R.add(elder);
  const cane = at(grp(mesh(new THREE.BoxGeometry(9, 0.7, 0.7).translate(-4.5, 0.35, 0), '#bcaaa4')), wx(193.6), 39);
  R.add(cane);
  R.add(at(box(3, 1, 8, '#795548'), wx(198.5), 61.7), at(cyl(1, 1.1, 10, '#8d6e63'), wx(198.5), 61.7));
  const tie = at(mesh(new THREE.TorusGeometry(1.5, 0.38, 8, 20).rotateX(Math.PI / 2), '#fdd835'), wx(198.5), 61.7, 0, 7);
  R.add(tie);
  U.push((dt) => {
    cane.rotation.z = anim('cane', F.caneRaised ? -1.15 : 0, dt, 2.5);
    tie.scale.setScalar(anim('tie', F.tieOn ? 1 : 0.001, dt, 5));
  });

  // Interchangeable docks M13 - M15 (local +X = front of the dock)
  for (const [dock, d] of Object.entries(FLL.DOCKS)) {
    const m = S.docks[dock];
    const g = at(grp(box(10, 2, 14, m === 13 ? '#8bc34a' : m === 14 ? '#a1887f' : '#90a4ae')), wx(d.x), d.y, d.front);
    R.add(g);
    if (m === 13) {
      const trees = grp();
      for (const z of [-4.5, 0, 4.5]) trees.add(pos(grp(cyl(0.35, 0.4, 2.5, '#6d4c41'), pos(cone(1.8, 5.5, '#43a047'), 0, 2.3, 0)), 0, 0, z));
      trees.position.set(-2, 2, 0);
      g.add(trees);
      U.push((dt) => { trees.rotation.z = anim('ytrees', F.treesRaised ? 0 : Math.PI / 2 * 0.95, dt, 2.5); });
    } else if (m === 14) {
      g.add(pos(box(9, 1, 13, '#4e342e'), 0, 2, 0));
      const sprouts = [[-2, -4], [2, -1.5], [-2, 1.5], [2, 4]].map(([x, z]) => { const s = pos(grp(cyl(0.2, 0.25, 2, '#7cb342'), pos(ball(0.9, '#8bc34a'), 0, 2.2, 0)), x, 3, z); g.add(s); return s; });
      U.push((dt) => {
        const n = S.items.filter((i) => i.kind === 'seed' && S.station && pointIn([i.x, i.y], S.station)).length;
        sprouts.forEach((s, i) => s.scale.setScalar(anim('sprout' + i, i < n ? 1 : 0.001, dt, 3)));
      });
    } else {
      g.add(pos(box(8, 10, 14, '#cfd8dc'), -1, 2, 0));
      for (const z of [-4.7, 0, 4.7]) g.add(pos(box(6, 0.5, 3.5, '#78909c'), -1.5, 12, z));
      const canopy = grp(mesh(new THREE.BoxGeometry(0.4, 4.2, 4.2).translate(0, -2.1, 0), '#66bb6a'));
      canopy.position.set(3.2, 11.8, -4.7);
      const sky = pos(box(2.2, 2.6, 4, '#81d4fa', { transparent: true, opacity: 0.75, roughness: 0.1 }), 4, 6.5, 0);
      const hatch = grp(mesh(new THREE.BoxGeometry(0.4, 4.4, 4.2).translate(0.2, 2.2, 0), '#8d6e63'));
      hatch.position.set(3, 2, 4.7);
      g.add(canopy, sky, hatch);
      U.push((dt) => {
        canopy.rotation.z = anim('canopy', F.canopy ? Math.PI / 2 : 0, dt, 3);
        sky.position.x = anim('sky', F.skylight ? 2.4 : 4.3, dt, 3);
        hatch.rotation.z = anim('hatch', F.hatch ? -Math.PI / 2 : 0, dt, 3);
      });
    }
  }
}

function pointIn([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function leafMesh() { const l = ball(1, '#43a047'); l.scale.set(2.2, 0.35, 1.3); l.position.y = 0.35; return grp(l); }
function katydidMesh() {
  const b = ball(1, '#9ccc65'); b.scale.set(2, 0.7, 0.75); b.position.y = 0.8;
  const g = grp(b, pos(ball(0.6, '#7cb342'), 1.8, 1, 0));
  for (const s of [-1, 1]) g.add(pos(box(2.6, 0.12, 0.12, '#558b2f'), 3, 1.3, s * 0.4).rotateY(s * 0.4).rotateZ(0.35));
  for (const s of [-1, 1]) g.add(pos(box(2.8, 0.18, 0.18, '#689f38'), -1, 0.4, s * 0.8).rotateY(s * 0.6));
  return g;
}

// ---------- loose items (seeds, keystone, habitats, sliders) ----------
function itemMesh(it) {
  if (it.ant) {
    const g = grp(box(3.6, 0.8, 3.6, '#5d4037'));
    [[-1.1, 0.7], [0, 0.9], [1.2, 0.75]].forEach(([x, r]) => g.add(pos(ball(r, '#c62828'), x, 1.5, 0)));
    for (const x of [-0.8, 0, 0.8]) for (const s of [-1, 1]) g.add(pos(box(0.12, 0.12, 2.4, '#222'), x, 1.1, s * 0.9).rotateX(s * 0.5));
    return g;
  }
  if (it.kind === 'slider') return it.id === 'm05-lever' ? grp(box(4.6, 4, 4.6, '#6d4c41'), pos(cyl(0.5, 0.5, 3, '#4e342e'), 0, 4, 0))
    : grp(box(5.2, 3, 5.2, '#2d3238'), pos(box(3, 0.2, 1, '#ffeb3b'), 0, 3, 0));
  if (it.kind === 'keystone') {
    const b = ball(2.8, '#ff9800'); b.scale.set(1, 0.85, 1); b.position.y = 2.4;
    const g = grp(b);
    for (const s of [-1, 1]) g.add(pos(ball(0.9, '#5d4037'), -0.4, 4.4, s * 1.7), pos(ball(0.35, '#212121'), 2.4, 3.1, s * 0.8));
    return g;
  }
  if (it.kind === 'seed') { const s = ball(1.3, '#8d5524'); s.scale.set(1, 0.7, 0.8); s.position.y = 0.9; return grp(s); }
  if (it.kind === 'leaf') return leafMesh();
  if (it.kind === 'katydid') return katydidMesh();
  if (it.kind === 'spider') {
    const g = grp(cyl(it.r, it.r, 2.5, '#455a64'), pos(ball(0.75, '#111'), 0, 3, 0));
    for (let k = 0; k < 4; k++) g.add(pos(box(3.4, 0.1, 0.1, '#111'), 0, 3, 0).rotateY(k * Math.PI / 4 + 0.4));
    return g;
  }
  if (it.kind === 'snail') {
    const g = grp(cyl(it.r, it.r, 1.8, '#f9a825'));
    const shell = pos(ball(1.3, '#8d6e63'), -0.3, 3, 0); shell.scale.set(1, 1, 0.7);
    const body = pos(ball(0.7, '#d7ccc8'), 1, 2.1, 0); body.scale.set(2, 0.6, 0.7);
    g.add(shell, body);
    return g;
  }
  return grp(ball(it.r, it.color));
}

function syncItems() {
  const seen = new Set();
  for (const it of V.S.items) {
    let m = V.items.get(it);
    if (!m) { m = itemMesh(it); V.items.set(it, m); V.root.add(m); }
    at(m, it.x, it.y, it.kind === 'katydid' || it.kind === 'leaf' ? 45 : 0);
    seen.add(it);
  }
  for (const [it, m] of V.items) if (!seen.has(it)) { V.root.remove(m); disposeTree(m); V.items.delete(it); }
}

// ---------- robot ----------
function buildRobot() {
  const cfg = sim.config, g = new THREE.Group();
  g.add(pos(box(16, 3, 11.2, '#3d434a'), 2, 1.2, 0));
  const wheels = {};
  for (const [role, z] of [['left', -7], ['right', 7]]) {
    const port = sim.wheelPort(role);
    const w = grp(mesh(new THREE.CylinderGeometry(2.8, 2.8, 2.6, 26).rotateX(Math.PI / 2), port ? '#1b1b1b' : '#777'),
      mesh(new THREE.BoxGeometry(4.2, 0.9, 2.7), '#bdbdbd'), mesh(new THREE.BoxGeometry(0.9, 4.2, 2.7), '#bdbdbd'));
    w.position.set(0, 2.8, z);
    g.add(w); wheels[role] = { w, port };
  }
  // EV3 brick with its screen (live LCD texture) and status light
  g.add(pos(box(10, 6.5, 9.6, '#e1e4e8'), -0.5, 4.2, 0));
  const lcdTex = new THREE.CanvasTexture(brick.lcd.canvas);
  lcdTex.colorSpace = THREE.SRGBColorSpace;
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.9).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lcdTex }));
  lcd.position.set(2.2, 10.75, 0);
  g.add(lcd);
  const light = new THREE.MeshStandardMaterial({ color: '#555', emissive: '#000' });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 8, 24).rotateX(Math.PI / 2), light);
  ring.position.set(-2.6, 10.75, 0);
  g.add(ring, pos(box(1.8, 0.4, 1.8, '#5c636b'), -2.6, 10.6, 0));
  // front arm (motor with role "arm"): turns around a horizontal axle, like a real FLL attachment
  let arm = null;
  for (const [p, m] of Object.entries(cfg.motors)) {
    if (m.type === 'none' || m.role !== 'arm') continue;
    const a = grp(pos(box(7.5, 0.9, 1.2, '#f2c200'), 3.75, -0.45, 0), pos(box(0.9, 0.9, 8, '#f2c200'), 7.5, -0.45, 0), mesh(new THREE.CylinderGeometry(0.9, 0.9, 2, 12).rotateX(Math.PI / 2), '#9e9e9e'));
    a.position.set(9.5, 6.5, 0);
    g.add(a); arm = { a, port: p };
    break;
  }
  for (const [, s] of Object.entries(cfg.sensors)) {
    if (s.type === 'color') { const [cx, cy] = COLOR_GEO[s.mount]; g.add(pos(box(2.4, 2.4, 2.6, '#26292d'), cx, 0.6, cy), pos(ball(0.5, '#ff2b2b', { emissive: '#ff2b2b', emissiveIntensity: 1.5 }), cx, 0.55, cy)); }
    else if (s.type === 'touch') { const b = BUMPER_GEO[s.mount]; g.add(pos(box(b[2] - b[0], 2.4, b[3] - b[1], '#c0392b'), (b[0] + b[2]) / 2, 1.6, (b[1] + b[3]) / 2)); }
    else if (s.type === 'ultrasonic' || s.type === 'infrared') {
      const [gx, gy, dir] = MOUNT_GEO[s.mount];
      const u = grp(pos(box(2, 3.2, 7.2, '#26292d'), -1, 0, 0));
      for (const z of [-1.9, 1.9]) u.add(pos(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 16).rotateZ(Math.PI / 2), s.type === 'ultrasonic' ? '#28c5c9' : '#7a1d1d'), 0.2, 1.6, z));
      u.position.set(gx, 3, gy); u.rotation.y = -dir * DEG;
      g.add(u);
    } else if (s.type === 'gyro') g.add(pos(box(2.6, 2.6, 2.6, '#26292d'), -5.5, 4.2, 3.3));
  }
  return { g, wheels, arm, light, lcdTex };
}

function syncRobot() {
  const key = JSON.stringify(sim.config);
  if (key !== V.robotKey) {
    if (V.robot) { V.scene.remove(V.robot.g); disposeTree(V.robot.g); }
    V.robot = buildRobot(); V.robotKey = key;
    V.scene.add(V.robot.g);
  }
  const R = V.robot;
  at(R.g, sim.robot.x, sim.robot.y, sim.robot.th / DEG);
  for (const { w, port } of Object.values(R.wheels)) if (port) w.rotation.z = -sim.motors[port].pos * DEG;
  if (R.arm) R.arm.a.rotation.z = sim.motors[R.arm.port].pos * DEG;
  R.lcdTex.needsUpdate = true;
  const lv = lightVisible(brick.light, sim.t);
  if (lv > 0) { R.light.color.set(LIGHT_COLORS[brick.light.color]); R.light.emissive.set(LIGHT_COLORS[brick.light.color]); R.light.emissiveIntensity = 1.6 * lv; }
  else { R.light.color.set('#555'); R.light.emissive.set('#000'); }
}

// ---------- labels, zones, trail, "mission done" effects ----------
const LABEL_H = { 8: 40, 9: 40, 12: 38, 15: 17, 1: 12 };
function buildBadges() {
  V.badges = FLL.badgeSpots(V.S).map((b) => {
    const s = textSprite(String(b.n).padStart(2, '0'), { round: true, font: 'bold 60px sans-serif' });
    s.scale.set(6, 6, 1);
    at(s, b.x, b.y, 0, LABEL_H[b.n] || 13);
    V.root.add(s);
    return { ...b, s };
  });
}
function buildZones() {
  const g = new THREE.Group();
  for (const z of V.S.zones) {
    const shape = new THREE.Shape(z.poly.map(([x, y]) => new THREE.Vector2(x - FLL.W / 2, -(y - FLL.H / 2))));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: z.kind === 'arm' ? '#ffc107' : '#03a9f4', transparent: true, opacity: 0.45, depthWrite: false }));
    m.position.y = 0.12;
    g.add(m);
  }
  V.zones = g; V.root.add(g);
}
function syncTrail() {
  const n = App.trail ? sim.trail.length : 0;
  if (n === V.trailLen) { if (V.trail && n) { const p = V.trail.geometry.attributes.position; p.setXYZ(n, sim.robot.x - FLL.W / 2, 0.25, sim.robot.y - FLL.H / 2); p.needsUpdate = true; } return; }
  V.trailLen = n;
  if (V.trail) { V.scene.remove(V.trail); V.trail.geometry.dispose(); V.trail = null; }
  if (n < 2) return;
  const pts = sim.trail.concat([[sim.robot.x, sim.robot.y]]).map(([x, y]) => new THREE.Vector3(x - FLL.W / 2, 0.25, y - FLL.H / 2));
  V.trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#3d8cf5' }));
  V.scene.add(V.trail);
}
function checkPops(dt) {
  const sc = FLL.score(V.S);
  const pts = sc.rows.map((r) => r.points);
  if (V.lastPts) {
    sc.rows.forEach((r, i) => {
      if (pts[i] > V.lastPts[i]) {
        const b = V.badges.find((x) => x.n === r.n) || { x: FLL.W / 2, y: FLL.H / 2 };
        const s = textSprite([`+${pts[i] - V.lastPts[i]}`, `M${String(r.n).padStart(2, '0')} ${r.name}`], { bg: 'rgba(46,160,67,0.92)', w: 512, h: 160, font: 'bold 72px sans-serif' });
        s.scale.set(26, 8.1, 1);
        at(s, b.x, b.y, 0, (LABEL_H[r.n] || 13) + 4);
        const ring = at(new THREE.Mesh(new THREE.RingGeometry(1, 1.8, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7CFC00', transparent: true, depthWrite: false })), b.x, b.y, 0, 0.3);
        V.scene.add(s, ring);
        V.pops.push({ s, ring, age: 0, y0: s.position.y });
      }
    });
  }
  V.lastPts = pts;
  for (const p of V.pops) {
    p.age += dt;
    const k = p.age / 2.4;
    p.s.position.y = p.y0 + k * 12;
    p.s.material.opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    p.ring.scale.setScalar(1 + k * 9);
    p.ring.material.opacity = Math.max(0, 1 - k * 1.6);
  }
  V.pops = V.pops.filter((p) => {
    if (p.age < 2.4) return true;
    V.scene.remove(p.s, p.ring); p.s.material.map.dispose(); p.s.material.dispose(); p.ring.geometry.dispose(); p.ring.material.dispose();
    return false;
  });
  return sc;
}

function rebuild() {
  if (V.root) { V.scene.remove(V.root); disposeTree(V.root); }
  for (const p of V.pops) V.scene.remove(p.s, p.ring);
  V.root = new THREE.Group(); V.scene.add(V.root);
  V.upd = []; V.anims = {}; V.items = new Map(); V.pops = []; V.lastPts = null;
  V.root.add(buildTable());
  buildModels();
  buildBadges();
  buildZones();
}

// ---------- public API (used by app.js) ----------
function fmt(t) { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

window.FLL3D = {
  get on() { return V.on; },
  enable(wrap) {
    if (!V.renderer) { init(wrap); setCam('table'); }
    V.on = true;
    V.renderer.domElement.hidden = false; V.hud.hidden = false; V.bar.hidden = false;
    V.last = 0;
  },
  disable() {
    V.on = false;
    if (V.renderer) { V.renderer.domElement.hidden = true; V.hud.hidden = true; V.bar.hidden = true; }
  },
  render(now) {
    if (!V.on || !FLLUI.S) return;
    if (V.S !== FLLUI.S) { V.S = FLLUI.S; rebuild(); }
    const dt = V.last ? Math.min(0.1, (now - V.last) / 1000) : 0;
    V.last = now; V.t += dt;
    const w = V.wrap.clientWidth, h = V.wrap.clientHeight;
    const cv = V.renderer.domElement;
    if (cv.width !== Math.round(w * V.renderer.getPixelRatio()) || cv.height !== Math.round(h * V.renderer.getPixelRatio())) {
      V.renderer.setSize(w, h, false);
      V.camera.aspect = w / Math.max(1, h); V.camera.updateProjectionMatrix();
    }
    for (const u of V.upd) u(dt);
    syncItems();
    syncRobot();
    syncTrail();
    V.zones.visible = FLLUI.showZones;
    for (const b of V.badges) b.s.visible = V.labels;
    const sc = checkPops(dt);
    // camera
    const C = V.camera, ctl = V.controls;
    if (V.cam === 'robot') {
      const th = sim.robot.th, rx = sim.robot.x - FLL.W / 2, rz = sim.robot.y - FLL.H / 2;
      const want = new THREE.Vector3(rx - Math.cos(th) * 45, 32, rz - Math.sin(th) * 45);
      C.position.lerp(want, Math.min(1, dt * 3));
      ctl.target.lerp(new THREE.Vector3(rx + Math.cos(th) * 18, 2, rz + Math.sin(th) * 18), Math.min(1, dt * 4));
      C.lookAt(ctl.target);
    } else {
      if (V.camAnim) {
        C.position.lerp(V.camAnim.p, Math.min(1, dt * 4 || 1));
        ctl.target.lerp(V.camAnim.t, Math.min(1, dt * 4 || 1));
        if (C.position.distanceTo(V.camAnim.p) < 0.5) V.camAnim = null;
      }
      ctl.update();
    }
    V.hud.innerHTML = `<b>${fmt(FLL.MATCH_TIME - V.S.clock)}</b> · ${sc.total} pts${V.S.ended ? ' · match over' : ''}`;
    V.renderer.render(V.scene, C);
  },
  // Mouse position -> mat point (cm) on a plane a little above the mat, for dragging the robot in home.
  pick(e) {
    const r = V.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), V.camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -4), p)) return [-1e3, -1e3];
    return [p.x + FLL.W / 2, p.z + FLL.H / 2];
  },
  get canvas() { return V.renderer && V.renderer.domElement; },
  setCam,
  get debug() { return { pops: V.pops.length, items: V.items.size, cam: V.cam }; },
  // for tests: look at a mat point (cm) from a given offset
  look(x, y, dx = 0, dh = 40, dz = 45) { V.cam = 'free'; V.camAnim = { p: new THREE.Vector3(x - FLL.W / 2 + dx, dh, y - FLL.H / 2 + dz), t: new THREE.Vector3(x - FLL.W / 2, 2, y - FLL.H / 2) }; },
};
