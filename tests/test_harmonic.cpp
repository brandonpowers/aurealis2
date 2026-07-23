// Test harmonic detection.
// Generate a sawtooth wave (rich harmonics), verify harmonic energy at fundamental.
// Compare with a pure sine wave (no harmonics).

#include "Aurealis2/dsp/FFTProcessor.h"
#include "Aurealis2/dsp/StereoAnalyzer.h"
#include "Aurealis2/dsp/HarmonicDetector.h"
#include "Aurealis2/config.h"
#include <cmath>
#include <cstdio>
#include <vector>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Generate a sawtooth wave (sum of harmonics: sin(f) + sin(2f)/2 + sin(3f)/3 + ...)
static void generateSawtooth(float* buffer, int numSamples, float freq, float sampleRate, int numHarmonics = 10) {
    for (int i = 0; i < numSamples; i++) {
        float sample = 0.0f;
        for (int h = 1; h <= numHarmonics; h++) {
            sample += std::sin(2.0f * static_cast<float>(M_PI) * freq * h * i / sampleRate) / h;
        }
        buffer[i] = sample * 0.5f;  // Scale down
    }
}

static void generateSine(float* buffer, int numSamples, float freq, float sampleRate) {
    for (int i = 0; i < numSamples; i++) {
        buffer[i] = std::sin(2.0f * static_cast<float>(M_PI) * freq * i / sampleRate) * 0.5f;
    }
}

int main() {
    const float sampleRate = 44100.0f;
    const int fftSize = 4096;
    const float freq = 220.0f;  // A3
    const int numSamples = fftSize * 2;
    const int numBins = fftSize / 2;

    printf("Test Harmonic Detection: %.0f Hz\n", freq);

    FFTProcessor fftProc;
    StereoAnalyzer stereo;
    HarmonicDetector harmonic;

    fftProc.Init(fftSize, sampleRate);
    stereo.Init(numBins);
    harmonic.Init(numBins);

    // --- Test 1: Sawtooth (should have high harmonic energy) ---
    std::vector<float> sawBuf(numSamples);
    generateSawtooth(sawBuf.data(), numSamples, freq, sampleRate);

    fftProc.PushSamples(sawBuf.data(), sawBuf.data(), numSamples);

    if (!fftProc.HasFrame()) {
        printf("FAIL: No frame from sawtooth\n");
        return 1;
    }

    FFTResult sawFFT = fftProc.PopFrame();
    std::vector<float> sawMag(numBins), sawWidth(numBins), sawHarm(numBins);
    stereo.Process(sawFFT, sawMag.data(), sawWidth.data());
    harmonic.Process(sawMag.data(), numBins, sawHarm.data());

    int fundamentalBin = static_cast<int>(std::round(freq * fftSize / sampleRate));
    float sawHarmonicEnergy = sawHarm[fundamentalBin];
    printf("Sawtooth harmonic energy at fundamental (bin %d): %.4f\n", fundamentalBin, sawHarmonicEnergy);

    // --- Test 2: Pure sine (should have low harmonic energy) ---
    FFTProcessor fftProc2;
    StereoAnalyzer stereo2;
    HarmonicDetector harmonic2;
    fftProc2.Init(fftSize, sampleRate);
    stereo2.Init(numBins);
    harmonic2.Init(numBins);

    std::vector<float> sineBuf(numSamples);
    generateSine(sineBuf.data(), numSamples, freq, sampleRate);

    fftProc2.PushSamples(sineBuf.data(), sineBuf.data(), numSamples);

    if (!fftProc2.HasFrame()) {
        printf("FAIL: No frame from sine\n");
        return 1;
    }

    FFTResult sineFFT = fftProc2.PopFrame();
    std::vector<float> sineMag(numBins), sineWidth(numBins), sineHarm(numBins);
    stereo2.Process(sineFFT, sineMag.data(), sineWidth.data());
    harmonic2.Process(sineMag.data(), numBins, sineHarm.data());

    float sineHarmonicEnergy = sineHarm[fundamentalBin];
    printf("Sine harmonic energy at fundamental (bin %d): %.4f\n", fundamentalBin, sineHarmonicEnergy);

    // Sawtooth should have higher harmonic energy than sine
    if (sawHarmonicEnergy <= sineHarmonicEnergy) {
        printf("FAIL: Sawtooth harmonic energy (%.4f) should exceed sine (%.4f)\n",
               sawHarmonicEnergy, sineHarmonicEnergy);
        return 1;
    }

    printf("PASS: Sawtooth harmonics (%.4f) > sine harmonics (%.4f)\n",
           sawHarmonicEnergy, sineHarmonicEnergy);
    return 0;
}
