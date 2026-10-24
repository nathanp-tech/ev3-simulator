// Reference solutions of the guided challenges, written with a small DSL (Blockly JSON).
// Used by the self-test (each must score 100 %) and published for the teacher's preview by tests/gen_solutions.html
// into api/_solutions.json (served only with the teacher password). After a change here: regenerate (see README).
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

// Quarter turn on the spot with the motor degrees (no gyro): the wheels travel a quarter of a 12 cm circle.
const QUARTER = CM(Math.PI * 12 / 4);
const turnRight = () => [b('ev3_move_dir_for', { DIR: 'right', UNIT: 'degrees' }, { AMOUNT: n(QUARTER) })];
const turnLeft = () => [b('ev3_move_dir_for', { DIR: 'left', UNIT: 'degrees' }, { AMOUNT: n(QUARTER) })];
const distWait = (cm) => b('ev3_distance_wait', { PORT: '4', OP: '<', UNIT: 'cm' }, { VALUE: n(cm) });
const reflectErr = (port) => op('ev3_op_sub', v(b('ev3_reflect', { PORT: port })), n(52));

const SOLUTIONS = {
  'first-steps': prog([start(), fwd(70)]),
  garage: prog([start(), fwd(105), ...turnLeft(), fwd(65)]),
  corridor: prog([start(), startDir('forward'), distWait(15), stopMove(), ...turnLeft(), startDir('forward'), distWait(10), stopMove()]),
  'color-route': prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), stopMove(),
    b('ev3_if_else', {}, { COND: v(colorIs('red')), DO: body([...turnLeft(), fwd(55)]), ELSE: body([...turnRight(), fwd(55)]) })]),
  'line-wall': prog([start(), startDir('forward'), b('ev3_color_wait', { PORT: '3', COLOR: 'black' }), stopMove(), ...turnRight(), startDir('forward'), distWait(10), stopMove()]),
  bounce: prog([start(), b('ev3_repeat', {}, { TIMES: n(3), DO: body([startDir('forward'), b('ev3_touch_wait', { PORT: '1', STATE: 'pressed' }), startDir('backward'), b('ev3_color_wait', { PORT: '3', COLOR: 'blue' })]) }), stopMove()]),
  square: prog([start(), b('ev3_repeat', {}, { TIMES: n(4), DO: body([fwd(50), b('ev3_move_dir_for', { DIR: 'left', UNIT: 'degrees' }, { AMOUNT: n(CM(Math.PI * 12 / 4)) })]) })]),
  'stop-wall': prog([start(), startDir('forward'), b('ev3_distance_wait', { PORT: '4', OP: '<', UNIT: 'cm' }, { VALUE: n(8) }), stopMove()]),
  'stop-line': prog([start(), startDir('forward'), b('ev3_color_wait', { PORT: '3', COLOR: 'black' }), stopMove()]),
  'touch-return': prog([start(), b('ev3_motor_set_pos', { PORT: 'B' }, { POS: n(0) }), startDir('forward'), b('ev3_touch_wait', { PORT: '1', STATE: 'pressed' }), stopMove(),
    b('ev3_move_dir_for', { DIR: 'backward', UNIT: 'degrees' }, { AMOUNT: v(b('ev3_motor_position', { PORT: 'B' })) })]),
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
    [start(),
      callProc('forward', [{ name: 'cm', value: n(89.5) }]), callProc('right'),
      callProc('forward', [{ name: 'cm', value: n(45) }]), callProc('right'),
      callProc('forward', [{ name: 'cm', value: n(90) }]), callProc('left'),
      callProc('forward', [{ name: 'cm', value: n(45) }]), callProc('left'),
      callProc('forward', [{ name: 'cm', value: n(90) }]), callProc('right'),
      callProc('forward', [{ name: 'cm', value: n(45) }])],
  )),
};

