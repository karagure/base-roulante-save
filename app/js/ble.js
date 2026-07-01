const RobotBle = (() => {
  const SERVICE = 0xffe0;
  const CHAR    = 0xffe1;

  let device = null;
  let characteristic = null;
  const listeners = { state: [], telemetry: [] };
  const enc = new TextEncoder();
  const dec = new TextDecoder();

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

  function emit(type, data) {
    (listeners[type] || []).forEach(f => f(data));
  }

  function on(type, cb) {
    if (listeners[type]) listeners[type].push(cb);
  }

  async function connect() {
    window.debugRobot('BLE_CONNECT_START', { service: SERVICE, characteristic: CHAR });

    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }]
    });

    window.debugRobot('BLE_DEVICE_SELECTED', {
      name: device.name || null,
      id: device.id || null
    });

    device.addEventListener('gattserverdisconnected', () => {
      window.debugRobot('BLE_DISCONNECTED', {});
      characteristic = null;
      emit('state', false);
    });

    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    characteristic = await service.getCharacteristic(CHAR);

    await characteristic.startNotifications();

    characteristic.addEventListener('characteristicvaluechanged', (e) => {
      const line = dec.decode(e.target.value);
      window.debugRobot('BLE_RX', { line });
      emit('telemetry', line);
    });

    window.debugRobot('BLE_CONNECTED', {});
    emit('state', true);
  }

  function disconnect() {
    window.debugRobot('BLE_DISCONNECT_REQUEST', {});
    if (device && device.gatt.connected) device.gatt.disconnect();
  }

  async function sendLine(line) {
    if (!characteristic) {
      window.debugRobot('BLE_TX_SKIPPED', {
        line,
        reason: 'not-connected'
      });
      return;
    }

    window.debugRobot('BLE_TX', { line });
    await characteristic.writeValue(enc.encode(line + '\n'));
  }

  function isConnected() {
    return !!characteristic;
  }

  return { connect, disconnect, sendLine, isConnected, on };
})();

window.RobotBle = RobotBle;