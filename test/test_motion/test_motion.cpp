#include <unity.h>
#include "Motion.h"

void setUp() {}
void tearDown() {}

void test_forward_utilise_ms_par_cm() {
    Move m{MoveType::Forward, 100};
    TEST_ASSERT_EQUAL_UINT32(100u * 40u, moveDurationMs(m, 40, 8));
}

void test_backward_utilise_ms_par_cm() {
    Move m{MoveType::Backward, 50};
    TEST_ASSERT_EQUAL_UINT32(50u * 40u, moveDurationMs(m, 40, 8));
}

void test_turn_utilise_ms_par_degre() {
    Move m{MoveType::TurnRight, 90};
    TEST_ASSERT_EQUAL_UINT32(90u * 8u, moveDurationMs(m, 40, 8));
}

void test_wait_est_en_secondes() {
    Move m{MoveType::Wait, 3};
    TEST_ASSERT_EQUAL_UINT32(3u * 1000u, moveDurationMs(m, 40, 8));
}

int main(int, char**) {
    UNITY_BEGIN();
    RUN_TEST(test_forward_utilise_ms_par_cm);
    RUN_TEST(test_backward_utilise_ms_par_cm);
    RUN_TEST(test_turn_utilise_ms_par_degre);
    RUN_TEST(test_wait_est_en_secondes);
    return UNITY_END();
}
