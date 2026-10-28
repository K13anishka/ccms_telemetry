# CCMS ESP32 Multi-Kit Telemetry Firmware

Universal ESP-IDF firmware for CCMS Street-Light Controller Kits.
Supports single-phase Modbus energy meter reading, UART GPS location tracking, Wi-Fi router connectivity, and secure AWS telemetry ingestion.

---

## Hardware Kit Architecture

```text
+-----------------------+     +-------------------+
| Single-Phase Meter    |     | GPS Module        |
| (RS485 / Modbus RTU)  |     | (NMEA / UART1)    |
+-----------+-----------+     +---------+---------+
            | (GPIO 16/17)              | (GPIO 5/18)
            +-------------+-------------+
                          |
                  +-------v-------+
                  |  ESP32 Node   |
                  +-------+-------+
                          | (Wi-Fi 802.11 b/g/n)
                  +-------v-------+
                  |  Wi-Fi Router |
                  +-------+-------+
                          | (Internet / HTTPS)
                  +-------v-------+
                  |  AWS Backend  |
                  +---------------+
```

---

## Kit Identity Separation

Each physical kit is uniquely identified by:
1. `KIT_ID` (e.g., `KIT_001`, `KIT_002`)
2. `IMEI` (e.g., `123456789012345`)
3. `ROUTER_NAME` (e.g., `CCMS_ROUTER_001`)

The backend ensures telemetry and meter data from one kit **never** mixes with another kit.

---

## Build & Flash via ESP-IDF on Windows PowerShell

### 1. Open ESP-IDF PowerShell
Open **ESP-IDF 5.x PowerShell** or load the environment:
```powershell
. $HOME/esp/esp-idf/export.ps1
```

### 2. Navigate to firmware directory
```powershell
cd firmware
```

### 3. Set Target
```powershell
idf.py set-target esp32
```

### 4. Configure Kit Parameters

#### Option A: Using Predefined Kit Profiles
For **Kit 1**:
```powershell
idf.py -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;configs/kit_001.conf" reconfigure build
```

For **Kit 2**:
```powershell
idf.py -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;configs/kit_002.conf" reconfigure build
```

#### Option B: Interactive Menuconfig
```powershell
idf.py menuconfig
```
Navigate to:
`CCMS Street-Light Kit Configuration`
- Set `Kit Identifier` (e.g. `KIT_001`)
- Set `Kit IMEI`
- Set `Wi-Fi Router Name`
- Set `AWS Telemetry Endpoint URL` (e.g. `http://<your-aws-ec2-ip>:8000/api/v1/save`)
- Set `Device API Key`
- Set `Wi-Fi SSID & Password`

Save and exit (`Q` -> `Y`).

### 5. Build Firmware
```powershell
idf.py build
```

### 6. Flash to ESP32
Connect your ESP32 via USB and run (replace `COM3` with your port):
```powershell
idf.py -p COM3 flash
```

### 7. Monitor Output
```powershell
idf.py -p COM3 monitor
```
*(Press `Ctrl + ]` to exit monitor)*
