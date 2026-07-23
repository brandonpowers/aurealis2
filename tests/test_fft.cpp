// Test FFT correctness.
// Feed a pure 440Hz sine wave, verify peak at expected bin.

#include "Aurealis2/dsp/FFTProcessor.h"
#include "Aurealis2/config.h"
#include <cmath>
#include <cstdio>
#include <cstdlib>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static bool approxEqual(float a, float b, float tolerance = 0.01f) {
    return std::abs(a - b) < tolerance;
}

int main() {
    const float sampleRate = 44100.0f;
    const int fftSize = 4096;
    const float frequency = 440.0f;  // A4
    const int expectedBin = static_cast<int>(std::round(frequency * fftSize / sampleRate));

    printf("Test FFT: %dHz sine at %.0f SR, fftSize=%d\n", (int)frequency, sampleRate, fftSize);
    printf("Expected peak at bin %d\n", expectedBin);

    FFTProcessor fft;
    fft.Init(fftSize, sampleRate);

    // Generate stereo sine wave (mono, same on both channels)
    const int numSamples = fftSize * 2;  // Enough for at least one frame + hop
    std::vector<float> left(numSamples), right(numSamples);

    for (int i = 0; i < numSamples; i++) {
        float sample = std::sin(2.0f * static_cast<float>(M_PI) * frequency * i / sampleRate);
        left[i] = sample;
        right[i] = sample;
    }

    fft.PushSamples(left.data(), right.data(), numSamples);

    if (!fft.HasFrame()) {
        printf("FAIL: No FFT frame produced after %d samples\n", numSamples);
        return 1;
    }

    FFTResult result = fft.PopFrame();
    printf("Got FFT frame: %d bins\n", result.numBins);

    // Find peak bin
    float maxMag = 0;
    int peakBin = 0;
    for (int i = 0; i < result.numBins; i++) {
        float mag = std::abs(result.left[i]);
        if (mag > maxMag) {
            maxMag = mag;
            peakBin = i;
        }
    }

    printf("Peak bin: %d (expected %d), magnitude: %.2f\n", peakBin, expectedBin, maxMag);

    // Allow ±1 bin tolerance
    if (std::abs(peakBin - expectedBin) > 1) {
        printf("FAIL: Peak bin %d too far from expected %d\n", peakBin, expectedBin);
        return 1;
    }

    // Verify peak magnitude is significantly above noise
    float avgMag = 0;
    for (int i = 0; i < result.numBins; i++) {
        if (std::abs(i - peakBin) > 5) {  // Skip bins near peak
            avgMag += std::abs(result.left[i]);
        }
    }
    avgMag /= (result.numBins - 10);

    float snr = maxMag / (avgMag + 1e-10f);
    printf("SNR: %.1f (peak/avg noise)\n", snr);

    if (snr < 10.0f) {
        printf("FAIL: SNR too low (%.1f), expected > 10\n", snr);
        return 1;
    }

    // Verify right channel matches left
    float rPeak = 0;
    int rBin = 0;
    for (int i = 0; i < result.numBins; i++) {
        float mag = std::abs(result.right[i]);
        if (mag > rPeak) {
            rPeak = mag;
            rBin = i;
        }
    }

    if (rBin != peakBin) {
        printf("FAIL: Right channel peak (%d) differs from left (%d)\n", rBin, peakBin);
        return 1;
    }

    printf("PASS: FFT correctly identifies 440Hz at bin %d, SNR=%.1f\n", peakBin, snr);
    return 0;
}
