// Engine regression tests: bugs found by testing (broadcast loops, disabled hats, My Blocks, commas, sound, odd names).
'use strict';

const out = [];
const say = (s) => { out.push(s); document.getElementById('out').textContent = out.join('\n'); };
const setV = (id, value) => b('variables_set', { VAR: { id } }, { VALUE: value });
const chg = (id, d = 1) => b('math_change', { VAR: { id } }, { DELTA: n(d) });
const call = (name, args = []) => callProc(name, args);

async function runFor(program, secs, { muted = true } = {}) {
  const sim = new Sim(), brick = new Brick();
  brick.sound.muted = muted;
  sim.loadMat(SANDBOX_MATS[0]);
  sim.resetRobot(SANDBOX_MATS[0].start);
  const logs = [];
  const p = programFromSerialized(program);
  const rt = new Runtime(sim, brick, { onLog: (m) => logs.push(m) });
  const t0 = performance.now();
  rt.start(p.code, { seed: 1, variables: p.variables, lists: p.lists });
  while (rt.running && sim.t < secs) {
    await rt.tick();
    if (performance.now() - t0 > 20000) { rt.stopAll('hang'); break; }
  }
  if (rt.running) rt.stopAll('user');
  return { rt, sim, brick, logs, code: p.code };
}

async function main() {
  let ok = true;
  const check = (c, msg) => { ok = ok && c; say(`${c ? 'OK  ' : 'FAIL'} ${msg}`); };

  { // a stack that re-broadcasts its own message runs once per step instead of freezing the page
    const r = await runFor(withVars(vars('x'), blocks([start(), b('ev3_broadcast', { MSG: 'go' })],
      [b('ev3_when_receive', { MSG: 'go' }), chg('v_x'), b('ev3_broadcast', { MSG: 'go' })])), 1);
    check(r.rt.endReason !== 'hang' && r.rt.V.x >= 150 && r.rt.V.x <= 250, `broadcast loop: x=${r.rt.V.x} after 1 s (${r.rt.endReason})`);
    const p = await runFor(withVars(vars('x'), blocks([start(), b('ev3_broadcast', { MSG: 'a' })],
      [b('ev3_when_receive', { MSG: 'a' }), chg('v_x'), b('ev3_broadcast_wait', { MSG: 'b' })],
      [b('ev3_when_receive', { MSG: 'b' }), b('ev3_broadcast', { MSG: 'a' })])), 1);
    check(p.rt.endReason !== 'hang' && p.rt.V.x > 10, `ping-pong broadcast: x=${p.rt.V.x} (${p.rt.endReason}) ${p.logs.join(' | ')}`);
  }
  { // a disabled hat is ignored, the other stacks still run
    const prog1 = withVars(vars('x', 'y'), blocks([start(), setV('v_y', tx(1))]));
    prog1.blocks.blocks.push({ ...chain([start(), b('ev3_move_dir_for', { DIR: 'forward', UNIT: 'rotations' }, { AMOUNT: n(1) }), setV('v_x', tx(1))]), enabled: false, x: 0, y: 900 });
    const r = await runFor(prog1, 3);
    check(r.rt.V.y === 1 && r.rt.V.x === 0 && !r.logs.length, `disabled hat ignored: x=${r.rt.V.x} y=${r.rt.V.y} ${r.logs.join(' | ')}`);
  }
  { // My Blocks named like the generated locals (a, n, s, k, i, _n, F)
    const names = ['a', 'n', 's', 'k', 'i', '_n', 'F'];
    const defs = names.map((nm, i) => defProc(nm, [], [chg('v_x')], i * 200));
    const outer = defProc('outer', [], names.map((nm) => b('ev3_repeat', {}, { TIMES: n(2), DO: body([call(nm)]) })), 2000);
    const r = await runFor(withVars(vars('x'), blocks(...defs, outer, [start(), call('outer')])), 2);
    check(r.rt.V.x === names.length * 2 && !r.logs.length, `My Blocks named ${names.join(', ')}: x=${r.rt.V.x} ${r.logs.join(' | ')}`);
  }
  { // My Block inputs are per call: two stacks calling the same block with a wait inside
    const prog2 = withVars(vars('p').concat(listVars('got')), blocks(
      defProc('slow', ['p'], [b('ev3_wait', {}, { SECS: n(0.5) }), b('ev3_list_add', { LIST: { id: 'l_got' } }, { ITEM: v(varGet('v_p')) })], 0),
      [start(), call('slow', [{ name: 'p', value: n(1) }])],
      [start(), b('ev3_wait', {}, { SECS: n(0.1) }), call('slow', [{ name: 'p', value: n(2) }])]));
    const r = await runFor(prog2, 2);
    check(JSON.stringify(r.rt.L.got) === '[1,2]' && r.rt.V.p === 0, `parallel My Block inputs: got=${JSON.stringify(r.rt.L.got)} global p=${r.rt.V.p} ${r.logs.join(' | ')}`);
    const rec = withVars(vars('k'), blocks(defProc('fact', ['k'], [b('ev3_if', {}, { COND: v(op('ev3_op_gt', v(varGet('v_k')), n(0))), DO: body([chg('v_total'), call('fact', [{ name: 'k', value: v(op('ev3_op_sub', v(varGet('v_k')), n(1))) }])]) })], 0),
      [start(), setV('v_total', tx(0)), call('fact', [{ name: 'k', value: n(5) }])]));
    rec.variables.push({ name: 'total', id: 'v_total' });
    const r2 = await runFor(rec, 1);
    check(r2.rt.V.total === 5, `recursive My Block with an input: total=${r2.rt.V.total} ${r2.logs.join(' | ')}`);
  }
  { // "stop this stack" in a My Block returns to the caller
    const r = await runFor(withVars(vars('a', 'b'), blocks(defProc('p', [], [setV('v_a', tx('in')), b('ev3_if', {}, { COND: v(b('ev3_op_not', {}, {})), DO: body([b('ev3_stop', { WHAT: 'this' })]) }), setV('v_a', tx('no'))], 0),
      [start(), call('p'), setV('v_b', tx('after'))])), 1);
    check(r.rt.V.a === 'in' && r.rt.V.b === 'after', `stop this stack inside a My Block: a=${r.rt.V.a} b=${r.rt.V.b}`);
    const r2 = await runFor(withVars(vars('b'), blocks([start(), b('ev3_if', {}, { COND: v(b('ev3_op_not', {}, {})), DO: body([b('ev3_stop', { WHAT: 'this' })]) }), setV('v_b', tx('no'))])), 1);
    check(r2.rt.V.b === 0, `stop this stack in a normal stack still stops it: b=${r2.rt.V.b}`);
  }
  { // endless recursion: clear message
    const r = await runFor(prog(defProc('loop', [], [callProc('loop')], 0), [start(), callProc('loop')]), 1);
    check(r.rt.endReason === 'error' && /My Block/.test(r.rt.lastError), `endless recursion message: "${r.rt.lastError}"`);
  }
  { // commas typed in number slots
    const ws = new Blockly.Workspace();
    const blk = ws.newBlock('ev3_num');
    blk.setFieldValue('0,5', 'NUM');
    const a = blk.getFieldValue('NUM');
    blk.setFieldValue('1e3', 'NUM');
    const c = blk.getFieldValue('NUM');
    blk.setFieldValue('abc', 'NUM');
    const d = blk.getFieldValue('NUM');
    ws.dispose();
    check(a === '0.5' && c === '1e3' && d === '1e3', `number field: "0,5" → "${a}", "1e3" → "${c}", "abc" rejected → "${d}"`);
    const r = await runFor(withVars(vars('x'), blocks([start(), setV('v_x', v(op('ev3_op_mul', tx('1,5'), n(2))))])), 1);
    check(r.rt.V.x === 3, `text "1,5" × 2 = ${r.rt.V.x}`);
  }
  { // very high/low beeps with the sound on do not crash
    const r = await runFor(prog([start(), b('ev3_beep_for', {}, { NOTE: n(2000), SECS: n(0.1) }), b('ev3_beep', {}, { NOTE: n(-500) }), b('ev3_beep_for', {}, { NOTE: n(60), SECS: n(-1) })]), 1, { muted: false });
    check(r.rt.endReason === 'done' && !r.logs.length, `extreme beeps with sound on: ${r.rt.endReason} ${r.logs.join(' | ')}`);
  }
  { // variable and list names that are special in JavaScript
    const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
    const r = await runFor(withVars(names.map((nm, i) => ({ name: nm, id: 'w' + i })).concat([{ name: '__proto__', id: 'lp', type: 'list' }]),
      blocks([start(), ...names.map((nm, i) => setV('w' + i, tx(i + 5))), b('ev3_list_add', { LIST: { id: 'lp' } }, { ITEM: tx(9) }), write(varGet('w0'))])), 1);
    check(names.every((nm, i) => r.rt.V[nm] === i + 5) && JSON.stringify(r.rt.L.__proto__) === '[9]' && r.brick.lcd.screenText() === '5', `special names: V=${JSON.stringify(names.map((nm) => r.rt.V[nm]))} list=${JSON.stringify(r.rt.L.__proto__)} screen="${r.brick.lcd.screenText()}"`);
  }
  say(ok ? 'RESULT: ALL OK' : 'RESULT: FAILURES');
  document.title = ok ? 'PASS' : 'FAIL';
}
window.addEventListener('load', () => main().catch((e) => say('EXCEPTION ' + e.message + '\n' + e.stack)));
