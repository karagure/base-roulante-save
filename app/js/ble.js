const RobotBle = (() => {
  const SERVICE = 0xffe0;
  const CHAR    = 0xffe1;

  let device = null;
  let characteristic = null;
  const listeners = { state: [], telemetry: [] };
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // --- Debug visuel limité, compatible téléphone ---
  window.debugRobot = window.debugRobot || (() => {
    const MAX_LINES = 80;
    const lines = [];

    let panel = null;
    let header = null;
    let content = null;
    let collapsed = false;

    function ensurePanel() {
      if (panel || !document.body) return;

      panel = document.createElement('div');
      panel.id = 'debug-panel';

      panel.style.cssText =
        'position:fixed;' +
        'left:8px;' +
        'right:8px;' +
        'bottom:8px;' +
        'max-height:28vh;' +
        'background:#111;' +
        'color:#0f0;' +
        'z-index:99999;' +
        'font:11px/1.35 monospace;' +
        'border-radius:6px;' +
        'opacity:.94;' +
        'overflow:hidden;' +
        'box-shadow:0 2px 12px rgba(0,0,0,.35);';

      header = document.createElement('div');
      header.style.cssText =
        'display:flex;' +
        'align-items:center;' +
        'justify-content:space-between;' +
        'gap:8px;' +
        'background:#222;' +
        'color:#fff;' +
        'padding:4px 6px;' +
        'font:12px sans-serif;';

      const title = document.createElement('span');
      title.textContent = 'Debug robot';

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px;';

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear';
      clearBtn.style.cssText =
        'font-size:11px;' +
        'padding:2px 6px;' +
        'border:0;' +
        'border-radius:4px;' +
        'background:#444;' +
        'color:#fff;';
      clearBtn.addEventListener('click', () => {
        lines.length = 0;
        render();
      });

      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = 'Hide';
      toggleBtn.style.cssText =
        'font-size:11px;' +
        'padding:2px 6px;' +
        'border:0;' +
        'border-radius:4px;' +
        'background:#444;' +
        'color:#fff;';
      toggleBtn.addEventListener('click', () => {
        collapsed = !collapsed;
        content.style.display = collapsed ? 'none' : 'block';
        toggleBtn.textContent = collapsed ? 'Show' : 'Hide';
        panel.style.maxHeight = collapsed ? '32px' : getPanelHeight();
      });

      actions.appendChild(clearBtn);
      actions.appendChild(toggleBtn);

      header.appendChild(title);
      header.appendChild(actions);

      content = document.createElement('pre');
      content.style.cssText =
        'margin:0;' +
        'padding:6px;' +
        'max-height:calc(' + getPanelHeight() + ' - 28px);' +
        'overflow:auto;' +
        'white-space:pre-wrap;' +
        'word-break:break-word;';

      panel.appendChild(header);
      panel.appendChild(content);
      document.body.appendChild(panel);

      applyResponsiveSize();

      window.addEventListener('resize', applyResponsiveSize);
    }

    function getPanelHeight() {
      if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) {
        return '22vh';
      }

      return '28vh';
    }

    function applyResponsiveSize() {
      if (!panel || !content) return;

      const height = getPanelHeight();

      if (!collapsed) {
        panel.style.maxHeight = height;
      }

      content.style.maxHeight = 'calc(' + height + ' - 28px)';
    }

    function render() {
      ensurePanel();
      if (!content) return;

      content.textContent = lines.join('\n');
      content.scrollTop = content.scrollHeight;
    }

    return function debugRobot(scope, data) {
      const line =
        '[' +
        new Date().toLocaleTimeString() +
        '] ' +
        scope +
        ' ' +
        JSON.stringify(data);

      console.debug(line);

      lines.push(line);

      while (lines.length > MAX_LINES) {
        lines.shift();
      }

      render();
    };
  })();

  function emit(type, data) {
    (listeners[type] || []).forEach(f => f(data));
  }

  function on(type, cb) {
    if (listeners[type]) listeners[type].push(cb);
  }

  async function connect() {
    window.debugRobot('BLE_CONNECT_START', {
      service: SERVICE,
      characteristic: CHAR
    });

    device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: 'BaseRoulante' }
      ],
      optionalServices: [SERVICE]
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

      window.debugRobot('BLE_RX', {
        line
      });

      emit('telemetry', line);
    });

    window.debugRobot('BLE_CONNECTED', {});
    emit('state', true);
  }

  function disconnect() {
    window.debugRobot('BLE_DISCONNECT_REQUEST', {});

    if (device && device.gatt.connected) {
      device.gatt.disconnect();
    }
  }

  async function sendLine(line) {
    if (!characteristic) {
      window.debugRobot('BLE_TX_SKIPPED', {
        line,
        reason: 'not-connected'
      });

      return;
    }

    window.debugRobot('BLE_TX', {
      line
    });

    await characteristic.writeValue(enc.encode(line + '\n'));
  }

  function isConnected() {
    return !!characteristic;
  }

  return {
    connect,
    disconnect,
    sendLine,
    isConnected,
    on
  };
})();

window.RobotBle = RobotBle;