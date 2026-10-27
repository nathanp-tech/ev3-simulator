// Several student-style solutions per challenge: each must pass the official check (≥ pass score)
// and stay robust on many random practice seeds. Run tests/variants.html through server.py.
'use strict';

const steer = (s) => ({ shadow: { type: 'ev3_steering', fields: { STEER: String(s) } } });
const moveFor = (dir, amount, unit = 'rotations') => b('ev3_move_dir_for', { DIR: dir, UNIT: unit }, { AMOUNT: n(amount) });
const tankFor = (amount, unit, l, r) => b('ev3_move_tank_for', { UNIT: unit }, { AMOUNT: n(amount), LEFT: n(l), RIGHT: n(r) });
const steerFor = (s, amount, unit) => b('ev3_move_steer_for', { UNIT: unit }, { STEER: steer(s), AMOUNT: n(amount) });
const steerStart = (s, sp) => b('ev3_move_steer_start', {}, { STEER: steer(s), SPEED: n(sp) });
const tankStart = (l, r) => b('ev3_move_tank_start', {}, { LEFT: n(l), RIGHT: n(r) });
const motorFor = (port, dir, amount, unit) => b('ev3_motor_run_for', { PORT: port, DIR: dir, UNIT: unit }, { AMOUNT: n(amount) });
const wait = (s) => b('ev3_wait', {}, { SECS: n(s) });
const repeat = (k, arr) => b('ev3_repeat', {}, { TIMES: n(k), DO: body(arr) });
const repeatUntil = (c, arr) => b('ev3_repeat_until', {}, { COND: v(c), DO: body(arr) });
const forever = (arr) => b('ev3_forever', {}, { DO: body(arr) });
const ifThen = (c, arr) => b('ev3_if', {}, { COND: v(c), DO: body(arr) });
const ifElse = (c, a, e) => b('ev3_if_else', {}, { COND: v(c), DO: body(a), ELSE: body(e) });
const touchIs = (port = '1') => b('ev3_touch_is', { PORT: port, STATE: 'pressed' });
const bumpWait = (state = 'pressed') => b('ev3_touch_wait', { PORT: '1', STATE: state });
const colorWait = (c) => b('ev3_color_wait', { PORT: '3', COLOR: c });
const reflect = () => b('ev3_reflect', { PORT: '3' });
const reflectWait = (o, x) => b('ev3_reflect_wait', { PORT: '3', OP: o }, { VALUE: n(x) });
const distCmp = (o, x) => b('ev3_distance_cmp', { PORT: '4', OP: o, UNIT: 'cm' }, { VALUE: n(x) });
const distance = () => b('ev3_distance', { PORT: '4', UNIT: 'cm' });
const lt = (A, B) => op('ev3_op_lt', A, B);
const gt = (A, B) => op('ev3_op_gt', A, B);
const or = (A, B) => b('ev3_op_or', {}, { A: v(A), B: v(B) });
const setVar = (id, value) => b('variables_set', { VAR: { id } }, { VALUE: value });
const changeVar = (id, d = 1) => b('math_change', { VAR: { id } }, { DELTA: n(d) });
const gyroAngle = () => b('ev3_angle', { PORT: '2' });
const gyroReset = () => b('ev3_angle_reset', { PORT: '2' });
const angleWait = (o, x) => b('ev3_angle_wait', { PORT: '2', OP: o }, { VALUE: n(x) });
const timer = () => b('ev3_timer');
const timerReset = () => b('ev3_timer_reset');
const writeText = (t) => b('ev3_display_text_line', {}, { TEXT: tx(t), LINE: n(1) });
const motorPos = (p) => b('ev3_motor_position', { PORT: p });
// Gyro turns (the classic robot keeps its gyro on port 2)
const gyroLeft = (a = 90) => [gyroReset(), startDir('left'), angleWait('<', -a + 2), stopMove()];
const gyroRight = (a = 90) => [gyroReset(), startDir('right'), angleWait('>', a - 2), stopMove()];
const RQ = 12 / 4 / 5.6; // rotations of a wheel for a quarter turn on the spot (≈ 0.536)

const V = {
  'first-steps': {
    '✗ 3 rotations': prog([start(), moveFor('forward', 3)]),
    '4 rotations': prog([start(), moveFor('forward', 4)]),
    '3.98 rotations (70/17.6)': prog([start(), moveFor('forward', 3.98)]),
    '1432 degrees': prog([start(), moveFor('forward', 1432, 'degrees')]),
    'tank 50 50 for 4 rotations': prog([start(), tankFor(4, 'rotations', 50, 50)]),
    'steer 0 for 4 rotations': prog([start(), steerFor(0, 4, 'rotations')]),
    'speed 100 %, 4 rotations': prog([start(), speed(100), moveFor('forward', 4)]),
    'speed 20 %, 4 rotations': prog([start(), speed(20), moveFor('forward', 4)]),
    'start + wait 2.73 s + stop': prog([start(), startDir('forward'), wait(2.73), stopMove()]),
    'move for 2.73 seconds': prog([start(), moveFor('forward', 2.73, 'seconds')]),
    'motor B+C 4 rotations': prog([start(), motorFor('B+C', 'cw', 4, 'rotations')]),
  },
  square: {
    'repeat 4: 2.84 rot + left 190°': prog([start(), repeat(4, [moveFor('forward', 2.84), moveFor('left', 190, 'degrees')])]),
    'repeat 4: 1023° + left 189°': prog([start(), repeat(4, [moveFor('forward', 1023, 'degrees'), moveFor('left', 189, 'degrees')])]),
    'repeat 4: tank -50 50 for 0.53 rot': prog([start(), repeat(4, [moveFor('forward', 2.84), tankFor(0.53, 'rotations', -50, 50)])]),
    'repeat 4: steer -100 for 190°': prog([start(), repeat(4, [moveFor('forward', 2.84), steerFor(-100, 190, 'degrees')])]),
    'repeat 4: gyro turn': prog([start(), repeat(4, [moveFor('forward', 2.84), ...gyroLeft()])]),
    'unrolled, speed 30': prog([start(), speed(30), ...[1, 2, 3, 4].flatMap(() => [moveFor('forward', 2.84), moveFor('left', 190, 'degrees')])]),
    'speed 80 %': prog([start(), speed(80), repeat(4, [moveFor('forward', 2.84), moveFor('left', 190, 'degrees')])]),
  },
  garage: {
    '5.97 rot, left 190°, 3.8 rot': prog([start(), moveFor('forward', 5.97), moveFor('left', 190, 'degrees'), moveFor('forward', 3.8)]),
    'degrees, speed 30': prog([start(), speed(30), moveFor('forward', 2150, 'degrees'), moveFor('left', 189, 'degrees'), moveFor('forward', 1370, 'degrees')]),
    'tank turn': prog([start(), moveFor('forward', 6), tankFor(RQ, 'rotations', -50, 50), moveFor('forward', 3.7)]),
    'gyro turn': prog([start(), moveFor('forward', 5.97), ...gyroLeft(), moveFor('forward', 3.8)]),
    'drive to the back wall (ultrasonic)': prog([start(), moveFor('forward', 5.97), moveFor('left', 190, 'degrees'), startDir('forward'), distWait(8), stopMove()]),
    'drive until touch, back off': prog([start(), moveFor('forward', 5.97), moveFor('left', 190, 'degrees'), startDir('forward'), bumpWait(), stopMove(), moveFor('backward', 0.3)]),
  },
  'touch-return': {
    'touch, stop, back 4 rotations': prog([start(), startDir('forward'), bumpWait(), stopMove(), moveFor('backward', 4)]),
    'back 3.8 rotations right away (no stop)': prog([start(), startDir('forward'), bumpWait(), moveFor('backward', 3.8)]),
    'back 1380 degrees': prog([start(), startDir('forward'), bumpWait(), stopMove(), moveFor('backward', 1380, 'degrees')]),
    'back for 2.6 seconds': prog([start(), startDir('forward'), bumpWait(), stopMove(), moveFor('backward', 2.6, 'seconds')]),
    'speed 30, back 4.5 rotations': prog([start(), speed(30), startDir('forward'), bumpWait(), stopMove(), moveFor('backward', 4.5)]),
    '✗ touches the wall but does not come back': prog([start(), startDir('forward'), bumpWait(), stopMove()]),
    '✗ comes back too little (1 rotation)': prog([start(), startDir('forward'), bumpWait(), stopMove(), moveFor('backward', 1)]),
    '✗ drives a fixed distance without the touch sensor (stops short)': prog([start(), moveFor('forward', 3), moveFor('backward', 3)]),
    '✗ exact distance without the touch sensor': prog([start(), moveFor('forward', 3.84), moveFor('backward', 3.84)]),
    '✗ drives into the wall by distance, no touch block': prog([start(), moveFor('forward', 4), moveFor('backward', 4)]),
    'reference (motor B position)': SOLUTIONS['touch-return'],
    'motor C position, no reset': prog([start(), startDir('forward'), bumpWait(), stopMove(), b('ev3_move_dir_for', { DIR: 'backward', UNIT: 'degrees' }, { AMOUNT: v(motorPos('C')) })]),
    'timer: go back for the same time': withVars(vars('t'), blocks([start(), timerReset(), startDir('forward'), bumpWait(), setVar('v_t', v(timer())), startDir('backward'),
      b('ev3_wait', {}, { SECS: v(varGet('v_t')) }), stopMove()])),
    'go back to motor position 0': prog([start(), b('ev3_motor_set_pos', { PORT: 'B' }, { POS: n(0) }), b('ev3_motor_set_pos', { PORT: 'C' }, { POS: n(0) }), startDir('forward'), bumpWait(), stopMove(),
      startDir('backward'), waitTrue(lt(v(motorPos('B')), n(20))), stopMove()]),
    'speed 30, backward until position < 0': prog([start(), speed(30), b('ev3_motor_set_pos', { PORT: 'B' }, { POS: n(0) }), startDir('forward'), bumpWait(), stopMove(),
      startDir('backward'), waitTrue(lt(v(motorPos('B')), n(0))), stopMove()]),
    'repeat until touch: 1 cm steps, count': withVars(vars('k'), blocks([start(), setVar('v_k', tx(0)), repeatUntil(touchIs(), [moveFor('forward', 20, 'degrees'), changeVar('v_k')]),
      b('ev3_repeat', {}, { TIMES: v(varGet('v_k')), DO: body([moveFor('backward', 20, 'degrees')]) })])),
  },
  'stop-wall': {
    'reference (< 8 cm)': SOLUTIONS['stop-wall'],
    'wait < 10 cm': prog([start(), startDir('forward'), distWait(10), stopMove()]),
    'wait < 5 cm': prog([start(), startDir('forward'), distWait(5), stopMove()]),
    'speed 100, < 10 cm': prog([start(), speed(100), startDir('forward'), distWait(10), stopMove()]),
    'repeat until dist < 8: move forward': prog([start(), repeatUntil(distCmp('<', 8), [startDir('forward')]), stopMove()]),
    'repeat until: 1 cm steps': prog([start(), repeatUntil(distCmp('<', 10), [moveFor('forward', 20, 'degrees')])]),
    'forever + if + stop program': prog([start(), forever([ifElse(distCmp('<', 8), [stopMove(), b('ev3_stop', { WHAT: 'exit' })], [startDir('forward')])])]),
    'steer start at 30 %, wait_until(distance < 7)': prog([start(), steerStart(0, 30), waitTrue(lt(v(distance()), n(7))), stopMove()]),
    'proportional: speed = distance - 5': prog([start(), repeatUntil(distCmp('<', 7), [b('ev3_move_steer_start', {}, { STEER: steer(0), SPEED: v(op('ev3_op_sub', v(distance()), n(5))) })]), stopMove()]),
  },
  corridor: {
    'reference': SOLUTIONS.corridor,
    'wait < 20 then < 8': prog([start(), startDir('forward'), distWait(20), stopMove(), ...turnLeft(), startDir('forward'), distWait(8), stopMove()]),
    'tank turn': prog([start(), startDir('forward'), distWait(15), stopMove(), tankFor(RQ, 'rotations', -50, 50), startDir('forward'), distWait(10), stopMove()]),
    'gyro turn': prog([start(), startDir('forward'), distWait(15), stopMove(), ...gyroLeft(), startDir('forward'), distWait(10), stopMove()]),
    'steer -100 turn, speed 30': prog([start(), speed(30), startDir('forward'), distWait(12), stopMove(), steerFor(-100, 190, 'degrees'), startDir('forward'), distWait(10), stopMove()]),
    'repeat 2 (same code twice)': prog([start(), repeat(2, [startDir('forward'), distWait(12), stopMove(), moveFor('left', 190, 'degrees')]), moveFor('right', 190, 'degrees')]),
  },
  'stop-line': {
    'reference': SOLUTIONS['stop-line'],
    'wait reflected < 20': prog([start(), startDir('forward'), reflectWait('<', 20), stopMove()]),
    'wait reflected < 50': prog([start(), startDir('forward'), reflectWait('<', 50), stopMove()]),
    'repeat until black': prog([start(), repeatUntil(colorIs('black'), [startDir('forward')]), stopMove()]),
    'speed 30': prog([start(), speed(30), startDir('forward'), colorWait('black'), stopMove()]),
    'speed 100': prog([start(), speed(100), startDir('forward'), colorWait('black'), stopMove()]),
    'steer start 40 %': prog([start(), steerStart(0, 40), colorWait('black'), stopMove()]),
    '✗ black, then 5 cm too far': prog([start(), startDir('forward'), colorWait('black'), stopMove(), moveFor('forward', 0.3)]),
    '✗ white→black edge 2 cm early': prog([start(), startDir('forward'), reflectWait('<', 80), stopMove(), moveFor('backward', 0.12)]),
    'wait reflected < 60, speed 100': prog([start(), speed(100), startDir('forward'), reflectWait('<', 60), stopMove()]),
    'wait reflected < 50, speed 20': prog([start(), speed(20), startDir('forward'), reflectWait('<', 50), stopMove()]),
    'event: when color is black → stop': prog([start(), startDir('forward'), wait(15)], [b('ev3_when_color', { PORT: '3', COLOR: 'black' }), stopMove(), b('ev3_stop', { WHAT: 'exit' })]),
  },
  'detect-color': {
    'reference': SOLUTIONS['detect-color'],
    'stop right away (no extra wait)': prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), stopMove(), write(b('ev3_color', { PORT: '3' }))]),
    'reflected < 85, then write color': prog([start(), startDir('forward'), reflectWait('<', 85), wait(0.2), stopMove(), write(b('ev3_color', { PORT: '3' }))]),
    'if chain writing the names': prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), moveFor('forward', 0.2), stopMove(),
      ifThen(colorIs('red'), [writeText('red')]), ifThen(colorIs('green'), [writeText('green')]), ifThen(colorIs('blue'), [writeText('blue')]), ifThen(colorIs('yellow'), [writeText('yellow')])]),
    'wait until red or green or blue or yellow': prog([start(), startDir('forward'), waitTrue(or(or(colorIs('red'), colorIs('green')), or(colorIs('blue'), colorIs('yellow')))), wait(0.2), stopMove(),
      b('ev3_display_text_xy', {}, { TEXT: v(b('ev3_color', { PORT: '3' })), X: n(10), Y: n(50) })]),
    'speed 100, repeat until not white': prog([start(), speed(100), repeatUntil(not(colorIs('white')), [startDir('forward')]), stopMove(), write(b('ev3_color', { PORT: '3' }))]),
    'write "Color: " + color': prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), wait(0.3), stopMove(), write(op('ev3_op_join', tx('Color: '), v(b('ev3_color', { PORT: '3' }))))]),
    'speed 20': prog([start(), speed(20), startDir('forward'), waitTrue(not(colorIs('white'))), stopMove(), write(b('ev3_color', { PORT: '3' }))]),
    '✗ reflected < 90, stop at the very edge, if chain': prog([start(), startDir('forward'), reflectWait('<', 90), stopMove(),
      ifThen(colorIs('red'), [writeText('red')]), ifThen(colorIs('green'), [writeText('green')]), ifThen(colorIs('blue'), [writeText('blue')]), ifThen(colorIs('yellow'), [writeText('yellow')])]),
  },
  'line-follow': {
    'reference (proportional)': SOLUTIONS['line-follow'],
    'hint: if reflect < 50 tank 10/40 else 40/10': prog([start(), forever([ifElse(lt(v(reflect()), n(50)), [tankStart(10, 40)], [tankStart(40, 10)])])]),
    'if color is black tank 10/40 else 40/10': prog([start(), forever([ifElse(colorIs('black'), [tankStart(10, 40)], [tankStart(40, 10)])])]),
    'steer -30 / 30 at 30 %': prog([start(), forever([ifElse(lt(v(reflect()), n(50)), [steerStart(-30, 30)], [steerStart(30, 30)])])]),
    'bang-bang fast 20/60': prog([start(), forever([ifElse(lt(v(reflect()), n(50)), [tankStart(20, 60)], [tankStart(60, 20)])])]),
    'proportional, gain 0.4, speed 25': withVars(vars('e'), blocks([start(), forever([setVar('v_e', v(reflectErr('3'))),
      b('ev3_move_tank_start', {}, { LEFT: v(op('ev3_op_add', n(25), v(op('ev3_op_mul', n(0.4), v(varGet('v_e')))))), RIGHT: v(op('ev3_op_sub', n(25), v(op('ev3_op_mul', n(0.4), v(varGet('v_e')))))) })])])),
    'repeat until timer > 40 (not forever)': prog([start(), timerReset(), repeatUntil(gt(v(timer()), n(40)), [ifElse(lt(v(reflect()), n(50)), [tankStart(10, 40)], [tankStart(40, 10)])]), stopMove()]),
  },
  'count-lines': {
    'reference': SOLUTIONS['count-lines'],
    'wait until white after each line': withVars(vars('n'), blocks([start(), setVar('v_n', tx(0)), startDir('forward'),
      repeatUntil(colorIs('red'), [ifThen(colorIs('black'), [changeVar('v_n'), colorWait('white')])]), stopMove(), write(varGet('v_n'))])),
    'event hat: when color is black → +1': withVars(vars('n'), blocks([start(), setVar('v_n', tx(0)), startDir('forward'), colorWait('red'), wait(0.2), stopMove(), write(varGet('v_n'))],
      [b('ev3_when_color', { PORT: '3', COLOR: 'black' }), changeVar('v_n')])),
    'reflected light < 30 / > 60': withVars(vars('n'), blocks([start(), setVar('v_n', tx(0)), startDir('forward'),
      repeatUntil(colorIs('red'), [ifThen(lt(v(reflect()), n(30)), [changeVar('v_n'), waitTrue(gt(v(reflect()), n(60)))])]), stopMove(), write(varGet('v_n'))])),
    'speed 100': withVars(vars('n'), blocks([start(), speed(100), setVar('v_n', tx(0)), startDir('forward'),
      repeatUntil(colorIs('red'), [ifThen(colorIs('black'), [changeVar('v_n'), waitTrue(not(colorIs('black')))])]), stopMove(), write(varGet('v_n'))])),
    'speed 25, stop immediately': withVars(vars('n'), blocks([start(), speed(25), setVar('v_n', tx(0)), startDir('forward'),
      repeatUntil(colorIs('red'), [ifThen(colorIs('black'), [changeVar('v_n'), waitTrue(not(colorIs('black')))])]), stopMove(), write(varGet('v_n'))])),
    'list of lines (length)': withVars(listVars('seen'), blocks([start(), startDir('forward'),
      repeatUntil(colorIs('red'), [ifThen(colorIs('black'), [b('ev3_list_add', { LIST: { id: 'l_seen' } }, { ITEM: tx('x') }), colorWait('white')])]), stopMove(),
      write(b('ev3_list_length', { LIST: { id: 'l_seen' } }))])),
  },
  'color-route': {
    'reference': SOLUTIONS['color-route'],
    'wait red or blue': prog([start(), startDir('forward'), waitTrue(or(colorIs('red'), colorIs('blue'))), stopMove(),
      ifElse(colorIs('red'), [moveFor('left', 190, 'degrees'), moveFor('forward', 3.1)], [moveFor('right', 190, 'degrees'), moveFor('forward', 3.1)])]),
    'reflected < 70, test blue': prog([start(), startDir('forward'), reflectWait('<', 70), wait(0.1), stopMove(),
      ifElse(colorIs('blue'), [moveFor('right', 190, 'degrees'), moveFor('forward', 3)], [moveFor('left', 190, 'degrees'), moveFor('forward', 3)])]),
    'two ifs, gyro turns': prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), stopMove(),
      ifThen(colorIs('red'), [...gyroLeft(), moveFor('forward', 3)]), ifThen(colorIs('blue'), [...gyroRight(), moveFor('forward', 3)])]),
    'fixed distance to the card (2 rot)': prog([start(), moveFor('forward', 2), ifElse(colorIs('red'), [moveFor('left', 190, 'degrees'), moveFor('forward', 3)], [moveFor('right', 190, 'degrees'), moveFor('forward', 3)])]),
    'steer ±100 turns, speed 30': prog([start(), speed(30), startDir('forward'), waitTrue(not(colorIs('white'))), stopMove(),
      ifElse(colorIs('red'), [steerFor(-100, 190, 'degrees'), moveFor('forward', 3)], [steerFor(100, 190, 'degrees'), moveFor('forward', 3)])]),
  },
  'line-wall': {
    'reference': SOLUTIONS['line-wall'],
    'reflected < 30, wall < 8': prog([start(), startDir('forward'), reflectWait('<', 30), stopMove(), moveFor('right', 190, 'degrees'), startDir('forward'), distWait(8), stopMove()]),
    'gyro turn': prog([start(), startDir('forward'), colorWait('black'), stopMove(), ...gyroRight(), startDir('forward'), distWait(10), stopMove()]),
    'tank turn, speed 30': prog([start(), speed(30), startDir('forward'), colorWait('black'), stopMove(), tankFor(RQ, 'rotations', 50, -50), startDir('forward'), distWait(12), stopMove()]),
    'repeat-until loops': prog([start(), repeatUntil(colorIs('black'), [startDir('forward')]), stopMove(), moveFor('right', 190, 'degrees'), repeatUntil(distCmp('<', 10), [startDir('forward')]), stopMove()]),
    'speed 100': prog([start(), speed(100), startDir('forward'), colorWait('black'), stopMove(), moveFor('right', 190, 'degrees'), startDir('forward'), distWait(10), stopMove()]),
  },
  bounce: {
    'reference': SOLUTIONS.bounce,
    'repeat-until loops inside repeat 3': prog([start(), repeat(3, [repeatUntil(touchIs(), [startDir('forward')]), repeatUntil(colorIs('blue'), [startDir('backward')])]), stopMove()]),
    'stop between each move': prog([start(), repeat(3, [startDir('forward'), bumpWait(), stopMove(), startDir('backward'), colorWait('blue'), stopMove()])]),
    'speed 100': prog([start(), speed(100), repeat(3, [startDir('forward'), bumpWait(), startDir('backward'), colorWait('blue')]), stopMove()]),
    'speed 30, tank': prog([start(), repeat(3, [tankStart(30, 30), bumpWait(), tankStart(-30, -30), colorWait('blue')]), stopMove()]),
    'back until reflected < 50': prog([start(), repeat(3, [startDir('forward'), bumpWait(), startDir('backward'), reflectWait('<', 50)]), stopMove()]),
    'counter variable': withVars(vars('hits'), blocks([start(), setVar('v_hits', tx(0)), repeatUntil(op('ev3_op_eq', v(varGet('v_hits')), n(3)),
      [startDir('forward'), bumpWait(), changeVar('v_hits'), startDir('backward'), colorWait('blue')]), stopMove()])),
  },
  maze: {
    'reference (My Blocks)': SOLUTIONS.maze,
    'plain blocks, rotations': prog([start(), moveFor('forward', 5.09), moveFor('right', 190, 'degrees'), moveFor('forward', 2.56), moveFor('right', 190, 'degrees'),
      moveFor('forward', 5.11), moveFor('left', 190, 'degrees'), moveFor('forward', 2.56), moveFor('left', 190, 'degrees'), moveFor('forward', 5.11), moveFor('right', 190, 'degrees'), moveFor('forward', 2.6)]),
    'gyro turns': prog([start(), moveFor('forward', 5.09), ...gyroRight(), moveFor('forward', 2.56), ...gyroRight(),
      moveFor('forward', 5.11), ...gyroLeft(), moveFor('forward', 2.56), ...gyroLeft(), moveFor('forward', 5.11), ...gyroRight(), moveFor('forward', 2.6)]),
    'ultrasonic: drive to each wall': prog([start(),
      startDir('forward'), distWait(14), stopMove(), moveFor('right', 190, 'degrees'), moveFor('forward', 2.56), moveFor('right', 190, 'degrees'),
      startDir('forward'), distWait(23), stopMove(), moveFor('left', 190, 'degrees'), moveFor('forward', 2.56), moveFor('left', 190, 'degrees'),
      startDir('forward'), distWait(14), stopMove(), moveFor('right', 190, 'degrees'), moveFor('forward', 2.6)]),
    'speed 100': prog([start(), speed(100), moveFor('forward', 5.09), moveFor('right', 190, 'degrees'), moveFor('forward', 2.56), moveFor('right', 190, 'degrees'),
      moveFor('forward', 5.11), moveFor('left', 190, 'degrees'), moveFor('forward', 2.56), moveFor('left', 190, 'degrees'), moveFor('forward', 5.11), moveFor('right', 190, 'degrees'), moveFor('forward', 2.6)]),
  },
};
// Open-loop turns: how far from the exact quarter turn (192.9 motor degrees) may a student be?
const MAZE_PATH = (turn, extra = []) => prog([start(), ...extra, moveFor('forward', 5.09), moveFor('right', turn, 'degrees'), moveFor('forward', 2.56), moveFor('right', turn, 'degrees'),
  moveFor('forward', 5.11), moveFor('left', turn, 'degrees'), moveFor('forward', 2.56), moveFor('left', turn, 'degrees'), moveFor('forward', 5.11), moveFor('right', turn, 'degrees'), moveFor('forward', 2.6)]);
if (new URLSearchParams(location.search).get('sweep')) {
  for (const k of Object.keys(V)) V[k] = {};
  for (const deg of [184, 186, 188, 190, 192, 193, 194, 196, 198]) {
    V.square[`turn ${deg}°`] = prog([start(), repeat(4, [moveFor('forward', 2.84), moveFor('left', deg, 'degrees')])]);
    V.square[`turn ${deg}°, speed 100`] = prog([start(), speed(100), repeat(4, [moveFor('forward', 2.84), moveFor('left', deg, 'degrees')])]);
    V.garage[`turn ${deg}°`] = prog([start(), moveFor('forward', 5.97), moveFor('left', deg, 'degrees'), moveFor('forward', 3.8)]);
    V.maze[`turn ${deg}°`] = MAZE_PATH(deg);
    V.maze[`turn ${deg}°, speed 100`] = MAZE_PATH(deg, [speed(100)]);
  }
}
// Wrong solutions found by testing (hard-coded layouts, skipped tasks, ramming): they must never pass.
const BACK_COLOR = { sensors: { ...DEFAULT_CONFIG.sensors, 3: { type: 'color', mount: 'back' } }, motors: DEFAULT_CONFIG.motors };
const BACK_TOUCH = { sensors: { ...DEFAULT_CONFIG.sensors, 1: { type: 'touch', mount: 'back' } }, motors: DEFAULT_CONFIG.motors };
Object.assign(V['count-lines'], Object.fromEntries([2, 4, 5, 6].map((k) => [`✗ no sensor: forward 220 cm, write ${k}`, prog([start(), moveFor('forward', 12.5), writeText(k)])])));
Object.assign(V['count-lines'], { '✗ drive until red, write 4': prog([start(), startDir('forward'), colorWait('red'), stopMove(), writeText(4)]) });
Object.assign(V['detect-color'], Object.fromEntries(['red', 'green', 'blue', 'yellow'].map((c) => [`✗ no sensor: forward 70 cm, write ${c}`, prog([start(), moveFor('forward', 4), writeText(c)])])));
V['detect-color']['write "Measured: " + color'] = prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), wait(0.3), stopMove(), write(op('ev3_op_join', tx('Measured: '), v(b('ev3_color', { PORT: '3' }))))]);
V['detect-color']['write "Colored zone is " + color'] = prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), wait(0.3), stopMove(), write(op('ev3_op_join', tx('Colored zone is '), v(b('ev3_color', { PORT: '3' }))))]);
V.corridor['✗ no sensor: forward 100 cm, left, forward 72 cm'] = prog([start(), moveFor('forward', 5.68), moveFor('left', 193, 'degrees'), moveFor('forward', 4.09)]);
V.corridor['✗ turn left at the start, then to the wall'] = prog([start(), moveFor('left', 193, 'degrees'), startDir('forward'), distWait(10), stopMove()]);
V.corridor['✗ forward 20 cm, turn left, then to the wall'] = prog([start(), moveFor('forward', 1.14), moveFor('left', 193, 'degrees'), startDir('forward'), distWait(10), stopMove()]);
V['line-wall']['✗ no sensor: forward 70 cm, right, forward 69 cm'] = prog([start(), moveFor('forward', 3.98), moveFor('right', 193, 'degrees'), moveFor('forward', 3.92)]);
V['line-wall']['✗ forward 70 cm, right, to the wall'] = prog([start(), moveFor('forward', 3.98), moveFor('right', 193, 'degrees'), startDir('forward'), distWait(10), stopMove()]);
V['line-wall']['color sensor at the back'] = { prog: prog([start(), startDir('forward'), colorWait('black'), stopMove(), moveFor('right', 193, 'degrees'), startDir('forward'), distWait(10), stopMove()]), config: BACK_COLOR };
V['color-route']['✗ always the blue route'] = prog([start(), startDir('forward'), waitTrue(not(colorIs('white'))), stopMove(), moveFor('right', 193, 'degrees'), moveFor('forward', 3)]);
V['touch-return']['✗ turn around, touch the table border'] = prog([start(), moveFor('left', 386, 'degrees'), startDir('forward'), bumpWait(), stopMove()]);
V['touch-return']['✗ ram the wall without the touch sensor'] = prog([start(), moveFor('forward', 7, 'seconds'), moveFor('backward', 9, 'seconds'), moveFor('forward', 0.34)]);
V['touch-return']['✗ touch sensor at the back, reverse to the border'] = { prog: prog([start(), startDir('backward'), bumpWait(), stopMove(), moveFor('forward', 0.3)]), config: BACK_TOUCH };
V['touch-return']['touch sensor at the back: turn around first'] = { prog: prog([start(), moveFor('left', 386, 'degrees'), b('ev3_motor_set_pos', { PORT: 'B' }, { POS: n(0) }), startDir('backward'), bumpWait(), stopMove(),
  b('ev3_move_dir_for', { DIR: 'forward', UNIT: 'degrees' }, { AMOUNT: v(op('ev3_op_sub', n(0), v(motorPos('B')))) })]), config: BACK_TOUCH };
V.bounce['✗ three taps in one trip'] = prog([start(), startDir('forward'), bumpWait(), repeat(2, [moveFor('backward', 0.2), startDir('forward'), bumpWait()]), startDir('backward'), colorWait('blue'), stopMove()]);
V.bounce['✗ ram the wall 3 times (no touch block)'] = prog([start(), repeat(3, [moveFor('forward', 6, 'seconds'), startDir('backward'), colorWait('blue')]), stopMove()]);
V['line-follow']['✗ no sensor: straight lines and arcs'] = prog([start(), moveFor('forward', 3.98), tankFor(8.21, 'rotations', 34, 46), moveFor('forward', 5.69), tankFor(8.21, 'rotations', 34, 46), moveFor('forward', 1.7)]);
V.square['✗ only 3 turns (wrong heading at the end)'] = prog([start(), repeat(3, [moveFor('forward', 2.84), moveFor('left', 193, 'degrees')]), moveFor('forward', 2.84)]);
V.garage['✗ parked sideways'] = prog([start(), moveFor('forward', 5.97), moveFor('left', 193, 'degrees'), moveFor('forward', 3.8), moveFor('right', 193, 'degrees')]);
const coast = () => b('ev3_move_set_stop', { ACTION: 'coast' });
V['touch-return']['✗ many short rams'] = prog([start(), repeat(25, [moveFor('forward', 0.4, 'seconds')]), moveFor('backward', 9, 'seconds'), moveFor('forward', 0.34)]);
V['touch-return']['✗ ram at an angle'] = prog([start(), moveFor('right', 20, 'degrees'), moveFor('forward', 8, 'seconds'), moveFor('backward', 9, 'seconds'), moveFor('left', 20, 'degrees'), moveFor('forward', 0.34)]);
V['touch-return']['speed 100, coast'] = prog([start(), speed(100), coast(), b('ev3_motor_set_pos', { PORT: 'B' }, { POS: n(0) }), startDir('forward'), bumpWait(), stopMove(),
  b('ev3_move_dir_for', { DIR: 'backward', UNIT: 'degrees' }, { AMOUNT: v(motorPos('B')) })]);
V.bounce['✗ many short rams'] = prog([start(), repeat(3, [repeat(18, [moveFor('forward', 0.4, 'seconds')]), startDir('backward'), colorWait('blue')]), stopMove()]);
V.bounce['✗ rams at an angle'] = prog([start(), moveFor('right', 20, 'degrees'), repeat(3, [moveFor('forward', 6, 'seconds'), startDir('backward'), colorWait('blue')]), stopMove()]);
V.bounce['speed 60, coast, no stop in between'] = prog([start(), speed(60), coast(), repeat(3, [startDir('forward'), bumpWait(), startDir('backward'), colorWait('blue')]), stopMove()]);
V.bounce['speed 100, stop between moves'] = prog([start(), speed(100), repeat(3, [startDir('forward'), bumpWait(), stopMove(), startDir('backward'), colorWait('blue'), stopMove()])]);
for (const id of ['card-lines', 'color-memory', 'open-gate', 'line-to-wall', 'sensor-maze']) V[id] = { reference: SOLUTIONS[id] };
// ---------- Expert challenges ----------
const eq = (A, B) => op('ev3_op_eq', A, B);
const readCard = (extra = []) => [startDir('forward'), waitTrue(not(colorIs('white'))), ...extra,
  ...[['red', 2], ['green', 3], ['blue', 4], ['yellow', 5]].map(([c, k]) => ifThen(colorIs(c), [setVar('v_number', tx(k))]))];
const countTo = (black, white) => repeatUntil(eq(v(varGet('v_count')), v(varGet('v_number'))), [waitTrue(black), changeVar('v_count'),
  ifThen(not(eq(v(varGet('v_count')), v(varGet('v_number')))), [waitTrue(white)])]);
Object.assign(V['card-lines'], {
  'reflected light to count (after leaving the card)': withVars(vars('number', 'count'), blocks([start(), setVar('v_count', tx(0)), ...readCard([wait(0.1)]), colorWait('white'),
    countTo(lt(v(reflect()), n(30)), gt(v(reflect()), n(70))), stopMove()])),
  'speed 30, read the card at once': withVars(vars('number', 'count'), blocks([start(), speed(30), setVar('v_count', tx(0)), ...readCard(),
    countTo(colorIs('black'), not(colorIs('black'))), stopMove()])),
  'stop the robot on the card to read it': withVars(vars('number', 'count'), blocks([start(), setVar('v_count', tx(0)), ...readCard([moveFor('forward', 0.15), stopMove()]),
    startDir('forward'), countTo(colorIs('black'), colorIs('white')), stopMove()])),
  '✗ counts with reflected light from the start (a blue or green card is dark too)': withVars(vars('number', 'count'), blocks([start(), setVar('v_count', tx(0)), ...readCard([wait(0.1)]),
    countTo(lt(v(reflect()), n(30)), gt(v(reflect()), n(70))), stopMove()])),
  '✗ always the 3rd line': withVars(vars('number', 'count'), blocks([start(), setVar('v_count', tx(0)), setVar('v_number', tx(3)), startDir('forward'),
    countTo(colorIs('black'), colorIs('white')), stopMove()])),
  '✗ forgets to wait for white (counts one line many times)': withVars(vars('number', 'count'), blocks([start(), setVar('v_count', tx(0)), ...readCard([wait(0.1)]),
    repeatUntil(eq(v(varGet('v_count')), v(varGet('v_number'))), [waitTrue(colorIs('black')), changeVar('v_count')]), stopMove()])),
});
const addColor = (list = 'l_c') => b('ev3_list_add', { LIST: { id: list } }, { ITEM: v(b('ev3_color', { PORT: '3' })) });
const nextSquare = () => waitTrue(or(colorIs('white'), colorIs('black')));
Object.assign(V['color-memory'], {
  'one color per display line': withVars(vars('line').concat(listVars('c')), blocks([start(), setVar('v_line', tx(1)), startDir('forward'),
    repeatUntil(colorIs('black'), [ifThen(not(colorIs('white')), [wait(0.08), b('ev3_display_text_line', {}, { TEXT: v(b('ev3_color', { PORT: '3' })), LINE: v(varGet('v_line')) }), changeVar('v_line'), nextSquare()])]),
    stopMove()])),
  'join the names in a text variable': withVars(vars('txt'), blocks([start(), setVar('v_txt', tx('')), startDir('forward'),
    repeatUntil(colorIs('black'), [ifThen(not(colorIs('white')), [wait(0.08), setVar('v_txt', v(op('ev3_op_join', v(varGet('v_txt')), v(op('ev3_op_join', v(b('ev3_color', { PORT: '3' })), tx(' ')))))), nextSquare()])]),
    stopMove(), write(varGet('v_txt'))])),
  'speed 30': withVars(listVars('c'), blocks([start(), speed(30), startDir('forward'),
    repeatUntil(colorIs('black'), [ifThen(not(colorIs('white')), [wait(0.12), addColor(), nextSquare()])]), stopMove(), write(b('ev3_list', { LIST: { id: 'l_c' } }))])),
  'speed 70': withVars(listVars('c'), blocks([start(), speed(70), startDir('forward'),
    repeatUntil(colorIs('black'), [ifThen(not(colorIs('white')), [wait(0.05), addColor(), nextSquare()])]), stopMove(), write(b('ev3_list', { LIST: { id: 'l_c' } }))])),
  '✗ always "red green blue"': prog([start(), startDir('forward'), colorWait('black'), stopMove(), writeText('red green blue')]),
  '✗ no wait for white (same square added many times)': withVars(listVars('c'), blocks([start(), startDir('forward'),
    repeatUntil(colorIs('black'), [ifThen(not(colorIs('white')), [addColor()])]), stopMove(), write(b('ev3_list', { LIST: { id: 'l_c' } }))])),
  '✗ also writes the black end line': withVars(listVars('c'), blocks([start(), startDir('forward'),
    repeatUntil(colorIs('black'), [ifThen(not(colorIs('white')), [wait(0.08), addColor(), nextSquare()])]), stopMove(), addColor(), write(b('ev3_list', { LIST: { id: 'l_c' } }))])),
});
Object.assign(V['open-gate'], {
  'thresholds: middle, then left, else right': prog([start(), ifElse(distCmp('>', 100), [], [moveFor('left', 80, 'degrees'),
    ifElse(distCmp('>', 110), [], [moveFor('right', 160, 'degrees')])]), startDir('forward'), distWait(15), stopMove()]),
  'tank turns, speed 30': withVars(vars('m', 'l', 'r'), blocks([start(), speed(30), setVar('v_m', v(distance())), tankFor(80, 'degrees', -30, 30), setVar('v_l', v(distance())),
    tankFor(160, 'degrees', 30, -30), setVar('v_r', v(distance())),
    ifElse(b('ev3_op_and', {}, { A: v(gt(v(varGet('v_m')), v(varGet('v_l')))), B: v(gt(v(varGet('v_m')), v(varGet('v_r')))) }), [tankFor(80, 'degrees', -30, 30)],
      [ifThen(gt(v(varGet('v_l')), v(varGet('v_r'))), [tankFor(160, 'degrees', -30, 30)])]),
    startDir('forward'), distWait(15), stopMove()])),
  '✗ always straight ahead': prog([start(), startDir('forward'), distWait(15), stopMove()]),
  '✗ always the left opening': prog([start(), moveFor('left', 80, 'degrees'), startDir('forward'), distWait(15), stopMove()]),
});
Object.assign(V['line-to-wall'], {
  'on/off: reflected < 50 → 15/40 else 40/15': prog([start(), repeatUntil(distCmp('<', 10), [ifElse(lt(v(reflect()), n(50)), [tankStart(15, 40)], [tankStart(40, 15)])]), stopMove()]),
  'proportional, gain 0.4, speed 25, stop < 8': withVars(vars('e'), blocks([start(), repeatUntil(distCmp('<', 8), [setVar('v_e', v(reflectErr('3'))),
    b('ev3_move_tank_start', {}, { LEFT: v(op('ev3_op_add', n(25), v(op('ev3_op_mul', n(0.4), v(varGet('v_e')))))), RIGHT: v(op('ev3_op_sub', n(25), v(op('ev3_op_mul', n(0.4), v(varGet('v_e')))))) })]), stopMove()])),
  'event: when distance < 10 → stop program': withVars(vars('e'), blocks([start(), forever([setVar('v_e', v(reflectErr('3'))),
    b('ev3_move_tank_start', {}, { LEFT: v(op('ev3_op_add', n(30), v(op('ev3_op_mul', n(0.6), v(varGet('v_e')))))), RIGHT: v(op('ev3_op_sub', n(30), v(op('ev3_op_mul', n(0.6), v(varGet('v_e')))))) })])],
    [b('ev3_when_distance', { PORT: '4', OP: '<', UNIT: 'cm' }, { VALUE: n(10) }), stopMove(), b('ev3_stop', { WHAT: 'exit' })])),
  '✗ straight to the wall (no line following)': prog([start(), startDir('forward'), distWait(10), stopMove()]),
  '✗ follows the line forever (never stops)': prog([start(), forever([ifElse(lt(v(reflect()), n(50)), [tankStart(15, 40)], [tankStart(40, 15)])])]),
});
const mazeLoop = (first, second, extra = [], d = 9) => prog(defProc('L', [], turnLeft(), 0), defProc('R', [], turnRight(), 300), [start(), ...extra, repeatUntil(colorIs('green'), [
  startDir('forward'), waitTrue(or(distCmp('<', d), colorIs('green'))), stopMove(),
  ifThen(not(colorIs('green')), [callProc(first), ifThen(distCmp('<', 20), [callProc(second), callProc(second)])])])]);
Object.assign(V['sensor-maze'], {
  'look right first': mazeLoop('R', 'L'),
  'speed 30': mazeLoop('L', 'R', [speed(30)]),
  'speed 80': mazeLoop('L', 'R', [speed(80)]),
  'stop at 8 cm, look again after turning around': mazeLoop('L', 'R', [], 8),
  '✗ always turns left': prog(defProc('L', [], turnLeft(), 0), [start(), repeatUntil(colorIs('green'), [startDir('forward'), waitTrue(or(distCmp('<', 9), colorIs('green'))), stopMove(),
    ifThen(not(colorIs('green')), [callProc('L')])])]),
});


const out = [];
const say = (s) => { out.push(s); document.getElementById('out').textContent = out.join('\n'); };
const RANDOM_SEEDS = Array.from({ length: Number(new URLSearchParams(location.search).get('n') || 40) }, (_, i) => (i * 2654435761 + 12345) >>> 0);

async function main() {
  const sim = new Sim(), brick = new Brick();
  brick.sound.muted = true;
  const qs = new URLSearchParams(location.search), only = qs.get('ch');
  if (qs.get('dump')) { say(JSON.stringify(V)); return; } // for the UI test (tests/ui_variants.py)
  if (qs.get('v')) { // debug one solution on one seed: final pose every 0.5 s
    const ch = CHALLENGES.find((c) => c.id === only), p = programFromSerialized(V[only][qs.get('v')]);
    if (qs.get('trace')) {
      const ctx = prepareChallenge(sim, brick, ch, Number(qs.get('seed') || checkSeeds(CHALLENGES.find((c) => c.id === only))[0]), DEFAULT_CONFIG);
      const rt = new Runtime(sim, brick, { onLog: say });
      rt.start(p.code, { seed: 1, variables: p.variables, lists: p.lists });
      let last = '';
      while (rt.running) {
        await rt.tick();
        if (rt.running) { const r = challengeAfterStep(ctx); if (r) rt.stopAll(r); }
        const blk = [...rt.activeBlocks()].join();
        if (blk !== last || sim.stepIndex % Number(qs.get('trace')) === 0) say(`t=${sim.t.toFixed(3)} (${sim.robot.x.toFixed(2)}, ${sim.robot.y.toFixed(2)}, ${(sim.robot.th / DEG).toFixed(2)}°) B=${sim.motors.B.pos.toFixed(1)} C=${sim.motors.C.pos.toFixed(1)} col=${sim.collisions}${blk !== last ? ' ▶ ' + blk : ''}`);
        last = blk;
      }
      return;
    }
    const t = await runTrial(ch, p, Number(qs.get('seed') || checkSeeds(CHALLENGES.find((c) => c.id === only))[0]), { sim, brick, config: DEFAULT_CONFIG, onLog: say });
    say(`score ${t.score} ${t.endReason} t=${t.simTime} pose (${sim.robot.x.toFixed(2)}, ${sim.robot.y.toFixed(2)}, ${(sim.robot.th / DEG).toFixed(1)}°) noise ${JSON.stringify(sim.noise)} collisions ${sim.collisions}`);
    say(`color sensor at (${sim.colorPoint('3').map((x) => x.toFixed(2)).join(', ')}) sees ${sim.colorKey('3')} reflect ${sim.reflect('3')} · data ${JSON.stringify(Object.fromEntries(Object.entries(prepareChallenge(new Sim(), new Brick(), ch, Number(qs.get('seed') || checkSeeds(CHALLENGES.find((c) => c.id === only))[0])).data).filter(([k]) => k !== 'zone')))} · screen "${brick.lcd.screenText()}"`);
    say(t.criteria.map((c) => `${c.points}/${c.max} ${c.label}`).join('\n'));
    return;
  }
  let fails = 0, total = 0;
  for (const ch of CHALLENGES) {
    if (only && ch.id !== only) continue;
    const variants = V[ch.id] || {};
    say(`\n=== ${ch.title} (${ch.id}) — ${Object.keys(variants).length} solutions`);
    for (const [name, src] of Object.entries(variants)) {
      total++;
      const logs = [];
      let p;
      const config = src.config || DEFAULT_CONFIG;
      try { p = programFromSerialized(src.prog || src); } catch (e) { say(`  FAIL ${name}: cannot load (${e.message})`); fails++; continue; }
      const opts = { sim, brick, config, onLog: (m) => logs.push(m) };
      const off = await evaluateProgram(ch, p, opts);
      const again = await evaluateProgram(ch, p, opts);
      const det = JSON.stringify(off) === JSON.stringify(again);
      const scores = [], bad = [];
      for (const sd of RANDOM_SEEDS) {
        const t = await runTrial(ch, p, sd, opts);
        scores.push(t.score);
        if (t.score < CLASSROOM.passScore) bad.push(`seed ${sd}: ${t.score}% ${t.endReason} ` + t.criteria.filter((c) => c.points < c.max).map((c) => c.label).join(' ; '));
      }
      const min = Math.min(...scores), mean = Math.round(scores.reduce((a, x) => a + x, 0) / scores.length);
      if (name.startsWith('✗')) { // a wrong solution: must not pass
        const passes = off.score >= CLASSROOM.passScore;
        if (passes) fails++;
        say(`  ${passes ? 'FAIL (wrong solution passes)' : 'OK  '} ${name}: check ${off.score}% · practice max ${Math.max(...scores)}%`);
        continue;
      }
      const ok = off.score >= CLASSROOM.passScore && det;
      if (!ok || bad.length) fails++;
      say(`  ${ok ? (bad.length ? 'WEAK' : 'OK  ') : 'FAIL'} ${name}: check ${off.score}% [${off.trials.map((t) => t.score + '% ' + t.endReason).join(', ')}]${det ? '' : ' NOT DETERMINISTIC'} · practice min ${min}% mean ${mean}% (${bad.length}/${scores.length} below ${CLASSROOM.passScore}%)` + (logs.length ? ' LOGS: ' + [...new Set(logs)].join(' | ') : ''));
      for (const t of off.trials) if (t.score < 100) say(`        check trial seed ${t.seed}: ${t.criteria.filter((c) => c.points < c.max).map((c) => '✖ ' + c.label).join(' ; ')}`);
      for (const x of bad.slice(0, 4)) say('        ' + x);
    }
  }
  say(`\nRESULT: ${total - fails} / ${total} solutions fully OK`);
  document.title = fails ? 'FAIL' : 'PASS';
}
window.addEventListener('load', () => main().catch((e) => say('EXCEPTION ' + e.message + '\n' + e.stack)));
