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

bool          manualMode      = false;
unsigned long lastManualMs    = 0;
unsigned long lastTelemetryMs = 0;
bool          wasConnected    = false;

std::string telemetry() {
    char buf[96];
    int d = sonar.readDistanceCm();
    const char* st = nav.state() == NavState::Executing    ? "EXEC"
                   : nav.state() == NavState::ObstacleHold ? "HOLD"
                   : nav.state() == NavState::AutoAvoid     ? "AUTO"
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
        case CommandKind::Auto:
            manualMode = false;
            nav.startAuto();
            ble.notify("OK AUTO");
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
