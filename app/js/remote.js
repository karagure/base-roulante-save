document.addEventListener('DOMContentLoaded', () => {
  const DIR_TO_CMD = { F: 'MR', B: 'ML', L: 'MF', R: 'MB' };
  const REPEAT_MS = 200; // < watchdog firmware (500ms)

  const baseEl = document.getElementById('joystick-base');
  const knobEl = document.getElementById('joystick-knob');

  let repeatTimer = null;
  const stopRepeat = () => { if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; } };

  createJoystick(baseEl, knobEl, (dir) => {
    stopRepeat();
    if (dir === null) {
      RobotBle.sendLine('MS');
      return;
    }
    const cmd = DIR_TO_CMD[dir];
    RobotBle.sendLine(cmd);
    repeatTimer = setInterval(() => RobotBle.sendLine(cmd), REPEAT_MS);
  });

  const speed    = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');
  speed.addEventListener('input',  () => { speedVal.textContent = speed.value; });
  speed.addEventListener('change', () => { RobotBle.sendLine('SPEED ' + speed.value); });
});
