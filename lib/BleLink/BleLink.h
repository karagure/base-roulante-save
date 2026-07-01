#pragma once
#include <string>

class BleLink {
public:
    void begin(const char* name);
    bool isConnected() const;
    bool readLine(std::string& out);   // false si aucune ligne en attente
    void notify(const std::string& msg);
};
