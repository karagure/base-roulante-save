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
