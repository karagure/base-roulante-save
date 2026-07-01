#include "Drivetrain.h"
#include "Config.h"

Drivetrain::Drivetrain()
    : _left (PIN_MOTEUR_G_IN1, PIN_MOTEUR_G_IN2, PIN_MOTEUR_G_EN, LEDC_CANAL_G),
      _right(PIN_MOTEUR_D_IN1, PIN_MOTEUR_D_IN2, PIN_MOTEUR_D_EN, LEDC_CANAL_D) {}

void Drivetrain::begin()          { _left.begin(); _right.begin(); }
void Drivetrain::forward(int s)   { _left.setSpeed(s);  _right.setSpeed(s); }
void Drivetrain::backward(int s)  { _left.setSpeed(-s); _right.setSpeed(-s); }
void Drivetrain::turnLeft(int s)  { _left.setSpeed(-s); _right.setSpeed(s); }
void Drivetrain::turnRight(int s) { _left.setSpeed(s);  _right.setSpeed(-s); }
void Drivetrain::stop()           { _left.stop(); _right.stop(); }
