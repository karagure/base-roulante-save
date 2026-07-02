document.addEventListener('DOMContentLoaded', () => {
  const btnStart  = document.getElementById('btn-auto-start');
  const btnStop   = document.getElementById('btn-auto-stop');
  const indicator = document.getElementById('auto-indicator');

  btnStart.addEventListener('click', () => RobotBle.sendLine('AUTO'));
  btnStop.addEventListener('click',  () => RobotBle.sendLine('STOP'));

  const autoSpeed    = document.getElementById('auto-speed');
  const autoSpeedVal = document.getElementById('auto-speed-val');
  autoSpeed.addEventListener('input',  () => { autoSpeedVal.textContent = autoSpeed.value; });
  autoSpeed.addEventListener('change', () => { RobotBle.sendLine('AUTOSPEED ' + autoSpeed.value); });

  const autoThreshold    = document.getElementById('auto-threshold');
  const autoThresholdVal = document.getElementById('auto-threshold-val');
  autoThreshold.addEventListener('input',  () => { autoThresholdVal.textContent = autoThreshold.value; });
  autoThreshold.addEventListener('change', () => { RobotBle.sendLine('AUTOTHRESHOLD ' + autoThreshold.value); });

  RobotBle.on('telemetry', (line) => {
    const active = line.includes('[S]AUTO');
    indicator.textContent = active ? 'Actif' : 'Inactif';
    indicator.className = 'status ' + (active ? 'on' : 'off');
  });
});
