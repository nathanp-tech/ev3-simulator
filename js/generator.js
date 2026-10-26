// JavaScript generator for EV3 blocks. The generated code is run by Runtime (runtime.js).
'use strict';

const G = javascript.javascriptGenerator;
const O = javascript.Order;

G.STATEMENT_PREFIX = 'R.step(T, %1);\n';
G.addReservedWords('R,V,T,F,a,k,i,_n');

const q = JSON.stringify;
const vcode = (b, n, def = '0') => G.valueToCode(b, n, O.NONE) || def;
const num = (b, n) => `R.num(${vcode(b, n)})`;
const str = (b, n) => `R.str(${vcode(b, n, "''")})`;
const cond = (b, n) => vcode(b, n, 'false');
const fld = (b, n) => q(b.getFieldValue(n));
const P = (b) => fld(b, 'PORT');
const loopBody = (b, n = 'DO') => G.statementToCode(b, n) + G.INDENT + 'await R.yield(T);\n';
const waitUntil = (expr) => `await R.waitUntil(T, () => (${expr}));\n`;
const cmpNum = (expr, b) => `R.cmp(${expr}, ${fld(b, 'OP')}, ${num(b, 'VALUE')})`;
const F = G.forBlock;

// Hats contain their own stack: prevent scrub_ from appending the next blocks again.
const origScrub = G.scrub_.bind(G);
G.scrub_ = function (block, code, thisOnly) {
  if (HAT_TYPES.has(block.type)) return code;
  return origScrub(block, code, thisOnly);
};
function hatBody(block) {
  const next = block.getNextBlock();
  return next ? G.prefixLines(G.blockToCode(next), G.INDENT) : '';
}
const thread = (block) => `async (T) => {\n${hatBody(block)}}`;
const id = (b) => q(b.id);
const onCond = (b, expr, initPrev = false) => `R.onCond(${id(b)}, () => (${expr}), ${thread(b)}, ${initPrev});\n`;

// ---------- Inputs ----------
F.ev3_num = (b) => {
  const v = b.getFieldValue('NUM');
  const n = Number(v);
  return [v !== '' && isFinite(n) ? String(n) : q(v), n < 0 ? O.UNARY_NEGATION : O.ATOMIC];
};
F.ev3_steering = (b) => {
  const n = Number(b.getFieldValue('STEER')) || 0;
  return [String(n), n < 0 ? O.UNARY_NEGATION : O.ATOMIC];
};
F.ev3_text = (b) => {
  const v = b.getFieldValue('TEXT');
  const n = Number(v);
  return [v.trim() !== '' && isFinite(n) && String(n) === v.trim() ? String(n) : q(v), n < 0 ? O.UNARY_NEGATION : O.ATOMIC];
};

// ---------- Motors ----------
F.ev3_motor_run_for = (b) => `await R.motorRunFor(T, ${P(b)}, ${fld(b, 'DIR')}, ${num(b, 'AMOUNT')}, ${fld(b, 'UNIT')});\n`;
F.ev3_motor_goto = (b) => `await R.motorGoTo(T, ${P(b)}, ${num(b, 'POS')});\n`;
F.ev3_motor_start = (b) => `R.motorStart(${P(b)}, ${fld(b, 'DIR')});\n`;
F.ev3_motor_start_speed = (b) => `R.motorStartSpeed(${P(b)}, ${num(b, 'SPEED')});\n`;
F.ev3_motor_stop = (b) => `R.motorStop(${P(b)});\n`;
F.ev3_motor_set_speed = (b) => `R.motorSetSpeed(${P(b)}, ${num(b, 'SPEED')});\n`;
F.ev3_motor_set_stop = (b) => `R.motorSetStopAction(${P(b)}, ${fld(b, 'ACTION')});\n`;
F.ev3_motor_set_pos = (b) => `R.motorSetPosition(${P(b)}, ${num(b, 'POS')});\n`;
F.ev3_motor_position = (b) => [`R.motorPosition(${P(b)})`, O.FUNCTION_CALL];
F.ev3_motor_speed = (b) => [`R.motorSpeed(${P(b)})`, O.FUNCTION_CALL];

// ---------- Movement ----------
F.ev3_move_dir_for = (b) => `await R.moveDirFor(T, ${fld(b, 'DIR')}, ${num(b, 'AMOUNT')}, ${fld(b, 'UNIT')});\n`;
F.ev3_move_steer_for = (b) => `await R.moveSteerFor(T, ${num(b, 'STEER')}, ${num(b, 'AMOUNT')}, ${fld(b, 'UNIT')});\n`;
F.ev3_move_tank_for = (b) => `await R.moveTankFor(T, ${num(b, 'AMOUNT')}, ${fld(b, 'UNIT')}, ${num(b, 'LEFT')}, ${num(b, 'RIGHT')});\n`;
F.ev3_move_dir_start = (b) => `R.moveDirStart(${fld(b, 'DIR')});\n`;
F.ev3_move_steer_start = (b) => `R.moveSteerStart(${num(b, 'STEER')}, ${b.getInputTargetBlock('SPEED') ? num(b, 'SPEED') : 'null'});\n`;
F.ev3_move_tank_start = (b) => `R.moveTankStart(${num(b, 'LEFT')}, ${num(b, 'RIGHT')});\n`;
F.ev3_move_stop = () => 'R.moveStop();\n';
F.ev3_move_set_speed = (b) => `R.moveSetSpeed(${num(b, 'SPEED')});\n`;
F.ev3_move_set_pair = (b) => `R.moveSetPair(${fld(b, 'PAIR')});\n`;
F.ev3_move_set_rotation = (b) => `R.moveSetRotation(${num(b, 'CM')});\n`;
F.ev3_move_set_stop = (b) => `R.moveSetStopAction(${fld(b, 'ACTION')});\n`;

// ---------- Display ----------
F.ev3_display_image_for = (b) => `await R.dispImageFor(T, ${fld(b, 'IMAGE')}, ${num(b, 'SECS')});\n`;
F.ev3_display_image = (b) => `R.dispImage(${fld(b, 'IMAGE')});\n`;
F.ev3_display_text_line = (b) => `R.dispTextLine(${str(b, 'TEXT')}, ${num(b, 'LINE')});\n`;
F.ev3_display_text_xy = (b) => `R.dispTextXY(${str(b, 'TEXT')}, ${num(b, 'X')}, ${num(b, 'Y')});\n`;
F.ev3_display_clear = () => 'R.dispClear();\n';
F.ev3_display_font = (b) => `R.dispFont(${fld(b, 'FONT')});\n`;
F.ev3_display_pen = (b) => `R.dispPen(${fld(b, 'COLOR')});\n`;
F.ev3_display_pixel = (b) => `R.dispPixel(${num(b, 'X')}, ${num(b, 'Y')});\n`;
F.ev3_display_line = (b) => `R.dispLine(${num(b, 'X1')}, ${num(b, 'Y1')}, ${num(b, 'X2')}, ${num(b, 'Y2')});\n`;
F.ev3_display_circle = (b) => `R.dispCircle(${fld(b, 'FILL')}, ${num(b, 'X')}, ${num(b, 'Y')}, ${num(b, 'R')});\n`;
F.ev3_display_rect = (b) => `R.dispRect(${fld(b, 'FILL')}, ${num(b, 'X')}, ${num(b, 'Y')}, ${num(b, 'W')}, ${num(b, 'H')});\n`;
F.ev3_light = (b) => `R.light(${fld(b, 'COLOR')}, ${fld(b, 'MODE')});\n`;
F.ev3_light_off = () => 'R.light(null);\n';

// ---------- Sound ----------
F.ev3_sound_play_wait = (b) => `await R.soundPlay(T, ${fld(b, 'SOUND')}, true);\n`;
F.ev3_sound_play = (b) => `R.soundPlay(T, ${fld(b, 'SOUND')}, false);\n`;
F.ev3_beep_for = (b) => `await R.beep(T, ${num(b, 'NOTE')}, ${num(b, 'SECS')}, true);\n`;
F.ev3_beep = (b) => `R.beep(T, ${num(b, 'NOTE')}, 0.2, false);\n`;
F.ev3_sound_stop = () => 'R.soundStop();\n';
F.ev3_volume_set = (b) => `R.setVolume(${num(b, 'VOL')});\n`;
F.ev3_volume_change = (b) => `R.setVolume(R.volume() + ${num(b, 'VOL')});\n`;
F.ev3_volume = () => ['R.volume()', O.FUNCTION_CALL];

// ---------- Events ----------
F.ev3_when_start = (b) => `R.onStart(${id(b)}, ${thread(b)});\n`;
F.ev3_when_color = (b) => onCond(b, `R.colorIs(${P(b)}, ${fld(b, 'COLOR')})`);
F.ev3_when_touch = (b) => (b.getFieldValue('STATE') === 'pressed' ? onCond(b, `R.touch(${P(b)})`) : onCond(b, `!R.touch(${P(b)})`, true));
F.ev3_when_distance = (b) => onCond(b, cmpNum(`R.distance(${P(b)}, ${fld(b, 'UNIT')})`, b));
F.ev3_when_proximity = (b) => onCond(b, cmpNum(`R.proximity(${P(b)})`, b));
F.ev3_when_beacon = (b) => onCond(b, `R.beaconButtons(${P(b)}, ${fld(b, 'CH')}) === ${fld(b, 'BUTTON')}`);
F.ev3_when_angle = (b) => onCond(b, cmpNum(`R.gyroAngle(${P(b)})`, b));
F.ev3_when_button = (b) => (b.getFieldValue('STATE') === 'pressed'
  ? onCond(b, `R.button(${fld(b, 'BUTTON')})`)
  : onCond(b, `!R.button(${fld(b, 'BUTTON')})`, true));
F.ev3_when_cond = (b) => onCond(b, cond(b, 'COND'));
F.ev3_when_receive = (b) => `R.onMsg(${id(b)}, ${fld(b, 'MSG')}, ${thread(b)});\n`;
F.ev3_broadcast = (b) => `R.broadcast(T, ${fld(b, 'MSG')}, false);\n`;
F.ev3_broadcast_wait = (b) => `await R.broadcast(T, ${fld(b, 'MSG')}, true);\n`;

// ---------- Control ----------
F.ev3_wait = (b) => `await R.wait(T, ${num(b, 'SECS')});\n`;
F.ev3_wait_until = (b) => waitUntil(cond(b, 'COND'));
F.ev3_repeat = (b) => `for (let _n = Math.round(${num(b, 'TIMES')}); _n > 0; _n--) {\n${loopBody(b)}}\n`;
F.ev3_forever = (b) => `while (true) {\n${loopBody(b)}}\n`;
F.ev3_repeat_until = (b) => `while (!(${cond(b, 'COND')})) {\n${loopBody(b)}}\n`;
F.ev3_if = (b) => `if (${cond(b, 'COND')}) {\n${G.statementToCode(b, 'DO')}}\n`;
F.ev3_if_else = (b) => `if (${cond(b, 'COND')}) {\n${G.statementToCode(b, 'DO')}} else {\n${G.statementToCode(b, 'ELSE')}}\n`;
F.ev3_stop_other = () => "R.stop(T, 'other');\n";
F.ev3_stop = (b) => {
  const root = b.getRootBlock();
  // like Scratch: "stop this stack" inside a My Block only ends that block
  if (b.getFieldValue('WHAT') === 'this' && root && root.type.startsWith('procedures_def')) return 'return;\n';
  return `R.stop(T, ${fld(b, 'WHAT')});\n`;
};

// ---------- Sensors ----------
const touchWait = (p, state) => {
  if (state === 'pressed') return waitUntil(`R.touch(${p})`);
  if (state === 'released') return waitUntil(`!R.touch(${p})`);
  return waitUntil(`R.touch(${p})`) + waitUntil(`!R.touch(${p})`);
};
F.ev3_reflect_wait = (b) => waitUntil(cmpNum(`R.reflect(${P(b)})`, b));
F.ev3_reflect_cmp = (b) => [cmpNum(`R.reflect(${P(b)})`, b), O.FUNCTION_CALL];
F.ev3_reflect = (b) => [`R.reflect(${P(b)})`, O.FUNCTION_CALL];
F.ev3_reflect_calibrate = (b) => `R.calibrate(${P(b)}, ${fld(b, 'WHICH')});\n`;
F.ev3_reflect_reset = (b) => `R.resetCalibration(${P(b)});\n`;
F.ev3_color_wait = (b) => waitUntil(`R.colorIs(${P(b)}, ${fld(b, 'COLOR')})`);
F.ev3_color_is = (b) => [`R.colorIs(${P(b)}, ${fld(b, 'COLOR')})`, O.FUNCTION_CALL];
F.ev3_color = (b) => [`R.color(${P(b)})`, O.FUNCTION_CALL];
F.ev3_ambient_cmp = (b) => [cmpNum(`R.ambient(${P(b)})`, b), O.FUNCTION_CALL];
F.ev3_ambient = (b) => [`R.ambient(${P(b)})`, O.FUNCTION_CALL];
F.ev3_touch_wait = (b) => touchWait(P(b), b.getFieldValue('STATE'));
F.ev3_touch_is = (b) => [b.getFieldValue('STATE') === 'pressed' ? `R.touch(${P(b)})` : `!R.touch(${P(b)})`, O.LOGICAL_NOT];
F.ev3_distance_wait = (b) => waitUntil(cmpNum(`R.distance(${P(b)}, ${fld(b, 'UNIT')})`, b));
F.ev3_distance_cmp = (b) => [cmpNum(`R.distance(${P(b)}, ${fld(b, 'UNIT')})`, b), O.FUNCTION_CALL];
F.ev3_distance = (b) => [`R.distance(${P(b)}, ${fld(b, 'UNIT')})`, O.FUNCTION_CALL];
F.ev3_prox_wait = (b) => waitUntil(cmpNum(`R.proximity(${P(b)})`, b));
F.ev3_prox_cmp = (b) => [cmpNum(`R.proximity(${P(b)})`, b), O.FUNCTION_CALL];
F.ev3_prox = (b) => [`R.proximity(${P(b)})`, O.FUNCTION_CALL];
F.ev3_beacon_wait = (b) => waitUntil(`R.beaconButtons(${P(b)}, ${fld(b, 'CH')}) === ${fld(b, 'BUTTON')}`);
F.ev3_beacon_is = (b) => [`(R.beaconButtons(${P(b)}, ${fld(b, 'CH')}) === ${fld(b, 'BUTTON')})`, O.ATOMIC];
F.ev3_beacon_buttons = (b) => [`R.beaconButtons(${P(b)}, ${fld(b, 'CH')})`, O.FUNCTION_CALL];
F.ev3_beacon_heading_cmp = (b) => [cmpNum(`R.beaconHeading(${P(b)}, ${fld(b, 'CH')})`, b), O.FUNCTION_CALL];
F.ev3_beacon_active = (b) => [`R.beaconActive(${P(b)}, ${fld(b, 'CH')})`, O.FUNCTION_CALL];
F.ev3_beacon_heading = (b) => [`R.beaconHeading(${P(b)}, ${fld(b, 'CH')})`, O.FUNCTION_CALL];
F.ev3_beacon_prox = (b) => [`R.beaconProximity(${P(b)}, ${fld(b, 'CH')})`, O.FUNCTION_CALL];
F.ev3_angle_wait = (b) => waitUntil(cmpNum(`R.gyroAngle(${P(b)})`, b));
F.ev3_angle_cmp = (b) => [cmpNum(`R.gyroAngle(${P(b)})`, b), O.FUNCTION_CALL];
F.ev3_angle = (b) => [`R.gyroAngle(${P(b)})`, O.FUNCTION_CALL];
F.ev3_angle_reset = (b) => `R.gyroReset(${P(b)});\n`;
F.ev3_rate = (b) => [`R.gyroRate(${P(b)})`, O.FUNCTION_CALL];
F.ev3_rate_cmp = (b) => [cmpNum(`R.gyroRate(${P(b)})`, b), O.FUNCTION_CALL];
const buttonExpr = (b) => (b.getFieldValue('STATE') === 'pressed' ? `R.button(${fld(b, 'BUTTON')})` : `!R.button(${fld(b, 'BUTTON')})`);
F.ev3_button_wait = (b) => waitUntil(buttonExpr(b));
F.ev3_button_is = (b) => [buttonExpr(b), O.LOGICAL_NOT];
F.ev3_timer = () => ['R.timer()', O.FUNCTION_CALL];
F.ev3_timer_reset = () => 'R.timerReset();\n';

// ---------- Operators ----------
const arith = (op) => (b) => [`(${num(b, 'A')} ${op} ${num(b, 'B')})`, O.ATOMIC];
F.ev3_op_random = (b) => [`R.random(${vcode(b, 'FROM')}, ${vcode(b, 'TO')})`, O.FUNCTION_CALL];
F.ev3_op_add = arith('+');
F.ev3_op_sub = arith('-');
F.ev3_op_mul = arith('*');
F.ev3_op_div = arith('/');
const compare = (op) => (b) => [`R.compare(${vcode(b, 'A', "''")}, '${op}', ${vcode(b, 'B', "''")})`, O.FUNCTION_CALL];
F.ev3_op_lt = compare('<');
F.ev3_op_eq = compare('=');
F.ev3_op_gt = compare('>');
F.ev3_op_and = (b) => [`(!!(${cond(b, 'A')}) && !!(${cond(b, 'B')}))`, O.ATOMIC];
F.ev3_op_or = (b) => [`(!!(${cond(b, 'A')}) || !!(${cond(b, 'B')}))`, O.ATOMIC];
F.ev3_op_not = (b) => [`!(${cond(b, 'A')})`, O.LOGICAL_NOT];
F.ev3_op_join = (b) => [`(${str(b, 'A')} + ${str(b, 'B')})`, O.ATOMIC];
F.ev3_op_letter = (b) => [`${str(b, 'TEXT')}.charAt(${num(b, 'N')} - 1)`, O.FUNCTION_CALL];
F.ev3_op_length = (b) => [`${str(b, 'TEXT')}.length`, O.MEMBER];
F.ev3_op_contains = (b) => [`${str(b, 'A')}.toLowerCase().includes(${str(b, 'B')}.toLowerCase())`, O.FUNCTION_CALL];
F.ev3_op_mod = (b) => [`R.mod(${num(b, 'A')}, ${num(b, 'B')})`, O.FUNCTION_CALL];
F.ev3_op_round = (b) => [`Math.round(${num(b, 'A')})`, O.FUNCTION_CALL];
F.ev3_op_math = (b) => [`R.math(${fld(b, 'OP')}, ${num(b, 'A')})`, O.FUNCTION_CALL];

// ---------- Variables (stored in V for the live monitor) ----------
const varName = (b, f = 'VAR') => q(b.getField(f).getText());
const varRef = (b) => `${procParams(b).includes(b.getField('VAR').getText()) ? 'F' : 'V'}[${varName(b)}]`;
F.variables_get = (b) => [varRef(b), O.MEMBER];
F.variables_set = (b) => `${varRef(b)} = ${vcode(b, 'VALUE')};\n`;
F.math_change = (b) => `${varRef(b)} = R.num(${varRef(b)}) + ${num(b, 'DELTA')};\n`;

// ---------- Lists ----------
const L = (b) => varName(b, 'LIST');
const item = (b) => vcode(b, 'ITEM', "''");
F.ev3_list = (b) => [`R.listText(${L(b)})`, O.FUNCTION_CALL];
F.ev3_list_add = (b) => `R.listAdd(${L(b)}, ${item(b)});\n`;
F.ev3_list_delete = (b) => `R.listDelete(${L(b)}, ${vcode(b, 'INDEX')});\n`;
F.ev3_list_delete_all = (b) => `R.listDeleteAll(${L(b)});\n`;
F.ev3_list_insert = (b) => `R.listInsert(${L(b)}, ${item(b)}, ${vcode(b, 'INDEX')});\n`;
F.ev3_list_replace = (b) => `R.listReplace(${L(b)}, ${vcode(b, 'INDEX')}, ${item(b)});\n`;
F.ev3_list_item = (b) => [`R.listItem(${L(b)}, ${vcode(b, 'INDEX')})`, O.FUNCTION_CALL];
F.ev3_list_index = (b) => [`R.listIndexOf(${L(b)}, ${item(b)})`, O.FUNCTION_CALL];
F.ev3_list_length = (b) => [`R.listLength(${L(b)})`, O.FUNCTION_CALL];
F.ev3_list_contains = (b) => [`R.listContains(${L(b)}, ${item(b)})`, O.FUNCTION_CALL];

// ---------- My Blocks (async procedures, parameters dynamically scoped) ----------
function procName(b) {
  const name = b.getFieldValue('NAME');
  return G.getProcedureName ? G.getProcedureName(name) : G.nameDB_.getName(name, Blockly.Names.NameType.PROCEDURE);
}
// Inside a My Block definition, its inputs are local to each call (F), so parallel stacks never mix them up.
function procParams(b) {
  const root = b.getRootBlock();
  return root && root.type.startsWith('procedures_def') ? root.getVars() : [];
}
function procDef(b) {
  const fn = procName(b);
  const params = b.getVars();
  const body = G.statementToCode(b, 'STACK');
  const ret = b.getInput('RETURN') ? G.valueToCode(b, 'RETURN', O.NONE) : '';
  G.definitions_['%' + fn] =
    `async function ${fn}(T, ...a) {\n` +
    `  const F = Object.create(null);\n` +
    `  ${q(params)}.forEach((k, i) => { F[k] = a[i]; });\n` +
    `${body}${ret ? `  return ${ret};\n` : ''}}`;
  return null;
}
F.procedures_defnoreturn = procDef;
F.procedures_defreturn = procDef;
const procArgs = (b) => b.getVars().map((_, i) => ', ' + vcode(b, 'ARG' + i, "''")).join('');
F.procedures_callnoreturn = (b) => `await ${procName(b)}(T${procArgs(b)});\n`;
F.procedures_callreturn = (b) => [`(await ${procName(b)}(T${procArgs(b)}))`, O.ATOMIC];
F.procedures_ifreturn = (b) => {
  const value = b.hasReturnValue_ ? vcode(b, 'VALUE', 'null') : '';
  return `if (${cond(b, 'CONDITION')}) {\n${G.INDENT}return ${value};\n}\n`;
};

// Generates the program: only stacks under a hat (and My Blocks definitions) run.
function generateProgram(ws) {
  G.init(ws);
  let code = '';
  for (const b of ws.getTopBlocks(true)) {
    if (!b.isEnabled()) continue;
    if (HAT_TYPES.has(b.type) || b.type.startsWith('procedures_def')) {
      const c = G.blockToCode(b);
      if (typeof c === 'string') code += c;
    }
  }
  return G.finish(code);
}
function programVariables(ws) {
  return {
    variables: ws.getVariablesOfType('').map((v) => v.name),
    lists: ws.getVariablesOfType('list').map((v) => v.name),
  };
}
