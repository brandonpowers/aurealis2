#include "StereoAnalyzer.h"
#include <algorithm>

StereoAnalyzer::StereoAnalyzer() {
    Init(DEFAULT_NUM_BINS);
}

void StereoAnalyzer::Init(int numBins) {
    mNumBins = numBins;
    mPrevWidth.assign(numBins, 0.0f);
    mPrevMag.assign(numBins, 0.0f);
}

void StereoAnalyzer::Process(const FFTResult& fft, float* magnitudes, float* stereoWidth) {
    int numBins = std::min(mNumBins, fft.numBins);

    // Resize smoothing buffers if needed
    if (static_cast<int>(mPrevWidth.size()) < numBins) {
        mPrevWidth.resize(numBins, 0.0f);
        mPrevMag.resize(numBins, 0.0f);
    }

    for (int i = 0; i < numBins; i++) {
        float lMag = std::abs(fft.left[i]);
        float rMag = std::abs(fft.right[i]);

        // Mid magnitude (average of L and R), log-scaled to 0-1
        float midMag = (lMag + rMag) * 0.5f;
        float logMag = LogScale(midMag);

        // Smooth magnitude with EMA
        logMag = mSmoothingAlpha * logMag + (1.0f - mSmoothingAlpha) * mPrevMag[i];
        mPrevMag[i] = logMag;
        magnitudes[i] = logMag;

        // Signed stereo balance: -1 full left, 0 center, +1 full right
        float sum = rMag + lMag + 1e-10f;  // Avoid division by zero
        float balance = (rMag - lMag) / sum;
        balance = std::copysign(std::sqrt(std::abs(balance)), balance);

        // Smooth stereo width with EMA
        balance = mSmoothingAlpha * balance + (1.0f - mSmoothingAlpha) * mPrevWidth[i];
        mPrevWidth[i] = balance;
        stereoWidth[i] = balance;
    }

    // Zero remaining bins
    for (int i = numBins; i < mNumBins; i++) {
        magnitudes[i] = 0.0f;
        stereoWidth[i] = 0.0f;
    }
}

float StereoAnalyzer::LogScale(float linearMag) const {
    // Convert linear magnitude to log scale (dB-like), normalized to 0-1
    // -80 dB floor, 0 dB ceiling
    if (linearMag < 1e-6f) return 0.0f;

    float db = 20.0f * std::log10(linearMag);
    float normalized = (db + 80.0f) / 80.0f;  // Map -80..0 dB to 0..1
    return std::clamp(normalized, 0.0f, 1.0f);
}
