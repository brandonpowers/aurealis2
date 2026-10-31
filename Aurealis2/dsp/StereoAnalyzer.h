#pragma once

#include "../config.h"
#include "FFTProcessor.h"
#include <vector>
#include <cmath>

// Per-bin stereo analysis: mid/side decomposition and signed stereo width.
// Outputs log-scaled mid magnitude and smoothed stereo balance per bin.
class StereoAnalyzer {
public:
    // Visible dynamic range: magnitudes at or below DB_FLOOR map to 0.
    // Keep in sync with DB_FLOOR / WIDTH_GATE_MAG in resources/web/js/analysis.js.
    static constexpr float DB_FLOOR = -70.0f;
    static constexpr float WIDTH_GATE_MAG = 0.2f;

    StereoAnalyzer();

    void Init(int numBins);

    // Process one FFT result into magnitude and stereo width arrays.
    // magnitudes: 0-1 mid-channel magnitude, linear in dB over DB_FLOOR..0 dB (|X|/N)
    // stereoWidth: -1 (full L) to +1 (full R) per bin
    void Process(const FFTResult& fft, float* magnitudes, float* stereoWidth);

    void SetSmoothingFactor(float alpha) { mSmoothingAlpha = alpha; }

private:
    float LogScale(float linearMag) const;

    int mNumBins = DEFAULT_NUM_BINS;
    float mSmoothingAlpha = 0.3f;  // EMA smoothing for stereo width
    std::vector<float> mPrevWidth;  // Previous frame's stereo width (for smoothing)
    std::vector<float> mPrevMag;    // Previous frame's magnitude (for smoothing)
};
