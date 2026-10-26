#pragma once

#include "sdkconfig.h"

/**
 * app_config.h — Device-specific configuration for CCMS Kits.
 *
 * Values can be configured via:
 *   1. idf.py menuconfig -> "CCMS Street-Light Kit Configuration"
 *   2. Custom sdkconfig profile (e.g. configs/kit_001.conf)
 *   3. Default fallbacks below
 */

#ifdef CONFIG_CCMS_KIT_ID
#define KIT_ID CONFIG_CCMS_KIT_ID
#else
#define KIT_ID "KIT_001"
#endif

#ifdef CONFIG_CCMS_IMEI
#define IMEI CONFIG_CCMS_IMEI
#else
#define IMEI "123456789012345"
#endif

#ifdef CONFIG_CCMS_ROUTER_NAME
#define ROUTER_NAME CONFIG_CCMS_ROUTER_NAME
#else
#define ROUTER_NAME "CCMS_ROUTER_001"
#endif

#ifdef CONFIG_CCMS_AWS_SERVER_URL
#define AWS_SERVER_URL CONFIG_CCMS_AWS_SERVER_URL
#else
#define AWS_SERVER_URL "http://localhost:8000/api/v1/save"
#endif

#ifdef CONFIG_CCMS_API_KEY
#define API_KEY CONFIG_CCMS_API_KEY
#else
#define API_KEY "secret123"
#endif

#ifdef CONFIG_CCMS_WIFI_SSID
#define WIFI_SSID CONFIG_CCMS_WIFI_SSID
#else
#define WIFI_SSID "CCMS_ROUTER_001"
#endif

#ifdef CONFIG_CCMS_WIFI_PASSWORD
#define WIFI_PASSWORD CONFIG_CCMS_WIFI_PASSWORD
#else
#define WIFI_PASSWORD ""
#endif

#ifdef CONFIG_CCMS_TELEMETRY_INTERVAL_SEC
#define TELEMETRY_INTERVAL_SEC CONFIG_CCMS_TELEMETRY_INTERVAL_SEC
#else
#define TELEMETRY_INTERVAL_SEC 10
#endif

/* Hardware Pins */
#ifdef CONFIG_CCMS_MODBUS_UART_NUM
#define MODBUS_UART_NUM CONFIG_CCMS_MODBUS_UART_NUM
#else
#define MODBUS_UART_NUM 2
#endif

#ifdef CONFIG_CCMS_MODBUS_TX_PIN
#define MODBUS_TX_PIN CONFIG_CCMS_MODBUS_TX_PIN
#else
#define MODBUS_TX_PIN 17
#endif

#ifdef CONFIG_CCMS_MODBUS_RX_PIN
#define MODBUS_RX_PIN CONFIG_CCMS_MODBUS_RX_PIN
#else
#define MODBUS_RX_PIN 16
#endif

#ifdef CONFIG_CCMS_MODBUS_BAUD_RATE
#define MODBUS_BAUD_RATE CONFIG_CCMS_MODBUS_BAUD_RATE
#else
#define MODBUS_BAUD_RATE 9600
#endif

#ifdef CONFIG_CCMS_GPS_UART_NUM
#define GPS_UART_NUM CONFIG_CCMS_GPS_UART_NUM
#else
#define GPS_UART_NUM 1
#endif

#ifdef CONFIG_CCMS_GPS_TX_PIN
#define GPS_TX_PIN CONFIG_CCMS_GPS_TX_PIN
#else
#define GPS_TX_PIN 18
#endif

#ifdef CONFIG_CCMS_GPS_RX_PIN
#define GPS_RX_PIN CONFIG_CCMS_GPS_RX_PIN
#else
#define GPS_RX_PIN 5
#endif

#ifdef CONFIG_CCMS_GPS_BAUD_RATE
#define GPS_BAUD_RATE CONFIG_CCMS_GPS_BAUD_RATE
#else
#define GPS_BAUD_RATE 9600
#endif

#ifdef CONFIG_CCMS_RELAY_GPIO
#define RELAY_GPIO_PIN CONFIG_CCMS_RELAY_GPIO
#else
#define RELAY_GPIO_PIN 2
#endif
