#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

typedef struct {
    float voltage;       // Volts (V)
    float current;       // Amperes (A)
    float active_power;  // Watts (W)
    float energy_kwh;    // Energy (kWh)
    float power_factor;  // Power factor (0.00 - 1.00)
    float frequency;     // Hz
    bool valid;          // True if CRC and response passed
} meter_reading_t;

esp_err_t modbus_meter_init(int uart_num, int tx_pin, int rx_pin, int baud_rate);
esp_err_t modbus_meter_read(meter_reading_t *out_reading);
