#include "TransientDetector.h"
#include <algorithm>
#include <cmath>

TransientDetector::TransientDetector() {
    Init(DEFAULT_NUM_BINS);
}

void TransientDetector::Init(int numBins) {
    mNumBins = numBins;
    mPrevMagnitudes.assign(numBins, 0.0f);
    mAdaptiveThreshold = 0.0f;
    mHasPrevFrame = false;
}

float TransientDetector::Process(const float* magnitudes, int numBins) {
    if (!mHasPrevFrame) {
        // Store first frame, no transient possible yet
        for (int i = 0; i < numBins && i < mNumBins; i++) {
            mPrevMagnitudes[i] = magnitudes[i];
        }
        mHasPrevFrame = true;
        return 0.0f;
    }

    // Spectral flux: sum of half-wave rectified differences
    float flux = 0.0f;
    int bins = std::min(numBins, mNumBins);

    for (int i = 0; i < bins; i++) {
        float diff = magnitudes[i] - mPrevMagnitudes[i];
        // Half-wave rectification: only count increases (onsets)
        if (diff > 0.0f) {
            flux += diff * diff;  // Squared for emphasis on large changes
        }
        mPrevMagnitudes[i] = magnitudes[i];
    }

    // Normalize by number of bins
    flux /= static_cast<float>(bins);

    // Adaptive threshold via EMA
    mAdaptiveThreshold = mDecayRate * mAdaptiveThreshold + (1.0f - mDecayRate) * flux;

    // Transient energy: how much flux exceeds the adaptive threshold
    float transient = 0.0f;
    if (flux > mAdaptiveThreshold * mThresholdMult) {
        transient = (flux - mAdaptiveThreshold) / (flux + 0.001f);
    }

    return std::clamp(transient, 0.0f, 1.0f);
}
