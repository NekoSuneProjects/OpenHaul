cmake_minimum_required(VERSION 3.24)
project(OpenHaulTelemetry LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "OpenHaul SCS telemetry plugin currently targets Windows.")
endif()

if(NOT DEFINED SCS_SDK_INCLUDE)
  message(FATAL_ERROR "Set SCS_SDK_INCLUDE to the official SCS Telemetry SDK include directory.")
endif()

add_library(OpenHaulTelemetry SHARED
  src/OpenHaulTelemetry.cpp
  src/OpenHaulTelemetry.def
)

target_compile_features(OpenHaulTelemetry PRIVATE cxx_std_20)
target_compile_definitions(OpenHaulTelemetry PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
target_include_directories(OpenHaulTelemetry PRIVATE "\${SCS_SDK_INCLUDE}")

set_target_properties(OpenHaulTelemetry PROPERTIES
  OUTPUT_NAME "OpenHaul.Telemetry"
  PREFIX ""
)

if(MSVC)
  target_compile_options(OpenHaulTelemetry PRIVATE /W4 /EHsc /utf-8)
endif()
