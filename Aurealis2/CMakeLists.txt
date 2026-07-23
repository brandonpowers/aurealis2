# Aurealis2 plugin CMake configuration

set(AUREALIS2_SRC
    Aurealis2.cpp
    dsp/FFTProcessor.cpp
    dsp/StereoAnalyzer.cpp
    dsp/HarmonicDetector.cpp
    dsp/TransientDetector.cpp
    dsp/ChromaExtractor.cpp
    dsp/ChordDetector.cpp
)

set(AUREALIS2_HEADERS
    Aurealis2.h
    config.h
    dsp/AnalysisFrame.h
    dsp/AnalysisRingBuffer.h
    dsp/FFTProcessor.h
    dsp/StereoAnalyzer.h
    dsp/HarmonicDetector.h
    dsp/TransientDetector.h
    dsp/ChromaExtractor.h
    dsp/ChordDetector.h
)

# DSP-only static library (used by tests and web build)
add_library(aurealis2_dsp STATIC ${AUREALIS2_SRC} ${AUREALIS2_HEADERS})
target_include_directories(aurealis2_dsp PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/..
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/dsp
)
target_compile_features(aurealis2_dsp PUBLIC cxx_std_17)

# Link FFTW if available
if(NOT USE_KISS_FFT AND FFTW3F_FOUND)
    if(TARGET PkgConfig::FFTW3F)
        target_link_libraries(aurealis2_dsp PUBLIC PkgConfig::FFTW3F)
    else()
        target_include_directories(aurealis2_dsp PUBLIC ${FFTW3F_INCLUDE})
        target_link_libraries(aurealis2_dsp PUBLIC ${FFTW3F_LIB})
    endif()
    target_compile_definitions(aurealis2_dsp PUBLIC USE_FFTW=1)
endif()

# VST3 plugin target (requires iPlug2)
if(AUREALIS2_BUILD_VST3 AND HAS_IPLUG2)
    message(STATUS "Building Aurealis2 VST3 plugin")
    # iPlug2 integration would go here — depends on iPlug2's CMake setup
    # For now, this is a placeholder for when iPlug2 submodule is added
    # add_iplug2_plugin(aurealis2_vst3 VST3 SOURCES ${AUREALIS2_SRC})
endif()

# WebAssembly target
if(AUREALIS2_BUILD_WEB)
    message(STATUS "Building Aurealis2 WebAssembly module")
    add_executable(aurealis2_wasm ${AUREALIS2_SRC})
    target_include_directories(aurealis2_wasm PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
    target_compile_features(aurealis2_wasm PRIVATE cxx_std_17)
    set_target_properties(aurealis2_wasm PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "--bind -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_NAME='Aurealis2DSP'"
    )
endif()

# Install web resources alongside plugin
set(AUREALIS2_WEB_RESOURCES_DIR ${CMAKE_CURRENT_SOURCE_DIR}/resources/web)
