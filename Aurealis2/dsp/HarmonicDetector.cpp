#include "HarmonicDetector.h"
#include <algorithm>
#include <cmath>

HarmonicDetector::HarmonicDetector() {
    Init(DEFAULT_NUM_BINS);
}

void HarmonicDetector::Init(int numBins) {
    mNumBins = numBins;
}

void HarmonicDetector::Process(const float* magnitudes, int numBins, float* harmonicEnergy) {
    // Harmonic Product Spectrum approach:
    // For each bin (potential fundamental), check if harmonics 2x, 3x, ... exist.
    // harmonicEnergy = geometric mean of harmonic magnitudes / fundamental magnitude.

    for (int i = 0; i < numBins; i++) {
        float fundamental = magnitudes[i];

        if (fundamental < 0.01f) {
            harmonicEnergy[i] = 0.0f;
            continue;
        }

        float harmonicProduct = 1.0f;
        int harmonicsFound = 0;

        for (int h = 2; h <= mNumHarmonics; h++) {
            int harmonicBin = i * h;
            if (harmonicBin >= numBins) break;

            float harmonicMag = magnitudes[harmonicBin];
            harmonicProduct *= (harmonicMag + 0.001f);  // Small epsilon to avoid zero
            harmonicsFound++;
        }

        if (harmonicsFound == 0) {
            harmonicEnergy[i] = 0.0f;
            continue;
        }

        // Geometric mean of harmonic magnitudes
        float geoMean = std::pow(harmonicProduct, 1.0f / harmonicsFound);

        // Ratio relative to fundamental — high ratio = harmonically rich
        float ratio = geoMean / (fundamental + 0.001f);

        // Clamp to 0-1
        harmonicEnergy[i] = std::clamp(ratio, 0.0f, 1.0f);
    }
}
