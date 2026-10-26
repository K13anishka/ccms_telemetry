#include "modbus_meter.h"
#include <string.h>
#include "driver/uart.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "MODBUS_METER";
static int s_uart_num = 2;

// Standard CRC-16 Modbus (polynomial 0xA001)
static uint16_t modbus_crc16(const uint8_t *buf, int len)
{
    uint16_t crc = 0xFFFF;
    for (int pos = 0; pos < len; pos++) {
        crc ^= (uint16_t)buf[pos];
        for (int i = 8; i != 0; i--) {
            if ((crc & 0x0001) != 0) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

esp_err_t modbus_meter_init(int uart_num, int tx_pin, int rx_pin, int baud_rate)
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

    ESP_ERROR_CHECK(uart_driver_install(s_uart_num, 512, 512, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(s_uart_num, &uart_config));
    ESP_ERROR_CHECK(uart_set_pin(s_uart_num, tx_pin, rx_pin, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    ESP_LOGI(TAG, "RS485 Modbus initialized on UART%d (TX:%d, RX:%d, Baud:%d)",
             uart_num, tx_pin, rx_pin, baud_rate);
    return ESP_OK;
}

esp_err_t modbus_meter_read(meter_reading_t *out_reading)
{
    if (!out_reading) return ESP_ERR_INVALID_ARG;
    memset(out_reading, 0, sizeof(meter_reading_t));
    out_reading->valid = false;

    // Standard Modbus RTU Read Input/Holding Registers (0x04)
    // Slave Addr: 0x01, Function: 0x04, Start Reg: 0x0000, Count: 0x0008
    uint8_t query[8] = { 0x01, 0x04, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00 };
    uint16_t crc = modbus_crc16(query, 6);
    query[6] = (uint8_t)(crc & 0xFF);
    query[7] = (uint8_t)((crc >> 8) & 0xFF);

    uart_flush_input(s_uart_num);
    uart_write_bytes(s_uart_num, (const char *)query, sizeof(query));

    uint8_t response[64] = { 0 };
    int rx_bytes = uart_read_bytes(s_uart_num, response, sizeof(response), pdMS_TO_TICKS(500));

    if (rx_bytes >= 9 && response[0] == 0x01 && (response[1] == 0x04 || response[1] == 0x03)) {
        uint16_t resp_crc = modbus_crc16(response, rx_bytes - 2);
        uint16_t expected_crc = response[rx_bytes - 2] | (response[rx_bytes - 1] << 8);

        if (resp_crc == expected_crc) {
            // Parse registers from the actual physical meter (big-endian 16-bit)
            uint16_t raw_v = (response[3] << 8) | response[4];
            uint16_t raw_i = (response[5] << 8) | response[6];
            uint16_t raw_p = (response[7] << 8) | response[8];

            out_reading->voltage = (float)raw_v / 10.0f;
            out_reading->current = (float)raw_i / 100.0f;
            out_reading->active_power = (float)raw_p;

            if (rx_bytes >= 13) {
                uint32_t raw_energy = ((uint32_t)response[9] << 24) |
                                      ((uint32_t)response[10] << 16) |
                                      ((uint32_t)response[11] << 8) |
                                      response[12];
                out_reading->energy_kwh = (float)raw_energy / 100.0f;
            }
            if (rx_bytes >= 17) {
                uint16_t raw_pf = (response[13] << 8) | response[14];
                uint16_t raw_freq = (response[15] << 8) | response[16];
                out_reading->power_factor = (float)raw_pf / 1000.0f;
                out_reading->frequency = (float)raw_freq / 10.0f;
            }
            out_reading->valid = true;
            ESP_LOGI(TAG, "Real Meter Reading -> Voltage: %.1fV, Current: %.2fA, Power: %.1fW, Energy: %.2fkWh",
                     out_reading->voltage, out_reading->current, out_reading->active_power, out_reading->energy_kwh);
            return ESP_OK;
        } else {
            ESP_LOGW(TAG, "Modbus CRC mismatch (0x%04X != 0x%04X)", resp_crc, expected_crc);
            return ESP_ERR_INVALID_CRC;
        }
    }

    // No dummy values! If the meter is disconnected or unpowered, report timeout
    ESP_LOGW(TAG, "No response from RS485 meter (%d bytes received). Check wiring A/B and slave ID.", rx_bytes);
    return ESP_ERR_TIMEOUT;
}
