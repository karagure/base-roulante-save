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
