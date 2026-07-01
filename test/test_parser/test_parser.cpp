#include <unity.h>
#include "CommandParser.h"

void setUp() {}
void tearDown() {}

void test_sequence_simple() {
    ParsedCommand c = parseCommand("F200 R90 F100");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(CommandKind::Sequence), static_cast<int>(c.kind));
    TEST_ASSERT_EQUAL_UINT32(3, c.moves.size());
    TEST_ASSERT_EQUAL(static_cast<int>(MoveType::Forward), static_cast<int>(c.moves[0].type));
    TEST_ASSERT_EQUAL_INT(200, c.moves[0].value);
    TEST_ASSERT_EQUAL(static_cast<int>(MoveType::TurnRight), static_cast<int>(c.moves[1].type));
    TEST_ASSERT_EQUAL_INT(90, c.moves[1].value);
}

void test_wait_minuscule() {
    ParsedCommand c = parseCommand("w5");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(MoveType::Wait), static_cast<int>(c.moves[0].type));
    TEST_ASSERT_EQUAL_INT(5, c.moves[0].value);
}

void test_stop() {
    ParsedCommand c = parseCommand("STOP");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(CommandKind::Stop), static_cast<int>(c.kind));
}

void test_speed() {
    ParsedCommand c = parseCommand("SPEED 180");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(CommandKind::Speed), static_cast<int>(c.kind));
    TEST_ASSERT_EQUAL_INT(180, c.speed);
}

void test_speed_hors_bornes_rejete() {
    ParsedCommand c = parseCommand("SPEED 999");
    TEST_ASSERT_FALSE(c.ok);
}

void test_manuel() {
    ParsedCommand c = parseCommand("MF");
    TEST_ASSERT_TRUE(c.ok);
    TEST_ASSERT_EQUAL(static_cast<int>(CommandKind::Manual), static_cast<int>(c.kind));
    TEST_ASSERT_EQUAL(static_cast<int>(ManualDir::Forward), static_cast<int>(c.manual));
}

void test_token_invalide_rejette_toute_la_sequence() {
    ParsedCommand c = parseCommand("F200 X10");
    TEST_ASSERT_FALSE(c.ok);
    TEST_ASSERT_EQUAL_UINT32(0, c.moves.size());
}

void test_ligne_vide_rejetee() {
    ParsedCommand c = parseCommand("   ");
    TEST_ASSERT_FALSE(c.ok);
}

int main(int, char**) {
    UNITY_BEGIN();
    RUN_TEST(test_sequence_simple);
    RUN_TEST(test_wait_minuscule);
    RUN_TEST(test_stop);
    RUN_TEST(test_speed);
    RUN_TEST(test_speed_hors_bornes_rejete);
    RUN_TEST(test_manuel);
    RUN_TEST(test_token_invalide_rejette_toute_la_sequence);
    RUN_TEST(test_ligne_vide_rejetee);
    return UNITY_END();
}
