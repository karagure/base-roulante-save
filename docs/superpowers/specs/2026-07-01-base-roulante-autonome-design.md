# Base roulante autonome — Design

**Date :** 2026-07-01
**Statut :** Validé (design approuvé, prêt pour plan d'implémentation)

## 1. Objectif

Base roulante à 2 roues motrices se déplaçant d'un point A à un point B de façon
autonome, pilotée par un ESP32. Le robot est commandé depuis une **application
web** (Web Bluetooth / BLE) offrant deux modes : une **télécommande** live et un
éditeur de **programmation par blocs** (Blockly). En mode blocs, l'app génère une
séquence de mouvements (mini-langage) exécutée en autonomie par le robot.

Le déplacement utilise le **dead reckoning** (durées calibrées, sans encodeurs).
Un capteur ultrason arrête le robot devant un obstacle. Un capteur DHT11 mesure
la température/humidité et l'affiche (rôle indépendant de la navigation).

Priorité : **code propre, modulaire, bien rangé en sous-dossiers**, extensible
(ajout d'encodeurs possible plus tard sans casser l'architecture). Le projet
s'inspire du pattern de `github.com/karagure/dog-robot` (firmware PlatformIO +
dossier `app/` statique, BLE service FFE0/FFE1, commandes texte, failsafe).

## 2. Matériel

| Élément            | Détail |
|--------------------|--------|
| Microcontrôleur    | ESP32 (`board = esp32dev`, framework Arduino) |
| Pont en H          | L298N — par moteur : IN1/IN2 (sens) + ENA (PWM d'activation) |
| Moteurs            | 2× moteur DC (gauche / droite) |
| Capteur distance   | HC-SR04 (ultrason, TRIG/ECHO) |
| Capteur environnem.| DHT11 (température + humidité) |
| Interface          | **BLE** (Bluetooth Low Energy) vers l'app web (Web Bluetooth) |

⚠️ **Câblage important :** la broche ECHO du HC-SR04 sort du 5 V. L'ESP32 est en
3.3 V → un **pont diviseur de tension** sur ECHO est obligatoire.

## 3. Décisions de conception

- **Navigation : dead reckoning.** On avance/tourne sur des durées calibrées.
  Pas d'encodeurs ni d'IMU dans cette version.
- **DHT11 : module indépendant.** Mesure + affichage périodique uniquement,
  aucune influence sur la navigation.
- **Interface : BLE (pas Bluetooth classique).** L'API Web Bluetooth des
  navigateurs ne parle **que le BLE** (GATT), pas le SPP classique. Le firmware
  expose donc un service BLE UART (FFE0/FFE1) ; l'app web (Chrome/Edge, contexte
  sécurisé HTTPS ou fichier local) s'y connecte. Commandes et télémétrie en
  **texte** (une commande par ligne, `\n` terminal). La télémétrie est renvoyée
  via les **notifications** BLE.
- **App web : site statique + Blockly.** Dossier `app/` en HTML/JS simple (sans
  gros framework), Blockly (CDN) pour le code bloc, ouvert en local ou publié sur
  GitHub Pages. L'ESP32 ne sert aucune page (BLE uniquement).
- **Trajet : envoyé par BLE** sous forme de séquence (ex. `F200 R90 F100`),
  soit tapée, soit générée par les blocs.
- **Failsafe (comme dog-robot) :** arrêt moteurs immédiat sur **déconnexion
  BLE** ; en pilotage **manuel**, watchdog 500 ms (auto-stop si aucune commande
  rafraîchie). Les **séquences autonomes** (mode blocs) tournent jusqu'au bout et
  ne s'arrêtent que sur déconnexion, obstacle ou `STOP` — le watchdog 500 ms ne
  s'applique **pas** pendant l'exécution d'une séquence.
- **Architecture firmware : modules dans `lib/` + boucle coopérative
  non-bloquante.** Mouvements pilotés par `millis()` + machine à états — jamais de
  `delay()` bloquant — pour lire l'ultrason et le BLE *pendant* un mouvement.

## 4. Architecture

```
mini-base-roulante/
├─ platformio.ini          # env esp32dev + env native (tests logiques)
├─ include/
│  └─ Config.h             # broches + constantes de calibration + seuils + UUID BLE
├─ lib/                    # modules firmware réutilisables (auto-compilés)
│  ├─ Motor/               # Motor.h/.cpp — 1 moteur L298N (IN1,IN2,ENA/PWM)
│  ├─ Drivetrain/          # Drivetrain.h/.cpp — 2 Motor, mouvements haut niveau
│  ├─ UltrasonicSensor/    # Hcsr04.h/.cpp — mesure distance (cm)
│  ├─ EnvironmentSensor/   # EnvironmentSensor.h/.cpp — DHT11 (temp/humidité)
│  ├─ CommandParser/       # CommandParser.h/.cpp — "F200 R90" -> liste de Move
│  ├─ Navigator/           # Navigator.h/.cpp — machine à états, exécute les Move
│  └─ BleLink/             # BleLink.h/.cpp — service BLE FFE0/FFE1 + failsafe
├─ src/
│  └─ main.cpp             # câblage : setup() + loop() (aucune logique métier)
├─ app/                    # application web statique (Web Bluetooth)
│  ├─ index.html           # 2 onglets : Télécommande | Code bloc
│  ├─ css/style.css
│  └─ js/
│     ├─ ble.js            # connexion BLE (FFE0/FFE1), envoi, télémétrie, failsafe
│     ├─ remote.js         # télécommande (boutons directionnels + vitesse)
│     ├─ blocks.js         # blocs Blockly custom + générateur de séquence
│     └─ app.js            # câblage, onglets, affichage télémétrie
└─ test/                   # tests unitaires (CommandParser, conversions)
```

**Principe :** une seule responsabilité par module, interface claire via le
header, faible couplage. Trois couches côté firmware :

- **Drivers matériel :** `Motor`, `UltrasonicSensor`, `EnvironmentSensor`,
  `BleLink`. Encapsulent le matériel, aucune logique métier.
- **Logique :** `CommandParser` (texte → structures), `Navigator` (orchestration,
  machine à états). Le `Navigator` dépend de `Drivetrain` + `UltrasonicSensor`.
- **Câblage :** `main.cpp` instancie les modules et fait tourner la boucle.

L'**app web** est un sous-système indépendant qui ne partage avec le firmware que
le **contrat de protocole BLE** (section 6).

### Interfaces des modules firmware (esquisse)

- **`Motor`** : `begin()`, `setSpeed(int vitesse)` où vitesse ∈ [-255, 255]
  (signe = sens), `stop()`.
- **`Drivetrain`** (2 Motor) : `begin()`, `forward(vitesse)`, `backward(vitesse)`,
  `turnLeft(vitesse)`, `turnRight(vitesse)`, `stop()`. Gère l'inversion
  gauche/droite.
- **`UltrasonicSensor`** : `begin()`, `readDistanceCm()` (retour distance en cm ;
  « hors portée » si timeout, pour ne pas provoquer de faux arrêt).
- **`EnvironmentSensor`** (DHT11) : `begin()`, `update()` (cadence min ~1 s),
  `temperatureC()`, `humidity()`, `isValid()`.
- **`CommandParser`** : `parse(const String& ligne, ...)` → liste de `Move` +
  code de succès/erreur. Fonction pure, testable sans matériel.
- **`Navigator`** : `setPath(liste de Move)`, `stopAll()`, `setSpeed(v)`,
  `update()` (non-bloquant), `state()`. Contient la machine à états.
- **`BleLink`** : `begin(nom)`, `isConnected()`, `readLine(String&)`
  (non-bloquant), `notify(...)` (télémétrie), callbacks connexion/déconnexion.

### Modules de l'app web

- **`ble.js`** : connexion/déconnexion au périphérique, écriture de commandes sur
  la caractéristique FFE1, abonnement aux notifications (télémétrie), gestion du
  heartbeat/failsafe, événements d'état.
- **`remote.js`** : UI télécommande — boutons avant/arrière/gauche/droite/stop
  (maintien = renvoi périodique), slider de vitesse → commandes `F/B/L/R/STOP/SPEED`.
- **`blocks.js`** : définitions des blocs Blockly custom + générateur qui produit
  la séquence texte (`F200 R90 ...`), en **déroulant** les boucles `Répéter`.
- **`app.js`** : bascule d'onglets, bouton *Exécuter* (blocs → séquence → envoi),
  affichage de la télémétrie (temp / humidité / distance / état).

## 5. Flux de contrôle (firmware)

Boucle `loop()`, non-bloquante, à chaque itération :

1. `BleLink` lit une ligne éventuelle reçue (write sur FFE1).
2. Si ligne reçue → routée : commande de contrôle (STOP/STATUS/SPEED/drive
   manuel) traitée directement, sinon passée au `CommandParser` →
   `Navigator.setPath(...)`.
3. `EnvironmentSensor.update()` (lecture DHT11 cadencée).
4. `Navigator.update()` fait progresser la machine à états.
5. Failsafe : si déconnecté → `stopAll()` ; en drive manuel, si watchdog 500 ms
   expiré → stop.
6. Télémétrie renvoyée périodiquement via notification BLE.

### Machine à états du Navigator

États : `IDLE → EXECUTING → (OBSTACLE_HOLD) → DONE → IDLE`.

- Un `Move` = `{ type, valeur }`. Types : `FORWARD` (cm), `BACKWARD` (cm),
  `TURN_LEFT` (°), `TURN_RIGHT` (°), `WAIT` (secondes).
- **Conversion dead-reckoning :** `durée_ms = valeur × constante_calibrée`
  (`MS_PAR_CM` pour avancer/reculer, `MS_PAR_DEGRE` pour tourner ; `WAIT` =
  valeur × 1000 ms, moteurs à l'arrêt). Chaque move démarre les moteurs et note
  `t_debut` + `duree_cible` ; il se termine quand `millis() - t_debut >=
  duree_cible`, puis on passe au suivant.
- **Obstacle (pendant FORWARD uniquement) :** si `distance < SEUIL_OBSTACLE_CM`
  → stop moteurs, passage en `OBSTACLE_HOLD`, mémorisation du temps restant,
  notification BLE. Reprise automatique quand la voie est dégagée. (Une manœuvre
  de contournement fausserait le dead-reckoning ; stop-and-wait, extensible.)

## 6. Protocole BLE (contrat firmware ↔ app)

- **Service** : `FFE0` · **Caractéristique** : `FFE1` (write + notify).
- **Sens app → robot** : write de commandes texte, une par ligne, `\n` terminal.
- **Sens robot → app** : télémétrie via notifications.

| Envoi app            | Effet |
|----------------------|-------|
| `F200 R90 F100`      | file une séquence (avancer 200 cm, tourner 90° droite, avancer 100 cm) |
| `F<val>` / `B<val>`  | avancer / reculer de `<val>` cm |
| `L<val>` / `R<val>`  | tourner gauche / droite de `<val>` degrés |
| `W<val>`             | attendre `<val>` secondes (bloc « Attendre ») |
| `STOP`               | arrêt immédiat, vide la file, retour IDLE |
| `STATUS`             | renvoie état + température + distance |
| `SPEED <0-255>`      | règle la vitesse de déplacement |
| `MF` / `MB` / `ML` / `MR` | **pilotage manuel live** : avance/recule/gauche/droite en continu (soumis au watchdog 500 ms) |
| `MS`                 | stop manuel |

**Deux familles de commandes :** les tokens de mouvement (`F/B/L/R/W`) forment
des **séquences autonomes** exécutées par le `Navigator` (mode blocs / trajet) ;
les commandes préfixées **`M`** sont le **pilotage manuel live** (télécommande),
pilotant directement les moteurs et soumises au watchdog 500 ms. Recevoir une
commande `M*` interrompt toute séquence en cours (`stopAll()` puis drive manuel).

Réponses du robot : `OK ...` (accusé), `ERR: ...` (erreur), et télémétrie
périodique du type `[T]24.5C [H]40% [D]35cm [S]EXEC 1/3`.

## 7. Configuration (`Config.h`)

Centralise tout ce qui est ajustable. Broches ESP32 par défaut (à adapter au
câblage réel) :

- Moteur gauche : `IN1=26`, `IN2=27`, `ENA=14`
- Moteur droit : `IN3=25`, `IN4=33`, `ENB=32`
- HC-SR04 : `TRIG=13`, `ECHO=34` (34 = entrée seule, adapté ; **pont diviseur**)
- DHT11 : `DATA=4`

Constantes de calibration (valeurs de départ, à calibrer, commentées) :
`MS_PAR_CM`, `MS_PAR_DEGRE`, `SEUIL_OBSTACLE_CM`, `VITESSE_DEFAUT`,
`WATCHDOG_MANUEL_MS = 500`, cadence de télémétrie. UUID BLE (`FFE0`/`FFE1`) et
nom du périphérique.

## 8. Gestion d'erreurs

- **DHT11** lecture ratée (NaN) → conserver la dernière valeur valide + log ;
  `isValid()` faux tant qu'aucune lecture correcte.
- **Ultrason** timeout (pas d'écho) → traiter comme « hors portée » (distance
  max), surtout **pas** de faux arrêt.
- **Commande inconnue / mal formée** → réponse `ERR: ...`, on reste en IDLE,
  aucune exécution partielle (séquence invalide rejetée en entier).
- **Déconnexion BLE** → `stopAll()` immédiat (failsafe).
- **App web** : navigateur sans Web Bluetooth (Firefox/Safari) → message clair
  « utilise Chrome/Edge » ; échec de connexion → état visible + bouton reconnecter.

## 9. Tests

- **Unitaires (Unity, env `native`, sans matériel) :** `CommandParser` (parsing
  de séquences valides/invalides → `Move` attendus) et les conversions
  dead-reckoning (cm→ms, °→ms, s→ms). Fonctions pures.
- **Validation manuelle robot (checklist) :** sens de rotation des moteurs,
  PWM/vitesse, mesure ultrason, lecture DHT11, connexion BLE, arrêt sur obstacle,
  failsafe (déconnexion + watchdog manuel), exécution d'une séquence complète.
- **App web (manuel) :** connexion BLE, télécommande live, génération de séquence
  Blockly correcte, affichage télémétrie.

## 10. Hors périmètre (extensions futures)

- Encodeurs de roues / odométrie, IMU/boussole.
- Manœuvre de contournement d'obstacle (au lieu du stop-and-wait).
- Interface WiFi / page servie par l'ESP32.
- Correction de la vitesse du son par la température (DHT11 → ultrason).
- Sauvegarde/chargement des programmes blocs (localStorage / fichier).
