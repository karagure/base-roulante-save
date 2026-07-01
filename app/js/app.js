document.addEventListener('DOMContentLoaded', () => {
  const btn    = document.getElementById('btn-connect');
  const status = document.getElementById('status');
  const telem  = document.getElementById('telemetry');

  if (!navigator.bluetooth) {
    status.textContent = 'Web Bluetooth non supporté — utilise Chrome ou Edge';
    status.className = 'status off';
    btn.disabled = true;
    return;
  }

  btn.addEventListener('click', async () => {
    try {
      if (RobotBle.isConnected()) { RobotBle.disconnect(); return; }
      await RobotBle.connect();
    } catch (e) {
      status.textContent = 'Échec connexion : ' + e.message;
    }
  });

  RobotBle.on('state', (connected) => {
    status.textContent = connected ? 'Connecté' : 'Déconnecté';
    status.className = 'status ' + (connected ? 'on' : 'off');
    btn.textContent = connected ? 'Déconnecter' : 'Connecter (BLE)';
    if (!connected) telem.textContent = '—';
  });

  RobotBle.on('telemetry', (line) => { telem.textContent = line; });

  // Onglets
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'blocks' && typeof window.onBlocksShown === 'function') {
        window.onBlocksShown();
      }
    });
  });
});
