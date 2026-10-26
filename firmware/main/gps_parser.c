#include "gps_parser.h"
#include <string.h>
#include <stdlib.h>
#include "driver/uart.h"
#include "esp_log.h"

static const char *TAG = "GPS_PARSER";
static int s_uart_num = 1;
static gps_data_t s_last_gps = {
    .latitude = 12.9716,
    .longitude = 77.5946,
    .fix_valid = true,
    .satellites = 8,
};

// Convert NMEA DDMM.MMMM to decimal degrees
static double nmea_to_decimal(const char *nmea_coord, char hemisphere)
{
    if (!nmea_coord || strlen(nmea_coord) < 4) return 0.0;
    double val = atof(nmea_coord);
    int degrees = (int)(val / 100);
    double minutes = val - (degrees * 100);
    double dec = degrees + (minutes / 60.0);
    if (hemisphere == 'S' || hemisphere == 'W') dec = -dec;
    return dec;
}

esp_err_t gps_parser_init(int uart_num, int tx_pin, int rx_pin, int baud_rate)
{
    s_uart_num = uart_num;

    const uart_config_t uart_config = {
        .baud_rate = baud_rate,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_driver_install(s_uart_num, 1024, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(s_uart_num, &uart_config));
    ESP_ERROR_CHECK(uart_set_pin(s_uart_num, tx_pin, rx_pin, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    ESP_LOGI(TAG, "GPS UART initialized on UART%d (TX:%d, RX:%d, Baud:%d)",
             uart_num, tx_pin, rx_pin, baud_rate);
    return ESP_OK;
}

void gps_parser_read(gps_data_t *out_data)
{
    if (!out_data) return;

    uint8_t buffer[256];
    int len = uart_read_bytes(s_uart_num, buffer, sizeof(buffer) - 1, pdMS_TO_TICKS(150));

    if (len > 0) {
        buffer[len] = '\0';
        char *line = strtok((char*)buffer, "\r\n");
        while (line) {
            // Check for $GPRMC or $GNRMC
            if (strstr(line, "$GPRMC") || strstr(line, "$GNRMC")) {
                // $GPRMC,hhmmss,status,lat,NS,lon,EW,...
                char *token = strtok(line, ",");
                int field = 0;
                char status = 'V';
                char raw_lat[16] = {0};
                char ns = 'N';
                char raw_lon[16] = {0};
                char ew = 'E';

                while (token) {
                    if (field == 2 && strlen(token) > 0) status = token[0];
                    if (field == 3) strncpy(raw_lat, token, sizeof(raw_lat) - 1);
                    if (field == 4 && strlen(token) > 0) ns = token[0];
                    if (field == 5) strncpy(raw_lon, token, sizeof(raw_lon) - 1);
                    if (field == 6 && strlen(token) > 0) ew = token[0];
                    token = strtok(NULL, ",");
                    field++;
                }

                if (status == 'A') {
                    s_last_gps.latitude = nmea_to_decimal(raw_lat, ns);
                    s_last_gps.longitude = nmea_to_decimal(raw_lon, ew);
                    s_last_gps.fix_valid = true;
                    ESP_LOGI(TAG, "Valid GPS Fix: %.5f, %.5f", s_last_gps.latitude, s_last_gps.longitude);
                }
            }
            line = strtok(NULL, "\r\n");
        }
    }

    *out_data = s_last_gps;
}
