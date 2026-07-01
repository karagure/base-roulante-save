// Joystick virtuel générique : ne connaît rien au BLE, informe juste
// l'appelant du changement de direction via onDirChange('F'|'B'|'L'|'R'|null).
function createJoystick(baseEl, knobEl, onDirChange) {
  const DEAD_ZONE_RATIO = 0.25; // ~25% du rayon autour du centre = pas de commande

  let active = false;
  let pointerId = null;
  let currentDir = null;

  function setDir(dir) {
    if (dir !== currentDir) {
      currentDir = dir;
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
      'translate(' + (Math.cos(angle) * clampedDist) + 'px, ' + (Math.sin(angle) * clampedDist) + 'px)';

    if (dist < radius * DEAD_ZONE_RATIO) {
      setDir(null);
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      setDir(dx > 0 ? 'R' : 'L');
    } else {
      setDir(dy > 0 ? 'B' : 'F');
    }
  }

  function onPointerDown(e) {
    active = true;
    pointerId = e.pointerId;
    baseEl.setPointerCapture(pointerId);
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
    active = false;
    pointerId = null;
    resetKnob();
    setDir(null);
  }

  baseEl.addEventListener('pointerdown', onPointerDown);
  baseEl.addEventListener('pointermove', onPointerMove);
  baseEl.addEventListener('pointerup', release);
  baseEl.addEventListener('pointercancel', release);
}

window.createJoystick = createJoystick;
