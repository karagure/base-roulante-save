# App web (télécommande + Blockly, Web Bluetooth) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ Préférence projet : AUCUN commit git.** Les étapes de commit sont remplacées par des « Points de contrôle » (vérification manuelle, sans git). Ne jamais lancer `git commit`/`git push`.

**Goal:** App web statique (dossier `app/`) qui pilote la base roulante via Web Bluetooth (BLE), avec deux modes : une **télécommande** live et un éditeur de **programmation par blocs** (Blockly) qui génère une séquence de commandes envoyée à l'ESP32.

**Architecture :** Site statique HTML/CSS/JS sans framework (pattern `dog-robot`). Un module BLE (`ble.js`) encapsule la connexion Web Bluetooth (service FFE0 / caractéristique FFE1) et expose `connect/disconnect/sendLine` + événements (`state`, `telemetry`). Deux modules d'UI indépendants (`remote.js`, `blocks.js`) consomment ce module via l'objet global `RobotBle`. `app.js` gère la connexion, les onglets et l'affichage de la télémétrie. Blockly est chargé par CDN.

**Tech Stack :** HTML5, CSS, JavaScript vanilla (ES modules non requis, scripts classiques), Web Bluetooth API, Blockly (CDN).

## Global Constraints

- **Transport :** Web Bluetooth (BLE) uniquement — service `0xffe0`, caractéristique `0xffe1` (write + notify). Contrat protocole = spec §6.
- **Compatibilité :** Web Bluetooth n'existe que sur navigateurs Chromium (Chrome/Edge/Opera), en **contexte sécurisé** (HTTPS ou `localhost`). Prévoir un message clair si `navigator.bluetooth` est absent.
- **Servir en local :** ouvrir l'app via un serveur local (`python3 -m http.server` → `http://localhost:8000`), pas en double-cliquant le fichier, pour garantir le contexte sécurisé.
- **Commandes envoyées :** toujours terminées par `\n`. Manuel = `MF/MB/ML/MR/MS` ; séquence = tokens `F/B/L/R/W` séparés par des espaces sur **une seule ligne** ; vitesse = `SPEED <0-255>` ; arrêt = `STOP`.
- **Une séquence par exécution :** le firmware remplace le trajet à chaque nouvelle séquence reçue (`setPath`). Le générateur Blockly produit donc **une seule ligne de séquence** (boucles déroulées) + éventuellement **une ligne `SPEED`** envoyée avant.
- **Style :** JS vanilla, pas de build, pas de dépendance npm (hors Blockly par CDN). Objet global `window.RobotBle` partagé entre modules.

---

## File Structure

- `app/index.html` — page unique : barre de connexion + télémétrie, onglets Télécommande / Code bloc, conteneurs des deux panneaux, `<script>` des 4 modules + Blockly CDN.
- `app/css/style.css` — mise en forme (barre, onglets, pavé directionnel, zone Blockly).
- `app/js/ble.js` — module BLE (`RobotBle`) : `connect`, `disconnect`, `sendLine`, `isConnected`, `on(type, cb)` pour `state`/`telemetry`.
- `app/js/app.js` — câblage global : bouton connexion, bascule d'onglets, affichage télémétrie, détection Web Bluetooth.
- `app/js/remote.js` — télécommande : pavé directionnel (maintien → renvoi périodique `M*`, relâche → `MS`) + slider vitesse (`SPEED`).
- `app/js/blocks.js` — définitions de blocs Blockly + `generateProgram()` (parcours manuel, boucles déroulées) + boutons Exécuter/STOP.

---

### Task 1 : Squelette statique (`index.html` + `style.css`)

**Files:**
- Create: `app/index.html`
- Create: `app/css/style.css`

**Interfaces:**
- Consumes: rien (les fichiers JS référencés seront créés aux tâches suivantes ; les `<script>` peuvent pointer vers des fichiers vides en attendant).
- Produces: structure DOM avec les IDs/classes attendus par les modules JS : `#btn-connect`, `#status`, `#telemetry`, `.tab[data-tab]`, `.tab-panel#tab-remote`, `#tab-blocks`, `.dir[data-dir]`, `#speed`, `#speed-val`, `#blockly`, `#btn-run`, `#btn-stop`, `#preview`.

- [ ] **Step 1 : Créer `app/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Base roulante — Télécommande &amp; Code bloc</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="https://unpkg.com/blockly/blockly.min.js"></script>
</head>
<body>
  <header>
    <h1>Base roulante</h1>
    <div class="conn">
      <button id="btn-connect">Connecter (BLE)</button>
      <span id="status" class="status off">Déconnecté</span>
    </div>
    <div id="telemetry" class="telemetry">—</div>
  </header>

  <nav class="tabs">
    <button class="tab active" data-tab="remote">Télécommande</button>
    <button class="tab" data-tab="blocks">Code bloc</button>
  </nav>

  <section id="tab-remote" class="tab-panel active">
    <div class="pad">
      <button class="dir" data-dir="MF">▲</button>
      <div class="pad-mid">
        <button class="dir" data-dir="ML">◄</button>
        <button class="dir stop" data-dir="MS">■</button>
        <button class="dir" data-dir="MR">►</button>
      </div>
      <button class="dir" data-dir="MB">▼</button>
    </div>
    <div class="speed-row">
      <label for="speed">Vitesse :</label>
      <input type="range" id="speed" min="0" max="255" value="200">
      <span id="speed-val">200</span>
    </div>
  </section>

  <section id="tab-blocks" class="tab-panel">
    <div id="blockly"></div>
    <div class="blocks-actions">
      <button id="btn-run">Exécuter ▶</button>
      <button id="btn-stop">STOP ■</button>
      <code id="preview"></code>
    </div>
  </section>

  <script src="js/ble.js"></script>
  <script src="js/app.js"></script>
  <script src="js/remote.js"></script>
  <script src="js/blocks.js"></script>
</body>
</html>
```

- [ ] **Step 2 : Créer `app/css/style.css`**

```css
* { box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  background: #f4f5f7;
  color: #1c2733;
}
header {
  background: #1c2733;
  color: #fff;
  padding: 12px 16px;
}
header h1 { margin: 0 0 8px; font-size: 1.3rem; }
.conn { display: flex; align-items: center; gap: 12px; }
button {
  cursor: pointer;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 1rem;
  background: #2d7dd2;
  color: #fff;
}
button:disabled { background: #888; cursor: not-allowed; }
.status { padding: 4px 10px; border-radius: 12px; font-size: .85rem; }
.status.off { background: #7a2e2e; }
.status.on  { background: #2e7a3f; }
.telemetry {
  margin-top: 8px;
  font-family: monospace;
  font-size: .9rem;
  opacity: .9;
}
.tabs { display: flex; background: #e3e6ea; }
.tab {
  flex: 1;
  background: transparent;
  color: #1c2733;
  border-radius: 0;
}
.tab.active { background: #fff; font-weight: 600; }
.tab-panel { display: none; padding: 16px; }
.tab-panel.active { display: block; }

/* Télécommande */
.pad { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.pad-mid { display: flex; gap: 8px; }
.dir {
  width: 70px; height: 70px;
  font-size: 1.6rem;
  background: #2d7dd2;
  user-select: none;
  touch-action: none;
}
.dir.stop { background: #c0392b; }
.speed-row { display: flex; align-items: center; gap: 10px; margin-top: 20px; }

/* Blockly */
#blockly { height: 420px; width: 100%; background: #fff; border: 1px solid #ccc; }
.blocks-actions { margin-top: 12px; display: flex; align-items: center; gap: 12px; }
#btn-stop { background: #c0392b; }
#preview { font-family: monospace; background: #fff; padding: 6px 10px; border-radius: 4px; }
```

- [ ] **Step 3 : Créer les fichiers JS vides (placeholders pour éviter les 404)**

Créer 4 fichiers vides : `app/js/ble.js`, `app/js/app.js`, `app/js/remote.js`, `app/js/blocks.js`.

Run: `mkdir -p app/js && touch app/js/ble.js app/js/app.js app/js/remote.js app/js/blocks.js`

- [ ] **Step 4 : Point de contrôle (vérification, sans git)**

Run: `python3 -m http.server 8000 --directory app`
Ouvrir `http://localhost:8000` dans Chrome. Attendu :
- La page s'affiche avec le titre, le bouton « Connecter (BLE) », les deux onglets.
- Cliquer sur les onglets bascule entre le pavé directionnel et la zone Blockly (la zone Blockly est vide/grise pour l'instant — normal).
- Aucune erreur 404 dans la console (F12) pour les fichiers JS/CSS.

*(Arrêter le serveur avec Ctrl+C une fois vérifié.)*

---

### Task 2 : Module BLE (`ble.js`)

**Files:**
- Modify: `app/js/ble.js`

**Interfaces:**
- Consumes: `navigator.bluetooth`.
- Produces: objet global `window.RobotBle` avec :
  - `async connect()` — demande l'appareil, se connecte, s'abonne aux notifications.
  - `disconnect()` — coupe la connexion GATT.
  - `async sendLine(line)` — écrit `line + "\n"` sur la caractéristique.
  - `isConnected()` → `bool`.
  - `on(type, cb)` — abonne un callback ; `type` ∈ `"state"` (arg `bool`) / `"telemetry"` (arg `string`).

- [ ] **Step 1 : Écrire `app/js/ble.js`**

```js
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
```

- [ ] **Step 2 : Point de contrôle (nécessite l'ESP32 flashé avec le firmware, périphérique `BaseRoulante`)**

Servir l'app (`python3 -m http.server 8000 --directory app`), ouvrir dans Chrome, puis dans la console (F12) :
```js
await RobotBle.connect();       // ouvre le sélecteur BLE -> choisir "BaseRoulante"
RobotBle.on('telemetry', console.log);  // doit logguer des lignes [T]..[D]..[S]IDLE ~1x/s
await RobotBle.sendLine('MF');  // le robot avance
await RobotBle.sendLine('MS');  // le robot s'arrête
```
Attendu : connexion réussie, télémétrie reçue, le robot réagit aux commandes. *(Sans robot : au minimum le sélecteur BLE doit s'ouvrir sans erreur JS.)*

---

### Task 3 : Câblage global (`app.js`)

**Files:**
- Modify: `app/js/app.js`

**Interfaces:**
- Consumes: `window.RobotBle` (`connect`, `disconnect`, `isConnected`, `on`). Éléments DOM : `#btn-connect`, `#status`, `#telemetry`, `.tab`, `.tab-panel`.
- Produces: comportement de connexion + bascule d'onglets + affichage télémétrie. Appelle `window.onBlocksShown()` (défini en Task 5) quand l'onglet blocs devient visible, si la fonction existe.

- [ ] **Step 1 : Écrire `app/js/app.js`**

```js
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
```

- [ ] **Step 2 : Point de contrôle**

Servir l'app, ouvrir dans Chrome :
- Le bouton « Connecter (BLE) » lance le sélecteur ; une fois connecté au robot, le badge passe à « Connecté » (vert), le bouton devient « Déconnecter », et la zone télémétrie affiche les lignes reçues.
- « Déconnecter » repasse le badge à « Déconnecté » (rouge).
- Sur un navigateur sans Web Bluetooth (ex. Firefox), le message « utilise Chrome ou Edge » s'affiche et le bouton est désactivé.

---

### Task 4 : Télécommande (`remote.js`)

**Files:**
- Modify: `app/js/remote.js`

**Interfaces:**
- Consumes: `window.RobotBle.sendLine`. Éléments DOM : `.dir[data-dir]`, `#speed`, `#speed-val`.
- Produces: pilotage live. Maintien d'un bouton directionnel → envoi immédiat de `M<dir>` puis renvoi toutes les 250 ms (rafraîchit le watchdog 500 ms) ; relâche → `MS`. Slider → `SPEED <val>` au relâchement.

- [ ] **Step 1 : Écrire `app/js/remote.js`**

```js
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
```

- [ ] **Step 2 : Point de contrôle (avec robot)**

Connecté au robot, onglet Télécommande :
- Maintenir ▲ → le robot avance tant que le bouton est pressé ; relâcher → il s'arrête (via `MS` + watchdog).
- Tester ▼ ◄ ► (recule / tourne gauche / tourne droite) et ■ (stop immédiat).
- Bouger le slider vitesse puis relâcher → la vitesse d'un mouvement suivant change (`SPEED` reçu, visible dans les logs série de l'ESP32).

---

### Task 5 : Programmation par blocs (`blocks.js`)

**Files:**
- Modify: `app/js/blocks.js`

**Interfaces:**
- Consumes: `Blockly` (global, CDN), `window.RobotBle.sendLine`. Éléments DOM : `#blockly`, `#btn-run`, `#btn-stop`, `#preview`.
- Produces:
  - Blocs custom : `avancer`, `reculer`, `tourner_gauche`, `tourner_droite`, `attendre`, `vitesse`, `repeter`.
  - `window.onBlocksShown()` — injecte/redimensionne le workspace Blockly (appelé par `app.js` à l'affichage de l'onglet).
  - Bouton Exécuter → génère `{ speed, sequence }` et envoie `SPEED <n>` (si présent) puis la ligne de séquence.

- [ ] **Step 1 : Écrire `app/js/blocks.js`**

```js
(() => {
  // --- Définition des blocs ---
  Blockly.defineBlocksWithJsonArray([
    { type: 'avancer', message0: 'avancer de %1 cm',
      args0: [{ type: 'field_number', name: 'N', value: 20, min: 0 }],
      previousStatement: null, nextStatement: null, colour: 210 },
    { type: 'reculer', message0: 'reculer de %1 cm',
      args0: [{ type: 'field_number', name: 'N', value: 20, min: 0 }],
      previousStatement: null, nextStatement: null, colour: 210 },
    { type: 'tourner_gauche', message0: 'tourner à gauche de %1 °',
      args0: [{ type: 'field_number', name: 'N', value: 90, min: 0 }],
      previousStatement: null, nextStatement: null, colour: 160 },
    { type: 'tourner_droite', message0: 'tourner à droite de %1 °',
      args0: [{ type: 'field_number', name: 'N', value: 90, min: 0 }],
      previousStatement: null, nextStatement: null, colour: 160 },
    { type: 'attendre', message0: 'attendre %1 s',
      args0: [{ type: 'field_number', name: 'N', value: 1, min: 0 }],
      previousStatement: null, nextStatement: null, colour: 60 },
    { type: 'vitesse', message0: 'régler vitesse %1',
      args0: [{ type: 'field_number', name: 'N', value: 200, min: 0, max: 255 }],
      previousStatement: null, nextStatement: null, colour: 20 },
    { type: 'repeter', message0: 'répéter %1 fois %2 %3',
      args0: [
        { type: 'field_number', name: 'N', value: 2, min: 1 },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' }
      ],
      previousStatement: null, nextStatement: null, colour: 120 }
  ]);

  const TOKEN = {
    avancer:        n => 'F' + n,
    reculer:        n => 'B' + n,
    tourner_gauche: n => 'L' + n,
    tourner_droite: n => 'R' + n,
    attendre:       n => 'W' + n
  };

  // Parcours manuel de la pile de blocs ; remplit out.tokens et out.speed.
  function walk(block, out) {
    while (block) {
      const t = block.type;
      const n = parseInt(block.getFieldValue('N'), 10);
      if (t === 'vitesse') {
        out.speed = n;                       // dernière valeur = vitesse du run
      } else if (t === 'repeter') {
        const inner = block.getInputTargetBlock('DO');
        for (let i = 0; i < n; i++) walk(inner, out);   // boucle déroulée
      } else if (TOKEN[t]) {
        out.tokens.push(TOKEN[t](n));
      }
      block = block.getNextBlock();
    }
  }

  function generateProgram(workspace) {
    const out = { speed: null, tokens: [] };
    workspace.getTopBlocks(true).forEach(b => walk(b, out));
    return { speed: out.speed, sequence: out.tokens.join(' ') };
  }

  const TOOLBOX = {
    kind: 'flyoutToolbox',
    contents: [
      { kind: 'block', type: 'avancer' },
      { kind: 'block', type: 'reculer' },
      { kind: 'block', type: 'tourner_gauche' },
      { kind: 'block', type: 'tourner_droite' },
      { kind: 'block', type: 'attendre' },
      { kind: 'block', type: 'vitesse' },
      { kind: 'block', type: 'repeter' }
    ]
  };

  let workspace = null;
  window.onBlocksShown = () => {
    if (workspace) { Blockly.svgResize(workspace); return; }
    workspace = Blockly.inject('blockly', { toolbox: TOOLBOX });
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-run').addEventListener('click', async () => {
      if (!workspace) return;
      const { speed, sequence } = generateProgram(workspace);
      document.getElementById('preview').textContent =
        (speed !== null ? 'SPEED ' + speed + ' | ' : '') + (sequence || '(vide)');
      if (speed !== null) await RobotBle.sendLine('SPEED ' + speed);
      if (sequence)       await RobotBle.sendLine(sequence);
    });
    document.getElementById('btn-stop').addEventListener('click', () => {
      RobotBle.sendLine('STOP');
    });
  });
})();
```

- [ ] **Step 2 : Point de contrôle — génération (sans robot possible)**

Servir l'app, onglet Code bloc. Attendu :
- La zone Blockly s'affiche avec la palette de blocs (le workspace s'injecte à l'ouverture de l'onglet).
- Construire : `régler vitesse 150` → `répéter 2 fois [ avancer 30 / tourner droite 90 ]` → `attendre 1`.
- Cliquer « Exécuter ▶ » : la zone `#preview` doit afficher exactement :
  `SPEED 150 | F30 R90 F30 R90 W1`
  (la boucle est bien déroulée 2 fois, la vitesse est extraite en tête).
- Vérifier qu'un workspace vide affiche `(vide)` et n'envoie rien.

- [ ] **Step 3 : Point de contrôle — exécution (avec robot)**

Connecté au robot : « Exécuter ▶ » sur le programme ci-dessus → le robot règle sa vitesse, puis exécute la séquence (avance/tourne ×2, attend 1 s), en s'arrêtant sur obstacle si l'ultrason détecte < seuil. « STOP ■ » interrompt immédiatement.

---

## Vérification end-to-end (checklist finale)

1. Ouvrir l'app servie en local sur Chrome, se connecter au robot `BaseRoulante`.
2. Télémétrie affichée et rafraîchie (~1×/s).
3. Onglet Télécommande : pilotage live OK dans les 4 directions + stop + vitesse.
4. Onglet Code bloc : programme construit → aperçu correct → exécution sur le robot.
5. Déconnexion BLE (fermer l'onglet / éteindre le robot) → l'app repasse « Déconnecté », le robot s'arrête (failsafe firmware).

## Couverture spec (self-review)

- §3 app statique Blockly + Web Bluetooth BLE → Tasks 1-5. ✅
- §3 BLE FFE0/FFE1, commandes texte `\n` → Task 2 (`ble.js`). ✅
- §4 modules app (`ble.js`, `remote.js`, `blocks.js`, `app.js`) → Tasks 2-5. ✅
- §4 2 onglets Télécommande / Code bloc → Task 1 (DOM) + Task 3 (bascule). ✅
- §4 blocs `avancer/reculer/tourner/attendre/répéter/vitesse` + génération + boucles déroulées → Task 5. ✅
- §6 manuel `M*` + watchdog (renvoi 250 ms) → Task 4. ✅
- §6 séquence une ligne + `SPEED` séparé → Task 5 `generateProgram`. ✅
- §6 télémétrie affichée → Task 3. ✅
- §8 navigateur sans Web Bluetooth → message clair → Task 3. ✅
- §8 échec connexion → état visible → Task 3. ✅
```
