document.addEventListener('DOMContentLoaded', () => {
  // Mapping corrigé selon le comportement réel du robot :
  // MF = gauche
  // MB = droite
  // MR = avance
  // ML = recule
  const DIR_TO_CMD   = { F: 'MR', B: 'ML', L: 'MF', R: 'MB' };

  const OPPOSITE_DIR = { F: 'B', B: 'F', L: 'R', R: 'L' };
  const DIR_LABEL    = { F: 'Avance', B: 'Recule', L: 'Tourne gauche', R: 'Tourne droite' };
  const REPEAT_MS    = 200; // < watchdog firmware (500ms)
  const STEP_GAP_MS  = 150; // pause entre deux étapes rejouées

  const baseEl      = document.getElementById('joystick-base');
  const knobEl      = document.getElementById('joystick-knob');
  const btnPointA   = document.getElementById('btn-point-a');
  const btnPointB   = document.getElementById('btn-point-b');
  const btnRecord   = document.getElementById('btn-record-step');
  const btnClear    = document.getElementById('btn-clear');
  const posEl       = document.getElementById('current-position');
  const logEl       = document.getElementById('record-log');

  let steps = [];                 // { dir: 'F'|'B'|'L'|'R', durationMs }
  let recording = true;           // capture les mouvements joystick tant qu'on n'a pas "figé" l'étape
  let currentDir = null;
  let segmentStart = 0;
  let repeatTimer = null;
  let currentPosition = 'A';
  let replaying = false;

  function debug(scope, data) {
    if (window.debugRobot) {
      window.debugRobot(scope, data);
    } else {
      console.debug(scope, data);
    }
  }

  function stopRepeat() {
    if (repeatTimer) {
      clearInterval(repeatTimer);
      repeatTimer = null;

      debug('RECORD_REPEAT_STOP', {});
    }
  }

  function logStep(step) {
    const div = document.createElement('div');
    div.textContent = DIR_LABEL[step.dir] + ' — ' + step.durationMs + ' ms';
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function closeSegment() {
    if (recording && currentDir !== null) {
      const durationMs = Date.now() - segmentStart;

      if (durationMs > 0) {
        const step = {
          dir: currentDir,
          durationMs
        };

        debug('RECORD_STEP', step);

        steps.push(step);
        logStep(step);
      }
    }
  }

  function updatePositionUI() {
    posEl.textContent = currentPosition;
    btnPointA.classList.toggle('active-point', currentPosition === 'A');
    btnPointB.classList.toggle('active-point', currentPosition === 'B');
  }

  function setControlsEnabled(enabled) {
    btnPointA.disabled = !enabled;
    btnPointB.disabled = !enabled;
    btnRecord.disabled = !enabled;
    btnClear.disabled = !enabled;
    baseEl.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  function reverseTrip(trip) {
    return trip
      .slice()
      .reverse()
      .map((s) => ({
        dir: OPPOSITE_DIR[s.dir],
        durationMs: s.durationMs
      }));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function playStep(step) {
    const cmd = DIR_TO_CMD[step.dir];

    debug('REPLAY_STEP_START', {
      ...step,
      cmd
    });

    RobotBle.sendLine(cmd);

    const timer = setInterval(() => {
      debug('REPLAY_REPEAT', {
        ...step,
        cmd
      });

      RobotBle.sendLine(cmd);
    }, REPEAT_MS);

    await delay(step.durationMs);

    clearInterval(timer);

    debug('REPLAY_STEP_STOP', {
      ...step,
      cmd: 'MS'
    });

    RobotBle.sendLine('MS');

    await delay(STEP_GAP_MS);
  }

  async function playTrip(trip, resultingPosition) {
    replaying = true;
    setControlsEnabled(false);

    debug('REPLAY_TRIP_START', {
      trip,
      resultingPosition
    });

    for (const step of trip) {
      await playStep(step);
    }

    replaying = false;
    currentPosition = resultingPosition;
    updatePositionUI();
    setControlsEnabled(true);

    debug('REPLAY_TRIP_END', {
      currentPosition
    });
  }

  // --- Joystick : pilotage direct + enregistrement des segments ---
  createJoystick(baseEl, knobEl, (dir) => {
    if (replaying) return;

    stopRepeat();
    closeSegment();

    if (dir === null) {
      debug('RECORD_CMD', {
        dir,
        cmd: 'MS'
      });

      RobotBle.sendLine('MS');
      currentDir = null;
      return;
    }

    const cmd = DIR_TO_CMD[dir];

    debug('RECORD_CMD', {
      dir,
      cmd
    });

    RobotBle.sendLine(cmd);

    repeatTimer = setInterval(() => {
      debug('RECORD_REPEAT', {
        dir,
        cmd
      });

      RobotBle.sendLine(cmd);
    }, REPEAT_MS);

    currentDir = dir;
    segmentStart = Date.now();
  });

  btnRecord.addEventListener('click', () => {
    if (replaying) return;

    stopRepeat();
    closeSegment();

    debug('RECORD_VALIDATE', {
      steps
    });

    RobotBle.sendLine('MS');

    currentDir = null;
    recording = false;
    currentPosition = 'B';
    btnPointB.hidden = false;

    updatePositionUI();
  });

  btnPointA.addEventListener('click', () => {
    if (replaying || currentPosition !== 'B' || steps.length === 0) return;

    debug('POINT_A_CLICK', {
      steps
    });

    playTrip(reverseTrip(steps), 'A');
  });

  btnPointB.addEventListener('click', () => {
    if (replaying || currentPosition !== 'A' || steps.length === 0) return;

    debug('POINT_B_CLICK', {
      steps
    });

    playTrip(steps, 'B');
  });

  btnClear.addEventListener('click', () => {
    if (replaying) return;

    stopRepeat();

    debug('RECORD_CLEAR', {});

    RobotBle.sendLine('MS');

    steps = [];
    recording = true;
    currentDir = null;
    currentPosition = 'A';
    btnPointB.hidden = true;
    logEl.innerHTML = '';

    updatePositionUI();
  });

  updatePositionUI();
});