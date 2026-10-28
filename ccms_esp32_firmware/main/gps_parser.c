#include "gps_parser.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "driver/uart.h"
#include "esp_log.h"

static const char *TAG = "GPS_PARSER";
static int s_uart_num = 1;

/* Keep the last valid hardware fix. Do not invent coordinates when there is
 * no satellite fix. NMEA sentences can arrive split across UART reads, so we
 * keep a small line buffer between calls. */
static gps_data_t s_last_gps = {
    .latitude = 0.0,
    .longitude = 0.0,
    .fix_valid = false,
    .satellites = 0,
};

static char s_line[1024];
static size_t s_line_len = 0;

static double nmea_to_decimal(const char *nmea_coord, char hemisphere)
{
    if (!nmea_coord || strlen(nmea_coord) < 4) return 0.0;

    double val = atof(nmea_coord);
    int degrees = (int)(val / 100.0);
    double minutes = val - (degrees * 100.0);
    double dec = degrees + (minutes / 60.0);

    if (hemisphere == 'S' || hemisphere == 'W') dec = -dec;
    return dec;
}

static void parse_rmc(char *line)
{
    char *save = NULL;
    char *token = strtok_r(line, ",", &save);
    int field = 0;
    char status = 'V';
    char raw_lat[20] = {0};
    char ns = 'N';
    char raw_lon[20] = {0};
    char ew = 'E';

    while (token) {
        if (field == 2 && token[0]) status = token[0];
        else if (field == 3) strncpy(raw_lat, token, sizeof(raw_lat) - 1);
        else if (field == 4 && token[0]) ns = token[0];
        else if (field == 5) strncpy(raw_lon, token, sizeof(raw_lon) - 1);
        else if (field == 6 && token[0]) ew = token[0];

        token = strtok_r(NULL, ",", &save);
        field++;
    }

    if (status == 'A' && raw_lat[0] && raw_lon[0]) {
        double lat = nmea_to_decimal(raw_lat, ns);
        double lon = nmea_to_decimal(raw_lon, ew);

        if (lat >= -90.0 && lat <= 90.0 &&
            lon >= -180.0 && lon <= 180.0 &&
            !(lat == 0.0 && lon == 0.0)) {
            s_last_gps.latitude = lat;
            s_last_gps.longitude = lon;
            s_last_gps.fix_valid = true;
            ESP_LOGI(TAG, "Hardware GPS Fix: Lat %.6f, Lon %.6f, Satellites: %d",
                     lat, lon, s_last_gps.satellites);
        }
    }
}

static void parse_gga(char *line)
{
    char *save = NULL;
    char *token = strtok_r(line, ",", &save);
    int field = 0;
    int fix_quality = 0;
    int satellites = 0;

    while (token) {
        if (field == 6 && token[0]) fix_quality = atoi(token);
        else if (field == 7 && token[0]) satellites = atoi(token);

        token = strtok_r(NULL, ",", &save);
        field++;
    }

    if (satellites >= 0) s_last_gps.satellites = satellites;
    if (fix_quality == 0) {
        /* GGA explicitly says there is no fix. Do not erase a previously
         * valid coordinate immediately; the last known site is still useful. */
    }
}

static void parse_line(char *line)
{
    if (!line || line[0] != '$') return;

    /* Remove CR/LF and checksum tail is harmless for the fields we use. */
    char work[256];
    strncpy(work, line, sizeof(work) - 1);
    work[sizeof(work) - 1] = '\0';

    if (strncmp(work, "$GPRMC,", 7) == 0 ||
        strncmp(work, "$GNRMC,", 7) == 0) {
        parse_rmc(work);
    } else if (strncmp(work, "$GPGGA,", 7) == 0 ||
               strncmp(work, "$GNGGA,", 7) == 0) {
        parse_gga(work);
    }
}

esp_err_t gps_parser_init(int uart_num, int tx_pin, int rx_pin, int baud_rate)
{
    s_uart_num = uart_num;
    s_line_len = 0;
    memset(s_line, 0, sizeof(s_line));

    const uart_config_t uart_config = {
        .baud_rate = baud_rate,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_driver_install(s_uart_num, 2048, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(s_uart_num, &uart_config));
    ESP_ERROR_CHECK(uart_set_pin(s_uart_num, tx_pin, rx_pin,
                                 UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    ESP_LOGI(TAG, "GPS UART initialized on UART%d (TX:%d, RX:%d, Baud:%d)",
             uart_num, tx_pin, rx_pin, baud_rate);
    return ESP_OK;
}

void gps_parser_read(gps_data_t *out_data)
{
    if (!out_data) return;

    uint8_t buffer[256];
    int len = uart_read_bytes(s_uart_num, buffer, sizeof(buffer),
                              pdMS_TO_TICKS(250));

    for (int i = 0; i < len; ++i) {
        char c = (char)buffer[i];

        if (c == '\n') {
            s_line[s_line_len] = '\0';
            parse_line(s_line);
            s_line_len = 0;
            continue;
        }

        if (c == '\r') continue;

        if (s_line_len < sizeof(s_line) - 1) {
            s_line[s_line_len++] = c;
        } else {
            /* Corrupt/oversized line: reset and wait for the next '$'. */
            s_line_len = 0;
        }

        if (s_line_len == 1 && s_line[0] != '$') {
            s_line_len = 0;
        }
    }

    *out_data = s_last_gps;
}
