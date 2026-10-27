// Reference solutions of the guided challenges, written with a small DSL (Blockly JSON).
// SOLUTIONS: one reference per challenge (the self-test requires 100 %). SOLUTION_SETS: several solutions per
// challenge, simplest first, published for the teacher's preview by tests/gen_solutions.html
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
const setVar0 = (id) => b('variables_set', { VAR: { id } }, { VALUE: tx(0) });
const dist = () => b('ev3_distance', { PORT: '4', UNIT: 'cm' });
const turnBy = (dir, deg) => b('ev3_move_dir_for', { DIR: dir, UNIT: 'degrees' }, { AMOUNT: n(deg) });
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
  'count-lines': withVars(vars('lines'), blocks([start(), setVar0('v_lines'), startDir('forward'),
    b('ev3_repeat_until', {}, { COND: v(op('ev3_op_eq', v(varGet('v_lines')), n(4))), DO: body([
      b('ev3_color_wait', { PORT: '3', COLOR: 'black' }), b('math_change', { VAR: { id: 'v_lines' } }, { DELTA: n(1) }),
      b('ev3_if', {}, { COND: v(not(op('ev3_op_eq', v(varGet('v_lines')), n(4)))), DO: body([b('ev3_color_wait', { PORT: '3', COLOR: 'white' })]) }),
    ]) }), stopMove()])),
  'detect-color': prog([start(), startDir('forward'), b('ev3_color_wait', { PORT: '3', COLOR: 'blue' }), b('ev3_wait', {}, { SECS: n(0.2) }), stopMove()]),
  'card-lines': withVars(vars('number', 'count'), blocks([start(), setVar0('v_count'), startDir('forward'), waitTrue(not(colorIs('white'))), b('ev3_wait', {}, { SECS: n(0.1) }),
    ...[['red', 2], ['green', 3], ['blue', 4], ['yellow', 5]].map(([c, k]) => b('ev3_if', {}, { COND: v(colorIs(c)), DO: body([b('variables_set', { VAR: { id: 'v_number' } }, { VALUE: tx(k) })]) })),
    b('ev3_repeat_until', {}, { COND: v(op('ev3_op_eq', v(varGet('v_count')), v(varGet('v_number')))), DO: body([
      b('ev3_color_wait', { PORT: '3', COLOR: 'black' }), b('math_change', { VAR: { id: 'v_count' } }, { DELTA: n(1) }),
      b('ev3_if', {}, { COND: v(not(op('ev3_op_eq', v(varGet('v_count')), v(varGet('v_number'))))), DO: body([b('ev3_color_wait', { PORT: '3', COLOR: 'white' })]) }),
    ]) }), stopMove()])),
  'color-memory': withVars(vars('first'), blocks([start(), startDir('forward'), waitTrue(not(colorIs('white'))), b('ev3_wait', {}, { SECS: n(0.08) }),
    b('variables_set', { VAR: { id: 'v_first' } }, { VALUE: v(b('ev3_color', { PORT: '3' })) }), b('ev3_color_wait', { PORT: '3', COLOR: 'white' }),
    waitTrue(b('ev3_op_and', {}, { A: v(not(colorIs('white'))), B: v(not(op('ev3_op_eq', v(b('ev3_color', { PORT: '3' })), v(varGet('v_first'))))) })), stopMove()])),
  'open-gate': withVars(vars('middle', 'left', 'right'), blocks([start(),
    b('variables_set', { VAR: { id: 'v_middle' } }, { VALUE: v(dist()) }), turnBy('left', 80),
    b('variables_set', { VAR: { id: 'v_left' } }, { VALUE: v(dist()) }), turnBy('right', 160),
    b('variables_set', { VAR: { id: 'v_right' } }, { VALUE: v(dist()) }),
    b('ev3_if_else', {}, { COND: v(b('ev3_op_and', {}, { A: v(op('ev3_op_gt', v(varGet('v_middle')), v(varGet('v_left')))), B: v(op('ev3_op_gt', v(varGet('v_middle')), v(varGet('v_right')))) })),
      DO: body([turnBy('left', 80)]),
      ELSE: body([b('ev3_if', {}, { COND: v(op('ev3_op_gt', v(varGet('v_left')), v(varGet('v_right')))), DO: body([turnBy('left', 160)]) })]) }),
    startDir('forward'), distWait(15), stopMove()])),
  'line-to-wall': withVars(vars('error'), blocks([start(), b('ev3_repeat_until', {}, { COND: v(b('ev3_distance_cmp', { PORT: '4', OP: '<', UNIT: 'cm' }, { VALUE: n(10) })), DO: body([
    b('variables_set', { VAR: { id: 'v_error' } }, { VALUE: v(reflectErr('3')) }),
    b('ev3_move_tank_start', {}, {
      LEFT: v(op('ev3_op_add', n(30), v(op('ev3_op_mul', n(0.6), v(varGet('v_error')))))),
      RIGHT: v(op('ev3_op_sub', n(30), v(op('ev3_op_mul', n(0.6), v(varGet('v_error')))))),
    }),
  ]) }), stopMove()])),
  'sensor-maze': prog(
    defProc('turn left', [], turnLeft(), 0),
    defProc('turn right', [], turnRight(), 300),
    [start(), b('ev3_repeat_until', {}, { COND: v(colorIs('green')), DO: body([
      startDir('forward'),
      waitTrue(b('ev3_op_or', {}, { A: v(b('ev3_distance_cmp', { PORT: '4', OP: '<', UNIT: 'cm' }, { VALUE: n(9) })), B: v(colorIs('green')) })),
      stopMove(),
      b('ev3_if', {}, { COND: v(not(colorIs('green'))), DO: body([
        callProc('turn left'),
        b('ev3_if', {}, { COND: v(b('ev3_distance_cmp', { PORT: '4', OP: '<', UNIT: 'cm' }, { VALUE: n(20) })), DO: body([callProc('turn right'), callProc('turn right')]) }),
      ]) }),
    ]) })]),
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


// ---------- Several solutions per challenge, from the simplest to the most advanced (teacher answer key) ----------
const rotF = (dir, r, unit = 'rotations') => b('ev3_move_dir_for', { DIR: dir, UNIT: unit }, { AMOUNT: n(r) });
const waitS = (s) => b('ev3_wait', {}, { SECS: n(s) });
const loopN = (k, arr) => b('ev3_repeat', {}, { TIMES: n(k), DO: body(arr) });
const untilDo = (c, arr) => b('ev3_repeat_until', {}, { COND: v(c), DO: body(arr) });
const forev = (arr) => b('ev3_forever', {}, { DO: body(arr) });
const ifT = (c, arr) => b('ev3_if', {}, { COND: v(c), DO: body(arr) });
const ifE = (c, a, e) => b('ev3_if_else', {}, { COND: v(c), DO: body(a), ELSE: body(e) });
const touchW = () => b('ev3_touch_wait', { PORT: '1', STATE: 'pressed' });
const colorW = (c) => b('ev3_color_wait', { PORT: '3', COLOR: c });
const reflW = (o, x) => b('ev3_reflect_wait', { PORT: '3', OP: o }, { VALUE: n(x) });
const tankS = (l, r) => b('ev3_move_tank_start', {}, { LEFT: n(l), RIGHT: n(r) });
const setVr = (id, value) => b('variables_set', { VAR: { id } }, { VALUE: value });
const chgV = (id) => b('math_change', { VAR: { id } }, { DELTA: n(1) });
const distLT = (x) => b('ev3_distance_cmp', { PORT: '4', OP: '<', UNIT: 'cm' }, { VALUE: n(x) });
const reflLT = (x) => op('ev3_op_lt', v(b('ev3_reflect', { PORT: '3' })), n(x));
const left90 = () => rotF('left', 193, 'degrees');
const right90 = () => rotF('right', 193, 'degrees');
const solEntry = (title, note, program) => ({ title, note, program });

const SOLUTION_SETS = {
  'first-steps': [
    solEntry('Simple: rotations', 'One wheel rotation ≈ 17.6 cm, so 70 cm ≈ 4 rotations.', prog([start(), rotF('forward', 4)])),
    solEntry('Exact: degrees', '70 cm ÷ 17.6 cm × 360° = 1432 motor degrees.', SOLUTIONS['first-steps']),
  ],
  square: [
    solEntry('Simple: one block per side', 'Forward 50 cm (2.84 rotations), quarter turn left (193 motor degrees), four times.', prog([start(), ...[1, 2, 3, 4].flatMap(() => [rotF('forward', 2.84), left90()])])),
    solEntry('With a loop', 'The same two blocks inside "repeat 4".', SOLUTIONS.square),
  ],
  garage: [
    solEntry('Simple: rotations', 'Forward about 105 cm, quarter turn left, forward about 65 cm (measure on the grid).', prog([start(), rotF('forward', 5.97), left90(), rotF('forward', 3.8)])),
    solEntry('Exact: degrees', 'The same path with distances converted to motor degrees.', SOLUTIONS.garage),
    solEntry('With the ultrasonic sensor', 'After the turn, drive until the back wall is 8 cm away: no need to measure the last distance.', prog([start(), rotF('forward', 5.97), left90(), startDir('forward'), distWait(8), stopMove()])),
  ],
  'touch-return': [
    solEntry('Simple: come back 4 rotations', 'Wait until the touch sensor is pressed, stop, then drive back about 70 cm.', prog([start(), startDir('forward'), touchW(), stopMove(), rotF('backward', 4)])),
    solEntry('With the timer', 'Measure the time to the wall, then drive back for the same time.', withVars(vars('t'), blocks([start(), b('ev3_timer_reset'), startDir('forward'), touchW(),
      setVr('v_t', v(b('ev3_timer'))), startDir('backward'), b('ev3_wait', {}, { SECS: v(varGet('v_t')) }), stopMove()]))),
    solEntry('Exact: motor position', 'Reset the motor position, then drive back exactly the degrees the motor turned.', SOLUTIONS['touch-return']),
  ],
  'stop-wall': [
    solEntry('Simple: wait until', 'Start moving, wait until the distance is less than 8 cm, stop.', SOLUTIONS['stop-wall']),
    solEntry('With a loop', 'Keep moving forward until the distance is less than 8 cm.', prog([start(), untilDo(distLT(8), [startDir('forward')]), stopMove()])),
  ],
  corridor: [
    solEntry('Simple: wait until, twice', 'Drive to the first wall, turn left, drive to the second wall.', SOLUTIONS.corridor),
    solEntry('With loops', 'The same idea with "repeat until distance < …".', prog([start(), untilDo(distLT(15), [startDir('forward')]), stopMove(), left90(), untilDo(distLT(10), [startDir('forward')]), stopMove()])),
  ],
  'stop-line': [
    solEntry('Simple: wait until black', 'Start moving, wait until the color is black, stop.', SOLUTIONS['stop-line']),
    solEntry('With reflected light', 'The line is dark: wait until the reflected light is less than 50.', prog([start(), startDir('forward'), reflW('<', 50), stopMove()])),
  ],
  'detect-color': [
    solEntry('Simple: wait until blue', 'Start moving, wait until the color is blue, stop.', prog([start(), startDir('forward'), colorW('blue'), stopMove()])),
    solEntry('Roll onto the zone', 'A short wait before "stop moving" puts the sensor well inside the blue zone.', SOLUTIONS['detect-color']),
    solEntry('With a loop', 'Keep moving forward until the color is blue.', prog([start(), untilDo(colorIs('blue'), [startDir('forward')]), stopMove()])),
  ],
  'line-follow': [
    solEntry('Simple: on / off', 'Forever: on the dark line turn one way, on white turn the other way. It passes with 90 % (the lap takes more than 30 s: no speed bonus).', prog([start(), forev([ifE(reflLT(50), [tankS(10, 40)], [tankS(40, 10)])])])),
    solEntry('Smoother: proportional', 'The turn is proportional to the error (reflected light − 52): faster and smoother.', SOLUTIONS['line-follow']),
  ],
  'count-lines': [
    solEntry('Simple: without a variable', 'Three times: wait until black, then until white. Then wait until black (the 4th line) and stop.', prog([start(), startDir('forward'),
      loopN(3, [colorW('black'), colorW('white')]), colorW('black'), stopMove()])),
    solEntry('With a variable', 'Add 1 at each line (and wait for white after it) until the variable is 4.', SOLUTIONS['count-lines']),
    solEntry('With an event', '"when color is black" adds 1 in another stack; the main stack waits until the variable is 4.', withVars(vars('lines'), blocks([start(), setVr('v_lines', tx(0)), startDir('forward'),
      waitTrue(op('ev3_op_eq', v(varGet('v_lines')), n(4))), stopMove()], [b('ev3_when_color', { PORT: '3', COLOR: 'black' }), chgV('v_lines')]))),
  ],
  'color-route': [
    solEntry('Simple: two "if"', 'Drive onto the card, then one "if" for red (left) and one for blue (right).', prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), stopMove(),
      ifT(colorIs('red'), [left90(), rotF('forward', 3.1)]), ifT(colorIs('blue'), [right90(), rotF('forward', 3.1)])])),
    solEntry('With if / else', 'Red → turn left, otherwise → turn right.', SOLUTIONS['color-route']),
  ],
  'line-wall': [
    solEntry('Simple: wait until, twice', 'Drive to the black line, turn right, drive until the wall is 10 cm away.', SOLUTIONS['line-wall']),
    solEntry('With loops', 'The same idea with "repeat until".', prog([start(), untilDo(colorIs('black'), [startDir('forward')]), stopMove(), right90(), untilDo(distLT(10), [startDir('forward')]), stopMove()])),
  ],
  bounce: [
    solEntry('Simple: stop between each move', 'Repeat 3: forward until pressed, stop, back until blue, stop.', prog([start(), loopN(3, [startDir('forward'), touchW(), stopMove(), startDir('backward'), colorW('blue'), stopMove()])])),
    solEntry('Without stopping', 'Change direction directly: smoother and faster.', SOLUTIONS.bounce),
  ],
  maze: [
    solEntry('Simple: one block per move', 'Measure each straight on the grid, quarter turns of 193 motor degrees.', prog([start(), rotF('forward', 5.09), right90(), rotF('forward', 2.56), right90(), rotF('forward', 5.11), left90(),
      rotF('forward', 2.56), left90(), rotF('forward', 5.11), right90(), rotF('forward', 2.6)])),
    solEntry('With My Blocks', '"right", "left" and "forward (cm)" blocks make the path easy to read and change.', SOLUTIONS.maze),
  ],
  'card-lines': [
    solEntry('Simple: stop on the card to read it', 'Stop on the card, set the number with one "if" per color, then count the lines until the number.', withVars(vars('number', 'count'), blocks([start(), setVr('v_count', tx(0)),
      startDir('forward'), waitTrue(not(colorIs('white'))), rotF('forward', 0.15), stopMove(),
      ...[['red', 2], ['green', 3], ['blue', 4], ['yellow', 5]].map(([c, k]) => ifT(colorIs(c), [setVr('v_number', tx(k))])),
      startDir('forward'), untilDo(op('ev3_op_eq', v(varGet('v_count')), v(varGet('v_number'))), [colorW('black'), chgV('v_count'),
        ifT(not(op('ev3_op_eq', v(varGet('v_count')), v(varGet('v_number')))), [colorW('white')])]), stopMove()]))),
    solEntry('Reading while driving', 'The same without stopping: read the card on the way.', SOLUTIONS['card-lines']),
  ],
  'color-memory': [
    solEntry('Remember the first color', 'Keep the color of the first square in a variable, then wait until the sensor sees a color that is not white and not that one.', SOLUTIONS['color-memory']),
    solEntry('With a loop and "if"', 'The same comparison inside a loop: when the color is different from the first one, a second variable says "found".', withVars(vars('first', 'found'), blocks([start(), setVr('v_found', tx(0)),
      startDir('forward'), waitTrue(not(colorIs('white'))), waitS(0.08), setVr('v_first', v(b('ev3_color', { PORT: '3' }))), colorW('white'),
      untilDo(op('ev3_op_eq', v(varGet('v_found')), n(1)), [ifT(b('ev3_op_and', {}, { A: v(not(colorIs('white'))), B: v(not(op('ev3_op_eq', v(b('ev3_color', { PORT: '3' })), v(varGet('v_first'))))) }), [setVr('v_found', tx(1))])]),
      stopMove()]))),
  ],
  'open-gate': [
    solEntry('Simple: check one direction after the other', 'Middle open (distance > 100)? Go. Otherwise turn left and look; otherwise turn right.', prog([start(),
      ifE(b('ev3_distance_cmp', { PORT: '4', OP: '>', UNIT: 'cm' }, { VALUE: n(100) }), [], [turnBy('left', 80),
        ifE(b('ev3_distance_cmp', { PORT: '4', OP: '>', UNIT: 'cm' }, { VALUE: n(110) }), [], [turnBy('right', 160)])]),
      startDir('forward'), distWait(15), stopMove()])),
    solEntry('Compare the three distances', 'Measure the 3 directions, keep them in variables, go where it is the largest.', SOLUTIONS['open-gate']),
  ],
  'line-to-wall': [
    solEntry('Simple: on / off', 'Repeat until the wall is 10 cm away: on the line turn one way, on white the other way.', prog([start(), untilDo(distLT(10), [ifE(reflLT(50), [tankS(15, 40)], [tankS(40, 15)])]), stopMove()])),
    solEntry('Smoother: proportional', 'The turn is proportional to the error (reflected light − 52).', SOLUTIONS['line-to-wall']),
  ],
  'sensor-maze': [
    solEntry('Without My Blocks', 'Repeat until green: drive to the wall, turn left, if it is closed turn around to the right.', prog([start(), untilDo(colorIs('green'), [
      startDir('forward'), waitTrue(b('ev3_op_or', {}, { A: v(distLT(9)), B: v(colorIs('green')) })), stopMove(),
      ifT(not(colorIs('green')), [left90(), ifT(distLT(20), [right90(), right90()])])])])),
    solEntry('With My Blocks', '"turn left" and "turn right" blocks keep the program short and readable.', SOLUTIONS['sensor-maze']),
  ],
};
