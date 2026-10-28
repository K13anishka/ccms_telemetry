idf_component_register(
    SRCS
        "main.c"
        "wifi_manager.c"
        "modbus_meter.c"
        "gps_parser.c"
        "telemetry_client.c"
    INCLUDE_DIRS "."
    REQUIRES
        esp_http_client
        esp_wifi
        nvs_flash
        esp_event
        driver
        freertos
        esp_timer
        json
)
