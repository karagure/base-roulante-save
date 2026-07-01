#pragma once
#include <cstdint>

// ===== Moteurs (L298N) — broches ESP32 =====
static const uint8_t PIN_MOTEUR_G_IN1 = 26;
static const uint8_t PIN_MOTEUR_G_IN2 = 27;
static const uint8_t PIN_MOTEUR_G_EN  = 14;
static const uint8_t PIN_MOTEUR_D_IN1 = 25;
static const uint8_t PIN_MOTEUR_D_IN2 = 33;
static const uint8_t PIN_MOTEUR_D_EN  = 32;

// ===== PWM LEDC (arduino-esp32 2.x, par canal) =====
static const uint8_t  LEDC_CANAL_G          = 0;
static const uint8_t  LEDC_CANAL_D          = 1;
static const uint32_t LEDC_FREQ_HZ          = 20000;
static const uint8_t  LEDC_RESOLUTION_BITS  = 8;      // duty 0..255

// ===== HC-SR04 (câblage réel : TRIG=D13, ECHO=D12) =====
static const uint8_t  PIN_ULTRASON_TRIG   = 13;
static const uint8_t  PIN_ULTRASON_ECHO   = 12;       // strapping pin : OK car écho LOW au boot ; pont diviseur 5V->3.3V obligatoire
static const uint32_t ULTRASON_TIMEOUT_US = 25000;    // ~4 m
static const int      ULTRASON_HORS_PORTEE_CM = 400;

// ===== DHT11 =====
static const uint8_t  PIN_DHT           = 4;
static const uint32_t DHT_INTERVALLE_MS = 2000;

// ===== Calibration dead reckoning (À CALIBRER sur le robot réel) =====
static const uint16_t MS_PAR_CM         = 40;   // durée pour avancer de 1 cm
static const uint16_t MS_PAR_DEGRE      = 8;    // durée pour tourner de 1°
static const int      VITESSE_DEFAUT    = 200;  // 0..255
static const int      SEUIL_OBSTACLE_CM = 20;

// ===== Failsafe / télémétrie =====
static const uint32_t WATCHDOG_MANUEL_MS       = 500;
static const uint32_t TELEMETRIE_INTERVALLE_MS = 1000;

// ===== BLE =====
#define BLE_NOM          "BaseRoulante"
#define BLE_SERVICE_UUID "0000ffe0-0000-1000-8000-00805f9b34fb"
#define BLE_CARAC_UUID   "0000ffe1-0000-1000-8000-00805f9b34fb"
