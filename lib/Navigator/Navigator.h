#pragma once
#include <vector>
#include "Config.h"
#include "Motion.h"

class Drivetrain;
class UltrasonicSensor;

enum class NavState { Idle, Executing, ObstacleHold, AutoAvoid };

class Navigator {
public:
    Navigator(Drivetrain& drive, UltrasonicSensor& sonar);
    void begin();
    void setPath(const std::vector<Move>& moves);
    void startAuto();                    // démarre le mode déplacement automatique
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
    bool              _autoAvoiding = false; // true tant que le mode auto tourne pour éviter un obstacle
    void startCurrentMove();
    void applyMotors(const Move& m);
};
