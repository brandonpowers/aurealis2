#pragma once

#include "../config.h"
#include "FFTProcessor.h"
#include <vector>
#include <cmath>

// Per-bin stereo analysis: mid/side decomposition and signed stereo width.
// Outputs log-scaled mid magnitude and smoothed stereo balance per bin.
class StereoAnalyzer {
public:
    StereoAnalyzer();

    void Init(int numBins);

    // Process one FFT result into magnitude and stereo width arrays.
    // magnitudes: log-scaled 0-1 mid-channel magnitude
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
