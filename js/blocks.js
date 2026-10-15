// EV3 blocks (EV3 Classroom style), toolbox and theme.
'use strict';

const EV3_COLORS = {
  motors: '#3D8CF5',
  movement: '#E95BC9',
  display: '#8C5CF0',
  sound: '#B86FD9',
  events: '#F0C430',
  control: '#F2B33D',
  sensors: '#58C2E8',
  operators: '#3DAA51',
  variables: '#F2994A',
  lists: '#EE7D2B',
  myblocks: '#E85A5E',
};

// My Blocks look like EV3 Classroom ("define").
Object.assign(Blockly.Msg, {
  PROCEDURES_DEFNORETURN_TITLE: 'define',
  PROCEDURES_DEFNORETURN_PROCEDURE: 'my block',
  PROCEDURES_BEFORE_PARAMS: 'with:',
  PROCEDURES_CALL_BEFORE_PARAMS: 'with:',
  PROCEDURES_DEFNORETURN_COMMENT: '',
  NEW_VARIABLE_TITLE: 'New variable name:',
});

// ---------- Icons (white SVG + separator, like EV3 Classroom) ----------
const ICON_SVG = {
  motor: (c) => `<circle cx="14" cy="16" r="11" fill="#fff"/><path d="M14 9v14M7 16h14" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/><circle cx="14" cy="16" r="2.6" fill="#fff" stroke="${c}" stroke-width="1.6"/>`,
  movement: (c) => `<circle cx="17" cy="19" r="10" fill="#fff" fill-opacity="0.6"/><circle cx="13" cy="14.5" r="10" fill="#fff"/><circle cx="13" cy="9.5" r="2.2" fill="${c}"/><circle cx="13" cy="19.5" r="2.2" fill="${c}"/><circle cx="8" cy="14.5" r="2.2" fill="${c}"/><circle cx="18" cy="14.5" r="2.2" fill="${c}"/><path d="M13 12.7v3.6M11.2 14.5h3.6" stroke="${c}" stroke-width="1.3"/>`,
  ultrasonic: () => `<rect x="2" y="9" width="24" height="14" rx="7" fill="none" stroke="#fff" stroke-width="2"/><circle cx="9" cy="16" r="3.6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="19" cy="16" r="3.6" fill="none" stroke="#fff" stroke-width="2"/>`,
  infrared: () => `<path d="M2 16c4-7 20-7 24 0c-4 7-20 7-24 0z" fill="none" stroke="#fff" stroke-width="2"/><rect x="6.5" y="13.5" width="5" height="5" rx="2.5" fill="#fff"/><rect x="16.5" y="13.5" width="5" height="5" rx="2.5" fill="#fff"/>`,
  color: () => `<rect x="7" y="3" width="14" height="26" rx="7" fill="none" stroke="#fff" stroke-width="2"/><circle cx="14" cy="11.5" r="4" fill="none" stroke="#fff" stroke-width="2"/><circle cx="14" cy="22" r="2" fill="#fff"/>`,
  touch: () => `<rect x="3" y="5" width="22" height="22" rx="6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="14" cy="16" r="6" fill="#fff"/><path d="M14 12v8M10 16h8" stroke="#58C2E8" stroke-width="2.2"/>`,
  gyro: () => `<rect x="3" y="4" width="22" height="24" rx="5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="14" cy="16" r="2.8" fill="#fff"/><path d="M9 10.5a8 8 0 0 0 0 11M19 10.5a8 8 0 0 1 0 11" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`,
  brick: () => `<rect x="7" y="3" width="15" height="26" rx="3" fill="none" stroke="#fff" stroke-width="2"/><rect x="10" y="6" width="9" height="7" rx="1" fill="#fff"/><rect x="11.5" y="17.5" width="6" height="6" rx="1.5" fill="#fff"/>`,
  sound: () => `<path d="M4 12h5l7-6v20l-7-6H4z" fill="#fff"/><path d="M19.5 11a7 7 0 0 1 0 10M22.5 8a11 11 0 0 1 0 16" stroke="#fff" fill="none" stroke-width="2" stroke-linecap="round"/>`,
  play: () => `<path d="M9 7.5l13 8.5-13 8.5z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`,
  timer: () => `<circle cx="14" cy="17" r="9.5" fill="none" stroke="#fff" stroke-width="2"/><path d="M14 17V11M11 4h6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`,
};
function iconURI(name, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="32" viewBox="0 0 34 32">${ICON_SVG[name](color)}<line x1="31.5" y1="1" x2="31.5" y2="31" stroke="#000" stroke-opacity="0.18" stroke-width="1.5"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const icon = (name, color) => ({ type: 'field_image', src: iconURI(name, color), width: 34, height: 32, alt: '' });

// ---------- Dropdown options ----------
const DD = {
  motorPorts: [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['A+D', 'A+D'], ['B+C', 'B+C'], ['A+B', 'A+B'], ['C+D', 'C+D'], ['A+B+C+D', 'A+B+C+D']],
  motorPort: [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']],
  sensorPort: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']],
  pairs: [['B+C', 'B+C'], ['A+B', 'A+B'], ['A+C', 'A+C'], ['A+D', 'A+D'], ['B+D', 'B+D'], ['C+D', 'C+D'], ['C+B', 'C+B']],
  rotDir: [['⟳ clockwise', 'cw'], ['⟲ counterclockwise', 'ccw']],
  motorUnits: [['rotations', 'rotations'], ['degrees', 'degrees'], ['seconds', 'seconds']],
  moveUnits: [['rotations', 'rotations'], ['degrees', 'degrees'], ['seconds', 'seconds']],
  moveDir: [['⬆ forward', 'forward'], ['⬇ backward', 'backward'], ['↻ right', 'right'], ['↺ left', 'left']],
  stopActions: [['brake', 'brake'], ['coast', 'coast'], ['hold', 'hold']],
  touchState: [['pressed', 'pressed'], ['released', 'released'], ['bumped', 'bumped']],
  touchIs: [['pressed', 'pressed'], ['released', 'released']],
  colors: [['red', 'red'], ['green', 'green'], ['blue', 'blue'], ['yellow', 'yellow'], ['black', 'black'], ['white', 'white'], ['brown', 'brown'], ['no color', 'none']],
  opWords: [['less than (<)', '<'], ['greater than (>)', '>'], ['equal to (=)', '=']],
  opSymbols: [['<', '<'], ['>', '>'], ['=', '=']],
  distUnits: [['cm', 'cm'], ['in', 'in']],
  calib: [['minimum', 'min'], ['maximum', 'max']],
  buttons: [['center', 'center'], ['up', 'up'], ['down', 'down'], ['left', 'left'], ['right', 'right']],
  buttonState: [['pressed', 'pressed'], ['released', 'released']],
  channels: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']],
  beaconButtons: BEACON_BUTTONS.map((b) => [b, b]),
  lightColor: [['green', 'green'], ['orange', 'orange'], ['red', 'red']],
  lightMode: [['solid', 'on'], ['flashing', 'flash'], ['pulsing', 'pulse']],
  fonts: [['small', 'small'], ['normal', 'normal'], ['large', 'large']],
  penColor: [['black', 'black'], ['white', 'white']],
  fill: [['outline', 'outline'], ['filled', 'fill']],
  stop: [['and exit program', 'exit'], ['this stack', 'this']],
  math: [['abs', 'abs'], ['floor', 'floor'], ['ceiling', 'ceiling'], ['sqrt', 'sqrt'], ['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['asin', 'asin'], ['acos', 'acos'], ['atan', 'atan'], ['ln', 'ln'], ['log', 'log'], ['e ^', 'e ^'], ['10 ^', '10 ^']],
  images: [
    ['Neutral', 'neutral'], ['Happy', 'happy'], ['Sad', 'sad'], ['Angry', 'angry'], ['Surprised', 'surprised'], ['Sleepy', 'sleepy'],
    ['Wink', 'wink'], ['Smiley', 'smiley'], ['Arrow up', 'up'], ['Arrow down', 'down'], ['Arrow left', 'left'], ['Arrow right', 'right'],
    ['Check mark', 'check'], ['X mark', 'cross'], ['Heart', 'heart'], ['Question mark', 'question'], ['Warning', 'warning'], ['Stop', 'stop'],
  ],
  sounds: [
    ['Hello', 'Hello'], ['Goodbye', 'Goodbye'], ['Yes', 'Yes'], ['No', 'No'], ['Okay', 'Okay'], ['Good job', 'Good job'],
    ['Fantastic', 'Fantastic'], ['Game over', 'Game over'], ['Go', 'Go'], ['Stop', 'Stop'], ['Left', 'Left'], ['Right', 'Right'],
    ['Up', 'Up'], ['Down', 'Down'], ['One', 'One'], ['Two', 'Two'], ['Three', 'Three'],
    ['Beep', 'fx:beep'], ['Horn', 'fx:horn'], ['Laser', 'fx:laser'], ['Boing', 'fx:boing'], ['Siren', 'fx:siren'],
    ['Fanfare', 'fx:fanfare'], ['Error', 'fx:error'], ['Applause', 'fx:applause'],
  ],
};

// ---------- Message dropdown (broadcast) with "New message" ----------
const NEW_MESSAGE = '__new_message__';
let ev3MainWorkspace = null;
class FieldMessage extends Blockly.FieldDropdown {
  constructor(value) {
    super(function () {
      const names = new Set(['message1']);
      const src = this.getSourceBlock();
      const wss = [src && src.workspace, ev3MainWorkspace].filter(Boolean);
      for (const w of wss) {
        for (const b of w.getAllBlocks(false)) {
          const f = b.getField('MSG');
          if (f instanceof FieldMessage && f.getValue() && f.getValue() !== NEW_MESSAGE) names.add(f.getValue());
        }
      }
      const cur = this.getValue();
      if (cur && cur !== NEW_MESSAGE) names.add(cur);
      return [...names].sort().map((n) => [n, n]).concat([['New message', NEW_MESSAGE]]);
    }, function (v) {
      if (v !== NEW_MESSAGE) return v;
      const name = window.prompt('New message name:', '');
      return name && name.trim() ? name.trim() : null;
    });
    if (value) this.setValue(value);
  }
  doClassValidation_(v) { return typeof v === 'string' && v !== '' ? v : null; }
  static fromJson(o) { return new FieldMessage(o.value || 'message1'); }
}
Blockly.fieldRegistry.register('field_ev3_message', FieldMessage);

// ---------- Steering field ("straight: 0", "right: 30", "left: 30") with a dial, like EV3 Classroom ----------
const steeringText = (v) => (v === 0 ? 'straight: 0' : v > 0 ? `right: ${v}` : `left: ${-v}`);
class FieldSteering extends Blockly.FieldNumber {
  constructor(value) { super(value || 0, -100, 100, 1); }
  static fromJson(o) { return new FieldSteering(Number(o.value) || 0); }
  getText_() { return this.isBeingEdited_ && this.htmlInput_ ? super.getText_() : steeringText(Number(this.getValue()) || 0); }
  showEditor_() {
    const D = Blockly.DropDownDiv;
    D.hideWithoutAnimation();
    D.clearContent();
    const div = D.getContentDiv();
    const size = 190, c = size / 2, R = 78;
    const ticks = Array.from({ length: 24 }, (_, i) => {
      const a = i * 15 * DEG;
      return `<line x1="${c + Math.sin(a) * (R - 10)}" y1="${c - Math.cos(a) * (R - 10)}" x2="${c + Math.sin(a) * (R - 3)}" y2="${c - Math.cos(a) * (R - 3)}" stroke="#fff" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>`;
    }).join('');
    div.innerHTML = `<div class="steer-dial"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${c}" cy="${c}" r="${R}" fill="#c42a98"/>${ticks}
      <g class="needle"><line x1="${c}" y1="${c}" x2="${c}" y2="${c - R + 6}" stroke="#fff" stroke-width="3"/>
        <circle cx="${c}" cy="${c - R + 6}" r="13" fill="#fff"/><path d="M${c} ${c - R}l-5 6h10z" fill="#c42a98"/><path d="M${c} ${c - R + 3}v10" stroke="#c42a98" stroke-width="2.5"/></g>
      <circle cx="${c}" cy="${c}" r="26" fill="#fff"/>
      <g fill="#c42a98"><circle cx="${c}" cy="${c - 11}" r="5"/><circle cx="${c}" cy="${c + 11}" r="5"/><circle cx="${c - 11}" cy="${c}" r="5"/><circle cx="${c + 11}" cy="${c}" r="5"/></g>
      <path d="M${c} ${c - 4}v8M${c - 4} ${c}h8" stroke="#c42a98" stroke-width="2"/>
    </svg><div class="steer-row"><button data-s="-100">⟲ spin</button><button data-s="-50">left</button><button data-s="0">straight</button><button data-s="50">right</button><button data-s="100">spin ⟳</button></div>
    <input class="steer-input" type="number" min="-100" max="100" step="1"></div>`;
    const svg = div.querySelector('svg'), needle = div.querySelector('.needle'), input = div.querySelector('.steer-input');
    const show = () => { const v = Number(this.getValue()) || 0; needle.setAttribute('transform', `rotate(${v * 1.8} ${c} ${c})`); input.value = v; };
    const set = (v) => { this.setValue(Math.max(-100, Math.min(100, Math.round(v)))); show(); };
    const fromPointer = (e) => {
      const r = svg.getBoundingClientRect();
      const ang = Math.atan2(e.clientX - r.left - c, -(e.clientY - r.top - c)) / DEG; // 0 = up, +90 = right
      let v = ang / 1.8;
      if (Math.abs(v) < 3) v = 0;
      set(v);
    };
    svg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      fromPointer(e);
      const move = (ev) => fromPointer(ev);
      const up = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerup', up);
    });
    div.querySelectorAll('button[data-s]').forEach((b) => b.addEventListener('click', () => set(Number(b.dataset.s))));
    input.addEventListener('input', () => { if (input.value !== '' && isFinite(Number(input.value))) set(Number(input.value)); });
    show();
    D.setColour(EV3_COLORS.movement, '#c42a98');
    D.showPositionedByField(this, () => {});
  }
}
Blockly.fieldRegistry.register('field_ev3_steering', FieldSteering);

// ---------- Block definition helpers ----------
const dd = (name, options) => ({ type: 'field_dropdown', name, options });
const val = (name, check) => (check ? { type: 'input_value', name, check } : { type: 'input_value', name });
const stmt = (name) => ({ type: 'input_statement', name });
const port = () => dd('PORT', DD.sensorPort);
const msgField = () => ({ type: 'field_ev3_message', name: 'MSG', value: 'message1' });
const listField = () => ({ type: 'field_variable', name: 'LIST', variable: 'my list', variableTypes: ['list'], defaultType: 'list' });

function cmd(type, colour, message, args, extra = {}) {
  return Object.assign({ type, message0: message, args0: args, previousStatement: null, nextStatement: null, colour, inputsInline: true }, extra);
}
function rep(type, colour, message, args, check = null) {
  return { type, message0: message, args0: args, output: check, colour, inputsInline: true, outputShape: check === 'Boolean' ? 1 : 2 };
}
function hat(type, colour, message, args) {
  return { type, message0: message, args0: args, nextStatement: null, colour, style: { hat: 'cap' }, inputsInline: true, extensions: ['ev3_hat'] };
}

const C = EV3_COLORS;
const I = {
  motor: icon('motor', C.motors), move: icon('movement', C.movement), us: icon('ultrasonic'), ir: icon('infrared'),
  color: icon('color'), touch: icon('touch'), gyro: icon('gyro'), brick: icon('brick'), sound: icon('sound'), play: icon('play'), timer: icon('timer'),
};
const S = C.sensors;
const loopArrow = { type: 'field_label', text: '↺' };

const EV3_BLOCKS = [
  // ---------- Input shadows (white round slots, like Scratch) ----------
  { type: 'ev3_num', message0: '%1', args0: [{ type: 'field_input', name: 'NUM', text: '0' }], output: null, colour: '#FFFFFF', outputShape: 2, extensions: ['ev3_numeric'] },
  { type: 'ev3_text', message0: '%1', args0: [{ type: 'field_input', name: 'TEXT', text: '' }], output: null, colour: '#FFFFFF', outputShape: 2 },
  { type: 'ev3_steering', message0: '%1', args0: [{ type: 'field_ev3_steering', name: 'STEER', value: 0 }], output: 'Number', colour: '#FFFFFF', outputShape: 2 },

  // ---------- Motors ----------
  cmd('ev3_motor_run_for', C.motors, '%1 %2 run %3 for %4 %5', [I.motor, dd('PORT', DD.motorPorts), dd('DIR', DD.rotDir), val('AMOUNT'), dd('UNIT', DD.motorUnits)]),
  cmd('ev3_motor_goto', C.motors, '%1 %2 go to position %3', [I.motor, dd('PORT', DD.motorPorts), val('POS')]),
  cmd('ev3_motor_start', C.motors, '%1 %2 start motor %3', [I.motor, dd('PORT', DD.motorPorts), dd('DIR', DD.rotDir)]),
  cmd('ev3_motor_start_speed', C.motors, '%1 %2 start motor at %3 % speed', [I.motor, dd('PORT', DD.motorPorts), val('SPEED')]),
  cmd('ev3_motor_stop', C.motors, '%1 %2 stop motor', [I.motor, dd('PORT', DD.motorPorts)]),
  cmd('ev3_motor_set_speed', C.motors, '%1 %2 set speed to %3 %', [I.motor, dd('PORT', DD.motorPorts), val('SPEED')]),
  cmd('ev3_motor_set_stop', C.motors, '%1 %2 set stop action to %3', [I.motor, dd('PORT', DD.motorPorts), dd('ACTION', DD.stopActions)]),
  cmd('ev3_motor_set_pos', C.motors, '%1 %2 set relative position to %3', [I.motor, dd('PORT', DD.motorPorts), val('POS')]),
  rep('ev3_motor_position', C.motors, '%1 %2 relative position', [I.motor, dd('PORT', DD.motorPort)], 'Number'),
  rep('ev3_motor_speed', C.motors, '%1 %2 speed', [I.motor, dd('PORT', DD.motorPort)], 'Number'),

  // ---------- Movement ----------
  cmd('ev3_move_dir_for', C.movement, '%1 move %2 for %3 %4', [I.move, dd('DIR', DD.moveDir), val('AMOUNT'), dd('UNIT', DD.moveUnits)]),
  cmd('ev3_move_steer_for', C.movement, '%1 move %2 for %3 %4', [I.move, val('STEER'), val('AMOUNT'), dd('UNIT', DD.moveUnits)]),
  cmd('ev3_move_tank_for', C.movement, '%1 move for %2 %3 at %4 %5 % speed', [I.move, val('AMOUNT'), dd('UNIT', DD.moveUnits), val('LEFT'), val('RIGHT')]),
  cmd('ev3_move_dir_start', C.movement, '%1 start moving %2', [I.move, dd('DIR', DD.moveDir)]),
  cmd('ev3_move_steer_start', C.movement, '%1 start moving %2 at %3 % speed', [I.move, val('STEER'), val('SPEED')]),
  cmd('ev3_move_tank_start', C.movement, '%1 start moving at %2 %3 % speed', [I.move, val('LEFT'), val('RIGHT')]),
  cmd('ev3_move_stop', C.movement, '%1 stop moving', [I.move]),
  cmd('ev3_move_set_speed', C.movement, '%1 set movement speed to %2 %', [I.move, val('SPEED')]),
  cmd('ev3_move_set_pair', C.movement, '%1 set movement motors to %2', [I.move, dd('PAIR', DD.pairs)]),
  cmd('ev3_move_set_rotation', C.movement, '%1 set 1 motor rotation to %2 cm', [I.move, val('CM')]),
  cmd('ev3_move_set_stop', C.movement, '%1 set movement stop action to %2', [I.move, dd('ACTION', DD.stopActions)]),

  // ---------- Display ----------
  cmd('ev3_display_image_for', C.display, '%1 display image %2 for %3 seconds', [I.brick, dd('IMAGE', DD.images), val('SECS')]),
  cmd('ev3_display_image', C.display, '%1 display image %2', [I.brick, dd('IMAGE', DD.images)]),
  cmd('ev3_display_text_line', C.display, '%1 write %2 at line %3', [I.brick, val('TEXT'), val('LINE')]),
  cmd('ev3_display_text_xy', C.display, '%1 write %2 at x: %3 y: %4', [I.brick, val('TEXT'), val('X'), val('Y')]),
  cmd('ev3_display_clear', C.display, '%1 clear display', [I.brick]),
  cmd('ev3_display_font', C.display, '%1 set font to %2', [I.brick, dd('FONT', DD.fonts)]),
  cmd('ev3_display_pen', C.display, '%1 set pen color to %2', [I.brick, dd('COLOR', DD.penColor)]),
  cmd('ev3_display_pixel', C.display, '%1 draw pixel at x: %2 y: %3', [I.brick, val('X'), val('Y')]),
  cmd('ev3_display_line', C.display, '%1 draw line from x: %2 y: %3 to x: %4 y: %5', [I.brick, val('X1'), val('Y1'), val('X2'), val('Y2')]),
  cmd('ev3_display_circle', C.display, '%1 draw %2 circle at x: %3 y: %4 radius: %5', [I.brick, dd('FILL', DD.fill), val('X'), val('Y'), val('R')]),
  cmd('ev3_display_rect', C.display, '%1 draw %2 rectangle at x: %3 y: %4 width: %5 height: %6', [I.brick, dd('FILL', DD.fill), val('X'), val('Y'), val('W'), val('H')]),
  cmd('ev3_light', C.display, '%1 set brick status light to %2 %3', [I.brick, dd('COLOR', DD.lightColor), dd('MODE', DD.lightMode)]),
  cmd('ev3_light_off', C.display, '%1 turn off brick status light', [I.brick]),

  // ---------- Sound ----------
  cmd('ev3_sound_play_wait', C.sound, '%1 play sound %2 until done', [I.sound, dd('SOUND', DD.sounds)]),
  cmd('ev3_sound_play', C.sound, '%1 start sound %2', [I.sound, dd('SOUND', DD.sounds)]),
  cmd('ev3_beep_for', C.sound, '%1 play beep %2 for %3 seconds', [I.sound, val('NOTE'), val('SECS')]),
  cmd('ev3_beep', C.sound, '%1 start playing beep %2', [I.sound, val('NOTE')]),
  cmd('ev3_sound_stop', C.sound, '%1 stop all sounds', [I.sound]),
  cmd('ev3_volume_set', C.sound, '%1 set volume to %2 %', [I.sound, val('VOL')]),
  cmd('ev3_volume_change', C.sound, '%1 change volume by %2', [I.sound, val('VOL')]),
  rep('ev3_volume', C.sound, '%1 volume', [I.sound], 'Number'),

  // ---------- Events ----------
  hat('ev3_when_start', C.events, '%1 when program starts', [I.play]),
  hat('ev3_when_color', C.events, '%1 %2 when color is %3', [I.color, port(), dd('COLOR', DD.colors)]),
  hat('ev3_when_touch', C.events, '%1 %2 when %3', [I.touch, port(), dd('STATE', DD.touchState)]),
  hat('ev3_when_distance', C.events, '%1 %2 when distance is %3 %4 %5', [I.us, port(), dd('OP', DD.opWords), val('VALUE'), dd('UNIT', DD.distUnits)]),
  hat('ev3_when_proximity', C.events, '%1 %2 when proximity is %3 %4 %', [I.ir, port(), dd('OP', DD.opWords), val('VALUE')]),
  hat('ev3_when_beacon', C.events, '%1 %2 when beacon %3 %4', [I.ir, port(), dd('CH', DD.channels), dd('BUTTON', DD.beaconButtons)]),
  hat('ev3_when_angle', C.events, '%1 %2 when angle is %3 %4 °', [I.gyro, port(), dd('OP', DD.opWords), val('VALUE')]),
  hat('ev3_when_button', C.events, '%1 when %2 button %3', [I.brick, dd('BUTTON', DD.buttons), dd('STATE', DD.buttonState)]),
  hat('ev3_when_cond', C.events, 'when %1', [val('COND', 'Boolean')]),
  hat('ev3_when_receive', C.events, 'when I receive %1', [msgField()]),
  cmd('ev3_broadcast', C.events, 'broadcast %1', [msgField()]),
  cmd('ev3_broadcast_wait', C.events, 'broadcast %1 and wait', [msgField()]),

  // ---------- Control ----------
  cmd('ev3_wait', C.control, 'wait %1 seconds', [val('SECS')]),
  cmd('ev3_wait_until', C.control, 'wait until %1', [val('COND', 'Boolean')]),
  { type: 'ev3_repeat', message0: 'repeat %1', args0: [val('TIMES')], message1: '%1', args1: [stmt('DO')], message2: '%1', args2: [loopArrow], previousStatement: null, nextStatement: null, colour: C.control, inputsInline: true },
  { type: 'ev3_forever', message0: 'forever', message1: '%1', args1: [stmt('DO')], message2: '%1', args2: [loopArrow], previousStatement: null, colour: C.control },
  { type: 'ev3_repeat_until', message0: 'repeat until %1', args0: [val('COND', 'Boolean')], message1: '%1', args1: [stmt('DO')], message2: '%1', args2: [loopArrow], previousStatement: null, nextStatement: null, colour: C.control, inputsInline: true },
  { type: 'ev3_if', message0: 'if %1 then', args0: [val('COND', 'Boolean')], message1: '%1', args1: [stmt('DO')], previousStatement: null, nextStatement: null, colour: C.control, inputsInline: true },
  { type: 'ev3_if_else', message0: 'if %1 then', args0: [val('COND', 'Boolean')], message1: '%1', args1: [stmt('DO')], message2: 'else', message3: '%1', args3: [stmt('ELSE')], previousStatement: null, nextStatement: null, colour: C.control, inputsInline: true },
  cmd('ev3_stop_other', C.control, 'stop other stacks', []),
  { type: 'ev3_stop', message0: 'stop %1', args0: [dd('WHAT', DD.stop)], previousStatement: null, colour: C.control },

  // ---------- Sensors: color ----------
  cmd('ev3_reflect_wait', S, '%1 %2 wait until reflected light intensity is %3 %4 %', [I.color, port(), dd('OP', DD.opWords), val('VALUE')]),
  rep('ev3_reflect_cmp', S, '%1 %2 is reflected light intensity %3 %4 % ?', [I.color, port(), dd('OP', DD.opSymbols), val('VALUE')], 'Boolean'),
  rep('ev3_reflect', S, '%1 %2 reflected light intensity', [I.color, port()], 'Number'),
  cmd('ev3_reflect_calibrate', S, '%1 %2 calibrate reflected light intensity %3', [I.color, port(), dd('WHICH', DD.calib)]),
  cmd('ev3_reflect_reset', S, '%1 %2 reset reflected light intensity calibration', [I.color, port()]),
  cmd('ev3_color_wait', S, '%1 %2 wait until color is %3', [I.color, port(), dd('COLOR', DD.colors)]),
  rep('ev3_color_is', S, '%1 %2 is color %3 ?', [I.color, port(), dd('COLOR', DD.colors)], 'Boolean'),
  rep('ev3_color', S, '%1 %2 color', [I.color, port()], 'String'),
  rep('ev3_ambient_cmp', S, '%1 %2 is ambient light intensity %3 %4 % ?', [I.color, port(), dd('OP', DD.opSymbols), val('VALUE')], 'Boolean'),
  rep('ev3_ambient', S, '%1 %2 ambient light intensity', [I.color, port()], 'Number'),
  // touch
  cmd('ev3_touch_wait', S, '%1 %2 wait until %3', [I.touch, port(), dd('STATE', DD.touchState)]),
  rep('ev3_touch_is', S, '%1 %2 is %3 ?', [I.touch, port(), dd('STATE', DD.touchIs)], 'Boolean'),
  // ultrasonic
  cmd('ev3_distance_wait', S, '%1 %2 wait until distance is %3 %4 %5', [I.us, port(), dd('OP', DD.opWords), val('VALUE'), dd('UNIT', DD.distUnits)]),
  rep('ev3_distance_cmp', S, '%1 %2 is distance %3 %4 %5 ?', [I.us, port(), dd('OP', DD.opSymbols), val('VALUE'), dd('UNIT', DD.distUnits)], 'Boolean'),
  rep('ev3_distance', S, '%1 %2 distance in %3', [I.us, port(), dd('UNIT', DD.distUnits)], 'Number'),
  // infrared
  cmd('ev3_prox_wait', S, '%1 %2 wait until proximity is %3 %4 %', [I.ir, port(), dd('OP', DD.opWords), val('VALUE')]),
  rep('ev3_prox_cmp', S, '%1 %2 is proximity %3 %4 % ?', [I.ir, port(), dd('OP', DD.opSymbols), val('VALUE')], 'Boolean'),
  rep('ev3_prox', S, '%1 %2 proximity', [I.ir, port()], 'Number'),
  cmd('ev3_beacon_wait', S, '%1 %2 wait until beacon %3 %4', [I.ir, port(), dd('CH', DD.channels), dd('BUTTON', DD.beaconButtons)]),
  rep('ev3_beacon_is', S, '%1 %2 is beacon %3 %4 ?', [I.ir, port(), dd('CH', DD.channels), dd('BUTTON', DD.beaconButtons)], 'Boolean'),
  rep('ev3_beacon_buttons', S, '%1 %2 beacon %3 buttons pressed', [I.ir, port(), dd('CH', DD.channels)], 'String'),
  rep('ev3_beacon_heading_cmp', S, '%1 %2 is beacon %3 heading %4 %5 ?', [I.ir, port(), dd('CH', DD.channels), dd('OP', DD.opSymbols), val('VALUE')], 'Boolean'),
  rep('ev3_beacon_active', S, '%1 %2 is beacon %3 active?', [I.ir, port(), dd('CH', DD.channels)], 'Boolean'),
  rep('ev3_beacon_heading', S, '%1 %2 heading to beacon %3', [I.ir, port(), dd('CH', DD.channels)], 'Number'),
  rep('ev3_beacon_prox', S, '%1 %2 proximity to beacon %3', [I.ir, port(), dd('CH', DD.channels)], 'Number'),
  // gyro
  cmd('ev3_angle_wait', S, '%1 %2 wait until angle is %3 %4 °', [I.gyro, port(), dd('OP', DD.opWords), val('VALUE')]),
  rep('ev3_angle_cmp', S, '%1 %2 is angle %3 %4 ° ?', [I.gyro, port(), dd('OP', DD.opSymbols), val('VALUE')], 'Boolean'),
  rep('ev3_angle', S, '%1 %2 angle', [I.gyro, port()], 'Number'),
  cmd('ev3_angle_reset', S, '%1 %2 reset angle', [I.gyro, port()]),
  rep('ev3_rate', S, '%1 %2 angular velocity', [I.gyro, port()], 'Number'),
  rep('ev3_rate_cmp', S, '%1 %2 is angular velocity %3 %4 °/s ?', [I.gyro, port(), dd('OP', DD.opSymbols), val('VALUE')], 'Boolean'),
  // brick buttons and timer
  cmd('ev3_button_wait', S, '%1 wait until %2 button %3', [I.brick, dd('BUTTON', DD.buttons), dd('STATE', DD.buttonState)]),
  rep('ev3_button_is', S, '%1 is %2 button %3 ?', [I.brick, dd('BUTTON', DD.buttons), dd('STATE', DD.buttonState)], 'Boolean'),
  rep('ev3_timer', S, '%1 timer', [I.timer], 'Number'),
  cmd('ev3_timer_reset', S, '%1 reset timer', [I.timer]),

  // ---------- Operators ----------
  rep('ev3_op_random', C.operators, 'pick random %1 to %2', [val('FROM'), val('TO')], 'Number'),
  rep('ev3_op_add', C.operators, '%1 + %2', [val('A'), val('B')], 'Number'),
  rep('ev3_op_sub', C.operators, '%1 - %2', [val('A'), val('B')], 'Number'),
  rep('ev3_op_mul', C.operators, '%1 * %2', [val('A'), val('B')], 'Number'),
  rep('ev3_op_div', C.operators, '%1 / %2', [val('A'), val('B')], 'Number'),
  rep('ev3_op_lt', C.operators, '%1 < %2', [val('A'), val('B')], 'Boolean'),
  rep('ev3_op_eq', C.operators, '%1 = %2', [val('A'), val('B')], 'Boolean'),
  rep('ev3_op_gt', C.operators, '%1 > %2', [val('A'), val('B')], 'Boolean'),
  rep('ev3_op_and', C.operators, '%1 and %2', [val('A', 'Boolean'), val('B', 'Boolean')], 'Boolean'),
  rep('ev3_op_or', C.operators, '%1 or %2', [val('A', 'Boolean'), val('B', 'Boolean')], 'Boolean'),
  rep('ev3_op_not', C.operators, 'not %1', [val('A', 'Boolean')], 'Boolean'),
  rep('ev3_op_join', C.operators, 'join %1 %2', [val('A'), val('B')], 'String'),
  rep('ev3_op_letter', C.operators, 'letter %1 of %2', [val('N'), val('TEXT')], 'String'),
  rep('ev3_op_length', C.operators, 'length of %1', [val('TEXT')], 'Number'),
  rep('ev3_op_contains', C.operators, '%1 contains %2 ?', [val('A'), val('B')], 'Boolean'),
  rep('ev3_op_mod', C.operators, '%1 mod %2', [val('A'), val('B')], 'Number'),
  rep('ev3_op_round', C.operators, 'round %1', [val('A')], 'Number'),
  rep('ev3_op_math', C.operators, '%1 of %2', [dd('OP', DD.math), val('A')], 'Number'),

  // ---------- Lists ----------
  rep('ev3_list', C.lists, '%1', [listField()], null),
  cmd('ev3_list_add', C.lists, 'add %1 to %2', [val('ITEM'), listField()]),
  cmd('ev3_list_delete', C.lists, 'delete %1 of %2', [val('INDEX'), listField()]),
  cmd('ev3_list_delete_all', C.lists, 'delete all of %1', [listField()]),
  cmd('ev3_list_insert', C.lists, 'insert %1 at %2 of %3', [val('ITEM'), val('INDEX'), listField()]),
  cmd('ev3_list_replace', C.lists, 'replace item %1 of %2 with %3', [val('INDEX'), listField(), val('ITEM')]),
  rep('ev3_list_item', C.lists, 'item %1 of %2', [val('INDEX'), listField()], null),
  rep('ev3_list_index', C.lists, 'item # of %1 in %2', [val('ITEM'), listField()], 'Number'),
  rep('ev3_list_length', C.lists, 'length of %1', [listField()], 'Number'),
  rep('ev3_list_contains', C.lists, '%1 contains %2 ?', [listField(), val('ITEM')], 'Boolean'),
];

Blockly.Extensions.register('ev3_hat', function () {
  this.suppressPrefixSuffix = true;
});
Blockly.Extensions.register('ev3_numeric', function () {
  this.getField('NUM').setValidator((v) => (/^-?\d*\.?\d*$/.test(v) ? v : null));
});
Blockly.common.defineBlocksWithJsonArray(EV3_BLOCKS);
// Older projects may still use cm / in units: accept them silently (not offered in the menu, like EV3 Classroom).
for (const t of ['ev3_move_dir_for', 'ev3_move_steer_for', 'ev3_move_tank_for']) {
  const def = Blockly.Blocks[t], init = def.init;
  def.init = function () {
    init.call(this);
    const f = this.getField('UNIT'), orig = f.doClassValidation_.bind(f);
    f.doClassValidation_ = (v) => (v === 'cm' || v === 'in' ? v : orig(v));
  };
}

// ---------- Toolbox ----------
const N = (v) => ({ shadow: { type: 'ev3_num', fields: { NUM: String(v) } } });
const TXT = (v) => ({ shadow: { type: 'ev3_text', fields: { TEXT: String(v) } } });
const STEER = (v) => ({ shadow: { type: 'ev3_steering', fields: { STEER: v } } });
const B = (type, inputs, fields) => {
  const o = { kind: 'block', type };
  if (inputs) o.inputs = inputs;
  if (fields) o.fields = fields;
  return o;
};
const GAP = { kind: 'sep', gap: 36 };

const EV3_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Motors', colour: C.motors, contents: [
      B('ev3_motor_run_for', { AMOUNT: N(1) }), B('ev3_motor_goto', { POS: N(0) }), B('ev3_motor_start'), B('ev3_motor_start_speed', { SPEED: N(75) }),
      B('ev3_motor_stop'), B('ev3_motor_set_speed', { SPEED: N(75) }), B('ev3_motor_set_stop'), B('ev3_motor_set_pos', { POS: N(0) }),
      B('ev3_motor_position'), B('ev3_motor_speed'),
    ] },
    { kind: 'category', name: 'Movement', colour: C.movement, contents: [
      B('ev3_move_dir_for', { AMOUNT: N(1) }), B('ev3_move_steer_for', { STEER: STEER(0), AMOUNT: N(1) }),
      B('ev3_move_tank_for', { AMOUNT: N(1), LEFT: N(50), RIGHT: N(50) }), B('ev3_move_dir_start'), B('ev3_move_steer_start', { STEER: STEER(0), SPEED: N(50) }),
      B('ev3_move_tank_start', { LEFT: N(50), RIGHT: N(50) }), B('ev3_move_stop'), GAP, B('ev3_move_set_speed', { SPEED: N(50) }),
      B('ev3_move_set_pair'), B('ev3_move_set_stop'),
    ] },
    { kind: 'category', name: 'Display', colour: C.display, contents: [
      B('ev3_display_image_for', { SECS: N(2) }), B('ev3_display_image'), B('ev3_display_text_line', { TEXT: TXT('Hello'), LINE: N(1) }),
      B('ev3_display_text_xy', { TEXT: TXT('Hello'), X: N(0), Y: N(0) }), B('ev3_display_clear'), B('ev3_display_font'), B('ev3_display_pen'),
      B('ev3_display_pixel', { X: N(89), Y: N(64) }), B('ev3_display_line', { X1: N(0), Y1: N(0), X2: N(177), Y2: N(127) }),
      B('ev3_display_circle', { X: N(89), Y: N(64), R: N(20) }), B('ev3_display_rect', { X: N(10), Y: N(10), W: N(50), H: N(30) }),
      GAP, B('ev3_light'), B('ev3_light_off'),
    ] },
    { kind: 'category', name: 'Sound', colour: C.sound, contents: [
      B('ev3_sound_play_wait'), B('ev3_sound_play'), B('ev3_beep_for', { NOTE: N(60), SECS: N(0.2) }), B('ev3_beep', { NOTE: N(60) }),
      B('ev3_sound_stop'), B('ev3_volume_set', { VOL: N(100) }), B('ev3_volume_change', { VOL: N(-10) }), B('ev3_volume'),
    ] },
    { kind: 'category', name: 'Events', colour: C.events, contents: [
      B('ev3_when_start'), B('ev3_when_color', null, { PORT: '3' }), B('ev3_when_touch', null, { PORT: '1' }),
      B('ev3_when_distance', { VALUE: N(15) }, { PORT: '4' }), B('ev3_when_proximity', { VALUE: N(15) }, { PORT: '4' }),
      B('ev3_when_beacon', null, { PORT: '4', BUTTON: 'top left' }), B('ev3_when_angle', { VALUE: N(90) }, { PORT: '2' }), B('ev3_when_button'),
      B('ev3_when_cond'), GAP, B('ev3_when_receive'), B('ev3_broadcast'), B('ev3_broadcast_wait'),
    ] },
    { kind: 'category', name: 'Control', colour: C.control, contents: [
      B('ev3_wait', { SECS: N(1) }), B('ev3_wait_until'), GAP, B('ev3_repeat', { TIMES: N(10) }), B('ev3_forever'), B('ev3_repeat_until'), GAP,
      B('ev3_if'), B('ev3_if_else'), GAP, B('ev3_stop_other'), B('ev3_stop'),
    ] },
    { kind: 'category', name: 'Sensors', colour: C.sensors, contents: [
      B('ev3_reflect_wait', { VALUE: N(50) }, { PORT: '3' }), B('ev3_reflect_cmp', { VALUE: N(50) }, { PORT: '3' }), B('ev3_reflect', null, { PORT: '3' }),
      B('ev3_reflect_calibrate', null, { PORT: '3' }), B('ev3_reflect_reset', null, { PORT: '3' }),
      B('ev3_color_wait', null, { PORT: '3' }), B('ev3_color_is', null, { PORT: '3' }), B('ev3_color', null, { PORT: '3' }),
      B('ev3_ambient_cmp', { VALUE: N(50) }, { PORT: '3' }), B('ev3_ambient', null, { PORT: '3' }), GAP,
      B('ev3_touch_wait', null, { PORT: '1' }), B('ev3_touch_is', null, { PORT: '1' }), GAP,
      B('ev3_distance_wait', { VALUE: N(15) }, { PORT: '4' }), B('ev3_distance_cmp', { VALUE: N(15) }, { PORT: '4' }), B('ev3_distance', null, { PORT: '4' }), GAP,
      B('ev3_prox_wait', { VALUE: N(15) }, { PORT: '4' }), B('ev3_prox_cmp', { VALUE: N(15) }, { PORT: '4' }), B('ev3_prox', null, { PORT: '4' }),
      B('ev3_beacon_wait', null, { PORT: '4', BUTTON: 'top left' }), B('ev3_beacon_is', null, { PORT: '4' }), B('ev3_beacon_buttons', null, { PORT: '4' }),
      B('ev3_beacon_heading_cmp', { VALUE: N(0) }, { PORT: '4' }), B('ev3_beacon_active', null, { PORT: '4' }), B('ev3_beacon_heading', null, { PORT: '4' }), B('ev3_beacon_prox', null, { PORT: '4' }), GAP,
      B('ev3_angle_wait', { VALUE: N(90) }, { PORT: '2' }), B('ev3_angle_cmp', { VALUE: N(45) }, { PORT: '2' }), B('ev3_angle', null, { PORT: '2' }),
      B('ev3_angle_reset', null, { PORT: '2' }), B('ev3_rate', null, { PORT: '2' }), B('ev3_rate_cmp', { VALUE: N(10) }, { PORT: '2' }), GAP,
      B('ev3_button_wait'), B('ev3_button_is'), B('ev3_timer'), B('ev3_timer_reset'),
    ] },
    { kind: 'category', name: 'Operators', colour: C.operators, contents: [
      B('ev3_op_random', { FROM: N(1), TO: N(10) }), GAP,
      B('ev3_op_add', { A: N(''), B: N('') }), B('ev3_op_sub', { A: N(''), B: N('') }), B('ev3_op_mul', { A: N(''), B: N('') }), B('ev3_op_div', { A: N(''), B: N('') }), GAP,
      B('ev3_op_lt', { A: TXT(''), B: TXT(100) }), B('ev3_op_eq', { A: TXT(''), B: TXT(100) }), B('ev3_op_gt', { A: TXT(''), B: TXT(100) }), GAP,
      B('ev3_op_and'), B('ev3_op_or'), B('ev3_op_not'), GAP,
      B('ev3_op_join', { A: TXT('apple'), B: TXT('banana') }), B('ev3_op_letter', { N: N(1), TEXT: TXT('apple') }),
      B('ev3_op_length', { TEXT: TXT('apple') }), B('ev3_op_contains', { A: TXT('apple'), B: TXT('a') }), GAP,
      B('ev3_op_mod', { A: N(''), B: N('') }), B('ev3_op_round', { A: N('') }), B('ev3_op_math', { A: N('') }),
    ] },
    { kind: 'category', name: 'Variables', colour: C.variables, custom: 'EV3_VARIABLES' },
    { kind: 'category', name: 'My Blocks', colour: C.myblocks, custom: 'EV3_MYBLOCKS' },
  ],
};

// Dynamic categories: Scratch-like variables + lists, and My Blocks.
function variablesFlyout(ws) {
  const out = [{ kind: 'button', text: 'Make a Variable', callbackkey: 'EV3_MAKE_VARIABLE' }];
  const vars = ws.getVariablesOfType('').sort((a, b) => a.name.localeCompare(b.name));
  if (vars.length) {
    for (const v of vars) out.push({ kind: 'block', type: 'variables_get', fields: { VAR: { id: v.getId() } } });
    const first = { id: vars[0].getId() };
    out.push(GAP);
    out.push({ kind: 'block', type: 'variables_set', fields: { VAR: first }, inputs: { VALUE: TXT(0) } });
    out.push({ kind: 'block', type: 'math_change', fields: { VAR: first }, inputs: { DELTA: N(1) } });
  }
  out.push(GAP, { kind: 'button', text: 'Make a List', callbackkey: 'EV3_MAKE_LIST' });
  const lists = ws.getVariablesOfType('list').sort((a, b) => a.name.localeCompare(b.name));
  if (lists.length) {
    for (const l of lists) out.push({ kind: 'block', type: 'ev3_list', fields: { LIST: { id: l.getId() } } });
    const L = { LIST: { id: lists[0].getId() } };
    out.push(GAP,
      { kind: 'block', type: 'ev3_list_add', fields: L, inputs: { ITEM: TXT('thing') } },
      { kind: 'block', type: 'ev3_list_delete', fields: L, inputs: { INDEX: N(1) } },
      { kind: 'block', type: 'ev3_list_delete_all', fields: L },
      { kind: 'block', type: 'ev3_list_insert', fields: L, inputs: { ITEM: TXT('thing'), INDEX: N(1) } },
      { kind: 'block', type: 'ev3_list_replace', fields: L, inputs: { INDEX: N(1), ITEM: TXT('thing') } },
      { kind: 'block', type: 'ev3_list_item', fields: L, inputs: { INDEX: N(1) } },
      { kind: 'block', type: 'ev3_list_index', fields: L, inputs: { ITEM: TXT('thing') } },
      { kind: 'block', type: 'ev3_list_length', fields: L },
      { kind: 'block', type: 'ev3_list_contains', fields: L, inputs: { ITEM: TXT('thing') } });
  }
  return out;
}

function myBlocksFlyout(ws) {
  const out = [{ kind: 'button', text: 'Make a Block', callbackkey: 'EV3_MAKE_BLOCK' }];
  const [defs] = Blockly.Procedures.allProcedures(ws);
  for (const [name, params] of defs) {
    const inputs = {};
    params.forEach((_, i) => { inputs['ARG' + i] = TXT(''); });
    out.push({ kind: 'block', type: 'procedures_callnoreturn', extraState: { name, params }, inputs });
  }
  return out;
}

const HAT_TYPES = new Set(EV3_BLOCKS.filter((b) => b.extensions && b.extensions.includes('ev3_hat')).map((b) => b.type));

const EV3_THEME = Blockly.Theme.defineTheme('ev3', {
  base: Blockly.Themes.Classic,
  blockStyles: {
    variable_blocks: { colourPrimary: EV3_COLORS.variables },
    variable_dynamic_blocks: { colourPrimary: EV3_COLORS.variables },
    procedure_blocks: { colourPrimary: EV3_COLORS.myblocks },
    logic_blocks: { colourPrimary: EV3_COLORS.operators },
    math_blocks: { colourPrimary: EV3_COLORS.variables },
    text_blocks: { colourPrimary: EV3_COLORS.operators },
    list_blocks: { colourPrimary: EV3_COLORS.lists },
  },
  componentStyles: {
    workspaceBackgroundColour: '#F7F7F7',
    toolboxBackgroundColour: '#FFFFFF',
    toolboxForegroundColour: '#4A4A4A',
    flyoutBackgroundColour: '#FFFFFF',
    flyoutForegroundColour: '#8A8A8A',
    flyoutOpacity: 1,
    scrollbarColour: '#CECECE',
  },
  fontStyle: { family: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: '500', size: 12 },
  startHats: true,
});
