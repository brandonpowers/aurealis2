# Aurealis2 test suite

# Simple test runner (no external test framework dependency)
# Each test is a standalone executable that returns 0 on success, non-zero on failure.

add_executable(test_fft test_fft.cpp)
target_link_libraries(test_fft PRIVATE aurealis2_dsp)

add_executable(test_harmonic test_harmonic.cpp)
target_link_libraries(test_harmonic PRIVATE aurealis2_dsp)

add_executable(test_chord test_chord.cpp)
target_link_libraries(test_chord PRIVATE aurealis2_dsp)

add_executable(test_ringbuffer test_ringbuffer.cpp)
target_link_libraries(test_ringbuffer PRIVATE aurealis2_dsp)

add_executable(test_integration test_integration.cpp)
target_link_libraries(test_integration PRIVATE aurealis2_dsp)

add_test(NAME fft COMMAND test_fft)
add_test(NAME harmonic COMMAND test_harmonic)
add_test(NAME chord COMMAND test_chord)
add_test(NAME ringbuffer COMMAND test_ringbuffer)
add_test(NAME integration COMMAND test_integration)
