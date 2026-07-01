#pragma once
#include <string>
#include <vector>
#include "Motion.h"

enum class CommandKind { Sequence, Manual, Stop, Status, Speed, Unknown };
enum class ManualDir  { Forward, Backward, Left, Right, Stop };

struct ParsedCommand {
    CommandKind kind = CommandKind::Unknown;
    std::vector<Move> moves;              // rempli si kind == Sequence
    int speed = 0;                        // rempli si kind == Speed
    ManualDir manual = ManualDir::Stop;   // rempli si kind == Manual
    bool ok = false;
    std::string error;
};

ParsedCommand parseCommand(const std::string& line);
