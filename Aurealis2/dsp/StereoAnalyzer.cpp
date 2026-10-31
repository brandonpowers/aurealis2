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
    const float fftNorm = 1.0f / static_cast<float>(2 * fft.numBins);  // 1 / fftSize

    // Resize smoothing buffers if needed
    if (static_cast<int>(mPrevWidth.size()) < numBins) {
        mPrevWidth.resize(numBins, 0.0f);
        mPrevMag.resize(numBins, 0.0f);
    }

    for (int i = 0; i < numBins; i++) {
        float lMag = std::abs(fft.left[i]);
        float rMag = std::abs(fft.right[i]);

        // Mid magnitude (average of L and R), normalised by FFT size so it matches
        // the Web Audio convention (|X| / N), then log-scaled to 0-1
        float midMag = (lMag + rMag) * 0.5f * fftNorm;
        float logMag = LogScale(midMag);

        // Smooth magnitude with EMA
        logMag = mSmoothingAlpha * logMag + (1.0f - mSmoothingAlpha) * mPrevMag[i];
        mPrevMag[i] = logMag;
        magnitudes[i] = logMag;

        // Signed stereo balance: -1 full left, 0 center, +1 full right
        float sum = rMag + lMag + 1e-10f;  // Avoid division by zero
        float balance = (rMag - lMag) / sum;
        balance = std::copysign(std::sqrt(std::abs(balance)), balance);

        // Gate by magnitude: noise-floor bins have random balance, keep them centred
        balance *= std::clamp(logMag / WIDTH_GATE_MAG, 0.0f, 1.0f);

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
    // Convert |X|/N magnitude to dB, then map DB_FLOOR..0 dB to 0..1
    // (same mapping as resources/web/js/analysis.js dbToMagnitude)
    if (linearMag <= 0.0f) return 0.0f;

    float db = 20.0f * std::log10(linearMag);
    float normalized = (db - DB_FLOOR) / (0.0f - DB_FLOOR);
    return std::clamp(normalized, 0.0f, 1.0f);
}
