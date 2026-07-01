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
