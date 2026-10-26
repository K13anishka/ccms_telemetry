#pragma once

#include "esp_err.h"
#include "modbus_meter.h"
#include "gps_parser.h"

esp_err_t telemetry_client_send(const char *url,
                                const char *api_key,
                                const char *kit_id,
                                const char *imei,
                                const char *router_name,
                                const meter_reading_t *meter,
                                const gps_data_t *gps,
                                int relay_state);

esp_err_t telemetry_client_poll_commands(const char *base_url,
                                         const char *api_key,
                                         const char *imei,
                                         int *out_relay_command);
