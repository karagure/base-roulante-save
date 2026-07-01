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
