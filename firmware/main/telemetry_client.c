#include "telemetry_client.h"
#include <string.h>
#include <stdio.h>
#include <time.h>
#include "esp_http_client.h"
#include "esp_log.h"

static const char *TAG = "TELEMETRY_CLIENT";

esp_err_t telemetry_client_send(const char *url,
                                const char *api_key,
                                const char *kit_id,
                                const char *imei,
                                const char *router_name,
                                const meter_reading_t *meter,
                                const gps_data_t *gps,
                                int relay_state)
{
    if (!url || !imei) return ESP_ERR_INVALID_ARG;

    char json_body[512];
    time_t now = time(NULL);

    char v_buf[16] = "null";
    char i_buf[16] = "null";
    char p_buf[16] = "null";
    char kwh_buf[16] = "null";
    char pf_buf[16] = "null";
    char freq_buf[16] = "null";

    if (meter && meter->valid) {
        snprintf(v_buf, sizeof(v_buf), "%.2f", meter->voltage);
        snprintf(i_buf, sizeof(i_buf), "%.3f", meter->current);
        snprintf(p_buf, sizeof(p_buf), "%.1f", meter->active_power);
        snprintf(kwh_buf, sizeof(kwh_buf), "%.3f", meter->energy_kwh);
        snprintf(pf_buf, sizeof(pf_buf), "%.2f", meter->power_factor);
        snprintf(freq_buf, sizeof(freq_buf), "%.1f", meter->frequency);
    }

    char lat_buf[20] = "null";
    char lon_buf[20] = "null";
    if (gps && gps->fix_valid) {
        snprintf(lat_buf, sizeof(lat_buf), "%.6f", gps->latitude);
        snprintf(lon_buf, sizeof(lon_buf), "%.6f", gps->longitude);
    }

    snprintf(json_body, sizeof(json_body),
        "{"
        "\"kit_id\":\"%s\","
        "\"imei\":\"%s\","
        "\"device_id\":\"%s\","
        "\"router_name\":\"%s\","
        "\"voltage\":%s,"
        "\"current\":%s,"
        "\"power\":%s,"
        "\"energy\":%s,"
        "\"pf\":%s,"
        "\"freq\":%s,"
        "\"lat\":%s,"
        "\"lon\":%s,"
        "\"relay\":%d,"
        "\"timestamp\":%ld"
        "}",
        kit_id ? kit_id : "KIT_001",
        imei,
        imei,
        router_name ? router_name : "",
        v_buf,
        i_buf,
        p_buf,
        kwh_buf,
        pf_buf,
        freq_buf,
        lat_buf,
        lon_buf,
        relay_state,
        (long)now
    );

    ESP_LOGI(TAG, "Transmitting Telemetry -> %s", json_body);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 8000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) {
        ESP_LOGE(TAG, "Failed to init HTTP client");
        return ESP_FAIL;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    if (api_key && strlen(api_key) > 0) {
        esp_http_client_set_header(client, "x-api-key", api_key);
    }
    esp_http_client_set_post_field(client, json_body, strlen(json_body));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "HTTP POST Success, StatusCode: %d", status);
    } else {
        ESP_LOGE(TAG, "HTTP POST Request failed: %s", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
    return err;
}

esp_err_t telemetry_client_poll_commands(const char *base_url,
                                         const char *api_key,
                                         const char *imei,
                                         int *out_relay_command)
{
    if (!base_url || !imei) return ESP_ERR_INVALID_ARG;

    // Build GET /api/v1/commands/<imei>
    char poll_url[256];
    char host_prefix[192];
    strncpy(host_prefix, base_url, sizeof(host_prefix) - 1);
    host_prefix[sizeof(host_prefix) - 1] = '\0';

    char *save_pos = strstr(host_prefix, "/save");
    if (save_pos) *save_pos = '\0';

    snprintf(poll_url, sizeof(poll_url), "%s/commands/%s", host_prefix, imei);

    esp_http_client_config_t config = {
        .url = poll_url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 5000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) return ESP_FAIL;

    if (api_key && strlen(api_key) > 0) {
        esp_http_client_set_header(client, "x-api-key", api_key);
    }

    esp_err_t err = esp_http_client_open(client, 0);
    if (err == ESP_OK) {
        int content_length = esp_http_client_fetch_headers(client);
        if (content_length > 0) {
            char buffer[256] = {0};
            int read_len = esp_http_client_read(client, buffer, sizeof(buffer) - 1);
            if (read_len > 0) {
                buffer[read_len] = '\0';
                ESP_LOGI(TAG, "Commands received: %s", buffer);
                if (out_relay_command) {
                    if (strstr(buffer, "\"cmd\":\"relay\"")) {
                        if (strstr(buffer, "\"value\":\"1\"") || strstr(buffer, "\"value\":\"on\"")) {
                            *out_relay_command = 1;
                        } else if (strstr(buffer, "\"value\":\"0\"") || strstr(buffer, "\"value\":\"off\"")) {
                            *out_relay_command = 0;
                        }
                    }
                }
            }
        }
    }

    esp_http_client_cleanup(client);
    return err;
}
