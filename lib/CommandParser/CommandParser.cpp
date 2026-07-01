#include "CommandParser.h"
#include <cctype>
#include <sstream>

namespace {

std::string trim(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return "";
    size_t b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

std::string upper(std::string s) {
    for (char& c : s) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    return s;
}

// Parse un entier >= 0 à partir de la position i ; false si aucun chiffre / caractère invalide.
bool parseUint(const std::string& s, size_t i, int& out) {
    if (i >= s.size()) return false;
    int val = 0;
    bool any = false;
    for (; i < s.size(); ++i) {
        if (!std::isdigit(static_cast<unsigned char>(s[i]))) return false;
        val = val * 10 + (s[i] - '0');
        any = true;
    }
    out = val;
    return any;
}

bool tokenToMove(const std::string& tok, Move& out) {
    if (tok.size() < 2) return false;
    char c = static_cast<char>(std::toupper(static_cast<unsigned char>(tok[0])));
    int value;
    if (!parseUint(tok, 1, value)) return false;
    switch (c) {
        case 'F': out = Move{MoveType::Forward,   value}; return true;
        case 'B': out = Move{MoveType::Backward,  value}; return true;
        case 'L': out = Move{MoveType::TurnLeft,  value}; return true;
        case 'R': out = Move{MoveType::TurnRight, value}; return true;
        case 'W': out = Move{MoveType::Wait,      value}; return true;
        default:  return false;
    }
}

ParsedCommand err(const std::string& msg) {
    ParsedCommand c;
    c.ok = false;
    c.error = msg;
    return c;
}

} // namespace

ParsedCommand parseCommand(const std::string& raw) {
    std::string line = trim(raw);
    if (line.empty()) return err("ligne vide");

    std::string up = upper(line);

    if (up == "STOP")   { ParsedCommand c; c.kind = CommandKind::Stop;   c.ok = true; return c; }
    if (up == "STATUS") { ParsedCommand c; c.kind = CommandKind::Status; c.ok = true; return c; }
    if (up == "AUTO")   { ParsedCommand c; c.kind = CommandKind::Auto;   c.ok = true; return c; }

    // Manuel : MF / MB / ML / MR / MS
    if (up.size() == 2 && up[0] == 'M') {
        ManualDir d;
        switch (up[1]) {
            case 'F': d = ManualDir::Forward;  break;
            case 'B': d = ManualDir::Backward; break;
            case 'L': d = ManualDir::Left;     break;
            case 'R': d = ManualDir::Right;    break;
            case 'S': d = ManualDir::Stop;     break;
            default:  return err("commande manuelle inconnue");
        }
        ParsedCommand c; c.kind = CommandKind::Manual; c.manual = d; c.ok = true; return c;
    }

    // SPEED n
    if (up.rfind("SPEED", 0) == 0) {
        std::string rest = trim(line.substr(5));
        int v;
        if (!parseUint(rest, 0, v) || v < 0 || v > 255) return err("vitesse invalide (0..255)");
        ParsedCommand c; c.kind = CommandKind::Speed; c.speed = v; c.ok = true; return c;
    }

    // Séquence de tokens de mouvement
    ParsedCommand c;
    c.kind = CommandKind::Sequence;
    std::istringstream iss(line);
    std::string tok;
    while (iss >> tok) {
        Move m;
        if (!tokenToMove(tok, m)) return err("token invalide: " + tok);
        c.moves.push_back(m);
    }
    if (c.moves.empty()) return err("séquence vide");
    c.ok = true;
    return c;
}
