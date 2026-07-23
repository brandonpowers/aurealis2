#pragma once

#include "../config.h"
#include <vector>

// Spectral flux onset/transient detector.
// Computes half-wave rectified difference between consecutive magnitude spectra.
// Uses adaptive EMA threshold to detect transients.
// Output: single float 0-1 representing global transient energy.
class TransientDetector {
public:
    TransientDetector();

    void Init(int numBins);

    // Process magnitude spectrum. Returns transient energy (0-1).
    float Process(const float* magnitudes, int numBins);

    void SetDecayRate(float rate) { mDecayRate = rate; }
    void SetThresholdMultiplier(float mult) { mThresholdMult = mult; }

private:
    int mNumBins = DEFAULT_NUM_BINS;
    std::vector<float> mPrevMagnitudes;  // Previous frame's magnitudes
    float mAdaptiveThreshold = 0.0f;     // EMA of spectral flux
    float mDecayRate = 0.95f;            // Threshold decay rate
    float mThresholdMult = 1.5f;         // Detection sensitivity
    bool mHasPrevFrame = false;
};
