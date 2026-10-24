// Student app: welcome screen, guided challenges or free programming, live simulation, Port View, save file.
'use strict';

const $ = (id) => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Waits for the next frame, or 50 ms if the tab is in the background (rAF paused).
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 50);
});

const DEFAULT_PROGRAM = { blocks: { languageVersion: 0, blocks: [{ type: 'ev3_when_start', x: 60, y: 60 }] } };
const STORAGE = 'ev3sim.v2.';

const sim = new Sim();
const brick = new Brick();
let rt = new Runtime(sim, brick);
let ws, portView, portDiagram;

const App = {
  mode: 'sandbox', matId: 'blank', challenge: null, practiceSeed: 1, ctx: null,
  status: 'idle', speed: 1, trail: true, busy: false, lastNow: 0, simTarget: 0,
  highlighted: new Set(), drag: null, view: null, runStartPose: null, cancelEval: false,
  loading: false, reminderSnoozedUntil: 0,
};
const progressMode = () => (App.mode === 'challenge' ? 'guided' : App.mode === 'fll' ? 'fll' : 'free');
const appModeOf = (m) => (m === 'free' ? 'sandbox' : m === 'fll' ? 'fll' : 'challenge');
const MODE_LABEL = { guided: '🧭 Guided challenges', free: '🛠️ Free programming', fll: '🏆 FIRST LEGO League' };
const modeAllowed = (m) => App.preview || (m === 'guided' ? CLASSROOM.allowGuided !== false : m === 'free' ? CLASSROOM.allowFree !== false : CLASSROOM.allowFLL !== false);

// ---------- Console and toast ----------
function log(msg, kind = 'info') {
  const el = $('log');
  const d = document.createElement('div');
  d.className = kind;
  d.textContent = msg;
  el.appendChild(d);
  while (el.children.length > 300) el.firstChild.remove();
  el.scrollTop = el.scrollHeight;
}
function toast(msg, ms = 3500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- Programs: one per challenge, plus the free-programming one ----------
function workSlot() {
  if (!Progress.data) return null;
  if (App.exam) return App.examCh ? examSlot(App.examCh) : null;
  if (App.mode === 'fll') return Progress.data.fll;
  return App.mode === 'challenge' ? Progress.ch() : Progress.data.free;
}
function storeWorkspace() {
  const slot = workSlot();
  if (!slot || App.loading) return;
  slot.program = Blockly.serialization.workspaces.save(ws);
  slot.robot = JSON.parse(JSON.stringify(sim.config));
  Progress.persist();
}
function loadProgram(state) {
  App.loading = true;
  try {
    ws.clear();
    Blockly.serialization.workspaces.load(state || DEFAULT_PROGRAM, ws);
  } catch (e) {
    console.error(e);
    ws.clear();
    Blockly.serialization.workspaces.load(DEFAULT_PROGRAM, ws);
  } finally {
    App.loading = false;
  }
}
function loadSlot(slot) {
  loadProgram(slot && slot.program);
  const robot = slot && slot.robot ? slot.robot : App.mode === 'fll' ? FLL_CONFIG : DEFAULT_CONFIG;
  applyConfig(App.mode === 'challenge' ? classicRobot(robot) : robot, { save: false });
  setTimeout(applyNotes, 0); // teacher comments on the blocks of this program
}
let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(storeWorkspace, 400);
}
function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const currentProgram = () => ({ code: generateProgram(ws), ...programVariables(ws) });

function saveWork() {
  if (!Progress.data) return;
  storeWorkspace();
  Progress.markSaved();
  download(Progress.fileName(), Progress.data);
  $('saveReminder').hidden = true;
  toast('💾 Your work was downloaded: ' + Progress.fileName());
  log('💾 Work saved to ' + Progress.fileName(), 'success');
}

// ---------- Robot configuration ----------
function applyConfig(cfg, { save = true } = {}) {
  sim.setConfig(cfg);
  portView.render();
  portDiagram.render();
  $('pvWarn').textContent = portView.warnings().join(' ');
  $('presetSel').value = Object.keys(ROBOT_PRESETS).find((k) => JSON.stringify(normalizeConfig(ROBOT_PRESETS[k])) === JSON.stringify(sim.config)) || '';
  if (save) autosave();
}

// ---------- Session: welcome screen ----------
function showWelcome() {
  $('welcome').hidden = false;
  $('wError').textContent = '';
  const saved = Progress.restoreLocal();
  const btn = $('wContinue');
  if (saved && saved.name) {
    const done = Object.values(saved.challenges || {}).filter((c) => c.status === 'validated').length;
    btn.textContent = `↩ Continue as ${saved.name}${saved.className ? ' (' + saved.className + ')' : ''} · ${saved.mode === 'free' ? 'free programming' : done + ' / ' + CHALLENGES.length + ' challenges'}`;
    btn.hidden = false;
    btn.onclick = () => startSession(Progress.load(saved));
  } else {
    btn.hidden = true;
  }
  App.exam = null;
  CR.examOver = false;
  CR.helpSince = 0;
  $('examOverlay').hidden = $('pauseOverlay').hidden = $('closedOverlay').hidden = true;
  updateExamBanner();
  renderHelpButton();
  pickClass('');
  checkClassCode().then((ok) => { if (ok) loadRoster().then(() => { if (!$('welcome').hidden && !$('wName').value) pickClass($('wClass').value); }); });
}

// The class code (in the link / QR code of the dashboard, or typed once) opens the class lists on this device.
async function checkClassCode() {
  const u = new URL(location.href);
  if (u.searchParams.get('c')) {
    ClassCode.set(u.searchParams.get('c').trim());
    u.searchParams.delete('c');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  }
  const info = await Sync.getJson('api/info');
  const ok = !info || !info.studentCodeRequired || (ClassCode.get() && (await Sync.getJson('api/join') || {}).ok);
  $('wCodeStep').hidden = !!ok;
  $('wPick').hidden = !ok;
  $('wModeTitle').hidden = $('wChoices').hidden = !ok;
  if (!ok) { $('wCode').value = ''; setTimeout(() => $('wCode').focus(), 50); }
  return ok;
}
async function submitClassCode() {
  const c = $('wCode').value.trim();
  if (!c) return;
  ClassCode.set(c);
  if ((await Sync.getJson('api/join') || {}).ok) { $('wError').textContent = ''; showWelcome(); return; }
  ClassCode.set('');
  $('wError').textContent = 'This code is not right. Ask your teacher.';
  $('wCode').select();
}
// The teacher changed the code during a session: ask for the new one (the work stays on this computer meanwhile).
let askingCode = false;
Sync.onNeedCode = () => {
  if (askingCode || !$('welcome').hidden) return;
  askingCode = true;
  openModal(`<h2>🔑 Class code</h2><p>Your teacher changed the class code. Type the new code to keep saving your work online.</p>
    <p><input id="mCode" autocomplete="off" style="font-size:18px;padding:8px 10px;width:180px"> <button class="primary" id="mCodeGo">OK</button></p><p id="mCodeErr" class="werr"></p>`);
  const go = async () => {
    ClassCode.set($('mCode').value.trim());
    if ((await Sync.getJson('api/join') || {}).ok) { askingCode = false; closeModal(); Sync.push(liveState(), true); }
    else $('mCodeErr').textContent = 'This code is not right.';
  };
  $('mCodeGo').onclick = go;
  $('mCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
};

// ---------- Welcome: the student chooses their class, then their name (js/roster.js) ----------
const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
function pickClass(cls) {
  $('wClass').value = cls;
  $('wName').value = '';
  const roster = currentRoster();
  if (cls && (!roster[cls] || classClosed(cls))) cls = '';
  $('wClass').value = cls;
  $('wClasses').innerHTML = !Object.keys(roster).length ? '<span class="muted">Loading the classes…</span>' : Object.keys(roster).sort(byName).map((c) => classClosed(c)
    ? `<button class="wclass closed" disabled title="Your teacher closed this class for now">🔒 ${esc(c)}</button>`
    : `<button class="wclass${c === cls ? ' on' : ''}" data-class="${esc(c)}">${esc(c)}</button>`).join('');
  $('wClasses').querySelectorAll('[data-class]').forEach((b) => { b.onclick = () => pickClass(b.dataset.class); });
  $('wNameStep').hidden = !cls;
  $('wNames').innerHTML = cls ? roster[cls].slice().sort(byName).map((n) => `<button class="wname" data-name="${esc(n)}">${esc(n)}</button>`).join('') : '';
  $('wNames').querySelectorAll('[data-name]').forEach((b) => { b.onclick = () => pickName(b.dataset.name); });
  $('wPick').hidden = false;
  $('wMe').hidden = true;
  $('wChoices').classList.add('wait');
  $('wModeTitle').classList.add('wait');
}
function pickName(name) {
  $('wName').value = name;
  $('wError').textContent = '';
  $('wPick').hidden = true;
  $('wMeText').innerHTML = `Hi <b>${esc(name)}</b> (${esc($('wClass').value)})! 👋`;
  $('wMe').hidden = false;
  $('wChoices').classList.remove('wait');
  $('wModeTitle').classList.remove('wait');
}

// The teacher changed this student's work in the dashboard: reload it from the server.
let remoteBusy = false;
async function onRemoteChange() {
  if (remoteBusy || !Progress.data) return;
  remoteBusy = true;
  try {
    if (App.status === 'running') rt.stopAll('user');
    const work = await Sync.fetchWork(Progress.data.studentId);
    Progress.load(work);
    Progress.dirty = false;
    startSession(Progress.data, { quiet: true });
    toast('🔄 Your teacher updated your work.');
  } catch (e) { console.error(e); } finally { remoteBusy = false; }
}
// The teacher deleted this student (or reset the class).
function onDeleted() {
  if (!Progress.data) return;
  if (App.status === 'running') rt.stopAll('user');
  Progress.clearLocal();
  Progress.data = null;
  closeModal();
  showWelcome();
  $('wError').textContent = 'Your teacher reset your work. Choose your name to start again.';
}

function applyClassSettings() {
  document.querySelector('.choice.guided').hidden = CLASSROOM.allowGuided === false;
  document.querySelector('.choice.free').hidden = CLASSROOM.allowFree === false;
  document.querySelector('.choice.fll').hidden = CLASSROOM.allowFLL === false;
  $('btnSwitchMode').disabled = !!App.exam || ['guided', 'free', 'fll'].filter(modeAllowed).length < 2;
}

function startSession(data, { quiet = false } = {}) {
  $('welcome').hidden = true;
  if (!modeAllowed(data.mode || 'guided')) data.mode = ['guided', 'free', 'fll'].find(modeAllowed) || 'guided';
  $('chipName').textContent = data.name + (data.className ? ' · ' + data.className : '');
  setMode(appModeOf(data.mode), { initial: true });
  if (quiet) return;
  Sync.push(liveState(), true);
  log(`Welcome ${data.name}!`);
}

// A student = class + name (from the class lists). Their saved work is found and reopened directly.
async function chooseMode(mode) {
  const name = $('wName').value.trim(), cls = $('wClass').value.trim();
  if (!name) { $('wError').textContent = 'Choose your class and your name first.'; return; }
  if (!Sync.online) await Sync.ping();
  const matches = await Sync.find(name, cls);
  if (!matches.length) { startSession(Progress.create(name, cls, mode)); return; }
  try {
    const data = await Sync.fetchWork(matches[0].studentId); // the most recent one
    data.mode = mode;
    if (cls) data.className = cls;
    startSession(Progress.load(data));
    toast(`👋 Welcome back, ${data.name}! Your work is here.`);
    return;
  } catch (e) { /* fall back to the list below */ }
  const ago = (t) => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString(); };
  openModal(`<h2>Welcome back, ${esc(matches[0].name)}! 👋</h2>
    <p>We found your saved work.</p>
    ${matches.map((m, i) => `<p><button class="primary" data-resume="${i}" style="font-size:15px;padding:10px 16px">↩ Continue my work: ${m.validated} / ${CHALLENGES.length} challenges validated · last saved ${ago(m.updatedAt)}</button></p>`).join('')}
    <p><button id="btnNotMe">This is not me</button></p>`);
  document.querySelectorAll('[data-resume]').forEach((b) => {
    b.onclick = async () => {
      try {
        const data = await Sync.fetchWork(matches[Number(b.dataset.resume)].studentId);
        data.mode = mode;
        closeModal();
        startSession(Progress.load(data));
      } catch (e) { $('wError').textContent = 'Cannot load your work: ' + e.message; closeModal(); }
    };
  });
  $('btnNotMe').onclick = () => {
    closeModal();
    $('wError').textContent = `Another student already uses "${matches[0].name}". Add the first letter of your last name, e.g. "${matches[0].name} M.".`;
    $('wName').focus();
  };
}

async function openWorkFile(file) {
  try {
    const data = JSON.parse(await file.text());
    startSession(Progress.load(data));
  } catch (e) {
    $('wError').textContent = 'Cannot open this file: ' + e.message;
  }
}

async function exitSession() {
  if (App.status !== 'idle') stopProgram();
  storeWorkspace();
  const online = await Sync.push(liveState('left'), true);
  const saved = online || Progress.minutesSinceSave() < 0.5;
  openModal(`
    <h2>Before you leave</h2>
    <p>${online ? '☁️ Your work is <b>saved online</b>. Next time, type the same first name to continue.' : saved ? '✅ Your work is saved.' : '⚠️ Your latest work is <b>not saved</b> yet: download it with "Save my work".'}</p>
    ${online ? '<p class="muted">You can also download a copy to keep on your computer.</p>' : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="primary" id="exSave">💾 Save my work</button>
      <button id="exLeave">${saved ? 'Leave' : 'Leave without saving'}</button>
      <button onclick="closeModal()">Cancel</button>
    </div>`);
  $('exSave').onclick = () => { saveWork(); $('exLeave').textContent = 'Leave'; };
  if (online) $('exSave').textContent = '💾 Download a copy';
  $('exLeave').onclick = () => {
    Progress.log('exit', null);
    Progress.persist();
    Sync.push(liveState('left'));
    closeModal();
    Progress.data = null;
    showWelcome();
  };
}

function switchMode() {
  if (!Progress.data || App.status !== 'idle') return;
  const modes = ['guided', 'free', 'fll'].filter((m) => modeAllowed(m) && m !== progressMode());
  openModal(`<h2>Switch to…</h2>${modes.map((m) => `<p><button class="primary" data-switch="${m}" style="font-size:15px;padding:10px 16px">${MODE_LABEL[m]}</button></p>`).join('')}<p class="muted">Your work in every mode is kept.</p>`);
  document.querySelectorAll('[data-switch]').forEach((b) => {
    b.onclick = () => {
      closeModal();
      Progress.data.mode = b.dataset.switch;
      Progress.log('mode', null, b.dataset.switch);
      setMode(appModeOf(b.dataset.switch));
    };
  });
}

// ---------- Modes ----------
function setMode(mode, { initial = false } = {}) {
  if (App.status === 'evaluating') return;
  if (App.exam) { enterExamChallenge(App.examCh || App.exam.challenges[0], { skipStore: true }); return; } // the exam stays on screen
  if (App.status === 'running') { rt.stopAll('user'); App.status = 'idle'; updateButtons(); }
  if (!initial) storeWorkspace();
  App.mode = mode;
  $('sandboxBar').hidden = mode !== 'sandbox';
  $('challengeBox').hidden = mode !== 'challenge';
  $('fllBox').hidden = mode !== 'fll';
  $('btnSwitchMode').textContent = MODE_LABEL[progressMode()];
  $('btnSwitchMode').title = 'Switch mode';
  if (mode === 'sandbox') {
    loadSlot(Progress.data.free);
    loadSandboxMat(App.matId);
  } else if (mode === 'fll') {
    loadSlot(Progress.data.fll);
    newFllMatch();
  } else {
    enterChallenge(Progress.data.current, { skipStore: true });
  }
  Progress.persist();
}

function loadSandboxMat(id) {
  const mat = SANDBOX_MATS.find((m) => m.id === id) || SANDBOX_MATS[0];
  App.matId = mat.id;
  sim.loadMat(mat);
  sim.resetRobot(mat.start);
  App.runStartPose = { ...mat.start };
  App.ctx = null;
  brick.reset();
  $('matSel').value = mat.id;
  LS.set(STORAGE + 'mat', mat.id);
}

// ---------- Guided challenges ----------
function enterChallenge(id, { skipStore = false } = {}) {
  if (App.exam) { enterExamChallenge(id); return; }
  const entry = Progress.data.challenges[id];
  if (!entry || entry.status === 'locked') return;
  if (App.status !== 'idle') return;
  if (!skipStore) storeWorkspace();
  Progress.data.current = id;
  if (!entry.openedAt) { entry.openedAt = new Date().toISOString(); Progress.log('open', id); }
  loadSlot(entry);
  selectChallenge(id, true);
  renderGuided();
  Progress.persist();
}

function selectChallenge(id, newSeed = true) {
  const ch = CHALLENGES.find((c) => c.id === id) || CHALLENGES[0];
  App.challenge = ch;
  if (newSeed) App.practiceSeed = Math.floor(Math.random() * 1e9);
  App.ctx = prepareChallenge(sim, brick, ch, App.practiceSeed, sim.config);
  $('practiceResult').innerHTML = '';
}

function renderGuided() {
  if (App.exam) { renderExam(); return; }
  const ch = App.challenge, entry = Progress.ch(ch.id);
  const idx = CHALLENGES.indexOf(ch);
  // one group per category (Motion, Touch sensor, Distance sensor, Color sensor, Combined)
  $('stepper').innerHTML = CATEGORIES.map((cat) => {
    const steps = CHALLENGES.filter((c) => c.cat === cat.id).map((c, k) => {
      const i = CHALLENGES.indexOf(c), st = Progress.data.challenges[c.id].status;
      const tip = { locked: 'locked', open: 'to do', validated: 'passed' }[st];
      return `${k ? '<span class="step-line"></span>' : ''}<button class="step ${st}${c.id === ch.id ? ' current' : ''}" data-ch="${c.id}" title="${esc(c.title)} (${tip})">${st === 'validated' ? '✓' : st === 'locked' ? '🔒' : i + 1}</button>`;
    }).join('');
    return steps ? `<div class="step-group${cat.id === ch.cat ? ' on' : ''}"><div class="step-cat">${cat.icon} ${esc(cat.label)}</div><div class="steps">${steps}</div></div>` : '';
  }).join('');
  $('challengeTitle').textContent = `Challenge ${idx + 1} / ${CHALLENGES.length}: ${ch.title.replace(/^\d+\.\s*/, '')}`;
  $('challengeMeta').textContent = `${categoryOf(ch).icon} ${categoryOf(ch).label} · Level ${ch.level}`;
  $('btnSolution').hidden = !App.preview;
  $('challengeDesc').innerHTML = `${ch.description}<span class="skills">Skills: ${esc(ch.skills)}</span>`;
  const hints = ch.hints || [];
  $('hintBox').innerHTML = hints.slice(0, entry.hints).map((h, i) => `<div class="hint-card">💡 <b>Hint ${i + 1}:</b> ${esc(h)}</div>`).join('');
  $('btnHint').hidden = entry.hints >= hints.length;
  $('btnHint').textContent = `💡 Hint (${entry.hints + 1}/${hints.length})`;
  renderValidation();
}

function renderValidation() {
  const ch = App.challenge, entry = Progress.ch(ch.id);
  const box = $('validateBox');
  $('btnEvaluate').hidden = entry.status === 'validated';
  if (entry.status === 'validated') {
    const next = CHALLENGES[CHALLENGES.indexOf(ch) + 1];
    box.innerHTML = `<div class="banner done"><div class="big">🎉 Challenge passed${entry.bestScore !== null ? ' with ' + entry.bestScore + ' %' : ''}!</div>
      ${next ? `<div class="row"><button class="primary" id="btnNext">Next challenge → ${esc(next.title.replace(/^\d+\.\s*/, ''))}</button></div>` : '<div><b>🏆 You finished all the challenges. Congratulations!</b> Don\'t forget to save your work.</div>'}</div>`;
    if (next) $('btnNext').onclick = () => enterChallenge(next.id);
  } else {
    box.innerHTML = entry.gradings.length ? `<div class="muted">Best check so far: ${entry.bestScore} % · you need ${CLASSROOM.passScore} % to pass.</div>` : '';
  }
}

function onValidated(id, by) {
  if (!Progress.validate(id, by)) return;
  const ch = CHALLENGES.find((c) => c.id === id);
  toast(`🔓 Your teacher unlocked the next challenge after "${ch.title.replace(/^\d+\.\s*/, '')}"`);
  log(`✅ Challenge "${ch.title}" unlocked by your teacher`, 'success');
  brick.sound.play('fx:fanfare');
  Sync.push(liveState());
  if (App.mode === 'challenge') renderGuided();
}

function showHint() {
  if (App.exam) { examHint(); return; }
  const entry = Progress.ch();
  const n = Math.min((App.challenge.hints || []).length, entry.hints + 1);
  Progress.onHint(n);
  renderGuided();
}

function resetPosition() {
  if (App.status !== 'idle') return;
  if (App.mode === 'challenge') selectChallenge(App.challenge.id, false);
  else if (App.mode === 'fll') { if (!FLLUI.S.started) sim.resetRobot(FLL.HOMES[FLLUI.side].start); }
  else { sim.resetRobot(App.runStartPose || sim.mat.start); brick.reset(); }
}

// ---------- Running programs ----------
function checkHats() {
  if (ws.getTopBlocks().some((b) => HAT_TYPES.has(b.type) && b.isEnabled())) return true;
  const msg = 'Add a "when program starts" block (Events): only blocks attached to a yellow hat block run.';
  log(msg, 'error');
  showSimError(msg);
  Progress.onError(progressMode(), 'hat block missing');
  return false;
}

function updateSaveStatus() {
  if (App.preview) { $('syncStatus').textContent = 'Preview · not saved for students'; return; }
  const el = $('syncStatus');
  if (!Progress.data) { el.textContent = ''; return; }
  if (Sync.online) {
    const t = Sync.savedAt ? new Date(Sync.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    el.textContent = Progress.dirty || !Sync.savedAt ? '☁️ Saving…' : `☁️ Saved online ${t}`;
    el.title = 'Your work is saved automatically. Next time, type the same first name to continue.';
  } else {
    el.textContent = '⚠️ Not saved online: use "Save my work"';
    el.title = 'The class server cannot be reached. Download your work to keep it.';
  }
  el.classList.toggle('on', Sync.online);
}

function showSimError(msg) {
  const el = $('simError');
  if (!msg) { el.hidden = true; return; }
  el.textContent = msg;
  el.hidden = false;
}

function runProgram() {
  if (App.status !== 'idle') return;
  Blockly.hideChaff();
  if (!checkHats()) return;
  const prog = currentProgram();
  // the program writes on the brick screen or waits for its buttons: show the brick
  if ($('lowerPanel').hidden && /R\.(disp[A-Z]|button\()/.test(prog.code)) { showLower(true, false); log('The EV3 brick is shown below: your program uses its screen or buttons.'); }
  if (App.mode === 'fll') {
    const S = FLLUI.S;
    if (S.ended) { showSimError('This match is over. Click "New match" to play again.'); return; }
    if (!FLL.homeOf(sim.bodyPoly())) { showSimError('Launch rule: the robot must be completely inside a launch area (white quarter circle). Drag it there, or click "Rescue robot".'); return; }
    S.started = true; S.running = true; S.launches++;
    FLL.onLaunch(S);
    sim.resetRobot(sim.robot);
    brick.reset();
    renderFllSetup();
  } else if (App.mode === 'challenge') {
    App.ctx = prepareChallenge(sim, brick, App.challenge, App.practiceSeed, sim.config);
    $('practiceResult').innerHTML = '';
  } else {
    App.runStartPose = { ...sim.robot };
    sim.resetRobot(sim.robot);
    brick.reset();
  }
  brick.sound.muted = App.speed === 'max';
  rt = new Runtime(sim, brick, { onLog: log });
  try {
    rt.start(prog.code, { seed: App.mode === 'challenge' ? App.practiceSeed : Math.floor(Math.random() * 1e9), variables: prog.variables, lists: prog.lists });
  } catch (e) {
    log('Error in the program: ' + e.message, 'error');
    console.error(e, prog.code);
    return;
  }
  if (!App.exam) Progress.onRun(progressMode());
  recordVersion('run');
  showSimError(null);
  App.status = 'running';
  App.simTarget = sim.t;
  App.lastNow = performance.now();
  updateButtons();
  log('▶ Program started');
}

// EV3 brick, variables and console: hidden by default (more room), opened on demand or when a program uses the brick.
function showLower(open, remember = true) {
  $('lowerPanel').hidden = !open;
  $('lowerToggle').setAttribute('aria-expanded', String(open));
  $('lowerToggle').querySelector('.lt-arrow').textContent = open ? '▾' : '▸';
  if (remember) LS.set(STORAGE + 'lowerOpen', open);
  window.dispatchEvent(new Event('resize'));
}

function stopProgram() {
  if (App.status === 'running') rt.stopAll('user');
  else if (App.status === 'evaluating') App.cancelEval = true;
}

async function stepOnce() {
  await rt.tick();
  if (rt.running && App.mode === 'challenge' && App.ctx) {
    const r = challengeAfterStep(App.ctx);
    if (r) rt.stopAll(r);
  }
  if (rt.running && App.mode === 'fll' && FLLUI.S.clock >= FLL.MATCH_TIME) rt.stopAll('timeout');
}

async function advance(now) {
  const dtReal = Math.min(0.1, Math.max(0, (now - App.lastNow) / 1000));
  App.lastNow = now;
  const t0 = performance.now();
  if (App.speed === 'max') {
    while (rt.running && performance.now() - t0 < 18) await stepOnce();
  } else {
    App.simTarget += dtReal * App.speed;
    while (rt.running && sim.t < App.simTarget - 1e-9 && performance.now() - t0 < 40) await stepOnce();
    if (sim.t < App.simTarget - 0.1) App.simTarget = sim.t; // the computer cannot keep up: slow down
  }
}

const END_MESSAGES = {
  done: ['■ Program finished', 'info'],
  'stopped-by-program': ['■ Program stopped by a "stop" block', 'info'],
  user: ['■ Program stopped', 'info'],
  timeout: ['⏱ Time is up for this challenge', 'error'],
  complete: ['🏁 Goal reached!', 'success'],
};

function onProgramEnd() {
  App.status = 'idle';
  updateButtons();
  const reason = rt.endReason;
  if (END_MESSAGES[reason]) log(...END_MESSAGES[reason]);
  if (reason === 'done' && rt.motorsWereRunning) {
    log('Tip: the program ended, so the motors stopped. "start moving" and "start motor" do not wait: add a "wait" block, a "wait until" block or a "forever" loop after them.', 'error');
  }
  if (reason === 'error') {
    showSimError(rt.lastError);
    Progress.onError(progressMode(), rt.lastError);
  }
  if (reason === 'error' && rt.errorBlock) {
    const b = ws.getBlockById(rt.errorBlock);
    if (b) {
      try {
        Blockly.common.setSelected(b);
        const r = b.getBoundingRectangle(), v = ws.getMetricsManager().getViewMetrics(true);
        if (r.left < v.left || r.top < v.top || r.right > v.left + v.width || r.bottom > v.top + v.height) ws.centerOnBlock(b.id);
      } catch (e) { console.error(e); }
    }
  }
  if (App.mode === 'fll') {
    FLLUI.S.running = false;
    for (let i = 0; i < SETTLE_STEPS; i++) sim.step(DT);
    if (FLLUI.S.clock >= FLL.MATCH_TIME) endFllMatch();
    else if (!FLL.homeOf(sim.bodyPoly())) log('The robot stopped outside home. Bring it back with your program next time, or click "Rescue robot" (−1 precision token).', 'info');
  } else if (App.mode === 'challenge' && App.ctx) {
    const res = finishChallenge(App.ctx, reason);
    if (!App.exam) Progress.onPractice(res);
    $('practiceResult').innerHTML = `<div class="scorebar">Practice run: ${res.score} %<div class="bar-bg"><div class="bar-fg" style="width:${res.score}%"></div></div></div>${criteriaHtml(res.criteria)}<div class="muted">When you think it works, click <b>Check my solution</b>.</div>`;
  } else {
    for (let i = 0; i < SETTLE_STEPS; i++) sim.step(DT);
  }
  updateButtons();
}

function criteriaHtml(criteria) {
  return '<ul class="criteria">' + criteria.map((c) => {
    const cls = c.points === c.max ? 'ok' : c.points > 0 ? 'part' : 'ko';
    return `<li class="${cls}"><span>${esc(c.label)}</span><span class="pts">${c.points} / ${c.max}</span></li>`;
  }).join('') + '</ul>';
}

// ---------- Check my solution (official trials) ----------
async function evaluate() {
  if (App.status !== 'idle' || !checkHats()) return;
  const ch = App.challenge;
  App.status = 'evaluating';
  App.cancelEval = false;
  updateButtons();
  storeWorkspace();
  const prog = currentProgram();
  const config = JSON.parse(JSON.stringify(sim.config));
  const box = $('practiceResult');
  const res = await evaluateProgram(ch, prog, {
    sim, brick, config, onLog: log,
    onTrial: (i, n) => { box.innerHTML = `<b>Checking… trial ${i + 1} / ${n}</b><div class="progress"><div style="width:${(i / n) * 100}%"></div></div><span class="muted">Click "Stop" to cancel.</span>`; },
    onFrame: async (ctx, r) => { App.ctx = ctx; App.evalRt = r; await nextFrame(); return App.cancelEval ? 'abort' : null; },
  });
  App.status = 'idle';
  App.evalRt = null;
  updateButtons();
  if (!res) { box.innerHTML = ''; log('Check cancelled'); return; }
  recordVersion('check', res.score);
  if (App.exam) { box.innerHTML = ''; if (!CR.examOver) onExamGrade(res); return; }
  const wasValidated = Progress.ch().status === 'validated';
  Progress.onGrade(res);
  Sync.push(liveState(), true);
  box.innerHTML = '';
  renderGuided();
  if (!wasValidated && Progress.ch().status === 'validated') brick.sound.play('fx:fanfare');
  showCheckReport(res);
}

function showCheckReport(r) {
  const passed = r.score >= CLASSROOM.passScore;
  const next = CHALLENGES[CHALLENGES.indexOf(App.challenge) + 1];
  const trials = r.trials.map((t, i) => `<div class="trial"><h4><span>Trial ${i + 1}</span><span>${t.score} %</span></h4>${t.criteria.length ? criteriaHtml(t.criteria) : '<span class="muted">The program could not start.</span>'}</div>`).join('');
  openModal(`
    <h2>${passed ? '🎉 Challenge passed!' : '🔧 Not yet…'}</h2>
    <div class="big-score">${r.score} %</div>
    <p>${passed
    ? (next ? 'Great job! The next challenge is unlocked.' : '🏆 You finished all the challenges. Congratulations!')
    : `You need at least <b>${CLASSROOM.passScore} %</b>. Look at the red crosses below, improve your program and try again. A <b>💡 Hint</b> can help!`}</p>
    ${trials}
    <div style="display:flex;gap:8px;justify-content:flex-end">${passed && next ? '<button class="primary" id="btnNextModal">Next challenge →</button><button onclick="closeModal()">Stay here</button>' : '<button class="primary" onclick="closeModal()">OK</button>'}</div>`);
  if (passed && next) $('btnNextModal').onclick = () => { closeModal(); enterChallenge(next.id); };
}


// ---------- FIRST LEGO League practice (BIOGLOW) ----------
const FLLUI = { S: null, side: 'left', docks: { mine: 13, city: 14, farm: 15 }, showZones: false, lastFrame: 0, sheetKey: '' };
const DOCK_MODELS = { 13: 'M13 Keystone Species', 14: 'M14 Seeds of Renewal', 15: 'M15 Biocentric Architecture' };

function newFllMatch() {
  if (App.status !== 'idle') return;
  sim.loadMat(FLL.mat);
  const S = FLL.newMatch({ seed: Math.floor(Math.random() * 1e9), docks: { ...FLLUI.docks } });
  FLLUI.S = S;
  sim.obstacles = S.obstacles;
  sim._rebuildSegments();
  sim.hook = (sm, dt) => FLL.step(S, sm, dt);
  sim.resetRobot(FLL.HOMES[FLLUI.side].start);
  App.runStartPose = { ...sim.robot };
  App.ctx = null;
  brick.reset();
  showSimError(null);
  FLLUI.sheetKey = '';
  renderFllSetup();
  $('fllInfo').innerHTML = `New match. The robot starts in the <b>${FLLUI.side === 'left' ? 'left (red)' : 'right (blue)'}</b> launch area. You have 2:30. Between runs, drag the robot inside home and launch again. Click a mission below to see what to do. Tip: press <b>🧊 3D</b> to watch the missions in 3D.`;
}

function renderFllSetup() {
  const S = FLLUI.S;
  const locked = S.started;
  $('fllSide').value = FLLUI.side;
  $('fllSide').disabled = locked;
  document.querySelectorAll('[data-dock]').forEach((sel) => {
    sel.innerHTML = [13, 14, 15].map((m) => `<option value="${m}"${FLLUI.docks[sel.dataset.dock] === m ? ' selected' : ''}>${DOCK_MODELS[m]}</option>`).join('');
    sel.disabled = locked;
  });
  $('fllSetup').title = locked ? 'The setup is locked during a match: start a new match to change it.' : 'Choose your launch area and which model goes on each dock (part of your strategy!).';
}

function updateFllPanel() {
  const S = FLLUI.S;
  if (!S) return;
  const left = Math.max(0, FLL.MATCH_TIME - S.clock);
  setText('fllClock', `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
  $('fllClock').classList.toggle('low', S.started && left < 30);
  const sc = FLL.score(S);
  setText('fllScore', String(sc.total));
  setText('fllTokens', '●'.repeat(S.tokens) + '○'.repeat(6 - S.tokens) + ` (${sc.tokens})`);
  $('fllRescue').disabled = !S.started || S.ended;
  $('fllEnd').disabled = !S.started || S.ended || App.status === 'evaluating';
  const key = sc.rows.map((r) => r.points).join(',') + '|' + S.tokens;
  if (key === FLLUI.sheetKey) return;
  FLLUI.sheetKey = key;
  $('fllSheet').innerHTML = '<table>' + sc.rows.map((r) => `<tr data-mission="${r.n}" class="${r.points === r.max ? 'full' : r.points === 0 ? 'zero' : ''}">
      <td class="mn"><span>${String(r.n).padStart(2, '0')}</span></td><td>${esc(r.name)}</td><td class="pts">${r.points} / ${r.max}</td></tr>`).join('')
    + `<tr class="extra"><td></td><td>Equipment inspection (robot fits in one launch area)</td><td class="pts">${sc.inspection} / 20</td></tr>`
    + `<tr class="extra"><td></td><td>Precision tokens (${S.tokens} left)</td><td class="pts">${sc.tokens} / 50</td></tr></table>`;
}

function showMission(n) {
  const m = FLL.MISSIONS[n - 1];
  const row = FLL.score(FLLUI.S).rows[n - 1];
  openModal(`<h2>Mission ${String(n).padStart(2, '0')}: ${esc(m.name)}</h2>
    <p><i>${esc(m.story)}</i></p>
    <h3>In this simulator</h3><p>${esc(m.howto)}</p>
    <h3>Scoring</h3>
    <table class="scoresheet">${row.parts.map((p) => `<tr><td>${p.na ? '—' : p.ok ? '✔' : p.partial ? '◐' : '✖'}</td><td>${esc(p.label)}</td><td style="text-align:right">${p.ok ? p.pts : p.partial || 0} / ${p.pts}</td></tr>`).join('')}</table>
    <p class="muted">Yellow zones = swing the arm (motor A) there · blue zones = push there. Tick "Show action zones" to see them on the field.</p>`);
}

function rescueRobot() {
  const S = FLLUI.S;
  if (!S.started || S.ended) return;
  const home = !!FLL.homeOf(sim.bodyPoly());
  if (App.status === 'running') rt.stopAll('user');
  if (!home) {
    S.tokens = Math.max(0, S.tokens - 1);
    log(`🛟 Robot rescued outside home: −1 precision token (${S.tokens} left)`, 'error');
  }
  sim.resetRobot(FLL.HOMES[FLLUI.side].start);
}

function endFllMatch() {
  const S = FLLUI.S;
  if (!S || S.ended) return;
  if (App.status === 'running') rt.stopAll('timeout');
  S.ended = true;
  S.running = false;
  const res = FLL.score(S);
  res.tokensLeft = S.tokens;
  Progress.onFllMatch(res);
  Sync.push(liveState(), true);
  const best = Progress.data.fll.bestScore;
  brick.sound.play('fx:fanfare');
  openModal(`<h2>🏁 Match over</h2>
    <div style="display:flex;gap:30px;align-items:center"><div><div class="big-score">${res.total}</div><div class="muted">points (max ${res.max})</div></div>
    <div><div class="big-score" style="color:#2e7d32">${best}</div><div class="muted">your best score</div></div></div>
    <table class="scoresheet">${res.rows.map((r) => `<tr><td><b>M${String(r.n).padStart(2, '0')}</b></td><td>${esc(r.name)}</td><td class="${r.points ? 'ok' : 'muted'}" style="text-align:right">${r.points} / ${r.max}</td></tr>`).join('')}
    <tr><td></td><td>Equipment inspection</td><td style="text-align:right">${res.inspection}</td></tr>
    <tr><td></td><td>Precision tokens (${S.tokens} left)</td><td style="text-align:right">${res.tokens}</td></tr></table>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="primary" id="fllAgain">🔁 New match</button><button onclick="closeModal()">Close</button></div>`);
  $('fllAgain').onclick = () => { closeModal(); newFllMatch(); };
}

function setupFll() {
  $('fllNew').onclick = () => {
    if (FLLUI.S && FLLUI.S.started && !FLLUI.S.ended && !confirm('Start a new match? The current match will not be scored.')) return;
    newFllMatch();
  };
  $('fllRescue').onclick = rescueRobot;
  $('fllEnd').onclick = endFllMatch;
  $('fllZones').onchange = (e) => { FLLUI.showZones = e.target.checked; };
  $('fllSide').onchange = (e) => { FLLUI.side = e.target.value; if (!FLLUI.S.started) sim.resetRobot(FLL.HOMES[FLLUI.side].start); };
  document.querySelectorAll('[data-dock]').forEach((sel) => {
    sel.onchange = () => {
      const dock = sel.dataset.dock, m = Number(sel.value), old = FLLUI.docks[dock];
      const other = Object.keys(FLLUI.docks).find((d) => d !== dock && FLLUI.docks[d] === m);
      if (other) FLLUI.docks[other] = old;
      FLLUI.docks[dock] = m;
      newFllMatch();
    };
  });
  $('fllSheet').addEventListener('click', (e) => { const r = e.target.closest('[data-mission]'); if (r) showMission(Number(r.dataset.mission)); });
}

// ---------- Live state for the teacher ----------
function liveState(status) {
  return {
    status: status || (App.status === 'idle' ? 'editing' : App.status),
    mode: progressMode(),
    challenge: App.mode === 'challenge' && App.challenge ? App.challenge.id : App.mode === 'fll' ? 'fll' : null,
    exam: App.exam ? { id: App.exam.id, challenge: App.examCh, over: CR.examOver } : null,
    blocks: ws ? ws.getAllBlocks(false).filter((b) => !b.isShadow()).length : 0,
  };
}

// ---------- Modal ----------
// ---------- Teacher preview: the student app with every challenge open (dashboard → 🎓 Student view) ----------
// Nothing is sent to the class server; the teacher's work is kept on this computer under its own key.
async function startPreview() {
  const code = localStorage.getItem('ev3sim.teacherCode') || '';
  const info = await Sync.getJson('api/info?code=' + encodeURIComponent(code));
  if (info && !info.passwordOk && !(info.teacher && !info.needsCode)) {
    showWelcome();
    $('wError').textContent = 'The student view is for teachers: log in with the 👩‍🏫 Teacher button first.';
    return;
  }
  App.preview = true;
  Sync.disabled = true;
  Progress.key = 'ev3sim.v2.preview';
  const saved = Progress.restoreLocal();
  const data = saved ? Progress.load(saved) : Progress.create('Teacher', '', 'guided');
  for (const c of CHALLENGES) if (data.challenges[c.id].status === 'locked') data.challenges[c.id].status = 'open';
  Progress.persist();
  document.body.classList.add('preview');
  startSession(data, { quiet: true });
  $('chipName').textContent = '👩‍🏫 Teacher preview';
  $('btnHelpMe').hidden = true;
  $('syncStatus').textContent = 'Preview · not saved for students';
  $('btnExit').textContent = 'Close preview';
  $('btnExit').onclick = () => { storeWorkspace(); location.href = 'teacher.html'; };
  $('btnSwitchMode').disabled = false;
  log('👩‍🏫 Teacher preview: every challenge is open, switch freely between challenges and modes. Your work here stays on this computer.', 'success');
}

// Teacher login from the welcome page: the password is checked by the server, then the dashboard opens.
function teacherLogin() {
  openModal(`<h2>👩‍🏫 Teacher dashboard</h2>
    <p><label>Password <input id="tPass" type="password" autocomplete="current-password" style="font-size:16px;padding:8px 10px;margin-left:6px"></label>
    <button class="primary" id="tGo">Open</button></p>
    <p><label><input type="checkbox" id="tPreview"> Open the <b>student view</b> instead (every challenge open, for trying them out)</label></p><p id="tErr" class="werr"></p>`);
  const go = async () => {
    const code = $('tPass').value.trim();
    if (!code) return;
    try {
      const r = await fetch('api/info?code=' + encodeURIComponent(code), { cache: 'no-store' });
      const info = await r.json();
      if (!info.passwordOk) { $('tErr').textContent = 'Wrong password.'; $('tPass').select(); return; }
      localStorage.setItem('ev3sim.teacherCode', code);
      location.href = $('tPreview') && $('tPreview').checked ? 'index.html?preview=1' : 'teacher.html';
    } catch (e) { $('tErr').textContent = 'The class server cannot be reached.'; }
  };
  $('tGo').onclick = go;
  $('tPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  setTimeout(() => $('tPass').focus(), 50);
}

function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
function closeModal() {
  $('modal').hidden = true;
  $('modal').querySelector('.modal-box').style.maxWidth = '';
  if (App.solWs) { App.solWs.dispose(); App.solWs = null; }
}

// Teacher preview: reference solution of the current challenge (sent by the server only with the teacher password).
async function showSolution() {
  if (!App.preview || !App.challenge) return;
  let d = null;
  try { d = await (await fetch('api/solutions', { cache: 'no-store', headers: { 'X-Teacher-Code': localStorage.getItem('ev3sim.teacherCode') || '' } })).json(); } catch (e) { /* offline */ }
  const sol = d && d.solutions && d.solutions[App.challenge.id];
  if (!sol) { toast('No solution available for this challenge.'); return; }
  openModal(`<h2>🔑 Solution · ${esc(App.challenge.title)}</h2>
    <p class="muted">Reference solution for the classic robot with the default ports (it scores 100 %). Other programs can be right too.</p>
    <div id="solWs" style="height:400px;border:1px solid var(--border);border-radius:10px"></div>
    <div class="actions" style="justify-content:flex-end;margin-top:8px"><button onclick="closeModal()">Close</button><button class="primary" id="solLoad">Load it into my program</button></div>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1000px';
  App.solWs = Blockly.inject('solWs', { readOnly: true, renderer: 'zelos', theme: EV3_THEME, media: 'lib/blockly/media/', zoom: { controls: true, wheel: true, startScale: 0.75 }, move: { scrollbars: true, drag: true, wheel: true } });
  Blockly.serialization.workspaces.load(sol, App.solWs);
  App.solWs.scrollCenter();
  $('solLoad').onclick = () => {
    if (!confirm('Replace your current program (in this preview) with the solution?')) return;
    closeModal();
    loadProgram(sol);
    applyConfig(DEFAULT_CONFIG);
    storeWorkspace();
    toast('🔑 Solution loaded: click "Check my solution" to see it pass.');
  };
}

function showHelp() {
  openModal(`
    <h2>Help</h2>
    <h3>Programming</h3>
    <ul>
      <li>Drag blocks from the palette on the left. Only blocks attached to a <b>yellow hat block</b> (Events) run.</li>
      <li>Click <b>▶ Run</b> to test your program in the simulator. Running blocks glow yellow.</li>
      <li>Several stacks can run at the same time, like in EV3 Classroom.</li>
    </ul>
    <h3>Guided challenges</h3>
    <ul>
      <li>Read the challenge, build your program and test it with <b>▶ Run</b> (each run uses a random layout).</li>
      <li>Stuck? Click <b>💡 Hint</b>.</li>
      <li>When it works, click <b>✅ Check my solution</b>. With ${CLASSROOM.passScore} % or more the challenge is passed and the next one unlocks.</li>
    </ul>
    <h3>FIRST LEGO League (BIOGLOW)</h3>
    <ul>
      <li>A practice version of the 2026-27 robot game: 15 missions on the BIOGLOW table, 2:30 matches, official points.</li>
      <li>The robot is launched from home (the white quarter circles). Between runs, drag it inside home, choose where it starts, and click <b>▶ Run</b> again. The clock keeps running.</li>
      <li>Robot stuck outside home? <b>Rescue robot</b> brings it home but costs a precision token.</li>
      <li>Click a mission in the score sheet to see what to do. Tick <b>Show action zones</b>: yellow = swing the arm (motor A), blue = push.</li>
      <li>Click <b>⛶</b> to see the table bigger, and again to go back to your blocks.</li>
    </ul>
    <h3>Save your work</h3>
    <ul>
      <li>Click <b>💾 Save my work</b>: a file is downloaded to this computer. Next time, choose <b>Continue from my saved file</b> on the welcome screen.</li>
    </ul>
    <h3>Robot and Port View</h3>
    <ul>
      <li>In <b>Port View</b>, choose what is plugged into each port. The blocks must use the right port numbers, like on a real robot.</li>
      <li>Wheels: 5.6 cm diameter (1 rotation ≈ 17.6 cm), 12 cm apart.</li>
    </ul>`);
}

function openMakeBlock() {
  openModal(`
    <h2>Make a Block</h2>
    <label class="field">Block name <input id="mbName" placeholder="e.g. turn right"></label>
    <label class="field">Inputs (optional, separated by commas) <input id="mbInputs" placeholder="e.g. angle, speed"></label>
    <p class="muted">Inside the definition, use the inputs with the orange variable blocks of the same name.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="primary" id="mbOk">OK</button><button onclick="closeModal()">Cancel</button></div>`);
  const ok = () => {
    const name = $('mbName').value.trim();
    if (!name) return;
    const params = $('mbInputs').value.split(',').map((s) => s.trim()).filter(Boolean)
      .map((p) => ({ name: p, id: (ws.getVariable(p, '') || ws.createVariable(p, '')).getId() }));
    const m = ws.getMetricsManager().getViewMetrics(true);
    const state = { type: 'procedures_defnoreturn', x: m.left + 40, y: m.top + 40, fields: { NAME: name } };
    if (params.length) state.extraState = { params };
    Blockly.serialization.blocks.append(state, ws, { recordUndo: true });
    closeModal();
  };
  $('mbOk').onclick = ok;
  $('mbName').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  setTimeout(() => $('mbName').focus(), 50);
}

// ---------- UI ----------
function updateButtons() {
  const busy = App.status !== 'idle';
  for (const id of ['btnRun', 'btnReset', 'btnEvaluate', 'btnVariant', 'matSel', 'presetSel', 'btnSwitchMode', 'btnExit', 'fllNew']) $(id).disabled = busy;
  $('btnStop').disabled = !busy;
  $('stepper').querySelectorAll('button').forEach((b) => { b.disabled = busy; });
  portView.setEditable(!busy);
}

const textCache = new Map();
function setText(id, text, html = false) {
  if (textCache.get(id) === text) return;
  textCache.set(id, text);
  if (html) $(id).innerHTML = text; else $(id).textContent = text;
}

function updatePanels() {
  if (!$('pvPanel').hidden) {
    if ($('pvSetupTab').hidden) portDiagram.update(); else portView.update();
  }
  setText('simClock', sim.t.toFixed(1) + ' s');
  const r = App.evalRt || rt;
  const { variables, lists } = programVariables(ws);
  const rows = variables.map((n) => `<div class="var"><b>${esc(n)}</b><span>${esc(r.str(r.V[n] !== undefined ? r.V[n] : 0))}</span></div>`)
    .concat(lists.map((n) => `<div class="var list"><b>${esc(n)}</b><span>[${esc((r.L[n] || []).map((x) => r.str(x)).join(', '))}]</span></div>`));
  setText('varList', rows.length ? rows.join('') : '<span class="muted">No variables</span>', true);
}

function updateHighlights() {
  const ids = App.status === 'running' ? rt.activeBlocks() : new Set();
  for (const id of App.highlighted) {
    if (ids.has(id)) continue;
    const b = ws.getBlockById(id);
    if (b) b.getSvgRoot().classList.remove('ev3-running');
  }
  for (const id of ids) {
    if (App.highlighted.has(id)) continue;
    const b = ws.getBlockById(id);
    if (b) b.getSvgRoot().classList.add('ev3-running');
  }
  App.highlighted = ids;
}

function draw() {
  if (!sim.mat) return;
  const canvas = $('simCanvas');
  const ch = App.mode === 'challenge' && App.ctx ? App.ctx : null;
  const overlay = App.mode === 'fll' && FLLUI.S ? (c) => FLL.draw(FLLUI.S, c, { showZones: FLLUI.showZones })
    : ch && ch.ch.overlay ? (c) => ch.ch.overlay(c, ch.data, ch.state) : null;
  App.view = renderScene(canvas, sim, brick, { trail: App.trail, sensors: true, overlay });
  if (App.view3d) {
    const hud = App.mode === 'challenge' && App.challenge ? `${App.exam ? '📝 ' : ''}${esc(App.challenge.title)} · ${sim.t.toFixed(1)} s` : App.mode === 'sandbox' ? `${esc(sim.mat.name || '')} · ${sim.t.toFixed(1)} s` : '';
    FLL3D.render(performance.now(), { overlay, hud });
  }
  if (App.mode === 'fll') updateFllPanel();
  $('lcdCanvas').getContext('2d').drawImage(brick.lcd.canvas, 0, 0);
  const lv = lightVisible(brick.light, sim.t);
  $('pad').style.boxShadow = lv > 0 ? `0 0 0 4px ${LIGHT_COLORS[brick.light.color]}, 0 0 ${10 * lv}px ${LIGHT_COLORS[brick.light.color]}` : '0 0 0 4px #9aa1a8';
  updatePanels();
  updateHighlights();
}

function frame(now) {
  // FLL: the match clock keeps running between launches (real time), like at a tournament.
  if (App.mode === 'fll' && FLLUI.S && FLLUI.S.started && !FLLUI.S.ended && App.status === 'idle') {
    FLLUI.S.clock += Math.min(0.1, Math.max(0, (now - (FLLUI.lastFrame || now)) / 1000));
    if (FLLUI.S.clock >= FLL.MATCH_TIME) endFllMatch();
  }
  FLLUI.lastFrame = now;
  if (App.status === 'running' && !App.busy) {
    App.busy = true;
    advance(now)
      .catch((e) => { console.error(e); log('Internal error: ' + e.message, 'error'); rt.stopAll('error'); })
      .finally(() => {
        App.busy = false;
        if (App.status === 'running' && !rt.running) onProgramEnd();
      });
  }
  draw();
  requestAnimationFrame(frame);
}

function resizeCanvas() {
  const c = $('simCanvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(c.clientWidth * dpr);
  c.height = Math.round(c.clientHeight * dpr);
}

// ---------- Mouse on the simulator ----------
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function toWorld(e) {
  const c = $('simCanvas');
  const r = c.getBoundingClientRect();
  const dpr = c.width / r.width;
  const v = App.view;
  return [((e.clientX - r.left) * dpr - v.ox) / v.s, ((e.clientY - r.top) * dpr - v.oy) / v.s];
}
function canEditScene() { return App.status === 'idle' && (App.mode === 'sandbox' || (App.mode === 'fll' && FLLUI.S && !FLLUI.S.ended)); }
// FLL rule: technicians may only handle the robot and loose models inside home.
const fllPoseOk = (x, y, th) => App.mode !== 'fll' || !!FLL.homeOf(sim.bodyPoly(x, y, th));

// 3D view of the FLL table (js/fll3d.js, rendering only)
function set3d(on) {
  if (on && !window.FLL3D) { showSimError('The 3D view could not be loaded in this browser.'); return; }
  App.view3d = !!on;
  $('btn3d').classList.toggle('on', App.view3d);
  if (!window.FLL3D) return;
  if (on) {
    const fresh = !FLL3D.canvas;
    FLL3D.enable($('simWrap'));
    if (fresh) bindSceneMouse(FLL3D.canvas, (e) => FLL3D.pick(e), true);
  } else FLL3D.disable();
}

function setupSceneMouse() { bindSceneMouse($('simCanvas'), toWorld, false); }
// own = the canvas also has camera controls: when we handle the event, they must not see it.
function bindSceneMouse(c, world, own) {
  const opt = own ? { capture: true } : false;
  const claim = (e) => { if (own) e.stopImmediatePropagation(); };
  c.addEventListener('pointerdown', (e) => {
    if (!canEditScene() || !App.view) return;
    const [x, y] = world(e);
    const item = App.mode === 'fll' ? FLLUI.S.items.find((it) => it.loose && FLL.inHome([it.x, it.y]) && Math.hypot(it.x - x, it.y - y) < it.r + 1) : null;
    if (item) {
      App.drag = { kind: 'item', item };
    } else if (pointInPoly(x, y, sim.bodyPoly())) {
      if (App.mode === 'fll' && !FLL.homeOf(sim.bodyPoly())) { showSimError('You can only handle the robot inside home. Use "Rescue robot" (−1 precision token).'); return; }
      App.drag = { kind: 'robot', dx: x - sim.robot.x, dy: y - sim.robot.y };
    } else if (sim.beacon && Math.hypot(x - sim.beacon.x, y - sim.beacon.y) < 7) {
      App.drag = { kind: 'beacon', dx: x - sim.beacon.x, dy: y - sim.beacon.y };
    } else {
      const o = sim.obstacles.find((ob) => ob.movable && pointInPoly(x, y, ob.poly));
      if (o) App.drag = { kind: 'obstacle', o, last: [x, y] };
    }
    if (App.drag) { claim(e); c.setPointerCapture(e.pointerId); c.classList.add('dragging'); }
  }, opt);
  c.addEventListener('pointermove', (e) => {
    if (!App.drag) return;
    claim(e);
    const [x, y] = world(e);
    if (App.drag.kind === 'robot') {
      const nx = x - App.drag.dx, ny = y - App.drag.dy;
      if (!sim.collides(nx, ny, sim.robot.th) && fllPoseOk(nx, ny, sim.robot.th)) sim.resetRobot({ x: nx, y: ny, th: sim.robot.th });
    } else if (App.drag.kind === 'item') {
      if (FLL.inHome([x, y])) { App.drag.item.x = x; App.drag.item.y = y; }
    } else if (App.drag.kind === 'beacon') {
      sim.beacon.x = Math.max(4, Math.min(sim.mat.w - 4, x - App.drag.dx));
      sim.beacon.y = Math.max(6, Math.min(sim.mat.h - 6, y - App.drag.dy));
      sim._cache = {};
    } else {
      const [lx, ly] = App.drag.last;
      sim.moveObstacle(App.drag.o, x - lx, y - ly);
      if (sim.collides(sim.robot.x, sim.robot.y, sim.robot.th)) sim.moveObstacle(App.drag.o, lx - x, ly - y);
      else App.drag.last = [x, y];
    }
  });
  const end = () => {
    if (App.drag && App.drag.kind === 'robot') App.runStartPose = { ...sim.robot };
    App.drag = null; c.classList.remove('dragging');
  };
  c.addEventListener('pointerup', (e) => { if (App.drag) claim(e); end(); }, opt);
  c.addEventListener('pointercancel', end, opt);
  c.addEventListener('wheel', (e) => {
    if (!canEditScene() || !App.view) return;
    const [x, y] = world(e);
    if (Math.hypot(x - sim.robot.x, y - sim.robot.y) > (own ? 10 : 25)) return;
    e.preventDefault(); claim(e);
    const step = (e.shiftKey ? 1 : 15) * DEG * Math.sign(e.deltaY || e.deltaX);
    let th = sim.robot.th + step;
    if (!e.shiftKey) th = Math.round(th / (15 * DEG)) * 15 * DEG;
    if (!sim.collides(sim.robot.x, sim.robot.y, th) && fllPoseOk(sim.robot.x, sim.robot.y, th)) {
      sim.resetRobot({ x: sim.robot.x, y: sim.robot.y, th });
      App.runStartPose = { ...sim.robot };
    }
  }, { passive: false, capture: own });
}

function setupBrickButtons() {
  document.querySelectorAll('.bb').forEach((el) => {
    const b = el.dataset.btn;
    const down = (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      if (b === 'back') { stopProgram(); return; }
      brick.buttons[b] = true;
    };
    const up = () => { el.classList.remove('pressed'); if (b !== 'back') brick.buttons[b] = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
  });
}

// Port View: hidden by default, opened from the workspace corner or the simulator toolbar.
function togglePortView(show) {
  const panel = $('pvPanel');
  const open = show === undefined ? panel.hidden : show;
  panel.hidden = !open;
  $('btnPortView').classList.toggle('active', open);
  if (open) { portDiagram.render(); portView.render(); }
}
function setupPortViewPanel() {
  $('btnPortView').onclick = () => togglePortView();
  $('btnPortView2').onclick = () => togglePortView();
  $('pvClose').onclick = () => togglePortView(false);
  document.querySelectorAll('[data-pvtab]').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('[data-pvtab]').forEach((x) => x.classList.toggle('active', x === b));
      $('pvDiagramTab').hidden = b.dataset.pvtab !== 'diagram';
      $('pvSetupTab').hidden = b.dataset.pvtab !== 'setup';
    };
  });
  // Drag the panel by its title bar.
  const panel = $('pvPanel'), bar = panel.querySelector('.pv-top');
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    panel.style.transform = 'none';
    const move = (ev) => {
      panel.style.left = Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - dx)) + 'px';
      panel.style.top = Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dy)) + 'px';
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}

// Workspace: zoom bar and category label colors like EV3 Classroom.
function setupWorkspaceChrome() {
  const place = () => {
    const tb = ws.getToolbox();
    const editorW = $('editor').clientWidth;
    const left = Math.max(0, Math.min((tb ? tb.getWidth() : 0) + (tb && tb.getFlyout() ? tb.getFlyout().getWidth() : 0) + 16, editorW - 290));
    $('zoomBar').style.left = left + 'px';
    $('btnPortView').style.left = left + 'px';
  };
  place();
  window.addEventListener('resize', place);
  document.querySelectorAll('#zoomBar button').forEach((b) => {
    b.onclick = () => {
      const z = b.dataset.z;
      if (z === 'in') ws.zoomCenter(1);
      if (z === 'out') ws.zoomCenter(-1);
      if (z === 'reset') { ws.setScale(0.9); ws.scrollCenter(); }
      if (z === 'undo') ws.undo(false);
      if (z === 'redo') ws.undo(true);
    };
  });
  for (const item of ws.getToolbox().getToolboxItems()) {
    const el = document.getElementById(item.getId() + '.label');
    if (el && item.colour_) el.style.color = item.colour_;
  }
}

// ---------- Init ----------
// The block palette has its own, smaller scale (less wide, more room for the program); blocks dragged
// into the program take the editor's size.
const PALETTE_SCALE = 0.75;
class PaletteFlyout extends ContinuousFlyout {
  getFlyoutScale() { return PALETTE_SCALE; }
}

function init() {
  // Dynamic categories need their callbacks: inject without them, then update the toolbox.
  const staticToolbox = { ...EV3_TOOLBOX, contents: EV3_TOOLBOX.contents.map((c) => (c.custom ? { kind: 'category', name: c.name, colour: c.colour, contents: [] } : c)) };
  ws = Blockly.inject('blocklyDiv', {
    toolbox: staticToolbox,
    renderer: 'zelos',
    theme: EV3_THEME,
    media: 'lib/blockly/media/',
    plugins: { toolbox: ContinuousToolbox, flyoutsVerticalToolbox: PaletteFlyout, metricsManager: ContinuousMetrics },
    trashcan: true,
    sounds: true,
    zoom: { controls: false, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.3, scaleSpeed: 1.15 },
    grid: { spacing: 24, length: 1.5, colour: '#d5d8db', snap: false },
    move: { scrollbars: true, drag: true, wheel: false },
  });
  ev3MainWorkspace = ws;
  ws.registerToolboxCategoryCallback('EV3_VARIABLES', variablesFlyout);
  ws.registerToolboxCategoryCallback('EV3_MYBLOCKS', myBlocksFlyout);
  ws.registerButtonCallback('EV3_MAKE_VARIABLE', () => { Blockly.Msg.NEW_VARIABLE_TITLE = 'New variable name:'; Blockly.Variables.createVariableButtonHandler(ws, null, ''); });
  ws.registerButtonCallback('EV3_MAKE_LIST', () => { Blockly.Msg.NEW_VARIABLE_TITLE = 'New list name:'; Blockly.Variables.createVariableButtonHandler(ws, null, 'list'); });
  ws.registerButtonCallback('EV3_MAKE_BLOCK', openMakeBlock);
  ws.updateToolbox(EV3_TOOLBOX);

  portView = new PortView($('pvGrid'), sim, { onConfigChange: (cfg) => applyConfig(cfg) });
  portDiagram = new PortDiagram($('pvDiagram'), sim, brick);
  setupPortViewPanel();
  $('presetSel').innerHTML = '<option value="">Custom robot</option>' + Object.keys(ROBOT_PRESETS).map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  $('presetSel').onchange = (e) => { if (e.target.value) applyConfig(ROBOT_PRESETS[e.target.value]); };
  applyConfig(DEFAULT_CONFIG, { save: false });
  ws.addChangeListener((e) => { if (!e.isUiEvent) autosave(); });

  $('matSel').innerHTML = SANDBOX_MATS.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  App.matId = LS.get(STORAGE + 'mat', 'blank');
  loadSandboxMat(App.matId);

  // Welcome screen
  document.querySelectorAll('.choice').forEach((b) => { b.onclick = () => chooseMode(b.dataset.mode); });
  $('wChange').onclick = () => pickClass($('wClass').value);
  $('wCodeGo').onclick = submitClassCode;
  $('wCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitClassCode(); });
  $('wOpen').onclick = () => $('wFile').click();
  $('wFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openWorkFile(f); };

  // Header and panels
  $('btnSaveWork').onclick = saveWork;
  $('btnReminderSave').onclick = saveWork;
  $('btnReminderLater').onclick = () => { $('saveReminder').hidden = true; App.reminderSnoozedUntil = Date.now() + 10 * 60000; };
  $('btnExit').onclick = exitSession;
  $('btnSwitchMode').onclick = switchMode;
  $('btnRun').onclick = runProgram;
  $('btnStop').onclick = stopProgram;
  $('btnReset').onclick = resetPosition;
  $('speedSel').onchange = (e) => { App.speed = e.target.value === 'max' ? 'max' : Number(e.target.value); brick.sound.muted = App.speed === 'max'; };
  $('chkTrail').onchange = (e) => { App.trail = e.target.checked; };
  $('matSel').onchange = (e) => loadSandboxMat(e.target.value);
  $('btnAddBox').onclick = () => {
    if (!canEditScene()) return;
    const { w, h } = sim.mat;
    for (let k = 0; k < 40; k++) {
      const bx = 10 + Math.random() * (w - 40), by = 10 + Math.random() * (h - 40);
      const ob = { poly: rectPoly(bx, by, 20, 20), color: PAL.box, movable: true };
      if (!polysOverlap(ob.poly, sim.bodyPoly())) { sim.obstacles.push(ob); sim._rebuildSegments(); return; }
    }
  };
  $('btnBeacon').onclick = () => {
    if (!canEditScene()) return;
    sim.beacon = sim.beacon ? null : { x: sim.mat.w - 25, y: 25, channel: sim.remote.channel };
    sim._cache = {};
  };
  $('btnClearTrail').onclick = () => { sim.trail = [[sim.robot.x, sim.robot.y]]; };
  $('stepper').addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) enterChallenge(b.dataset.ch); });
  $('btnVariant').onclick = () => { selectChallenge(App.challenge.id, true); };
  $('btnHint').onclick = showHint;
  $('btnEvaluate').onclick = evaluate;
  $('btnClearLog').onclick = () => { $('log').innerHTML = ''; };
  $('btnHelp').onclick = showHelp;
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('modal').hidden) closeModal(); else togglePortView(false); } });

  // Activity tracking, save reminder, live sync
  for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, () => { Progress.lastInput = Date.now(); }, { capture: true, passive: true });
  setInterval(() => {
    if (!Progress.data) return;
    Progress.tick(progressMode(), App.status !== 'idle');
    if (!Sync.online && Progress.minutesSinceSave() > CLASSROOM.saveReminderMinutes && Date.now() > App.reminderSnoozedUntil) $('saveReminder').hidden = false;
    if (Sync.online) $('saveReminder').hidden = true;
    updateSaveStatus();
  }, 1000);
  window.addEventListener('beforeunload', (e) => {
    if (!Progress.data) return;
    storeWorkspace();
    if (Sync.online) {
      try { fetch('api/work', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Class-Code': ClassCode.get() }, body: JSON.stringify({ ...Progress.data, live: liveState('left') }) }); } catch (err) { /* ignore */ }
      if (Sync.savedRecently(20)) return;
    }
    if (Progress.minutesSinceSave() > 0.5) { e.preventDefault(); e.returnValue = ''; }
  });
  Sync.onValidated = (id) => onValidated(id, 'teacher');
  Sync.onRemoteChange = onRemoteChange;
  Sync.onDeleted = onDeleted;
  Sync.loadSettings().then(applyClassSettings);
  setInterval(() => Sync.loadSettings().then(applyClassSettings), 30000);
  Sync.onStatus = () => updateSaveStatus();
  Sync.start(() => liveState());

  setupFll();
  $('wTeacher').onclick = teacherLogin;
  $('btnSolution').onclick = showSolution;
  $('lowerToggle').onclick = () => showLower($('lowerPanel').hidden);
  showLower(LS.get(STORAGE + 'lowerOpen', false), false);
  setupClassroom();
  $('btnBig').onclick = () => {
    document.body.classList.toggle('bigfield');
    $('btnBig').title = document.body.classList.contains('bigfield') ? 'Back to normal size (more room for your blocks)' : 'Bigger simulator';
    setTimeout(() => { window.dispatchEvent(new Event('resize')); Blockly.svgResize(ws); }, 50);
  };
  setupSceneMouse();
  $('btn3d').onclick = () => set3d(!App.view3d);
  setupBrickButtons();
  setupWorkspaceChrome();
  new ResizeObserver(resizeCanvas).observe($('simCanvas'));
  resizeCanvas();
  updateButtons();
  if (new URLSearchParams(location.search).get('preview')) startPreview(); else showWelcome();
  requestAnimationFrame(frame);
}

window.addEventListener('load', init);
