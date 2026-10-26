#include <stdio.h>
#include <string.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "driver/gpio.h"

#include "app_config.h"
#include "wifi_manager.h"
#include "modbus_meter.h"
#include "gps_parser.h"
#include "telemetry_client.h"

static const char *TAG = "CCMS_MAIN";
static int s_relay_state = 1; // 1 = ON, 0 = OFF

static void set_relay(int state)
{
    s_relay_state = state ? 1 : 0;
    gpio_set_level((gpio_num_t)RELAY_GPIO_PIN, s_relay_state);
    ESP_LOGI(TAG, "Relay switched to: %s", s_relay_state ? "ENERGIZED (ON)" : "DE-ENERGIZED (OFF)");
}

static void telemetry_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Telemetry task started. Target Kit: '%s' | IMEI: '%s' | Router: '%s'",
             KIT_ID, IMEI, ROUTER_NAME);

    // Wait until Wi-Fi is connected
    wifi_manager_wait_connected();

    while (1) {
        if (wifi_manager_is_connected()) {
            // 1. Read Modbus Energy Meter
            meter_reading_t meter = { 0 };
            modbus_meter_read(&meter);

            // 2. Read GPS
            gps_data_t gps = { 0 };
            gps_parser_read(&gps);

            // 3. Send Telemetry to AWS Backend
            telemetry_client_send(
                AWS_SERVER_URL,
                API_KEY,
                KIT_ID,
                IMEI,
                ROUTER_NAME,
                &meter,
                &gps,
                s_relay_state
            );

            // 4. Poll and execute queued commands from AWS
            int relay_cmd = -1;
            if (telemetry_client_poll_commands(AWS_SERVER_URL, API_KEY, IMEI, &relay_cmd) == ESP_OK) {
                if (relay_cmd == 0 || relay_cmd == 1) {
                    set_relay(relay_cmd);
                }
            }
        } else {
            ESP_LOGW(TAG, "Wi-Fi not connected yet. Waiting...");
        }

        vTaskDelay(pdMS_TO_TICKS(TELEMETRY_INTERVAL_SEC * 1000));
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "==================================================");
    ESP_LOGI(TAG, "Starting CCMS ESP32 Multi-Kit Telemetry Firmware");
    ESP_LOGI(TAG, "Kit ID     : %s", KIT_ID);
    ESP_LOGI(TAG, "IMEI       : %s", IMEI);
    ESP_LOGI(TAG, "Router     : %s", ROUTER_NAME);
    ESP_LOGI(TAG, "AWS Server : %s", AWS_SERVER_URL);
    ESP_LOGI(TAG, "==================================================");

    // Initialize NVS Flash
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Configure Relay GPIO
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << RELAY_GPIO_PIN),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_ENABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);
    set_relay(1); // Default ON

    // Initialize Subsystems
    modbus_meter_init(MODBUS_UART_NUM, MODBUS_TX_PIN, MODBUS_RX_PIN, MODBUS_BAUD_RATE);
    gps_parser_init(GPS_UART_NUM, GPS_TX_PIN, GPS_RX_PIN, GPS_BAUD_RATE);
    wifi_manager_init(WIFI_SSID, WIFI_PASSWORD);

    // Launch periodic telemetry task
    xTaskCreatePinnedToCore(telemetry_task, "telemetry_task", 6144, NULL, 5, NULL, 1);
}
