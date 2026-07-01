document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.dir').forEach((b) => {
    const dir = b.dataset.dir;   // MF, MB, ML, MR, MS
    let timer = null;

    const start = (e) => {
      e.preventDefault();
      RobotBle.sendLine(dir);
      if (dir !== 'MS') {
        timer = setInterval(() => RobotBle.sendLine(dir), 250);
      }
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
      if (dir !== 'MS') RobotBle.sendLine('MS');
    };

    b.addEventListener('mousedown', start);
    b.addEventListener('touchstart', start, { passive: false });
    b.addEventListener('mouseup', stop);
    b.addEventListener('mouseleave', stop);
    b.addEventListener('touchend', stop);
  });

  const speed    = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');
  speed.addEventListener('input',  () => { speedVal.textContent = speed.value; });
  speed.addEventListener('change', () => { RobotBle.sendLine('SPEED ' + speed.value); });
});
