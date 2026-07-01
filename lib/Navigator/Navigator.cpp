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
    _autoAvoiding = false;
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

void Navigator::startAuto() {
    _path.clear();
    _index = 0;
    _autoAvoiding = false;
    _state = NavState::AutoAvoid;
    _drive.forward(_speed);
}

void Navigator::stopAll() {
    _drive.stop();
    _path.clear();
    _index = 0;
    _autoAvoiding = false;
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

    if (_state == NavState::AutoAvoid) {
        bool obstacle = _sonar.readDistanceCm() < SEUIL_OBSTACLE_CM;
        if (obstacle && !_autoAvoiding) {
            _autoAvoiding = true;
            _drive.turnRight(_speed);
        } else if (!obstacle && _autoAvoiding) {
            _autoAvoiding = false;
            _drive.forward(_speed);
        }
        return;
    }

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
