#pragma once
#include <cstdint>

enum class MoveType { Forward, Backward, TurnLeft, TurnRight, Wait };

struct Move {
    MoveType type;
    int value;   // cm (Forward/Backward), degrés (Turn*), secondes (Wait)
};

// Durée d'un mouvement en dead reckoning, en millisecondes.
uint32_t moveDurationMs(const Move& m, uint16_t msPerCm, uint16_t msPerDeg);
