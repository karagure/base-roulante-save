#pragma once
#include <cstdint>
#include <DHT.h>

class EnvironmentSensor {
public:
    explicit EnvironmentSensor(uint8_t pin);
    void begin();
    void update();                    // relit si DHT_INTERVALLE_MS écoulé
    float temperatureC() const;
    float humidity() const;
    bool  isValid() const;
private:
    DHT   _dht;
    float _tempC = 0.0f;
    float _hum   = 0.0f;
    bool  _valid = false;
    unsigned long _lastRead = 0;
};
