# Base roulante autonome — ESP32

Base roulante 2 roues (moteurs DC + pont en H **L298N**) pilotée par un **ESP32**,
avec capteur ultrason **HC-SR04** (arrêt sur obstacle) et capteur **DHT11**
(température/humidité). Pilotage via **Bluetooth Low Energy** depuis une **app web**
(télécommande live + programmation par blocs Blockly). Déplacements en dead
reckoning (durées calibrées).

## Structure

```
include/Config.h     Broches + calibration + UUID BLE (tout est ici)
lib/                 Modules firmware (Motor, Drivetrain, UltrasonicSensor,
                     EnvironmentSensor, BleLink, Navigator, Motion, CommandParser)
src/main.cpp         Câblage : routeur de commandes, télémétrie, failsafe
test/                Tests unitaires natifs (Unity) : parsing + timing
app/                 App web statique (Web Bluetooth + Blockly)
app/record.html      Page d'enregistrement de parcours (point A / point B)
docs/superpowers/    Spécification + plans d'implémentation
```

## Architecture en couches

Le firmware (`lib/`) suit deux couches :

| Couche | Modules | Rôle |
|---|---|---|
| **Application** | `Navigator`, `CommandParser` | logique métier : interprétation des commandes texte, séquencement des déplacements, évitement d'obstacle |
| **HAL** (Hardware Abstraction Layer) | `Motor`, `Drivetrain`, `UltrasonicSensor`, `EnvironmentSensor`, `BleLink`, `Motion` | accès direct au matériel (PWM moteurs, capteurs, BLE) et calculs de bas niveau (durées en dead reckoning) |

Il n'y a volontairement **pas de couche Contrôle** (pas d'asservissement
PID, pas d'odométrie) : le robot n'a pas d'encodeurs sur les moteurs, donc
aucune mesure de retour (vitesse réelle, distance parcourue) n'est
disponible pour fermer une boucle de contrôle. Les déplacements reposent
uniquement sur du dead reckoning en boucle ouverte (durée = distance ou
angle × calibration dans `Config.h`). C'est un choix assumé lié au matériel
disponible, pas un oubli.

## Câblage (broches par défaut, voir `include/Config.h`)

| Élément | Broche ESP32 |
|---|---|
| Moteur gauche IN1 / IN2 / ENA | 26 / 27 / 14 |
| Moteur droit  IN3 / IN4 / ENB | 25 / 33 / 32 |
| HC-SR04 TRIG / ECHO | 13 / 12 |
| DHT11 DATA | 4 |

⚠️ **ECHO du HC-SR04 sort en 5 V** → pont diviseur vers 3.3 V obligatoire.

⚠️ **GPIO12 est une *strapping pin*** (elle règle la tension de la flash au boot).
Si la ligne ECHO est HIGH au moment du flash, l'upload échoue avec
`Failed to communicate with the flash chip`. **Solutions :** débrancher le fil
ECHO de D12 pendant l'upload, **ou** déplacer ECHO sur `GPIO34` (entrée seule,
non-strapping) dans `include/Config.h`.

## Firmware (PlatformIO)

```bash
# Compiler
pio run -e esp32dev

# Téléverser (adapter upload_port dans platformio.ini si besoin)
pio run -e esp32dev -t upload

# Moniteur série (115200)
pio device monitor -b 115200

# Tests unitaires (sans matériel)
pio test -e native
```

Au démarrage, le moniteur affiche `Base roulante prete (BLE en attente)` et
le périphérique BLE `BaseRoulante` devient visible.

## App web

Nécessite **Chrome ou Edge** (Web Bluetooth), servie en contexte sécurisé :

```bash
python3 -m http.server 8000 --directory app
# puis ouvrir http://localhost:8000
```

1. Cliquer **Connecter (BLE)** → choisir `BaseRoulante`.
2. Onglet **Télécommande** : joystick virtuel (maintien dans une direction =
   avance continue, commande répétée toutes les 200 ms pour respecter le
   watchdog firmware) + vitesse.
3. Onglet **Auto** : démarrer/arrêter le mode déplacement automatique
   (commande `AUTO` / `STOP`), avec indicateur actif/inactif basé sur la
   télémétrie.
4. Onglet **Code bloc** : assembler les blocs → **Exécuter ▶** envoie la séquence.
5. Lien **Enregistrement parcours** (en haut de page) → `record.html` :
   piloter le robot au joystick jusqu'à un point B, cliquer **Enregistrer
   cette étape** pour figer le trajet parcouru, puis rejouer ce trajet à
   l'identique (**Point B** depuis A) ou en sens inverse (**Point A** depuis
   B). Le rejeu est géré entièrement côté app (répétition des commandes
   manuelles existantes), sans nouvelle commande firmware.

## Protocole BLE

Service `FFE0` / caractéristique `FFE1` (write + notify). Commandes texte, une par
ligne (`\n`) :

| Commande | Effet |
|---|---|
| `F200 R90 F100` | séquence : avancer 200 cm, tourner 90° droite, avancer 100 cm |
| `F<cm>` `B<cm>` `L<°>` `R<°>` `W<s>` | tokens de séquence |
| `MF` `MB` `ML` `MR` `MS` | pilotage manuel live (watchdog 500 ms) |
| `SPEED <0-255>` | vitesse | `STOP` | arrêt | `STATUS` | état |
| `AUTO` | mode déplacement automatique : avance tout droit, tourne sur place à droite en continu tant qu'un obstacle est détecté (`SEUIL_OBSTACLE_CM`), reprend tout droit une fois la voie dégagée ; boucle jusqu'à `STOP` ou toute commande manuelle |

Télémétrie renvoyée : `[T]24.5C [H]40% [D]35cm [S]EXEC 1/3` (`[S]` vaut
`AUTO` quand le mode déplacement automatique est actif).

## Calibration

Après montage, ajuster dans `include/Config.h` :
- `MS_PAR_CM` : lancer `F100`, mesurer la distance réelle, corriger le ratio.
- `MS_PAR_DEGRE` : lancer `R360`, ajuster pour un tour complet.

Ces réglages ne changent que la config, jamais la logique.
