# CCMS Fixed Live Telemetry Deployment

## What was fixed

1. **ESP32 endpoint mismatch**
   - The flashed firmware build was pointing to `/api/v1/telemetry`.
   - The backend accepted `/api/v1/save`.
   - Backend now accepts **both** endpoints, so older flashed ESP32 firmware can still send data.

2. **ESP32 device identity**
   - The firmware build used IMEI `355354200837906`.
   - The server seed now registers that device with API key `secret123`.

3. **GPS**
   - GPS parsing now handles NMEA sentences split across UART reads.
   - RMC/GGA parsing is more reliable.
   - Telemetry includes `gps_fix_valid`, `gps_satellites`, `lat`, and `lon`.

4. **Dashboard**
   - Cleaner cards and spacing.
   - Clear LIVE status.
   - GPS coordinates are shown directly on every kit.
   - Last ESP32 telemetry time is shown.
   - Map link opens the actual reported coordinates.
   - Dashboard continues polling AWS every 5 seconds.

## Important AWS check

The project firmware currently targets:

`http://16.171.175.118:8000/api/v1/save`

From the development environment, that public IP was **not reachable on port 8000** during the check. Therefore the AWS server/network must be brought online before the ESP32 can send live data.

On EC2:

```bash
cd /var/www/ccms_telemetry

git pull origin main

npm install --omit=dev

cd frontend
npm install
npm run build
cd ..

rm -rf public/assets
cp -r frontend/dist/* public/

pm2 restart ccms-server --update-env
pm2 status
pm2 logs ccms-server --lines 100
```

If your PM2 process has a different name, use:

```bash
pm2 list
pm2 restart <actual-process-name>
```

## Test AWS before touching the ESP32

On the EC2 machine:

```bash
curl http://127.0.0.1:8000/health
```

Expected:

```json
{"status":"ok", ...}
```

From your Windows PC:

```powershell
curl http://16.171.175.118:8000/health
```

If this does not respond, fix the AWS EC2 Security Group/firewall first.

### EC2 Security Group

Allow:

- TCP 8000 from your testing IP / required network
- TCP 80 if using Nginx
- TCP 443 if using HTTPS
- TCP 22 only from your own IP for SSH

For production, prefer Nginx + HTTPS and point the ESP32 at the HTTPS endpoint.

## Test the telemetry API

From PowerShell:

```powershell
curl -Method POST `
  -Uri "http://16.171.175.118:8000/api/v1/save" `
  -Headers @{"Content-Type"="application/json";"x-api-key"="secret123"} `
  -Body '{"device_id":"355354200837906","kit_id":"KIT_001","router_name":"COFE_4376","voltage":230.5,"current":1.2,"power":276.6,"energy":12.4,"pf":0.98,"freq":50,"lat":12.971600,"lon":77.594600,"gps_fix_valid":true,"gps_satellites":8,"relay":1,"timestamp":1730000000}'
```

Expected:

```json
{"ok":true}
```

Then check:

```powershell
curl http://16.171.175.118:8000/api/v1/kits
```

The kit should contain voltage/current/power/energy and GPS coordinates.

## Rebuild and flash the fixed ESP32 firmware

Use ESP-IDF PowerShell:

```powershell
cd C:\Users\dell\ccms_telemetry\firmware

idf.py set-target esp32

idf.py reconfigure

idf.py build
```

Flash:

```powershell
idf.py -p COM3 flash
```

Monitor:

```powershell
idf.py -p COM3 monitor
```

You should see:

```text
Wi-Fi connected
Hardware GPS Fix: Lat xx.xxxxxx, Lon yy.yyyyyy
Transmitting Telemetry -> ...
HTTP POST Success, StatusCode: 200
```

If you see:

```text
HTTP StatusCode: 404
```

the server URL/path is wrong.

If you see:

```text
HTTP StatusCode: 401
```

the IMEI/API key does not match the device registered in the AWS database.

If you see:

```text
HTTP POST Request failed
```

check Wi-Fi and AWS internet connectivity.

## Correct architecture

```text
GPS ─────┐
Modbus ──┼──> ESP32
Relay ───┘     │
               │ Wi-Fi
               ▼
          Wi-Fi Router
               │
               │ Internet
               ▼
          AWS EC2 / Nginx
               │
               ▼
        CCMS Node.js API
               │
               ▼
          PostgreSQL/RDS
               │
               ▼
        React Web Dashboard
```

The browser/dashboard does **not** need to connect directly to the ESP32 or router.

The ESP32 sends the real sensor/GPS data to AWS. The dashboard reads the latest stored telemetry from AWS.

## One important hardware check

The GPS module's **TX must go to ESP32 RX (GPIO 5 in this firmware)**.

The firmware currently uses:

- GPS UART1
- GPS TX pin: GPIO 18
- GPS RX pin: GPIO 5
- GPS baud: 9600

So the GPS module's output TX line must physically reach ESP32 GPIO 5.

The Modbus meter uses:

- UART2
- TX GPIO 17
- RX GPIO 16
- 9600 baud

