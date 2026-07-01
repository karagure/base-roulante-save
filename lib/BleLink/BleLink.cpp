#include "BleLink.h"
#include <NimBLEDevice.h>
#include <deque>
#include "Config.h"

namespace {

NimBLECharacteristic* g_carac = nullptr;
bool g_connected = false;
std::deque<std::string> g_lines;
std::string g_rxBuffer;

class ServerCb : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer*) override { g_connected = true; }
    void onDisconnect(NimBLEServer*) override {
        g_connected = false;
        NimBLEDevice::startAdvertising();   // se remettre en écoute
    }
};

class CaracCb : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* c) override {
        std::string v = c->getValue();
        for (char ch : v) {
            if (ch == '\n' || ch == '\r') {
                if (!g_rxBuffer.empty()) {
                    g_lines.push_back(g_rxBuffer);
                    g_rxBuffer.clear();
                }
            } else {
                g_rxBuffer.push_back(ch);
            }
        }
    }
};

} // namespace

void BleLink::begin(const char* name) {
    NimBLEDevice::init(name);
    NimBLEServer* server = NimBLEDevice::createServer();
    server->setCallbacks(new ServerCb());

    NimBLEService* service = server->createService(BLE_SERVICE_UUID);
    g_carac = service->createCharacteristic(
        BLE_CARAC_UUID,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::NOTIFY);
    g_carac->setCallbacks(new CaracCb());
    service->start();

    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->addServiceUUID(BLE_SERVICE_UUID);
    adv->setScanResponse(true);
    adv->start();
}

bool BleLink::isConnected() const { return g_connected; }

bool BleLink::readLine(std::string& out) {
    if (g_lines.empty()) return false;
    out = g_lines.front();
    g_lines.pop_front();
    return true;
}

void BleLink::notify(const std::string& msg) {
    if (!g_connected || g_carac == nullptr) return;
    g_carac->setValue(msg);
    g_carac->notify();
}
