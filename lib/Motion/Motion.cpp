#include "Motion.h"

uint32_t moveDurationMs(const Move& m, uint16_t msPerCm, uint16_t msPerDeg) {
    switch (m.type) {
        case MoveType::Forward:
        case MoveType::Backward:
            return static_cast<uint32_t>(m.value) * msPerCm;
        case MoveType::TurnLeft:
        case MoveType::TurnRight:
            return static_cast<uint32_t>(m.value) * msPerDeg;
        case MoveType::Wait:
            return static_cast<uint32_t>(m.value) * 1000u;
    }
    return 0;
}
