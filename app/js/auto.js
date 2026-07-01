document.addEventListener('DOMContentLoaded', () => {
  const btnStart  = document.getElementById('btn-auto-start');
  const btnStop   = document.getElementById('btn-auto-stop');
  const indicator = document.getElementById('auto-indicator');

  btnStart.addEventListener('click', () => RobotBle.sendLine('AUTO'));
  btnStop.addEventListener('click',  () => RobotBle.sendLine('STOP'));

  RobotBle.on('telemetry', (line) => {
    const active = line.includes('[S]AUTO');
    indicator.textContent = active ? 'Actif' : 'Inactif';
    indicator.className = 'status ' + (active ? 'on' : 'off');
  });
});
