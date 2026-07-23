// Integration test: full pipeline from audio samples through to analysis frames.
// Tests Aurealis2::ProcessAudio end-to-end.

#include "Aurealis2/Aurealis2.h"
#include "Aurealis2/config.h"
#include <cmath>
#include <cstdio>
#include <vector>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

int main() {
    printf("Test Integration: Full Pipeline\n");

    int passed = 0;
    int total = 0;

    Aurealis2 plugin;
    plugin.Reset(44100.0f, 512);

    const float sampleRate = 44100.0f;
    const int fftSize = DEFAULT_FFT_SIZE;
    const int blockSize = 512;

    // Test 1: Audio pass-through
    {
        total++;
        std::vector<float> inL(blockSize), inR(blockSize), outL(blockSize), outR(blockSize);
        for (int i = 0; i < blockSize; i++) {
            inL[i] = static_cast<float>(i) / blockSize;
            inR[i] = static_cast<float>(blockSize - i) / blockSize;
        }

        plugin.ProcessAudio(inL.data(), inR.data(), outL.data(), outR.data(), blockSize);

        bool passThrough = true;
        for (int i = 0; i < blockSize; i++) {
            if (outL[i] != inL[i] || outR[i] != inR[i]) {
                passThrough = false;
                printf("FAIL: Pass-through mismatch at sample %d\n", i);
                break;
            }
        }
        if (passThrough) {
            printf("PASS: Audio pass-through (no modification)\n");
            passed++;
        }
    }

    // Test 2: Process enough audio to generate analysis frames
    {
        total++;
        Aurealis2 plugin2;
        plugin2.Reset(44100.0f, blockSize);

        // Generate a 440Hz stereo sine wave, process in blocks
        const int totalSamples = fftSize * 3;  // Enough for multiple FFT frames
        std::vector<float> fullL(totalSamples), fullR(totalSamples);
        for (int i = 0; i < totalSamples; i++) {
            float s = std::sin(2.0f * static_cast<float>(M_PI) * 440.0f * i / sampleRate) * 0.5f;
            fullL[i] = s;
            fullR[i] = s;
        }

        // Process in block-sized chunks
        std::vector<float> outL(blockSize), outR(blockSize);
        for (int offset = 0; offset + blockSize <= totalSamples; offset += blockSize) {
            plugin2.ProcessAudio(fullL.data() + offset, fullR.data() + offset,
                                outL.data(), outR.data(), blockSize);
        }

        // Check ring buffer has frames
        size_t available = plugin2.GetAnalysisBuffer().Available();
        printf("Analysis frames available: %zu\n", available);

        if (available > 0) {
            printf("PASS: Analysis pipeline produced %zu frames\n", available);
            passed++;
        } else {
            printf("FAIL: No analysis frames produced\n");
        }
    }

    // Test 3: Verify analysis frame content (mono 440Hz)
    {
        total++;
        Aurealis2 plugin3;
        plugin3.Reset(44100.0f, blockSize);

        const int totalSamples = fftSize * 3;
        std::vector<float> fullL(totalSamples), fullR(totalSamples);
        for (int i = 0; i < totalSamples; i++) {
            float s = std::sin(2.0f * static_cast<float>(M_PI) * 440.0f * i / sampleRate) * 0.5f;
            fullL[i] = s;
            fullR[i] = s;
        }

        std::vector<float> outL(blockSize), outR(blockSize);
        for (int offset = 0; offset + blockSize <= totalSamples; offset += blockSize) {
            plugin3.ProcessAudio(fullL.data() + offset, fullR.data() + offset,
                                outL.data(), outR.data(), blockSize);
        }

        // Drain to the last frame (most steady-state)
        AnalysisFrame frame;
        bool gotFrame = false;
        while (plugin3.GetAnalysisBuffer().Pop(frame)) {
            gotFrame = true;
        }

        if (!gotFrame) {
            printf("FAIL: Could not pop analysis frame\n");
        } else {
            // Find peak bin
            int peakBin = 0;
            float peakMag = 0;
            for (int i = 0; i < frame.numBins; i++) {
                if (frame.magnitudes[i] > peakMag) {
                    peakMag = frame.magnitudes[i];
                    peakBin = i;
                }
            }

            int expectedBin = static_cast<int>(std::round(440.0f * fftSize / sampleRate));
            printf("Peak bin: %d (expected ~%d), magnitude: %.3f\n", peakBin, expectedBin, peakMag);

            // Stereo width should be near 0 (mono signal)
            float avgWidth = 0;
            for (int i = 0; i < frame.numBins; i++) {
                avgWidth += std::abs(frame.stereoWidth[i]);
            }
            avgWidth /= frame.numBins;
            printf("Average stereo width: %.4f (expected ~0 for mono)\n", avgWidth);

            // Allow ±5 bin tolerance since magnitude smoothing shifts peak slightly
            if (std::abs(peakBin - expectedBin) <= 5 && peakMag > 0.05f && avgWidth < 0.15f) {
                printf("PASS: Analysis frame content correct\n");
                passed++;
            } else {
                printf("FAIL: Analysis frame content unexpected\n");
            }
        }
    }

    // Test 4: Stereo signal produces non-zero stereo width
    {
        total++;
        Aurealis2 plugin4;
        plugin4.Reset(44100.0f, blockSize);

        const int totalSamples = fftSize * 3;
        std::vector<float> fullL(totalSamples), fullR(totalSamples);
        for (int i = 0; i < totalSamples; i++) {
            float s = std::sin(2.0f * static_cast<float>(M_PI) * 440.0f * i / sampleRate);
            fullL[i] = s * 0.8f;  // Louder on left
            fullR[i] = s * 0.2f;  // Quieter on right
        }

        std::vector<float> outL(blockSize), outR(blockSize);
        for (int offset = 0; offset + blockSize <= totalSamples; offset += blockSize) {
            plugin4.ProcessAudio(fullL.data() + offset, fullR.data() + offset,
                                outL.data(), outR.data(), blockSize);
        }

        AnalysisFrame frame;
        if (plugin4.GetAnalysisBuffer().Pop(frame)) {
            int peakBin = 0;
            float peakMag = 0;
            for (int i = 0; i < frame.numBins; i++) {
                if (frame.magnitudes[i] > peakMag) {
                    peakMag = frame.magnitudes[i];
                    peakBin = i;
                }
            }

            float width = frame.stereoWidth[peakBin];
            printf("Stereo width at peak (bin %d): %.3f (expected < 0, biased left)\n", peakBin, width);

            if (width < -0.1f) {
                printf("PASS: Stereo signal detected correctly (width=%.3f)\n", width);
                passed++;
            } else {
                printf("FAIL: Stereo width not detected (%.3f)\n", width);
            }
        } else {
            printf("FAIL: No frame for stereo test\n");
        }
    }

    // Test 5: Parameter setting
    {
        total++;
        plugin.SetColorTune(0.7f);
        plugin.SetSensitivity(2.5f);
        plugin.SetStereoSpread(3.0f);

        if (plugin.GetColorTune() == 0.7f &&
            plugin.GetSensitivity() == 2.5f &&
            plugin.GetStereoSpread() == 3.0f) {
            printf("PASS: Parameter getters/setters work\n");
            passed++;
        } else {
            printf("FAIL: Parameter mismatch\n");
        }
    }

    printf("\n%d/%d tests passed\n", passed, total);
    return (passed == total) ? 0 : 1;
}
