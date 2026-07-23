#pragma once

#include "../config.h"
#include <vector>

// Harmonic Product Spectrum — detects harmonic content per frequency bin.
// For each bin, checks for energy at 2x, 3x, 4x, 5x harmonic frequencies.
// Output: per-bin harmonic energy (0-1), where 1 = strong harmonic content.
class HarmonicDetector {
public:
    HarmonicDetector();

    void Init(int numBins);

    // Process magnitude spectrum, write harmonic energy per bin.
    void Process(const float* magnitudes, int numBins, float* harmonicEnergy);

    void SetNumHarmonics(int n) { mNumHarmonics = n; }

private:
    int mNumBins = DEFAULT_NUM_BINS;
    int mNumHarmonics = 5;  // Check up to 5th harmonic
};
