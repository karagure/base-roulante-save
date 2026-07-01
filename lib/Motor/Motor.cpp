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
