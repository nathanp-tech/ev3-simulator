// Self-test: runs a reference solution for each challenge and checks the language and robot configurations.
'use strict';

// Mini DSL to write Blockly JSON programs
const n = (v) => ({ shadow: { type: 'ev3_num', fields: { NUM: String(v) } } });
const tx = (v) => ({ shadow: { type: 'ev3_text', fields: { TEXT: String(v) } } });
const v = (block) => ({ block });
const b = (type, fields = {}, inputs = {}) => ({ type, fields, inputs });
function chain(arr) {
  for (let i = 0; i < arr.length - 1; i++) arr[i].next = { block: arr[i + 1] };
  return arr[0];
}
const body = (arr) => ({ block: chain(arr) });
const blocks = (...stacks) => ({ languageVersion: 0, blocks: stacks.map((s, i) => (Array.isArray(s) ? { ...chain(s), x: 0, y: i * 300 } : s)) });
const prog = (...stacks) => ({ blocks: blocks(...stacks) });
const withVars = (vars, bl) => ({ variables: vars, blocks: bl });
const start = () => b('ev3_when_start');
const varGet = (id) => b('variables_get', { VAR: { id } });
const vars = (...names) => names.map((nm) => ({ name: nm, id: 'v_' + nm }));
const listVars = (...names) => names.map((nm) => ({ name: nm, id: 'l_' + nm, type: 'list' }));

const CM = (cm) => Math.round(cm / (Math.PI * 5.6) * 360 * 100) / 100; // cm → motor degrees
const fwd = (cm) => b('ev3_move_dir_for', { DIR: 'forward', UNIT: 'degrees' }, { AMOUNT: n(CM(cm)) });
const speed = (s) => b('ev3_move_set_speed', {}, { SPEED: n(s) });
const startDir = (d) => b('ev3_move_dir_start', { DIR: d });
const stopMove = () => b('ev3_move_stop');
const waitTrue = (c) => b('ev3_wait_until', {}, { COND: v(c) });
const colorIs = (c, port = '3') => b('ev3_color_is', { PORT: port, COLOR: c });
const not = (x) => b('ev3_op_not', {}, { A: v(x) });
const op = (type, A, B) => b(type, {}, { A, B });
const write = (valueBlock) => b('ev3_display_text_line', {}, { TEXT: v(valueBlock), LINE: n(1) });
const callProc = (name, args = []) => ({ type: 'procedures_callnoreturn', extraState: { name, params: args.map((a) => a.name) }, inputs: Object.fromEntries(args.map((a, i) => ['ARG' + i, a.value])) });
const defProc = (name, params, stack, y) => ({ type: 'procedures_defnoreturn', fields: { NAME: name }, extraState: params.length ? { params: params.map((p) => ({ name: p, id: 'v_' + p })) } : undefined, inputs: { STACK: body(stack) }, x: 600, y });

const turnRight = () => [b('ev3_angle_reset', { PORT: '2' }), speed(15), startDir('right'), b('ev3_angle_wait', { PORT: '2', OP: '>' }, { VALUE: n(88) }), stopMove(), speed(50)];
const turnLeft = () => [b('ev3_angle_reset', { PORT: '2' }), speed(15), startDir('left'), b('ev3_angle_wait', { PORT: '2', OP: '<' }, { VALUE: n(-88) }), stopMove(), speed(50)];
const reflectErr = (port) => op('ev3_op_sub', v(b('ev3_reflect', { PORT: port })), n(52));

const SOLUTIONS = {
  'first-steps': prog([start(), fwd(70)]),
  square: prog([start(), b('ev3_repeat', {}, { TIMES: n(4), DO: body([fwd(50), b('ev3_move_dir_for', { DIR: 'left', UNIT: 'degrees' }, { AMOUNT: n(CM(Math.PI * 12 / 4)) })]) })]),
  'stop-wall': prog([start(), startDir('forward'), b('ev3_distance_wait', { PORT: '4', OP: '<', UNIT: 'cm' }, { VALUE: n(8) }), stopMove()]),
  'stop-line': prog([start(), startDir('forward'), b('ev3_color_wait', { PORT: '3', COLOR: 'black' }), stopMove()]),
  'touch-return': prog([start(), b('ev3_motor_set_pos', { PORT: 'B' }, { POS: n(0) }), startDir('forward'), b('ev3_touch_wait', { PORT: '1', STATE: 'pressed' }), stopMove(),
    b('ev3_move_dir_for', { DIR: 'backward', UNIT: 'degrees' }, { AMOUNT: v(b('ev3_motor_position', { PORT: 'B' })) })]),
  'gyro-turn': prog([start(), ...turnRight(), fwd(60)]),
  'line-follow': withVars(vars('error'), blocks([start(), b('ev3_forever', {}, { DO: body([
    b('variables_set', { VAR: { id: 'v_error' } }, { VALUE: v(reflectErr('3')) }),
    b('ev3_move_tank_start', {}, {
      LEFT: v(op('ev3_op_add', n(35), v(op('ev3_op_mul', n(0.6), v(varGet('v_error')))))),
      RIGHT: v(op('ev3_op_sub', n(35), v(op('ev3_op_mul', n(0.6), v(varGet('v_error')))))),
    }),
  ]) })])),
  'count-lines': withVars(vars('lines'), blocks([start(), b('variables_set', { VAR: { id: 'v_lines' } }, { VALUE: tx(0) }), startDir('forward'),
    b('ev3_repeat_until', {}, { COND: v(colorIs('red')), DO: body([
      b('ev3_if', {}, { COND: v(colorIs('black')), DO: body([
        b('math_change', { VAR: { id: 'v_lines' } }, { DELTA: n(1) }),
        waitTrue(not(colorIs('black'))),
      ]) }),
    ]) }),
    b('ev3_wait', {}, { SECS: n(0.3) }), stopMove(), write(varGet('v_lines'))])),
  'detect-color': prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), b('ev3_wait', {}, { SECS: n(0.3) }), stopMove(), write(b('ev3_color', { PORT: '3' }))]),
  maze: withVars(vars('cm'), blocks(
    defProc('right', [], turnRight(), 0),
    defProc('left', [], turnLeft(), 300),
    defProc('forward', ['cm'], [b('ev3_move_dir_for', { DIR: 'forward', UNIT: 'degrees' }, { AMOUNT: v(op('ev3_op_mul', v(varGet('v_cm')), n(360 / (Math.PI * 5.6)))) })], 600),
    [start(), speed(50),
      callProc('forward', [{ name: 'cm', value: n(89.5) }]), callProc('right'),
      callProc('forward', [{ name: 'cm', value: n(45) }]), callProc('right'),
      callProc('forward', [{ name: 'cm', value: n(90) }]), callProc('left'),
      callProc('forward', [{ name: 'cm', value: n(45) }]), callProc('left'),
      callProc('forward', [{ name: 'cm', value: n(90) }]), callProc('right'),
      callProc('forward', [{ name: 'cm', value: n(45) }])],
  )),
};

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
