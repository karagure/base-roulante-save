# Projet Robotique Mobile B3 — Base Roulante Rinho

Base roulante composée de :
- 2 roues motrices (moteurs DC + pont en H **L298N**)
- pilotée par un **ESP32 WROOM-32D**
- capteur ultrason **HC-SR04**, pour la détection et l'évitement d'obstacles
- capteur **DHT11**, pour la mesure de température et d'humidité à l'intérieur du robot

Pilotage via **Bluetooth Low Energy** depuis une application web (télécommande
en direct + programmation par blocs Blockly). Les déplacements reposent sur
du dead reckoning (durées calibrées).

## Structure

```
include/Config.h     Broches, calibration et UUID BLE
lib/                 Modules firmware (Motor, Drivetrain, UltrasonicSensor,
                     EnvironmentSensor, BleLink, Navigator, Motion, CommandParser)
src/main.cpp         Routeur de commandes, télémétrie, sécurité (watchdog)
test/                Tests unitaires natifs (Unity) : parsing et timing
app/                 Application web statique (Web Bluetooth + Blockly)
app/record.html      Page d'enregistrement de parcours (point A / point B)
docs/superpowers/    Spécification et plans d'implémentation
```

## Architecture logicielle

Le firmware (`lib/`) est organisé en deux couches :

| Couche | Modules | Rôle |
|---|---|---|
| **Application** | `Navigator`, `CommandParser` | Logique métier : interprétation des commandes, séquencement des déplacements, évitement d'obstacle |
| **HAL** (Hardware Abstraction Layer) | `Motor`, `Drivetrain`, `UltrasonicSensor`, `EnvironmentSensor`, `BleLink`, `Motion` | Accès direct au matériel (PWM moteurs, capteurs, BLE) et calculs bas niveau (durées en dead reckoning) |

Le robot ne disposant pas d'encodeurs sur les moteurs, aucune mesure de
retour (vitesse réelle, distance parcourue) n'est disponible pour fermer une
boucle d'asservissement. La couche Contrôle (PID, odométrie) est donc
absente par choix : les déplacements reposent uniquement sur du dead
reckoning en boucle ouverte, calibré par durée (`Config.h`).

## Câblage

| Élément | Broche ESP32 |
|---|---|
| Moteur gauche IN1 / IN2 / ENA | 26 / 27 / 14 |
| Moteur droit  IN3 / IN4 / ENB | 25 / 33 / 32 |
| HC-SR04 TRIG / ECHO | 13 / 12 |
| DHT11 DATA | 4 |

Le signal ECHO du HC-SR04, en sortie 5 V, passe par un pont diviseur de
tension vers 3,3 V avant d'entrer sur l'ESP32.

GPIO12 étant une *strapping pin* (elle fixe la tension de la flash au
démarrage), la ligne ECHO doit être isolée pendant le flashing, ou réaffectée
à GPIO34 (broche d'entrée uniquement, non-strapping) dans `include/Config.h`.

### Alimentation

Une batterie unique 3S (11,1 V) alimente l'ensemble du robot, répartie en
deux branches :

| Branche | Départ | Alimente |
|---|---|---|
| Puissance (directe) | 11,1 V brut, avant régulation | Pont en H L298N → 2 moteurs DC |
| Logique (régulée) | 11,1 V → régulateur 5 V → ESP32 (VIN/5V) | ESP32, HC-SR04, DHT11 |

La batterie, le L298N, le régulateur et l'ESP32 partagent une masse commune,
condition nécessaire à la stabilité des mesures du HC-SR04 et du DHT11.

Le régulateur utilisé est un convertisseur à découpage (type LM2596/MP1584),
avec un rendement estimé à 80-90 %, hypothèse retenue dans le bilan
énergétique ci-dessous.

## Firmware (PlatformIO)

```bash
# Compiler
pio run -e esp32dev

# Téléverser
pio run -e esp32dev -t upload

# Moniteur série (115200)
pio device monitor -b 115200

# Tests unitaires (sans matériel)
pio test -e native
```

Au démarrage, le moniteur affiche `Base roulante prete (BLE en attente)` et
le périphérique BLE `BaseRoulante` devient visible.

## Application web

Nécessite Chrome ou Edge (Web Bluetooth), servie en contexte sécurisé :

```bash
python3 -m http.server 8000 --directory app
# puis ouvrir http://localhost:8000
```

1. **Connecter (BLE)** → sélection du périphérique `BaseRoulante`.
2. Onglet **Télécommande** : joystick virtuel (commande répétée toutes les
   200 ms tant que la direction est maintenue, pour respecter le watchdog
   firmware) et réglage de vitesse.
3. Onglet **Auto** : démarrage/arrêt du mode déplacement automatique
   (commandes `AUTO` / `STOP`), avec indicateur d'état basé sur la
   télémétrie.
4. Onglet **Code bloc** : programmation par blocs Blockly, exécution de la
   séquence assemblée.
5. Page **Enregistrement parcours** (`record.html`) : pilotage au joystick
   jusqu'à un point B, mémorisation du trajet parcouru (bouton "Enregistrer
   cette étape"), puis rejeu à l'identique (Point B depuis A) ou en sens
   inverse (Point A depuis B). Le rejeu est géré côté application, par
   répétition des commandes manuelles existantes, sans commande firmware
   supplémentaire.

## Protocole BLE

Service `FFE0` / caractéristique `FFE1` (write + notify). Commandes texte,
une par ligne (`\n`) :

| Commande | Effet |
|---|---|
| `F200 R90 F100` | Séquence : avancer 200 cm, tourner 90° à droite, avancer 100 cm |
| `F<cm>` `B<cm>` `L<°>` `R<°>` `W<s>` | Tokens de séquence |
| `MF` `MB` `ML` `MR` `MS` | Pilotage manuel en direct (watchdog 500 ms) |
| `SPEED <0-255>` | Réglage de vitesse |
| `STOP` | Arrêt |
| `STATUS` | Demande d'état |
| `AUTO` | Mode déplacement automatique : avance tout droit, tourne sur place à droite en continu tant qu'un obstacle est détecté (`SEUIL_OBSTACLE_CM`), reprend tout droit une fois la voie dégagée ; boucle jusqu'à `STOP` ou toute commande manuelle |

Télémétrie renvoyée : `[T]24.5C [H]40% [D]35cm [S]EXEC 1/3` (`[S]` vaut
`AUTO` pendant le mode déplacement automatique).

## Bilan énergétique

### Consommation — branche puissance (11,1 V direct)

| Consommateur | Courant typique | Remarque |
|---|---|---|
| Moteur DC gauche (roulage normal) | 200 – 300 mA | — |
| Moteur DC droit (roulage normal) | 200 – 300 mA | — |
| Pointe démarrage / blocage (2 moteurs) | jusqu'à 1,5 – 2 A | Courant d'appel bref |
| Pertes L298N | — | Chute ≈ 2 V (pont bipolaire) : le moteur reçoit ≈ 9 V utiles sur 11,1 V |

Consommation moyenne en roulage continu : **≈ 500 mA** (2 moteurs × 250 mA).

### Consommation — branche logique (après régulateur 5 V)

| Consommateur | Courant typique | Remarque |
|---|---|---|
| ESP32 WROOM-32D (BLE actif) | 80 – 130 mA | Pointes ≈ 250 mA en transmission |
| HC-SR04 | ≈ 15 mA en pointe, < 5 mA en moyenne | Mesure ponctuelle ≈ 10 ms |
| DHT11 | 1 – 2,5 mA | Mesure toutes les 2 s |

Consommation moyenne côté 5 V : **≈ 100 mA**. Ramenée côté batterie (11,1 V)
à travers le régulateur (rendement ≈ 85 %) :

```
I_batterie(régulateur) = (5 V × 100 mA) / (0,85 × 11,1 V) ≈ 53 mA
```

### Consommation totale et autonomie

| | Courant moyen tiré de la batterie |
|---|---|
| Moteurs (direct) | ≈ 500 mA |
| Logique (via régulateur) | ≈ 53 mA |
| **Total** | **≈ 553 mA** |

```
Autonomie (h) = Capacité batterie (mAh) × 0,8 / Consommation moyenne (mA)
```

Le facteur 0,8 correspond à la marge de sécurité (profondeur de décharge)
recommandée pour préserver la durée de vie d'une batterie LiPo.

Estimation pour une capacité de 1300 mAh (valeur d'exemple) :

| Capacité | Consommation moyenne | Autonomie brute | Autonomie avec marge 80 % |
|---|---|---|---|
| 1300 mAh | ≈ 553 mA | 2 h 21 | ≈ 1 h 53 |

La consommation est très largement dominée par les moteurs (≈ 90 % du
total) : l'autonomie globale dépend donc essentiellement de la vitesse de
déplacement et de la fréquence des phases d'accélération/blocage, bien plus
que du rendement du régulateur logique.

## Analyse fonctionnelle

### Bête à cornes

| À qui rend-il service ? | Sur quoi agit-il ? | Dans quel but ? |
|---|---|---|
| Utilisateur (opérateur avec smartphone) | Déplacement dans un environnement intérieur | Piloter, déplacer et apprendre la logique de code grace au "code bloc" |

> **FP0** : Permettre à un utilisateur de déplacer une base roulante dans une
> pièce, manuellement (joystick BLE) ou en mode autonome (évitement de
> murs), et de mémoriser/rejouer un trajet.

### Diagramme pieuvre (méthode APTE)

Milieux extérieurs identifiés : Utilisateur (smartphone) · Énergie (batterie
et régulateur) · Sol/obstacles · Ambiance (température/humidité) · Sécurité.

| Fonction | Type | Description |
|---|---|---|
| **FP1** | Principale | Permettre à l'utilisateur de piloter le robot depuis son smartphone (joystick virtuel BLE) |
| **FP2** | Principale | Permettre au robot d'éviter les obstacles de façon autonome |
| **FC1** | Contrainte | Être alimenté par une batterie 3S unique (11,1 V direct moteurs + régulateur 5 V pour la logique) |
| **FC2** | Contrainte | Se déplacer sur le sol sans se renverser (châssis, répartition des masses) |
| **FC3** | Contrainte | Mesurer les conditions ambiantes (DHT11) |
| **FC4** | Contrainte | Garantir un arrêt sécurisé (watchdog 500 ms en cas de perte de liaison, commande STOP) |
| **FC5** | Contrainte | Communiquer en Bluetooth Low Energy avec le smartphone (portée ≈ 10–15 m) |

### FAST simplifié — FP2 (évitement d'obstacle)

| Sous-fonction | Solution technique | Fichier (couche) |
|---|---|---|
| Détecter la distance à l'obstacle | Capteur ultrason HC-SR04 | `UltrasonicSensor.cpp` (HAL) |
| Décider de l'action à mener | Machine à états (avance / évitement) | `Navigator.cpp` (Application) |
| Actionner le déplacement | Pont en H L298N + moteurs DC | `Drivetrain.cpp` (HAL) |

## Calibration

Réglages dans `include/Config.h` :
- `MS_PAR_CM` : calibré à partir de la commande `F100` (avance de 100 cm), en comparant à la distance réellement parcourue.
- `MS_PAR_DEGRE` : calibré à partir de la commande `R360` (rotation complète).

Ces réglages n'affectent que la configuration, jamais la logique du firmware.

_A partir d'ici le readme a été modifié apres la date du rendu du 2 juillet 2026 suite au retour de l'intervenant je souhaite rajouter une analyse fonctionnelle comme exercice sous le format de l'exemple qu'il m'a envoyé_ _(Erika)_

Régulateur tension 5V  ------> ESP32 WROOM 32D ------> (controle moteur) Lignes GPIO / PWM   -> (alimentation)                         |                              |                           -> (Driver) L298N
  -> Batterie lipo 3S                  |                              |                                     -> Moteur DC x2
                                       |                              |
                             (capteur ultrasons)        (capteur température/humidité) 
                                    HC-SR04                         DHT11