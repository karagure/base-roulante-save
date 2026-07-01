const RobotBle = (() => {
  const SERVICE = 0xffe0;
  const CHAR    = 0xffe1;

  let device = null;
  let characteristic = null;
  const listeners = { state: [], telemetry: [] };
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function emit(type, data) { (listeners[type] || []).forEach(f => f(data)); }
  function on(type, cb) { if (listeners[type]) listeners[type].push(cb); }

  async function connect() {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }]
    });
    device.addEventListener('gattserverdisconnected', () => {
      characteristic = null;
      emit('state', false);
    });
    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    characteristic = await service.getCharacteristic(CHAR);
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (e) => {
      emit('telemetry', dec.decode(e.target.value));
    });
    emit('state', true);
  }

  function disconnect() {
    if (device && device.gatt.connected) device.gatt.disconnect();
  }

  async function sendLine(line) {
    if (!characteristic) return;
    await characteristic.writeValue(enc.encode(line + '\n'));
  }

  function isConnected() { return !!characteristic; }

  return { connect, disconnect, sendLine, isConnected, on };
})();

window.RobotBle = RobotBle;
