cmake_minimum_required(VERSION 3.16)
project(Aurealis2 VERSION 1.0.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# iPlug2 submodule path
set(IPLUG2_DIR ${CMAKE_CURRENT_SOURCE_DIR}/libs/iPlug2)

# Check if iPlug2 exists; if not, we build in standalone/web mode
if(EXISTS ${IPLUG2_DIR}/CMakeLists.txt)
  set(HAS_IPLUG2 TRUE)
  message(STATUS "iPlug2 found at ${IPLUG2_DIR}")
else()
  set(HAS_IPLUG2 FALSE)
  message(STATUS "iPlug2 not found — building DSP library only (for testing/web)")
endif()

# Options
option(AUREALIS2_BUILD_TESTS "Build unit tests" ON)
option(AUREALIS2_BUILD_VST3 "Build VST3 plugin" ${HAS_IPLUG2})
option(AUREALIS2_BUILD_AU "Build Audio Unit plugin" OFF)
option(AUREALIS2_BUILD_CLAP "Build CLAP plugin" OFF)
option(AUREALIS2_BUILD_WEB "Build WebAssembly module" OFF)

# FFTW3 — use system install or bundled
find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
  pkg_check_modules(FFTW3F IMPORTED_TARGET fftw3f)
endif()

if(NOT FFTW3F_FOUND)
  find_library(FFTW3F_LIB NAMES fftw3f)
  find_path(FFTW3F_INCLUDE NAMES fftw3.h)
  if(FFTW3F_LIB AND FFTW3F_INCLUDE)
    set(FFTW3F_FOUND TRUE)
  endif()
endif()

if(NOT FFTW3F_FOUND)
  message(WARNING "FFTW3F not found — using built-in DFT (kiss_fft fallback)")
  set(USE_KISS_FFT TRUE)
else()
  set(USE_KISS_FFT FALSE)
  message(STATUS "FFTW3F found")
endif()

add_subdirectory(Aurealis2)

if(AUREALIS2_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
