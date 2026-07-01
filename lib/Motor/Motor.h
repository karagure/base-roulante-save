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
