#pragma once

#include <stdbool.h>
#include "esp_err.h"

typedef struct {
    double latitude;
    double longitude;
    bool fix_valid;
    int satellites;
} gps_data_t;

esp_err_t gps_parser_init(int uart_num, int tx_pin, int rx_pin, int baud_rate);
void gps_parser_read(gps_data_t *out_data);
