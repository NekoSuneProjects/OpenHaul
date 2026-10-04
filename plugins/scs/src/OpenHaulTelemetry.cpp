#include <windows.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <deque>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

#include "scssdk_telemetry.h"
#include "common/scssdk_telemetry_common_channels.h"
#include "common/scssdk_telemetry_truck_common_channels.h"
#include "common/scssdk_telemetry_job_common_channels.h"
#include "common/scssdk_telemetry_trailer_common_channels.h"
#include "common/scssdk_telemetry_common_configs.h"
#include "common/scssdk_telemetry_common_gameplay_events.h"
#include "eurotrucks2/scssdk_eut2.h"
#include "amtrucks/scssdk_ats.h"

namespace {

constexpr const char* kPipeName = R"(\\.\pipe\OpenHaulTelemetry)";

class PipeServer {
public:
    void start() {
        if (running_.exchange(true)) return;
        worker_ = std::thread([this] { run(); });
    }

    void stop() {
        if (!running_.exchange(false)) return;
        cv_.notify_all();

        HANDLE wake = CreateFileA(kPipeName, GENERIC_READ, 0, nullptr, OPEN_EXISTING, 0, nullptr);
        if (wake != INVALID_HANDLE_VALUE) CloseHandle(wake);

        if (worker_.joinable()) worker_.join();
    }

    void push(std::string line) {
        {
            std::lock_guard lock(mutex_);
            if (queue_.size() > 512) queue_.pop_front();
            queue_.push_back(std::move(line));
        }
        cv_.notify_one();
    }

private:
    void run() {
        while (running_) {
            HANDLE pipe = CreateNamedPipeA(
                kPipeName,
                PIPE_ACCESS_OUTBOUND,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                1,
                64 * 1024,
                64 * 1024,
                0,
                nullptr);

            if (pipe == INVALID_HANDLE_VALUE) {
                std::this_thread::sleep_for(std::chrono::seconds(1));
                continue;
            }

            const BOOL connected = ConnectNamedPipe(pipe, nullptr)
                ? TRUE
                : (GetLastError() == ERROR_PIPE_CONNECTED);

            if (!connected) {
                CloseHandle(pipe);
                continue;
            }

            while (running_) {
                std::string line;
                {
                    std::unique_lock lock(mutex_);
                    cv_.wait_for(lock, std::chrono::milliseconds(500), [this] {
                        return !running_ || !queue_.empty();
                    });

                    if (!running_) break;
                    if (queue_.empty()) continue;

                    line = std::move(queue_.front());
                    queue_.pop_front();
                }

                line.push_back('\n');

                DWORD written = 0;
                if (!WriteFile(pipe, line.data(), static_cast<DWORD>(line.size()), &written, nullptr)) {
                    break;
                }
                FlushFileBuffers(pipe);
            }

            DisconnectNamedPipe(pipe);
            CloseHandle(pipe);
        }
    }

    std::atomic_bool running_{false};
    std::thread worker_;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::deque<std::string> queue_;
};

struct TelemetryState {
    std::string game = "unknown";
    bool driving = false;
    bool hasPlacement = false;
    double x = 0;
    double y = 0;
    double z = 0;
    float heading = 0;
    float speedMps = 0;
    float rpm = 0;
    float fuel = 0;
    float odometerKm = 0;
    float navDistanceM = 0;
    float navTimeS = 0;
    float speedLimitMps = 0;
    float wearEngine = 0;
    float wearTransmission = 0;
    float wearCabin = 0;
    float wearChassis = 0;
    float wearWheels = 0;
    float trailerWearChassis = 0;
    float cargoDamage = 0;

    std::string truckBrand;
    std::string truckName;

    std::string cargo;
    std::string sourceCity;
    std::string destinationCity;
    std::string sourceCompany;
    std::string destinationCompany;
    std::int64_t configuredIncome = 0;
    float plannedDistanceKm = 0;
    bool specialJob = false;
    bool cargoLoaded = false;
};

PipeServer g_pipe;
TelemetryState g_state;
scs_log_t g_log = nullptr;
auto g_lastLive = std::chrono::steady_clock::now();

std::string escape_json(const std::string& value) {
    std::ostringstream out;
    for (unsigned char c : value) {
        switch (c) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (c < 0x20) {
                    out << "\\u"
                        << std::hex << std::setw(4) << std::setfill('0')
                        << static_cast<int>(c)
                        << std::dec << std::setfill(' ');
                } else {
                    out << static_cast<char>(c);
                }
        }
    }
    return out.str();
}

void log_message(const scs_log_type_t type, const std::string& message) {
    if (g_log) g_log(type, message.c_str());
}

std::string truck_display_name() {
    if (g_state.truckBrand.empty()) return g_state.truckName;
    if (g_state.truckName.empty()) return g_state.truckBrand;
    return g_state.truckBrand + " " + g_state.truckName;
}

void emit_live() {
    using namespace std::chrono;
    const auto now = steady_clock::now();
    if (duration_cast<milliseconds>(now - g_lastLive).count() < 250) return;
    g_lastLive = now;

    std::ostringstream json;
    json << std::fixed << std::setprecision(6)
         << R"({"type":"live","data":{)"
         << R"("game":")" << escape_json(g_state.game) << R"(",)"
         << R"("x":)" << g_state.x << ','
         << R"("y":)" << g_state.y << ','
         << R"("z":)" << g_state.z << ','
         << R"("heading":)" << g_state.heading << ','
         << R"("speedKph":)" << (static_cast<double>(g_state.speedMps) * 3.6) << ','
         << R"("rpm":)" << g_state.rpm << ','
         << R"("fuel":)" << g_state.fuel << ','
         << R"("odometerKm":)" << g_state.odometerKm << ','
         << R"("navigationDistanceM":)" << g_state.navDistanceM << ','
         << R"("navigationTimeS":)" << g_state.navTimeS << ','
         << R"("speedLimitKph":)" << (static_cast<double>(g_state.speedLimitMps) * 3.6) << ','
         << R"("truckDamagePercent":)" << (std::max({g_state.wearEngine, g_state.wearTransmission, g_state.wearCabin, g_state.wearChassis, g_state.wearWheels}) * 100.0f) << ','
         << R"("trailerDamagePercent":)" << (g_state.trailerWearChassis * 100.0f) << ','
         << R"("cargoDamagePercent":)" << (g_state.cargoDamage * 100.0f) << ','
         << R"("specialJob":)" << (g_state.specialJob ? "true" : "false") << ','
         << R"("cargoLoaded":)" << (g_state.cargoLoaded ? "true" : "false") << ','
         << R"("truck":")" << escape_json(truck_display_name()) << R"(",)"
         << R"("cargo":")" << escape_json(g_state.cargo) << R"(",)"
         << R"("sourceCity":")" << escape_json(g_state.sourceCity) << R"(",)"
         << R"("destinationCity":")" << escape_json(g_state.destinationCity) << R"(",)"
         << R"("sourceCompany":")" << escape_json(g_state.sourceCompany) << R"(",)"
         << R"("destinationCompany":")" << escape_json(g_state.destinationCompany) << R"("}})";

    g_pipe.push(json.str());
}

const scs_named_value_t* find_attribute(const scs_named_value_t* attributes, const char* name) {
    if (!attributes) return nullptr;
    for (auto current = attributes; current->name; ++current) {
        if (std::strcmp(current->name, name) == 0) return current;
    }
    return nullptr;
}

std::string string_attribute(const scs_named_value_t* attributes, const char* name) {
    const auto* attr = find_attribute(attributes, name);
    if (!attr || attr->value.type != SCS_VALUE_TYPE_string || !attr->value.value_string.value) return {};
    return attr->value.value_string.value;
}

std::int64_t s64_attribute(const scs_named_value_t* attributes, const char* name, std::int64_t fallback = 0) {
    const auto* attr = find_attribute(attributes, name);
    if (!attr) return fallback;
    if (attr->value.type == SCS_VALUE_TYPE_s64) return attr->value.value_s64.value;
    if (attr->value.type == SCS_VALUE_TYPE_s32) return attr->value.value_s32.value;
    return fallback;
}

float float_attribute(const scs_named_value_t* attributes, const char* name, float fallback = 0) {
    const auto* attr = find_attribute(attributes, name);
    if (!attr) return fallback;
    if (attr->value.type == SCS_VALUE_TYPE_float) return attr->value.value_float.value;
    if (attr->value.type == SCS_VALUE_TYPE_double) return static_cast<float>(attr->value.value_double.value);
    return fallback;
}

bool bool_attribute(const scs_named_value_t* attributes, const char* name, bool fallback = false) {
    const auto* attr = find_attribute(attributes, name);
    if (!attr || attr->value.type != SCS_VALUE_TYPE_bool) return fallback;
    return attr->value.value_bool.value != 0;
}

SCSAPI_VOID on_world_placement(
    const scs_string_t,
    const scs_u32_t,
    const scs_value_t* const value,
    const scs_context_t) {
    if (!value || value->type != SCS_VALUE_TYPE_dplacement) return;
    g_state.x = value->value_dplacement.position.x;
    g_state.y = value->value_dplacement.position.y;
    g_state.z = value->value_dplacement.position.z;
    g_state.heading = value->value_dplacement.orientation.heading;
    g_state.hasPlacement = true;
}

SCSAPI_VOID on_float_channel(
    const scs_string_t,
    const scs_u32_t,
    const scs_value_t* const value,
    const scs_context_t context) {
    if (!value || !context) return;
    auto* target = static_cast<float*>(context);
    if (value->type == SCS_VALUE_TYPE_float) *target = value->value_float.value;
    else if (value->type == SCS_VALUE_TYPE_double) *target = static_cast<float>(value->value_double.value);
}

SCSAPI_VOID on_frame_end(const scs_event_t, const void* const, const scs_context_t) {
    // Free-roam has no active cargo/job configuration, but world placement is
    // still valid telemetry. Emit whenever the game has supplied a truck
    // placement so free-roam drivers remain visible on the live map.
    if (g_state.hasPlacement) emit_live();
}

SCSAPI_VOID on_driving_state(const scs_event_t event, const void* const, const scs_context_t) {
    g_state.driving = event == SCS_TELEMETRY_EVENT_started;
}

SCSAPI_VOID on_configuration(const scs_event_t, const void* const event_info, const scs_context_t) {
    if (!event_info) return;
    const auto* config = static_cast<const scs_telemetry_configuration_t*>(event_info);

    if (std::strcmp(config->id, SCS_TELEMETRY_CONFIG_truck) == 0) {
        g_state.truckBrand = string_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_brand);
        g_state.truckName = string_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_name);
        return;
    }

    if (std::strcmp(config->id, SCS_TELEMETRY_CONFIG_job) == 0) {
        g_state.cargo = string_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_cargo);
        g_state.sourceCity = string_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_source_city);
        g_state.destinationCity = string_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_destination_city);
        g_state.sourceCompany = string_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_source_company);
        g_state.destinationCompany = string_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_destination_company);
        g_state.configuredIncome = s64_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_income);
        g_state.plannedDistanceKm = float_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_planned_distance_km);
        g_state.specialJob = bool_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_special_job);
        g_state.cargoLoaded = bool_attribute(config->attributes, SCS_TELEMETRY_CONFIG_ATTRIBUTE_is_cargo_loaded);
    }
}

SCSAPI_VOID on_gameplay(const scs_event_t, const void* const event_info, const scs_context_t) {
    if (!event_info) return;
    const auto* gameplay = static_cast<const scs_telemetry_gameplay_event_t*>(event_info);

    if (std::strcmp(gameplay->id, SCS_TELEMETRY_GAMEPLAY_EVENT_player_fined) == 0) {
        const auto offence = string_attribute(gameplay->attributes, SCS_TELEMETRY_GAMEPLAY_EVENT_ATTRIBUTE_fine_offence);
        const auto amount = s64_attribute(gameplay->attributes, SCS_TELEMETRY_GAMEPLAY_EVENT_ATTRIBUTE_fine_amount);

        std::ostringstream json;
        json << R"({"type":"fine","data":{)"
             << R"("game":")" << escape_json(g_state.game) << R"(",)"
             << R"("offence":")" << escape_json(offence) << R"(",)"
             << R"("amount":)" << amount
             << R"(}})";
        g_pipe.push(json.str());
        return;
    }

    if (std::strcmp(gameplay->id, SCS_TELEMETRY_GAMEPLAY_EVENT_job_delivered) == 0) {
        const auto revenue = s64_attribute(
            gameplay->attributes,
            SCS_TELEMETRY_GAMEPLAY_EVENT_ATTRIBUTE_revenue,
            g_state.configuredIncome);
        const auto distance = float_attribute(
            gameplay->attributes,
            SCS_TELEMETRY_GAMEPLAY_EVENT_ATTRIBUTE_distance_km,
            g_state.plannedDistanceKm);

        std::ostringstream json;
        json << std::fixed << std::setprecision(2)
             << R"({"type":"job.completed","data":{)"
             << R"("game":")" << escape_json(g_state.game) << R"(",)"
             << R"("cargo":")" << escape_json(g_state.cargo) << R"(",)"
             << R"("sourceCity":")" << escape_json(g_state.sourceCity) << R"(",)"
             << R"("destinationCity":")" << escape_json(g_state.destinationCity) << R"(",)"
             << R"("sourceCompany":")" << escape_json(g_state.sourceCompany) << R"(",)"
             << R"("destinationCompany":")" << escape_json(g_state.destinationCompany) << R"(",)"
             << R"("distanceKm":)" << distance << ','
             << R"("income":)" << revenue
             << R"(}})";
        g_pipe.push(json.str());
    }
}

bool register_channel(
    const scs_telemetry_init_params_v100_t* api,
    const char* name,
    const scs_value_type_t type,
    const scs_u32_t flags,
    const scs_telemetry_channel_callback_t callback,
    const scs_context_t context) {
    return api->register_for_channel(name, SCS_U32_NIL, type, flags, callback, context) == SCS_RESULT_ok;
}

bool register_indexed_channel(
    const scs_telemetry_init_params_v100_t* api,
    const char* name,
    const scs_u32_t index,
    const scs_value_type_t type,
    const scs_u32_t flags,
    const scs_telemetry_channel_callback_t callback,
    const scs_context_t context) {
    return api->register_for_channel(name, index, type, flags, callback, context) == SCS_RESULT_ok;
}

} // namespace

extern "C" SCSAPI_RESULT scs_telemetry_init(
    const scs_u32_t version,
    const scs_telemetry_init_params_t* const params) {
    if (!params) return SCS_RESULT_invalid_parameter;
    if (version != SCS_TELEMETRY_VERSION_1_00 && version != SCS_TELEMETRY_VERSION_1_01) {
        return SCS_RESULT_unsupported;
    }

    const auto* api = static_cast<const scs_telemetry_init_params_v100_t*>(params);
    g_log = api->common.log;

    if (std::strcmp(api->common.game_id, SCS_GAME_ID_EUT2) == 0) {
        g_state.game = "ets2";
    } else if (std::strcmp(api->common.game_id, SCS_GAME_ID_ATS) == 0) {
        g_state.game = "ats";
    } else {
        g_state.game = api->common.game_id ? api->common.game_id : "unknown";
    }

    g_pipe.start();

    bool ok = true;
    ok &= api->register_for_event(SCS_TELEMETRY_EVENT_frame_end, on_frame_end, nullptr) == SCS_RESULT_ok;
    ok &= api->register_for_event(SCS_TELEMETRY_EVENT_started, on_driving_state, nullptr) == SCS_RESULT_ok;
    ok &= api->register_for_event(SCS_TELEMETRY_EVENT_paused, on_driving_state, nullptr) == SCS_RESULT_ok;
    ok &= api->register_for_event(SCS_TELEMETRY_EVENT_configuration, on_configuration, nullptr) == SCS_RESULT_ok;

    if (version >= SCS_TELEMETRY_VERSION_1_01) {
        ok &= api->register_for_event(SCS_TELEMETRY_EVENT_gameplay, on_gameplay, nullptr) == SCS_RESULT_ok;
    }

    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_world_placement, SCS_VALUE_TYPE_dplacement,
        SCS_TELEMETRY_CHANNEL_FLAG_each_frame, on_world_placement, nullptr);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_speed, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_each_frame, on_float_channel, &g_state.speedMps);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_engine_rpm, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.rpm);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_fuel, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.fuel);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_odometer, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.odometerKm);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_navigation_distance, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.navDistanceM);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_navigation_time, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.navTimeS);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_navigation_speed_limit, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.speedLimitMps);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_wear_engine, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.wearEngine);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_wear_transmission, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.wearTransmission);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_wear_cabin, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.wearCabin);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_wear_chassis, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.wearChassis);
    ok &= register_channel(api, SCS_TELEMETRY_TRUCK_CHANNEL_wear_wheels, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.wearWheels);
    ok &= register_channel(api, SCS_TELEMETRY_JOB_CHANNEL_cargo_damage, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.cargoDamage);
    ok &= register_indexed_channel(api, SCS_TELEMETRY_TRAILER_CHANNEL_wear_chassis, 0, SCS_VALUE_TYPE_float,
        SCS_TELEMETRY_CHANNEL_FLAG_none, on_float_channel, &g_state.trailerWearChassis);

    if (!ok) {
        log_message(SCS_LOG_TYPE_error, "OpenHaul: failed to register one or more telemetry callbacks.");
        g_pipe.stop();
        return SCS_RESULT_generic_error;
    }

    log_message(SCS_LOG_TYPE_message, "OpenHaul: telemetry plugin initialized.");
    return SCS_RESULT_ok;
}

extern "C" SCSAPI_VOID scs_telemetry_shutdown(void) {
    g_pipe.stop();
    log_message(SCS_LOG_TYPE_message, "OpenHaul: telemetry plugin shut down.");
}
