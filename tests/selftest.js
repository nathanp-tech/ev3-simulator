// Self-test: runs a reference solution for each challenge and checks the language and robot configurations.
'use strict';

// Language: messages, waits, variables, loops, lists, operators, generic "when" hat.
const LANG_TEST = withVars(vars('x', 'y', 'z', 'evt', 'txt', 'item', 'cmp').concat(listVars('l')), blocks(
  [start(),
    b('variables_set', { VAR: { id: 'v_x' } }, { VALUE: tx(0) }),
    b('ev3_broadcast_wait', { MSG: 'go' }),
    b('variables_set', { VAR: { id: 'v_y' } }, { VALUE: v(op('ev3_op_mul', v(varGet('v_x')), n(2))) }),
    b('ev3_repeat', {}, { TIMES: n(1000), DO: body([b('math_change', { VAR: { id: 'v_z' } }, { DELTA: n(1) })]) }),
    b('ev3_repeat', {}, { TIMES: n(3), DO: body([b('ev3_list_add', { LIST: { id: 'l_l' } }, { ITEM: tx(7) })]) }),
    b('ev3_list_replace', { LIST: { id: 'l_l' } }, { INDEX: n(2), ITEM: tx('b') }),
    b('variables_set', { VAR: { id: 'v_item' } }, { VALUE: v(b('ev3_list_item', { LIST: { id: 'l_l' } }, { INDEX: n(2) })) }),
    b('variables_set', { VAR: { id: 'v_txt' } }, { VALUE: v(op('ev3_op_join', tx('a'), v(op('ev3_op_mod', n(-7), n(3))))) }),
    b('variables_set', { VAR: { id: 'v_cmp' } }, { VALUE: v(b('ev3_op_and', {}, { A: v(op('ev3_op_lt', tx(9), tx(10))), B: v(op('ev3_op_eq', tx('Apple'), tx('apple'))) })) }),
    b('ev3_wait', {}, { SECS: n(1.5) }),
  ],
  [b('ev3_when_receive', { MSG: 'go' }), b('ev3_wait', {}, { SECS: n(0.5) }), b('variables_set', { VAR: { id: 'v_x' } }, { VALUE: tx(21) })],
  [b('ev3_when_cond', {}, { COND: v(op('ev3_op_gt', v(b('ev3_timer')), n(1))) }), b('variables_set', { VAR: { id: 'v_evt' } }, { VALUE: tx('timer') })],
));

// Two color sensors (ports 1 and 3, front left / front right) following the line edge on the oval track.
const TWO_SENSOR_CONFIG = ROBOT_PRESETS['Line follower (2 color sensors)'];
const TWO_SENSOR_LINE = withVars(vars('e'), blocks([start(), b('ev3_forever', {}, { DO: body([
  b('variables_set', { VAR: { id: 'v_e' } }, { VALUE: v(op('ev3_op_sub', v(b('ev3_reflect', { PORT: '1' })), v(b('ev3_reflect', { PORT: '3' })))) }),
  b('ev3_move_tank_start', {}, {
    LEFT: v(op('ev3_op_add', n(30), v(op('ev3_op_mul', n(0.5), v(varGet('v_e')))))),
    RIGHT: v(op('ev3_op_sub', n(30), v(op('ev3_op_mul', n(0.5), v(varGet('v_e')))))),
  }),
]) })]));

// Infrared beacon follower.
const IR_CONFIG = ROBOT_PRESETS['Explorer (infrared + beacon)'];
const heading = () => b('ev3_beacon_heading', { PORT: '4', CH: '1' });
const BEACON_FOLLOW = prog([start(), b('ev3_repeat_until', {}, {
  COND: v(op('ev3_op_lt', v(b('ev3_beacon_prox', { PORT: '4', CH: '1' })), n(12))),
  DO: body([b('ev3_move_tank_start', {}, {
    LEFT: v(op('ev3_op_add', n(30), v(op('ev3_op_mul', n(3), v(heading()))))),
    RIGHT: v(op('ev3_op_sub', n(30), v(op('ev3_op_mul', n(3), v(heading()))))),
  })]),
}), stopMove()]);

const out = [];
const say = (s) => { out.push(s); document.getElementById('out').textContent = out.join('\n'); };

async function runSandbox(sim, brick, mat, config, program, maxT) {
  sim.setConfig(config);
  sim.loadMat(mat);
  sim.resetRobot(mat.start);
  brick.reset();
  const logs = [];
  const rt = new Runtime(sim, brick, { onLog: (m) => logs.push(m) });
  const p = programFromSerialized(program);
  rt.start(p.code, { seed: 1, variables: p.variables, lists: p.lists });
  while (rt.running && sim.t < maxT) await rt.tick();
  if (rt.running) rt.stopAll('user');
  return { rt, logs, p };
}

async function main() {
  const sim = new Sim(), brick = new Brick();
  brick.sound.muted = true;
  let allOk = true;
  const check = (ok, msg) => { allOk = allOk && ok; say(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };

  // Language
  {
    const { rt, logs, p } = await runSandbox(sim, brick, SANDBOX_MATS[0], DEFAULT_CONFIG, LANG_TEST, 5);
    const V = rt.V;
    const ok = V.x === 21 && V.y === 42 && V.z === 1000 && JSON.stringify(rt.L.l) === '[7,"b",7]' && V.item === 'b' && V.txt === 'a2' && V.evt === 'timer' && V.cmp === true;
    check(ok, `language: x=${V.x} y=${V.y} z=${V.z} list=${JSON.stringify(rt.L.l)} item=${V.item} txt=${V.txt} evt=${V.evt} cmp=${V.cmp} ${logs.join(' | ')}`);
    if (!ok) say(p.code);
  }
  // Wrong port gives a clear error
  {
    const bad = prog([start(), b('variables_set', { VAR: { id: 'v_x' } }, { VALUE: v(b('ev3_reflect', { PORT: '1' })) })]);
    bad.variables = vars('x');
    const { rt, logs } = await runSandbox(sim, brick, SANDBOX_MATS[0], DEFAULT_CONFIG, bad, 1);
    check(rt.endReason === 'error' && /No Color Sensor on port 1/.test(logs.join()), `wrong port error: "${logs.join(' | ')}"`);
  }
  // Two color sensors on the oval track
  {
    const { rt, logs } = await runSandbox(sim, brick, SANDBOX_MATS[1], TWO_SENSOR_CONFIG, TWO_SENSOR_LINE, 20);
    const dist = Math.hypot(sim.robot.x - 90, sim.robot.y - 115);
    check(!logs.length && sim.trail.length > 300 && sim.collisions === 0, `2-color-sensor line follower: traveled ${sim.trail.length} trail points, pos (${sim.robot.x.toFixed(0)}, ${sim.robot.y.toFixed(0)}), from start ${dist.toFixed(0)} cm ${logs.join(' | ')} ${rt.endReason}`);
  }
  // Infrared beacon
  {
    const mat = SANDBOX_MATS.find((m) => m.id === 'beacon');
    const { rt, logs } = await runSandbox(sim, brick, mat, IR_CONFIG, BEACON_FOLLOW, 20);
    const d = Math.hypot(sim.robot.x - mat.beacon.x, sim.robot.y - mat.beacon.y);
    check(rt.endReason === 'done' && d < 40, `infrared beacon follower: ${rt.endReason} at ${d.toFixed(0)} cm from the beacon after ${sim.t.toFixed(1)} s ${logs.join(' | ')}`);
  }
  // Challenges with the default robot
  for (const ch of CHALLENGES) {
    try {
      const p = programFromSerialized(SOLUTIONS[ch.id]);
      const logs = [];
      const res = await evaluateProgram(ch, p, { sim, brick, config: DEFAULT_CONFIG, onLog: (m) => logs.push(m) });
      check(res.score >= 90, `${ch.title}: ${res.score} % ` + res.trials.map((t) => `[${t.score}% ${t.endReason} ${t.simTime}s] ` + t.criteria.filter((c) => c.points < c.max).map((c) => '✖ ' + c.label).join(' ; ')).join(' ') + (logs.length ? ' LOGS: ' + logs.join(' | ') : ''));
    } catch (e) {
      check(false, `${ch.title}: exception ${e.message}\n${e.stack}`);
    }
  }
  // Every solution of the teacher's answer key passes the check
  for (const ch of CHALLENGES) {
    const set = SOLUTION_SETS[ch.id] || [];
    const res = [];
    for (const s of set) res.push((await evaluateProgram(ch, programFromSerialized(s.program), { sim, brick, config: DEFAULT_CONFIG })).score);
    check(set.length >= 2 && res.every((x) => x >= CLASSROOM.passScore), `${ch.title}: ${set.length} solutions in the answer key, scores ${res.join(' / ')} (${set.map((s) => s.title).join(' · ')})`);
  }
  // Categories, no gyro, variants that really change
  {
    check(CHALLENGES.every((c) => CATEGORIES.some((k) => k.id === c.cat)), `every challenge has a category: ${CHALLENGES.map((c) => c.cat).join(', ')}`);
    check(CHALLENGES.every((c) => !/gyro/i.test(c.description + c.hints.join(' ') + c.skills)), 'no challenge needs the gyro sensor');
    const ch = CHALLENGES.find((c) => c.id === 'color-route');
    const colors = checkSeeds(ch).map((sd) => ch.setup(mulberry32(sd)).data.color);
    check(new Set(colors).size === 2, `color code: both colors appear in the trials (${colors.join(', ')})`);
    // basic challenges: one fixed layout; advanced ones (Combined, Expert): a layout that changes, several trials
    const layout = (c, sd) => JSON.stringify(c.setup(mulberry32(sd)).data);
    const basic = CHALLENGES.filter((c) => ['motion', 'touch', 'distance', 'color'].includes(c.cat));
    check(basic.every((c) => (c.trials || 1) === 1 && layout(c, 1) === layout(c, 99) && layout(c, 1) === layout(c, 12345)), `basic challenges have a fixed layout: ${basic.map((c) => c.id).join(', ')}`);
    const adv = CHALLENGES.filter((c) => ['combined', 'expert'].includes(c.cat) && c.id !== 'maze');
    check(adv.every((c) => c.trials >= 3 && new Set(Array.from({ length: 20 }, (_, i) => layout(c, i + 1))).size > 1 && new Set(checkSeeds(c).map((sd) => layout(c, sd))).size >= 2),
      `advanced challenges change their layout (different check trials): ${adv.map((c) => `${c.id} ${new Set(checkSeeds(c).map((sd) => layout(c, sd))).size}/${c.trials}`).join(', ')}`);
  }
  // The answer key published for the teacher (api/_solutions.json) is the same as these solutions
  {
    try {
      const r = await fetch('../api/solutions', { cache: 'no-store' });
      const pub = r.ok ? await r.json() : null;
      check(pub && JSON.stringify(pub.solutions) === JSON.stringify(SOLUTION_SETS), pub ? 'published answer key is up to date (api/_solutions.json)' : 'published answer key: not reachable (run the test through server.py)');
    } catch (e) { check(false, 'published answer key: ' + e.message); }
  }
  // An empty program scores nothing
  {
    const p = programFromSerialized(prog([start()]));
    const scores = [];
    for (const ch of CHALLENGES) scores.push((await evaluateProgram(ch, p, { sim, brick, config: DEFAULT_CONFIG })).score);
    check(scores.every((x) => x === 0), `empty program: ${scores.join(', ')}`);
  }
  // Determinism
  {
    const ch = CHALLENGES.find((c) => c.id === 'line-follow');
    const p = programFromSerialized(SOLUTIONS['line-follow']);
    const a = await evaluateProgram(ch, p, { sim, brick, config: DEFAULT_CONFIG });
    const c = await evaluateProgram(ch, p, { sim, brick, config: DEFAULT_CONFIG });
    check(JSON.stringify(a) === JSON.stringify(c), 'grading is deterministic');
  }
  say(allOk ? 'RESULT: ALL OK' : 'RESULT: FAILURES');
  document.title = allOk ? 'PASS' : 'FAIL';
}
window.addEventListener('load', () => main().catch((e) => say('EXCEPTION ' + e.message + '\n' + e.stack)));
