// Challenge setup and grading (used by the student app and the teacher page).
'use strict';

const EVAL_SEEDS = [1103, 2207, 3301, 4409, 5503];
// Official trials of a challenge: its own seeds (chosen so that the layouts really differ), else the common ones.
const checkSeeds = (ch) => (ch.checkSeeds || EVAL_SEEDS).slice(0, ch.trials || 1);
const SETTLE_STEPS = 80;
const SENSOR_NEEDS = { touch: 'touch sensor', color: 'color sensor', distance: 'ultrasonic sensor' }; // 0.4 s of coasting after the program ends

function prepareChallenge(sim, brick, ch, seed, config) {
  const rng = mulberry32(seed);
  const setup = ch.setup(rng);
  if (config) sim.setConfig(config);
  sim.manual = {}; // a touch sensor held down in Port View must not change a trial
  brick.buttons = {};
  sim.loadMat(setup.mat);
  sim.resetRobot(setup.start);
  const n = ch.noise || 0;
  const sign = () => (rng() < 0.5 ? -1 : 1);
  sim.setNoise(1 + sign() * (0.4 + 0.6 * rng()) * n, 1 + sign() * (0.4 + 0.6 * rng()) * n * 0.3);
  brick.reset();
  const ctx = { sim, brick, ch, seed, data: setup.data, start: setup.start, state: {}, programEnded: false, screen: '' };
  if (ch.init) ch.init(ctx);
  return ctx;
}

// Call after every simulation step during a challenge. Returns a stop reason or null.
function challengeAfterStep(ctx) {
  const ch = ctx.ch;
  if (ch.step) ch.step(ctx);
  ctx.velBeforeEnd = ctx.sim.vel;
  if (ch.done && ch.done(ctx)) return 'complete';
  if (ctx.sim.t >= ch.timeLimit) return 'timeout';
  return null;
}

function finishChallenge(ctx, endReason) {
  ctx.programEnded = endReason === 'done' || endReason === 'stopped-by-program' || endReason === 'complete';
  for (let i = 0; i < SETTLE_STEPS; i++) {
    ctx.sim.step(DT);
    if (ctx.ch.step) ctx.ch.step(ctx);
  }
  ctx.screen = ctx.brick.lcd.screenText();
  const criteria = ctx.ch.evaluate(ctx);
  // A fixed layout could be solved by driving a measured distance: the program must read the sensor of the challenge.
  const need = ctx.ch.needs;
  if (need && !(ctx.runtime && ctx.runtime.read && ctx.runtime.read[need])) {
    criteria.forEach((c) => { c.points = 0; c.ok = false; });
    criteria.unshift({ label: `✖ Your program must use the ${SENSOR_NEEDS[need]} (no points without it)`, max: 0, points: 0, ok: false, note: true });
  }
  const max = criteria.reduce((a, c) => a + c.max, 0);
  const pts = criteria.reduce((a, c) => a + c.points, 0);
  return { seed: ctx.seed, criteria, score: Math.round(pts / max * 100), endReason, simTime: Math.round(ctx.sim.t * 100) / 100 };
}

// Runs one complete trial as fast as possible. onFrame (optional) can display progress.
async function runTrial(ch, prog, seed, { sim, brick, config, onFrame, onLog } = {}) {
  const ctx = prepareChallenge(sim, brick, ch, seed, config);
  const muted = brick.sound.muted;
  brick.sound.muted = true;
  const rt = new Runtime(sim, brick, { onLog });
  ctx.runtime = rt;
  try {
    rt.start(prog.code, { seed, variables: prog.variables, lists: prog.lists });
  } catch (e) {
    if (onLog) onLog('Error: ' + e.message, 'error');
    brick.sound.muted = muted;
    return { seed, criteria: [], score: 0, endReason: 'error', simTime: 0 };
  }
  let last = performance.now();
  while (rt.running) {
    await rt.tick();
    if (rt.running) {
      const r = challengeAfterStep(ctx);
      if (r) rt.stopAll(r);
    }
    if (onFrame && performance.now() - last > 30) {
      if ((await onFrame(ctx, rt)) === 'abort') rt.stopAll('aborted');
      last = performance.now();
    }
  }
  if (rt.endReason === 'aborted') { brick.sound.muted = muted; return { seed, criteria: [], score: 0, endReason: 'aborted', simTime: sim.t }; }
  const res = finishChallenge(ctx, rt.endReason);
  brick.sound.muted = muted;
  if (onFrame) await onFrame(ctx, rt);
  return res;
}

async function evaluateProgram(ch, prog, opts) {
  const seeds = checkSeeds(ch);
  const trials = [];
  for (let i = 0; i < seeds.length; i++) {
    if (opts.onTrial) opts.onTrial(i, seeds.length);
    const t = await runTrial(ch, prog, seeds[i], opts);
    if (t.endReason === 'aborted') return null;
    trials.push(t);
  }
  const score = Math.round(trials.reduce((a, t) => a + t.score, 0) / trials.length);
  return { challengeId: ch.id, challengeTitle: ch.title, score, grade: swissGrade(score), trials };
}

// Generates the code of a serialized program without displaying it (teacher page, tests).
function programFromSerialized(state) {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, ws);
    return { code: generateProgram(ws), ...programVariables(ws) };
  } finally {
    ws.dispose();
  }
}
