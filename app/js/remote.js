document.addEventListener('DOMContentLoaded', () => {
  // Mapping corrigé selon le comportement réel du robot :
  // MF = gauche
  // MB = droite
  // MR = avance
  // ML = recule
  const DIR_TO_CMD = { F: 'MR', B: 'ML', L: 'MF', R: 'MB' };

  const REPEAT_MS = 200; // < watchdog firmware (500ms)

  const baseEl = document.getElementById('joystick-base');
  const knobEl = document.getElementById('joystick-knob');

  let repeatTimer = null;

  const stopRepeat = () => {
    if (repeatTimer) {
      clearInterval(repeatTimer);
      repeatTimer = null;

      if (window.debugRobot) {
        window.debugRobot('REMOTE_REPEAT_STOP', {});
      }
    }
  };

  createJoystick(baseEl, knobEl, (dir) => {
    stopRepeat();

    if (dir === null) {
      if (window.debugRobot) {
        window.debugRobot('REMOTE_CMD', {
          dir,
          cmd: 'MS'
        });
      }

      RobotBle.sendLine('MS');
      return;
    }

    const cmd = DIR_TO_CMD[dir];

    if (window.debugRobot) {
      window.debugRobot('REMOTE_CMD', {
        dir,
        cmd
      });
    }

    RobotBle.sendLine(cmd);

    repeatTimer = setInterval(() => {
      if (window.debugRobot) {
        window.debugRobot('REMOTE_REPEAT', {
          dir,
          cmd
        });
      }

      RobotBle.sendLine(cmd);
    }, REPEAT_MS);
  });

  const speed    = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');

  speed.addEventListener('input', () => {
    speedVal.textContent = speed.value;
  });

  speed.addEventListener('change', () => {
    if (window.debugRobot) {
      window.debugRobot('REMOTE_SPEED', {
        speed: speed.value
      });
    }

    RobotBle.sendLine('SPEED ' + speed.value);
  });
});