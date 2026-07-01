# Firmware ESP32 — Base roulante — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firmware ESP32 (PlatformIO/Arduino) qui pilote une base roulante 2 moteurs (L298N) en dead reckoning, évite les obstacles (HC-SR04), mesure temp/humidité (DHT11), et se pilote via BLE (télécommande live + séquences autonomes).

**Architecture :** Modules autonomes dans `lib/` (drivers matériel + logique pure), orchestrés par un `Navigator` à machine à états non-bloquante, câblés dans `src/main.cpp`. La logique pure (parsing, timing dead-reckoning) est isolée dans des libs sans dépendance Arduino, testées en unitaire sur l'environnement `native`. Le matériel est validé par compilation + checklist manuelle.

**Tech Stack :** C++17, PlatformIO, framework Arduino (arduino-esp32 2.0.x via `espressif32@^6.9.0`), NimBLE-Arduino (BLE), Adafruit DHT (DHT11), Unity (tests natifs).

## Global Constraints

- Cible : ESP32 `board = esp32dev`, framework `arduino`.
- Plateforme figée : `platform = espressif32@^6.9.0` (⇒ arduino-esp32 2.0.x, API LEDC par **canal** : `ledcSetup`/`ledcAttachPin`/`ledcWrite(canal, duty)`). Ne PAS utiliser l'API v3 par broche.
- BLE : `h2zero/NimBLE-Arduino@^1.4.1` (signatures callbacks `onWrite(NimBLECharacteristic*)`, `onConnect/onDisconnect(NimBLEServer*)`).
- Service BLE `0000ffe0-0000-1000-8000-00805f9b34fb`, caractéristique `0000ffe1-0000-1000-8000-00805f9b34fb` (WRITE | WRITE_NR | NOTIFY).
- Aucune fonction bloquante longue dans `loop()` : mouvements pilotés par `millis()`, jamais de `delay()` pour temporiser un déplacement.
- Modules de logique pure (`lib/Motion`, `lib/CommandParser`) : **aucun `#include <Arduino.h>`**, uniquement types `std` (`std::string`, `std::vector`, `<cstdint>`), pour rester compilables/testables sur `native`.
- Protocole texte : une commande par ligne, terminée par `\n`. Contrat complet dans la spec §6.
- HC-SR04 : broche ECHO en 5 V → **pont diviseur** matériel obligatoire (rappel câblage, pas de code).
- `monitor_speed = 115200`.

---

## File Structure

- `platformio.ini` — 2 environnements : `esp32dev` (firmware) + `native` (tests logiques).
- `include/Config.h` — broches, canaux PWM, constantes de calibration, seuils, UUID BLE. Un seul point de vérité pour tout ce qui est ajustable.
- `lib/Motion/` — **pur** : `Motion.h` (types `MoveType`, `Move`), `Motion.cpp` (`moveDurationMs`).
- `lib/CommandParser/` — **pur** : `CommandParser.h/.cpp` (`parseCommand` → `ParsedCommand`). Dépend de Motion.
- `lib/Motor/` — driver 1 moteur L298N (sens + PWM LEDC).
- `lib/Drivetrain/` — 2 `Motor`, mouvements haut niveau. Dépend de Motor.
- `lib/UltrasonicSensor/` — HC-SR04, distance en cm.
- `lib/EnvironmentSensor/` — DHT11 (temp/humidité, cadencé). Dépend d'Adafruit DHT.
- `lib/BleLink/` — service BLE FFE0/FFE1, file de lignes reçues, notify. Dépend de NimBLE.
- `lib/Navigator/` — machine à états, exécute les `Move`. Dépend de Motion + Drivetrain + UltrasonicSensor.
- `src/main.cpp` — câblage, routeur de commandes, télémétrie, failsafe. Aucune logique métier réutilisable.
- `test/test_motion/` , `test/test_parser/` — tests Unity natifs.

---

### Task 1 : Configuration projet (`platformio.ini` + `Config.h`)

**Files:**
- Modify: `platformio.ini`
- Create: `include/Config.h`

**Interfaces:**
- Consumes: rien.
- Produces: macros de `Config.h` (broches, canaux LEDC, calibration, UUID) utilisées par tous les modules matériels et `main.cpp`. Deux environnements PlatformIO : `esp32dev`, `native`.

- [ ] **Step 1 : Écrire `platformio.ini`**

```ini
; PlatformIO Project Configuration File
[env:esp32dev]
platform = espressif32@^6.9.0
board = esp32dev
framework = arduino
monitor_speed = 115200
build_flags = -std=gnu++17
build_unflags = -std=gnu++11
lib_deps =
    adafruit/DHT sensor library@^1.4.6
    adafruit/Adafruit Unified Sensor@^1.1.14
    h2zero/NimBLE-Arduino@^1.4.1

[env:native]
platform = native
test_framework = unity
build_flags = -std=gnu++17
test_filter = test_motion
test_filter = test_parser
```

Note : sous PlatformIO, une seule directive `test_filter` par ligne s'écrase ; utiliser la syntaxe liste :

```ini
[env:native]
platform = native
test_framework = unity
build_flags = -std=gnu++17
test_filter =
    test_motion
    test_parser
```

Garde la version « liste » ci-dessus dans le fichier final.

- [ ] **Step 2 : Créer `include/Config.h`**

```cpp
#pragma once
#include <cstdint>

// ===== Moteurs (L298N) — broches ESP32 =====
static const uint8_t PIN_MOTEUR_G_IN1 = 26;
static const uint8_t PIN_MOTEUR_G_IN2 = 27;
static const uint8_t PIN_MOTEUR_G_EN  = 14;
static const uint8_t PIN_MOTEUR_D_IN1 = 25;
static const uint8_t PIN_MOTEUR_D_IN2 = 33;
static const uint8_t PIN_MOTEUR_D_EN  = 32;

// ===== PWM LEDC (arduino-esp32 2.x, par canal) =====
static const uint8_t  LEDC_CANAL_G          = 0;
static const uint8_t  LEDC_CANAL_D          = 1;
static const uint32_t LEDC_FREQ_HZ          = 20000;
static const uint8_t  LEDC_RESOLUTION_BITS  = 8;      // duty 0..255

// ===== HC-SR04 =====
static const uint8_t  PIN_ULTRASON_TRIG   = 13;
static const uint8_t  PIN_ULTRASON_ECHO   = 34;       // entrée seule + pont diviseur !
static const uint32_t ULTRASON_TIMEOUT_US = 25000;    // ~4 m
static const int      ULTRASON_HORS_PORTEE_CM = 400;

// ===== DHT11 =====
static const uint8_t  PIN_DHT           = 4;
static const uint32_t DHT_INTERVALLE_MS = 2000;

// ===== Calibration dead reckoning (À CALIBRER sur le robot réel) =====
static const uint16_t MS_PAR_CM       = 40;   // durée pour avancer de 1 cm
static const uint16_t MS_PAR_DEGRE    = 8;    // durée pour tourner de 1°
static const int      VITESSE_DEFAUT  = 200;  // 0..255
static const int      SEUIL_OBSTACLE_CM = 20;

// ===== Failsafe / télémétrie =====
static const uint32_t WATCHDOG_MANUEL_MS      = 500;
static const uint32_t TELEMETRIE_INTERVALLE_MS = 1000;

// ===== BLE =====
#define BLE_NOM          "BaseRoulante"
#define BLE_SERVICE_UUID "0000ffe0-0000-1000-8000-00805f9b34fb"
#define BLE_CARAC_UUID   "0000ffe1-0000-1000-8000-00805f9b34fb"
```

- [ ] **Step 3 : Vérifier que le projet compile (squelette actuel)**

Run: `pio run -e esp32dev`
Expected : la compilation démarre et télécharge les libs. Elle peut échouer sur `src/main.cpp` (template par défaut) — c'est normal à ce stade ; l'important est que `platformio.ini` est accepté et que les libs se résolvent. Si `main.cpp` template bloque, le vider temporairement avec `void setup(){} void loop(){}`.

- [ ] **Step 4 : Commit**

```bash
git add platformio.ini include/Config.h
git commit -m "chore: config PlatformIO (esp32dev + native) et Config.h"
```

---

### Task 2 : Module `Motion` (types + timing dead-reckoning) — TDD natif

**Files:**
- Create: `lib/Motion/Motion.h`
- Create: `lib/Motion/Motion.cpp`
- Test: `test/test_motion/test_motion.cpp`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `enum class MoveType { Forward, Backward, TurnLeft, TurnRight, Wait };`
  - `struct Move { MoveType type; int value; };` (`value` = cm, degrés ou secondes selon le type)
  - `uint32_t moveDurationMs(const Move& m, uint16_t msPerCm, uint16_t msPerDeg);`

- [ ] **Step 1 : Écrire le test qui échoue**

`test/test_motion/test_motion.cpp` :
```cpp
#include <unity.h>
#include "Motion.h"

void setUp() {}
void tearDown() {}

void test_forward_utilise_ms_par_cm() {
    Move m{MoveType::Forward, 100};
    TEST_ASSERT_EQUAL_UINT32(100u * 40u, moveDurationMs(m, 40, 8));
}

void test_backward_utilise_ms_par_cm() {
    Move m{MoveType::Backward, 50};
    TEST_ASSERT_EQUAL_UINT32(50u * 40u, moveDurationMs(m, 40, 8));
}

void test_turn_utilise_ms_par_degre() {
    Move m{MoveType::TurnRight, 90};
    TEST_ASSERT_EQUAL_UINT32(90u * 8u, moveDurationMs(m, 40, 8));
}

void test_wait_est_en_secondes() {
    Move m{MoveType::Wait, 3};
    TEST_ASSERT_EQUAL_UINT32(3u * 1000u, moveDurationMs(m, 40, 8));
}

int main(int, char**) {
    UNITY_BEGIN();
    RUN_TEST(test_forward_utilise_ms_par_cm);
    RUN_TEST(test_backward_utilise_ms_par_cm);
    RUN_TEST(test_turn_utilise_ms_par_degre);
    RUN_TEST(test_wait_est_en_secondes);
    return UNITY_END();
}
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `pio test -e native -f test_motion`
Expected : ÉCHEC de compilation (`Motion.h` introuvable).

- [ ] **Step 3 : Écrire l'en-tête `lib/Motion/Motion.h`**

```cpp
#pragma once
#include <cstdint>

enum class MoveType { Forward, Backward, TurnLeft, TurnRight, Wait };

struct Move {
    MoveType type;
    int value;   // cm (Forward/Backward), degrés (Turn*), secondes (Wait)
};

// Durée d'un mouvement en dead reckoning, en millisecondes.
uint32_t moveDurationMs(const Move& m, uint16_t msPerCm, uint16_t msPerDeg);
```

- [ ] **Step 4 : Écrire l'implémentation `lib/Motion/Motion.cpp`**

```cpp
#include "Motion.h"

uint32_t moveDurationMs(const Move& m, uint16_t msPerCm, uint16_t msPerDeg) {
    switch (m.type) {
        case MoveType::Forward:
        case MoveType::Backward:
            return static_cast<uint32_t>(m.value) * msPerCm;
        case MoveType::TurnLeft:
        case MoveType::TurnRight:
            return static_cast<uint32_t>(m.value) * msPerDeg;
        case MoveType::Wait:
            return static_cast<uint32_t>(m.value) * 1000u;
    }
    return 0;
}
```

- [ ] **Step 5 : Lancer le test pour vérifier qu'il passe**

Run: `pio test -e native -f test_motion`
Expected : PASS (4 tests).

- [ ] **Step 6 : Commit**

```bash
git add lib/Motion test/test_motion
git commit -m "feat: module Motion (types Move + timing dead-reckoning) + tests"
```

---

### Task 3 : Module `CommandParser` — TDD natif

**Files:**
- Create: `lib/CommandParser/CommandParser.h`
- Create: `lib/CommandParser/CommandParser.cpp`
- Test: `test/test_parser/test_parser.cpp`

**Interfaces:**
- Consumes: `Motion.h` (`Move`, `MoveType`).
- Produces:
  - `enum class CommandKind { Sequence, Manual, Stop, Status, Speed, Unknown };`
  - `enum class ManualDir { Forward, Backward, Left, Right, Stop };`
  - `struct ParsedCommand { CommandKind kind; std::vector<Move> moves; int speed; ManualDir manual; bool ok; std::string error; };`
  - `ParsedCommand parseCommand(const std::string& line);`

Règles : `STOP`/`STATUS` → commande simple. `SPEED n` → `Speed` (n∈0..255). `MF/MB/ML/MR/MS` → `Manual`. Sinon, tokens séparés par espaces de forme `<lettre><entier≥0>` avec lettre ∈ `F/B/L/R/W` (insensible à la casse) → `Sequence`. Toute ligne vide ou token invalide → `ok=false` avec `error`, aucune exécution partielle.

- [ ] **Step 1 : Écrire le test qui échoue**

`test/test_parser/test_parser.cpp` :
```cpp
#include <unity.h>
#include "CommandParser.h"

void setUp() {}
void tearDown() {}

void test_sequence_simple() {
    ParsedCommand c = parseCommand("F200 R90 F100");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(CommandKind::Sequence), static_cast<int>(c.kind));
    TEST_ASSERT_EQUAL_UINT32(3, c.moves.size());
    TEST_ASSERT_EQUAL(static_cast<int>(MoveType::Forward), static_cast<int>(c.moves[0].type));
    TEST_ASSERT_EQUAL_INT(200, c.moves[0].value);
    TEST_ASSERT_EQUAL(static_cast<int>(MoveType::TurnRight), static_cast<int>(c.moves[1].type));
    TEST_ASSERT_EQUAL_INT(90, c.moves[1].value);
}

void test_wait_minuscule() {
    ParsedCommand c = parseCommand("w5");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(MoveType::Wait), static_cast<int>(c.moves[0].type));
    TEST_ASSERT_EQUAL_INT(5, c.moves[0].value);
}

void test_stop() {
    ParsedCommand c = parseCommand("STOP");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(CommandKind::Stop), static_cast<int>(c.kind));
}

void test_speed() {
    ParsedCommand c = parseCommand("SPEED 180");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(CommandKind::Speed), static_cast<int>(c.kind));
    TEST_ASSERT_EQUAL_INT(180, c.speed);
}

void test_speed_hors_bornes_rejete() {
    ParsedCommand c = parseCommand("SPEED 999");
    TEST_ASSERT_FALSE(c.ok);
}

void test_manuel() {
    ParsedCommand c = parseCommand("MF");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(CommandKind::Manual), static_cast<int>(c.kind));
    TEST_ASSERT_EQUAL(static_cast<int>(ManualDir::Forward), static_cast<int>(c.manual));
}

void test_token_invalide_rejette_toute_la_sequence() {
    ParsedCommand c = parseCommand("F200 X10");
    TEST_ASSERT_FALSE(c.ok);
    TEST_ASSERT_EQUAL_UINT32(0, c.moves.size());
}

void test_ligne_vide_rejetee() {
    ParsedCommand c = parseCommand("   ");
    TEST_ASSERT_FALSE(c.ok);
}

int main(int, char**) {
    UNITY_BEGIN();
    RUN_TEST(test_sequence_simple);
    RUN_TEST(test_wait_minuscule);
    RUN_TEST(test_stop);
    RUN_TEST(test_speed);
    RUN_TEST(test_speed_hors_bornes_rejete);
    RUN_TEST(test_manuel);
    RUN_TEST(test_token_invalide_rejette_toute_la_sequence);
    RUN_TEST(test_ligne_vide_rejetee);
    return UNITY_END();
}
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `pio test -e native -f test_parser`
Expected : ÉCHEC de compilation (`CommandParser.h` introuvable).

- [ ] **Step 3 : Écrire l'en-tête `lib/CommandParser/CommandParser.h`**

```cpp
#pragma once
#include <string>
#include <vector>
#include "Motion.h"

enum class CommandKind { Sequence, Manual, Stop, Status, Speed, Unknown };
enum class ManualDir  { Forward, Backward, Left, Right, Stop };

struct ParsedCommand {
    CommandKind kind = CommandKind::Unknown;
    std::vector<Move> moves;              // rempli si kind == Sequence
    int speed = 0;                        // rempli si kind == Speed
    ManualDir manual = ManualDir::Stop;   // rempli si kind == Manual
    bool ok = false;
    std::string error;
};

ParsedCommand parseCommand(const std::string& line);
```

- [ ] **Step 4 : Écrire l'implémentation `lib/CommandParser/CommandParser.cpp`**

```cpp
#include "CommandParser.h"
#include <cctype>
#include <sstream>

namespace {

std::string trim(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return "";
    size_t b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

std::string upper(std::string s) {
    for (char& c : s) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    return s;
}

// Parse un entier ≥ 0 à partir de position i ; retourne false si aucun chiffre.
bool parseUint(const std::string& s, size_t i, int& out) {
    if (i >= s.size()) return false;
    int val = 0;
    bool any = false;
    for (; i < s.size(); ++i) {
        if (!std::isdigit(static_cast<unsigned char>(s[i]))) return false;
        val = val * 10 + (s[i] - '0');
        any = true;
    }
    out = val;
    return any;
}

bool tokenToMove(const std::string& tok, Move& out) {
    if (tok.size() < 2) return false;
    char c = static_cast<char>(std::toupper(static_cast<unsigned char>(tok[0])));
    int value;
    if (!parseUint(tok, 1, value)) return false;
    switch (c) {
        case 'F': out = Move{MoveType::Forward,  value}; return true;
        case 'B': out = Move{MoveType::Backward, value}; return true;
        case 'L': out = Move{MoveType::TurnLeft, value}; return true;
        case 'R': out = Move{MoveType::TurnRight, value}; return true;
        case 'W': out = Move{MoveType::Wait,     value}; return true;
        default:  return false;
    }
}

ParsedCommand err(const std::string& msg) {
    ParsedCommand c;
    c.ok = false;
    c.error = msg;
    return c;
}

} // namespace

ParsedCommand parseCommand(const std::string& raw) {
    std::string line = trim(raw);
    if (line.empty()) return err("ligne vide");

    std::string up = upper(line);

    if (up == "STOP")   { ParsedCommand c; c.kind = CommandKind::Stop;   c.ok = true; return c; }
    if (up == "STATUS") { ParsedCommand c; c.kind = CommandKind::Status; c.ok = true; return c; }

    // Manuel : MF / MB / ML / MR / MS
    if (up.size() == 2 && up[0] == 'M') {
        ManualDir d;
        switch (up[1]) {
            case 'F': d = ManualDir::Forward;  break;
            case 'B': d = ManualDir::Backward; break;
            case 'L': d = ManualDir::Left;     break;
            case 'R': d = ManualDir::Right;    break;
            case 'S': d = ManualDir::Stop;     break;
            default:  return err("commande manuelle inconnue");
        }
        ParsedCommand c; c.kind = CommandKind::Manual; c.manual = d; c.ok = true; return c;
    }

    // SPEED n
    if (up.rfind("SPEED", 0) == 0) {
        std::string rest = trim(line.substr(5));
        int v;
        if (!parseUint(rest, 0, v) || v < 0 || v > 255) return err("vitesse invalide (0..255)");
        ParsedCommand c; c.kind = CommandKind::Speed; c.speed = v; c.ok = true; return c;
    }

    // Séquence de tokens de mouvement
    ParsedCommand c;
    c.kind = CommandKind::Sequence;
    std::istringstream iss(line);
    std::string tok;
    while (iss >> tok) {
        Move m;
        if (!tokenToMove(tok, m)) return err("token invalide: " + tok);
        c.moves.push_back(m);
    }
    if (c.moves.empty()) return err("séquence vide");
    c.ok = true;
    return c;
}
```

- [ ] **Step 5 : Lancer les tests pour vérifier qu'ils passent**

Run: `pio test -e native -f test_parser`
Expected : PASS (8 tests).

- [ ] **Step 6 : Commit**

```bash
git add lib/CommandParser test/test_parser
git commit -m "feat: module CommandParser (parsing protocole BLE) + tests"
```

---

### Task 4 : Driver `Motor` (L298N + LEDC)

**Files:**
- Create: `lib/Motor/Motor.h`
- Create: `lib/Motor/Motor.cpp`

**Interfaces:**
- Consumes: `Config.h` (`LEDC_FREQ_HZ`, `LEDC_RESOLUTION_BITS`).
- Produces: classe `Motor` avec `Motor(uint8_t in1, uint8_t in2, uint8_t en, uint8_t ledcChannel)`, `void begin()`, `void setSpeed(int speed)` (speed ∈ [-255,255], signe = sens), `void stop()`.

Ce module dépend du matériel : pas de test unitaire natif, validation par compilation + checklist manuelle.

- [ ] **Step 1 : Écrire `lib/Motor/Motor.h`**

```cpp
#pragma once
#include <cstdint>

class Motor {
public:
    Motor(uint8_t pinIn1, uint8_t pinIn2, uint8_t pinEn, uint8_t ledcChannel);
    void begin();
    void setSpeed(int speed);   // -255..255, signe = sens de rotation
    void stop();
private:
    uint8_t _in1, _in2, _en, _channel;
};
```

- [ ] **Step 2 : Écrire `lib/Motor/Motor.cpp`**

```cpp
#include "Motor.h"
#include <Arduino.h>
#include "Config.h"

Motor::Motor(uint8_t pinIn1, uint8_t pinIn2, uint8_t pinEn, uint8_t ledcChannel)
    : _in1(pinIn1), _in2(pinIn2), _en(pinEn), _channel(ledcChannel) {}

void Motor::begin() {
    pinMode(_in1, OUTPUT);
    pinMode(_in2, OUTPUT);
    ledcSetup(_channel, LEDC_FREQ_HZ, LEDC_RESOLUTION_BITS);
    ledcAttachPin(_en, _channel);
    stop();
}

void Motor::setSpeed(int speed) {
    if (speed > 255)  speed = 255;
    if (speed < -255) speed = -255;
    if (speed > 0) {
        digitalWrite(_in1, HIGH); digitalWrite(_in2, LOW);
    } else if (speed < 0) {
        digitalWrite(_in1, LOW);  digitalWrite(_in2, HIGH);
    } else {
        digitalWrite(_in1, LOW);  digitalWrite(_in2, LOW);
    }
    ledcWrite(_channel, abs(speed));
}

void Motor::stop() {
    digitalWrite(_in1, LOW);
    digitalWrite(_in2, LOW);
    ledcWrite(_channel, 0);
}
```

- [ ] **Step 3 : Vérifier la compilation firmware**

Run: `pio run -e esp32dev`
Expected : SUCCÈS (le module compile ; `main.cpp` peut rester le squelette vide de la Task 1).

- [ ] **Step 4 : Commit**

```bash
git add lib/Motor
git commit -m "feat: driver Motor (L298N + PWM LEDC)"
```

---

### Task 5 : `Drivetrain` (2 moteurs, mouvements haut niveau)

**Files:**
- Create: `lib/Drivetrain/Drivetrain.h`
- Create: `lib/Drivetrain/Drivetrain.cpp`

**Interfaces:**
- Consumes: `Motor.h`, `Config.h` (broches moteurs + canaux LEDC).
- Produces: classe `Drivetrain` : `void begin()`, `void forward(int speed)`, `void backward(int speed)`, `void turnLeft(int speed)`, `void turnRight(int speed)`, `void stop()`. `speed` ∈ [0,255].

- [ ] **Step 1 : Écrire `lib/Drivetrain/Drivetrain.h`**

```cpp
#pragma once
#include "Motor.h"

class Drivetrain {
public:
    Drivetrain();
    void begin();
    void forward(int speed);
    void backward(int speed);
    void turnLeft(int speed);    // rotation sur place vers la gauche
    void turnRight(int speed);   // rotation sur place vers la droite
    void stop();
private:
    Motor _left;
    Motor _right;
};
```

- [ ] **Step 2 : Écrire `lib/Drivetrain/Drivetrain.cpp`**

```cpp
#include "Drivetrain.h"
#include "Config.h"

Drivetrain::Drivetrain()
    : _left (PIN_MOTEUR_G_IN1, PIN_MOTEUR_G_IN2, PIN_MOTEUR_G_EN, LEDC_CANAL_G),
      _right(PIN_MOTEUR_D_IN1, PIN_MOTEUR_D_IN2, PIN_MOTEUR_D_EN, LEDC_CANAL_D) {}

void Drivetrain::begin()             { _left.begin(); _right.begin(); }
void Drivetrain::forward(int s)      { _left.setSpeed(s);  _right.setSpeed(s); }
void Drivetrain::backward(int s)     { _left.setSpeed(-s); _right.setSpeed(-s); }
void Drivetrain::turnLeft(int s)     { _left.setSpeed(-s); _right.setSpeed(s); }
void Drivetrain::turnRight(int s)    { _left.setSpeed(s);  _right.setSpeed(-s); }
void Drivetrain::stop()              { _left.stop(); _right.stop(); }
```

- [ ] **Step 3 : Vérifier la compilation**

Run: `pio run -e esp32dev`
Expected : SUCCÈS.

- [ ] **Step 4 : Commit**

```bash
git add lib/Drivetrain
git commit -m "feat: Drivetrain (2 moteurs, mouvements haut niveau)"
```

*Note calibration/câblage (validation manuelle plus tard, Task 10) : si un moteur tourne à l'envers, inverser ses deux broches IN dans `Config.h`. Si le robot tourne du mauvais côté, échanger gauche/droite.*

---

### Task 6 : `UltrasonicSensor` (HC-SR04)

**Files:**
- Create: `lib/UltrasonicSensor/UltrasonicSensor.h`
- Create: `lib/UltrasonicSensor/UltrasonicSensor.cpp`

**Interfaces:**
- Consumes: `Config.h` (`ULTRASON_TIMEOUT_US`, `ULTRASON_HORS_PORTEE_CM`).
- Produces: classe `UltrasonicSensor` : `UltrasonicSensor(uint8_t trig, uint8_t echo)`, `void begin()`, `int readDistanceCm()` (retourne `ULTRASON_HORS_PORTEE_CM` si timeout — jamais de faux 0).

- [ ] **Step 1 : Écrire `lib/UltrasonicSensor/UltrasonicSensor.h`**

```cpp
#pragma once
#include <cstdint>

class UltrasonicSensor {
public:
    UltrasonicSensor(uint8_t pinTrig, uint8_t pinEcho);
    void begin();
    int readDistanceCm();   // distance en cm ; hors portée -> ULTRASON_HORS_PORTEE_CM
private:
    uint8_t _trig, _echo;
};
```

- [ ] **Step 2 : Écrire `lib/UltrasonicSensor/UltrasonicSensor.cpp`**

```cpp
#include "UltrasonicSensor.h"
#include <Arduino.h>
#include "Config.h"

UltrasonicSensor::UltrasonicSensor(uint8_t pinTrig, uint8_t pinEcho)
    : _trig(pinTrig), _echo(pinEcho) {}

void UltrasonicSensor::begin() {
    pinMode(_trig, OUTPUT);
    pinMode(_echo, INPUT);
    digitalWrite(_trig, LOW);
}

int UltrasonicSensor::readDistanceCm() {
    digitalWrite(_trig, LOW);
    delayMicroseconds(2);
    digitalWrite(_trig, HIGH);
    delayMicroseconds(10);
    digitalWrite(_trig, LOW);

    unsigned long duration = pulseIn(_echo, HIGH, ULTRASON_TIMEOUT_US);
    if (duration == 0) return ULTRASON_HORS_PORTEE_CM;      // pas d'écho

    int cm = static_cast<int>(duration / 58);              // ~343 m/s, aller-retour
    if (cm > ULTRASON_HORS_PORTEE_CM) cm = ULTRASON_HORS_PORTEE_CM;
    return cm;
}
```

*Note : `pulseIn` bloque au plus `ULTRASON_TIMEOUT_US` (25 ms). C'est le seul point « lent » de la boucle, acceptable pour une lecture par itération. Ne pas appeler plusieurs fois par tour de boucle.*

- [ ] **Step 3 : Vérifier la compilation**

Run: `pio run -e esp32dev`
Expected : SUCCÈS.

- [ ] **Step 4 : Commit**

```bash
git add lib/UltrasonicSensor
git commit -m "feat: driver UltrasonicSensor (HC-SR04)"
```

---

### Task 7 : `EnvironmentSensor` (DHT11)

**Files:**
- Create: `lib/EnvironmentSensor/EnvironmentSensor.h`
- Create: `lib/EnvironmentSensor/EnvironmentSensor.cpp`

**Interfaces:**
- Consumes: lib Adafruit DHT (`<DHT.h>`), `Config.h` (`DHT_INTERVALLE_MS`).
- Produces: classe `EnvironmentSensor` : `EnvironmentSensor(uint8_t pin)`, `void begin()`, `void update()` (lit si l'intervalle est écoulé), `float temperatureC() const`, `float humidity() const`, `bool isValid() const`.

- [ ] **Step 1 : Écrire `lib/EnvironmentSensor/EnvironmentSensor.h`**

```cpp
#pragma once
#include <cstdint>
#include <DHT.h>

class EnvironmentSensor {
public:
    explicit EnvironmentSensor(uint8_t pin);
    void begin();
    void update();                    // relit si DHT_INTERVALLE_MS écoulé
    float temperatureC() const;
    float humidity() const;
    bool  isValid() const;
private:
    DHT   _dht;
    float _tempC = 0.0f;
    float _hum   = 0.0f;
    bool  _valid = false;
    unsigned long _lastRead = 0;
};
```

- [ ] **Step 2 : Écrire `lib/EnvironmentSensor/EnvironmentSensor.cpp`**

```cpp
#include "EnvironmentSensor.h"
#include <Arduino.h>
#include "Config.h"

EnvironmentSensor::EnvironmentSensor(uint8_t pin) : _dht(pin, DHT11) {}

void EnvironmentSensor::begin() { _dht.begin(); }

void EnvironmentSensor::update() {
    unsigned long now = millis();
    if (_lastRead != 0 && (now - _lastRead) < DHT_INTERVALLE_MS) return;
    _lastRead = now;

    float t = _dht.readTemperature();
    float h = _dht.readHumidity();
    if (isnan(t) || isnan(h)) {   // lecture ratée : on garde la dernière valeur valide
        _valid = false;
        return;
    }
    _tempC = t;
    _hum   = h;
    _valid = true;
}

float EnvironmentSensor::temperatureC() const { return _tempC; }
float EnvironmentSensor::humidity()     const { return _hum; }
bool  EnvironmentSensor::isValid()      const { return _valid; }
```

- [ ] **Step 3 : Vérifier la compilation**

Run: `pio run -e esp32dev`
Expected : SUCCÈS (Adafruit DHT + Unified Sensor téléchargés).

- [ ] **Step 4 : Commit**

```bash
git add lib/EnvironmentSensor
git commit -m "feat: EnvironmentSensor (DHT11, lecture cadencée)"
```

---

### Task 8 : `BleLink` (service BLE FFE0/FFE1)

**Files:**
- Create: `lib/BleLink/BleLink.h`
- Create: `lib/BleLink/BleLink.cpp`

**Interfaces:**
- Consumes: NimBLE-Arduino, `Config.h` (`BLE_SERVICE_UUID`, `BLE_CARAC_UUID`).
- Produces: classe `BleLink` : `void begin(const char* name)`, `bool isConnected() const`, `bool readLine(std::string& out)` (récupère une ligne reçue terminée par `\n`, non-bloquant, `false` si file vide), `void notify(const std::string& msg)`.

*Note : NimBLE appelle ses callbacks depuis une tâche interne. La file de lignes et l'état de connexion sont en variables de portée fichier ; `readLine`/`notify` sont appelés depuis `loop()`. Les accès sont simples (push/pop de deque, booléen) ; acceptable pour ce projet. Une file protégée par mutex est une amélioration hors périmètre.*

- [ ] **Step 1 : Écrire `lib/BleLink/BleLink.h`**

```cpp
#pragma once
#include <string>

class BleLink {
public:
    void begin(const char* name);
    bool isConnected() const;
    bool readLine(std::string& out);   // false si aucune ligne en attente
    void notify(const std::string& msg);
};
```

- [ ] **Step 2 : Écrire `lib/BleLink/BleLink.cpp`**

```cpp
#include "BleLink.h"
#include <NimBLEDevice.h>
#include <deque>
#include "Config.h"

namespace {

NimBLECharacteristic* g_carac = nullptr;
bool g_connected = false;
std::deque<std::string> g_lines;
std::string g_rxBuffer;

class ServerCb : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer*) override { g_connected = true; }
    void onDisconnect(NimBLEServer*) override {
        g_connected = false;
        NimBLEDevice::startAdvertising();   // se remettre en écoute
    }
};

class CaracCb : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* c) override {
        std::string v = c->getValue();
        for (char ch : v) {
            if (ch == '\n' || ch == '\r') {
                if (!g_rxBuffer.empty()) {
                    g_lines.push_back(g_rxBuffer);
                    g_rxBuffer.clear();
                }
            } else {
                g_rxBuffer.push_back(ch);
            }
        }
    }
};

} // namespace

void BleLink::begin(const char* name) {
    NimBLEDevice::init(name);
    NimBLEServer* server = NimBLEDevice::createServer();
    server->setCallbacks(new ServerCb());

    NimBLEService* service = server->createService(BLE_SERVICE_UUID);
    g_carac = service->createCharacteristic(
        BLE_CARAC_UUID,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::NOTIFY);
    g_carac->setCallbacks(new CaracCb());
    service->start();

    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->addServiceUUID(BLE_SERVICE_UUID);
    adv->setScanResponse(true);
    adv->start();
}

bool BleLink::isConnected() const { return g_connected; }

bool BleLink::readLine(std::string& out) {
    if (g_lines.empty()) return false;
    out = g_lines.front();
    g_lines.pop_front();
    return true;
}

void BleLink::notify(const std::string& msg) {
    if (!g_connected || g_carac == nullptr) return;
    g_carac->setValue(msg);
    g_carac->notify();
}
```

- [ ] **Step 3 : Vérifier la compilation**

Run: `pio run -e esp32dev`
Expected : SUCCÈS (NimBLE téléchargé). En cas d'erreur de signature de callback, vérifier que NimBLE est bien en `@^1.4.1` (pas 2.x).

- [ ] **Step 4 : Commit**

```bash
git add lib/BleLink
git commit -m "feat: BleLink (service BLE FFE0/FFE1, RX lignes + notify)"
```

---

### Task 9 : `Navigator` (machine à états, dead reckoning + obstacle)

**Files:**
- Create: `lib/Navigator/Navigator.h`
- Create: `lib/Navigator/Navigator.cpp`

**Interfaces:**
- Consumes: `Motion.h` (`Move`, `moveDurationMs`), `Drivetrain.h`, `UltrasonicSensor.h`, `Config.h` (`MS_PAR_CM`, `MS_PAR_DEGRE`, `SEUIL_OBSTACLE_CM`, `VITESSE_DEFAUT`).
- Produces:
  - `enum class NavState { Idle, Executing, ObstacleHold };`
  - classe `Navigator(Drivetrain& drive, UltrasonicSensor& sonar)` : `void begin()`, `void setPath(const std::vector<Move>& moves)`, `void setSpeed(int speed)`, `void stopAll()`, `void update()`, `NavState state() const`, `int currentIndex() const`, `int pathSize() const`.

Comportement : `setPath` démarre la séquence (Idle si vide). `update()` fait avancer chaque move sur sa durée (`moveDurationMs`) sans bloquer. Pendant un `Forward`, si `sonar.readDistanceCm() < SEUIL_OBSTACLE_CM` → stop moteurs + `ObstacleHold` (temps restant mémorisé), reprise auto quand dégagé. En fin de séquence → `stop()` + `Idle`.

- [ ] **Step 1 : Écrire `lib/Navigator/Navigator.h`**

```cpp
#pragma once
#include <vector>
#include "Motion.h"

class Drivetrain;
class UltrasonicSensor;

enum class NavState { Idle, Executing, ObstacleHold };

class Navigator {
public:
    Navigator(Drivetrain& drive, UltrasonicSensor& sonar);
    void begin();
    void setPath(const std::vector<Move>& moves);
    void setSpeed(int speed);            // 0..255
    void stopAll();                      // arrêt + vide la file
    void update();                       // non-bloquant, à appeler chaque loop()
    NavState state() const { return _state; }
    int currentIndex() const { return static_cast<int>(_index); }
    int pathSize() const { return static_cast<int>(_path.size()); }
private:
    Drivetrain&       _drive;
    UltrasonicSensor& _sonar;
    std::vector<Move> _path;
    size_t            _index = 0;
    NavState          _state = NavState::Idle;
    int               _speed = VITESSE_DEFAUT;
    unsigned long     _moveStart = 0;      // millis() du (re)démarrage du move courant
    unsigned long     _remainingMs = 0;    // durée restante du move courant
    void startCurrentMove();
    void applyMotors(const Move& m);
};
```

*(`VITESSE_DEFAUT` vient de `Config.h`, inclus via le .cpp ; pour l'initialisation en-tête, inclure `Config.h` avant la classe.)* Ajouter en haut du header, après les `#include` : `#include "Config.h"`.

- [ ] **Step 2 : Écrire `lib/Navigator/Navigator.cpp`**

```cpp
#include "Navigator.h"
#include <Arduino.h>
#include "Config.h"
#include "Drivetrain.h"
#include "UltrasonicSensor.h"

Navigator::Navigator(Drivetrain& drive, UltrasonicSensor& sonar)
    : _drive(drive), _sonar(sonar) {}

void Navigator::begin() {
    _state = NavState::Idle;
    _index = 0;
    _path.clear();
}

void Navigator::setSpeed(int speed) {
    if (speed < 0)   speed = 0;
    if (speed > 255) speed = 255;
    _speed = speed;
    if (_state == NavState::Executing) applyMotors(_path[_index]);  // effet immédiat
}

void Navigator::setPath(const std::vector<Move>& moves) {
    _path = moves;
    _index = 0;
    if (_path.empty()) {
        _state = NavState::Idle;
        _drive.stop();
        return;
    }
    _state = NavState::Executing;
    startCurrentMove();
}

void Navigator::stopAll() {
    _drive.stop();
    _path.clear();
    _index = 0;
    _state = NavState::Idle;
}

void Navigator::applyMotors(const Move& m) {
    switch (m.type) {
        case MoveType::Forward:   _drive.forward(_speed);   break;
        case MoveType::Backward:  _drive.backward(_speed);  break;
        case MoveType::TurnLeft:  _drive.turnLeft(_speed);  break;
        case MoveType::TurnRight: _drive.turnRight(_speed); break;
        case MoveType::Wait:      _drive.stop();            break;
    }
}

void Navigator::startCurrentMove() {
    _remainingMs = moveDurationMs(_path[_index], MS_PAR_CM, MS_PAR_DEGRE);
    _moveStart = millis();
    applyMotors(_path[_index]);
}

void Navigator::update() {
    if (_state == NavState::Idle) return;

    if (_state == NavState::ObstacleHold) {
        if (_sonar.readDistanceCm() >= SEUIL_OBSTACLE_CM) {   // voie dégagée -> reprise
            _moveStart = millis();
            _state = NavState::Executing;
            applyMotors(_path[_index]);
        }
        return;
    }

    // _state == Executing
    const Move& m = _path[_index];

    // Obstacle seulement quand on avance
    if (m.type == MoveType::Forward && _sonar.readDistanceCm() < SEUIL_OBSTACLE_CM) {
        unsigned long elapsed = millis() - _moveStart;
        _remainingMs = (elapsed >= _remainingMs) ? 0 : (_remainingMs - elapsed);
        _drive.stop();
        _state = NavState::ObstacleHold;
        return;
    }

    if (millis() - _moveStart >= _remainingMs) {   // move terminé
        _index++;
        if (_index >= _path.size()) {              // séquence finie
            _drive.stop();
            _state = NavState::Idle;
            _path.clear();
            _index = 0;
        } else {
            startCurrentMove();
        }
    }
}
```

- [ ] **Step 3 : Vérifier la compilation**

Run: `pio run -e esp32dev`
Expected : SUCCÈS.

- [ ] **Step 4 : Commit**

```bash
git add lib/Navigator
git commit -m "feat: Navigator (machine à états dead-reckoning + obstacle)"
```

---

### Task 10 : `src/main.cpp` (câblage, routeur, télémétrie, failsafe)

**Files:**
- Modify: `src/main.cpp` (remplacer le contenu)

**Interfaces:**
- Consumes: tous les modules (`Drivetrain`, `UltrasonicSensor`, `EnvironmentSensor`, `BleLink`, `Navigator`, `CommandParser`, `Config.h`).
- Produces: firmware exécutable complet.

Comportement `loop()` : lire les lignes BLE et les router ; `env.update()` ; `nav.update()` ; failsafe (déconnexion → `stopAll` + stop manuel ; watchdog 500 ms en mode manuel) ; télémétrie périodique.

- [ ] **Step 1 : Écrire `src/main.cpp`**

```cpp
#include <Arduino.h>
#include <string>
#include "Config.h"
#include "Drivetrain.h"
#include "UltrasonicSensor.h"
#include "EnvironmentSensor.h"
#include "BleLink.h"
#include "Navigator.h"
#include "CommandParser.h"

Drivetrain        drive;
UltrasonicSensor  sonar(PIN_ULTRASON_TRIG, PIN_ULTRASON_ECHO);
EnvironmentSensor env(PIN_DHT);
BleLink           ble;
Navigator         nav(drive, sonar);

bool          manualMode  = false;
unsigned long lastManualMs = 0;
unsigned long lastTelemetryMs = 0;
bool          wasConnected = false;

std::string telemetry() {
    char buf[96];
    int d = sonar.readDistanceCm();
    const char* st = nav.state() == NavState::Executing    ? "EXEC"
                   : nav.state() == NavState::ObstacleHold ? "HOLD"
                   : manualMode                             ? "MAN"
                   :                                          "IDLE";
    if (env.isValid()) {
        snprintf(buf, sizeof(buf), "[T]%.1fC [H]%.0f%% [D]%dcm [S]%s %d/%d",
                 env.temperatureC(), env.humidity(), d, st,
                 nav.currentIndex(), nav.pathSize());
    } else {
        snprintf(buf, sizeof(buf), "[T]-- [H]-- [D]%dcm [S]%s %d/%d",
                 d, st, nav.currentIndex(), nav.pathSize());
    }
    return std::string(buf);
}

void driveManual(ManualDir dir) {
    manualMode = true;
    lastManualMs = millis();
    switch (dir) {
        case ManualDir::Forward:  drive.forward(VITESSE_DEFAUT);   break;
        case ManualDir::Backward: drive.backward(VITESSE_DEFAUT);  break;
        case ManualDir::Left:     drive.turnLeft(VITESSE_DEFAUT);  break;
        case ManualDir::Right:    drive.turnRight(VITESSE_DEFAUT); break;
        case ManualDir::Stop:     drive.stop(); manualMode = false; break;
    }
}

void handleLine(const std::string& line) {
    ParsedCommand c = parseCommand(line);
    if (!c.ok) { ble.notify("ERR: " + c.error); return; }

    switch (c.kind) {
        case CommandKind::Stop:
            nav.stopAll(); manualMode = false; drive.stop();
            ble.notify("OK STOP");
            break;
        case CommandKind::Status:
            ble.notify(telemetry());
            break;
        case CommandKind::Speed:
            nav.setSpeed(c.speed);
            ble.notify("OK SPEED");
            break;
        case CommandKind::Manual:
            nav.stopAll();            // une commande manuelle interrompt toute séquence
            driveManual(c.manual);
            ble.notify("OK M");
            break;
        case CommandKind::Sequence:
            manualMode = false;
            nav.setPath(c.moves);
            ble.notify("OK SEQ " + std::to_string(c.moves.size()));
            break;
        default:
            ble.notify("ERR: commande inconnue");
            break;
    }
}

void setup() {
    Serial.begin(115200);
    drive.begin();
    sonar.begin();
    env.begin();
    nav.begin();
    ble.begin(BLE_NOM);
    Serial.println("Base roulante prete (BLE en attente)");
}

void loop() {
    // 1. Commandes BLE entrantes
    std::string line;
    while (ble.readLine(line)) {
        handleLine(line);
    }

    // 2. Capteur environnement (cadencé en interne)
    env.update();

    // 3. Navigation autonome
    nav.update();

    // 4. Failsafe
    bool connected = ble.isConnected();
    if (wasConnected && !connected) {          // vient de se déconnecter
        nav.stopAll(); manualMode = false; drive.stop();
    }
    wasConnected = connected;

    if (manualMode && (millis() - lastManualMs > WATCHDOG_MANUEL_MS)) {
        drive.stop();
        manualMode = false;
    }

    // 5. Télémétrie périodique
    if (connected && (millis() - lastTelemetryMs >= TELEMETRIE_INTERVALLE_MS)) {
        lastTelemetryMs = millis();
        ble.notify(telemetry());
    }
}
```

- [ ] **Step 2 : Compiler et téléverser sur l'ESP32**

Run: `pio run -e esp32dev -t upload`
Expected : SUCCÈS de compilation + téléversement. Puis `pio device monitor -b 115200` doit afficher « Base roulante prete (BLE en attente) ».

- [ ] **Step 3 : Checklist de validation manuelle (matériel)**

Avec une appli terminal BLE (ex. « nRF Connect » ou « Serial Bluetooth Terminal » en BLE) ou l'app web (autre plan), connecté au périphérique `BaseRoulante` :

1. **Connexion BLE** : le périphérique `BaseRoulante` apparaît et se connecte ; la télémétrie `[T]... [D]... [S]IDLE 0/0` arrive ~1×/s.
2. **DHT11** : la température affichée est plausible (≈ température ambiante).
3. **Ultrason** : approcher la main → `[D]` diminue ; dégagé → `[D]` grand / `400`.
4. **Moteurs / sens** : envoyer `MF` → le robot avance ; `MS` → stop. Vérifier que `MB/ML/MR` font reculer/tourner correctement. *Si un moteur est inversé, échanger ses broches IN dans `Config.h` ; si gauche/droite sont inversés, échanger les deux blocs de broches.*
5. **Watchdog manuel** : envoyer `MF` puis ne plus rien envoyer → le robot s'arrête tout seul après ~0,5 s.
6. **Séquence** : envoyer `F30 R90 F30` → le robot avance ~30 cm, tourne ~90°, avance ~30 cm, puis `[S]` repasse à `IDLE`. *Calibrer `MS_PAR_CM` / `MS_PAR_DEGRE` dans `Config.h` en mesurant l'écart réel.*
7. **Obstacle** : lancer `F200`, placer un obstacle à < 20 cm devant → le robot s'arrête (`[S]HOLD`) ; retirer l'obstacle → il reprend.
8. **Failsafe déconnexion** : pendant un `F200`, couper le Bluetooth → les moteurs s'arrêtent immédiatement.

Cocher cette étape une fois les 8 points vérifiés (ajuster la calibration au besoin, sans changer la logique).

- [ ] **Step 4 : Commit**

```bash
git add src/main.cpp
git commit -m "feat: main.cpp (câblage, routeur BLE, télémétrie, failsafe)"
```

---

## Notes de calibration (post-implémentation)

- `MS_PAR_CM` : lancer `F100`, mesurer la distance réelle parcourue, ajuster `MS_PAR_CM = MS_PAR_CM × (100 / distance_mesurée_cm)`.
- `MS_PAR_DEGRE` : lancer `R360`, ajuster de même pour une rotation complète.
- `SEUIL_OBSTACLE_CM` : selon la distance d'arrêt souhaitée.
- Ces réglages ne changent que `Config.h`, jamais la logique.

## Couverture spec (self-review)

- §3 dead reckoning → Task 2 (`moveDurationMs`) + Task 9. ✅
- §3 DHT11 indépendant → Task 7. ✅
- §3 BLE (pas SPP) → Task 8 (NimBLE, FFE0/FFE1). ✅
- §3 failsafe (déconnexion + watchdog manuel) → Task 10 loop. ✅
- §3/§4 modules non-bloquants → Task 9 `update()` + Task 10 `loop()`. ✅
- §4 structure de fichiers → Tasks 1-10 (un module par task). ✅
- §5 machine à états Idle/Executing/ObstacleHold → Task 9. ✅
- §5 obstacle pendant Forward + reprise → Task 9 `update()`. ✅
- §6 protocole (F/B/L/R/W, STOP, STATUS, SPEED, M*) → Task 3 (parse) + Task 10 (route). ✅
- §6 télémétrie `[T]..[H]..[D]..[S]..` → Task 10 `telemetry()`. ✅
- §7 Config.h → Task 1. ✅
- §8 DHT NaN → dernière valeur → Task 7. ✅
- §8 ultrason timeout → hors portée → Task 6. ✅
- §8 commande invalide → `ERR:` sans exécution → Task 3 + Task 10. ✅
- §9 tests natifs parser + timing → Task 2, Task 3. ✅
- §9 checklist matériel → Task 10 Step 3. ✅
```
