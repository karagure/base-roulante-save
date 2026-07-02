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
