// Joystick virtuel générique : ne connaît rien au BLE, informe juste
// l'appelant du changement de direction via onDirChange('F'|'B'|'L'|'R'|null).

window.debugRobot = window.debugRobot || function debugRobot(scope, data) {
  const line = '[' + new Date().toLocaleTimeString() + '] ' + scope + ' ' + JSON.stringify(data);
  console.debug(line);

  let panel = document.getElementById('debug-panel');
  if (!panel && document.body) {
    panel = document.createElement('pre');
    panel.id = 'debug-panel';
    panel.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:8px;max-height:35vh;overflow:auto;' +
      'background:#111;color:#0f0;padding:8px;z-index:99999;font:12px/1.4 monospace;' +
      'border-radius:6px;opacity:.92;';
    document.body.appendChild(panel);
  }

  if (panel) {
    panel.textContent += line + '\n';
    panel.scrollTop = panel.scrollHeight;
  }
};

function createJoystick(baseEl, knobEl, onDirChange) {
  const DEAD_ZONE_RATIO = 0.25; // ~25% du rayon autour du centre = pas de commande

  let active = false;
  let pointerId = null;
  let currentDir = null;

  function setDir(dir, meta = {}) {
    if (dir !== currentDir) {
      const previousDir = currentDir;
      currentDir = dir;

      window.debugRobot('JOYSTICK_DIR', {
        previousDir,
        dir,
        ...meta
      });

      onDirChange(dir);
    }
  }

  function resetKnob() {
    knobEl.style.transform = 'translate(0px, 0px)';
  }

  function handleMove(clientX, clientY) {
    const rect = baseEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2;

    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const clampedDist = Math.min(dist, radius);
    const angle = Math.atan2(dy, dx);

    knobEl.style.transform =
      'translate(' +
      (Math.cos(angle) * clampedDist) +
      'px, ' +
      (Math.sin(angle) * clampedDist) +
      'px)';

    const meta = {
      dx: Math.round(dx),
      dy: Math.round(dy),
      dist: Math.round(dist),
      radius: Math.round(radius),
      deadZone: Math.round(radius * DEAD_ZONE_RATIO),
      dominantAxis: Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    };

    if (dist < radius * DEAD_ZONE_RATIO) {
      setDir(null, {
        ...meta,
        reason: 'dead-zone'
      });
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      setDir(dx > 0 ? 'R' : 'L', meta);
    } else {
      setDir(dy > 0 ? 'B' : 'F', meta);
    }
  }

  function onPointerDown(e) {
    active = true;
    pointerId = e.pointerId;
    baseEl.setPointerCapture(pointerId);

    window.debugRobot('POINTER_DOWN', {
      pointerId,
      x: Math.round(e.clientX),
      y: Math.round(e.clientY)
    });

    handleMove(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!active || e.pointerId !== pointerId) return;

    handleMove(e.clientX, e.clientY);
    e.preventDefault();
  }

  function release(e) {
    if (!active || (e && e.pointerId !== pointerId)) return;

    window.debugRobot('POINTER_UP', { pointerId });

    active = false;
    pointerId = null;
    resetKnob();

    setDir(null, { reason: 'release' });
  }

  baseEl.addEventListener('pointerdown', onPointerDown);
  baseEl.addEventListener('pointermove', onPointerMove);
  baseEl.addEventListener('pointerup', release);
  baseEl.addEventListener('pointercancel', release);
}

window.createJoystick = createJoystick;