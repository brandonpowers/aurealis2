#include "ChromaExtractor.h"
#include <algorithm>
#include <cmath>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

ChromaExtractor::ChromaExtractor() {
    Init(DEFAULT_NUM_BINS, 44100.0f, DEFAULT_FFT_SIZE);
}

void ChromaExtractor::Init(int numBins, float sampleRate, int fftSize) {
    mNumBins = numBins;
    mSampleRate = sampleRate;
    mFFTSize = fftSize;
    BuildBinToChromaMap();
}

void ChromaExtractor::BuildBinToChromaMap() {
    mBinMap.resize(mNumBins);

    float binFreqStep = mSampleRate / static_cast<float>(mFFTSize);

    for (int i = 0; i < mNumBins; i++) {
        float freq = (i + 1) * binFreqStep;  // Skip bin 0 (DC)

        if (freq < FREQ_MIN || freq > FREQ_MAX) {
            mBinMap[i] = {-1, 0.0f};  // Out of musical range
            continue;
        }

        // MIDI note number (continuous, not rounded)
        float midiNote = 12.0f * std::log2(freq / FREQ_REF) + 69.0f;

        // Fractional chroma position
        float chromaPos = std::fmod(midiNote, 12.0f);
        if (chromaPos < 0.0f) chromaPos += 12.0f;

        int chromaBin = static_cast<int>(std::round(chromaPos)) % 12;

        // Cosine weighting: bins closer to the exact pitch class get higher weight
        float distance = chromaPos - std::round(chromaPos);
        float weight = std::cos(distance * static_cast<float>(M_PI));  // 1.0 at center, 0 at ±0.5

        mBinMap[i] = {chromaBin, std::max(0.0f, weight)};
    }
}

void ChromaExtractor::Process(const float* magnitudes, int numBins, float* chroma) {
    std::memset(chroma, 0, 12 * sizeof(float));
    float totalEnergy = 0.0f;

    int bins = std::min(numBins, mNumBins);

    for (int i = 0; i < bins; i++) {
        if (mBinMap[i].chromaBin < 0) continue;

        float energy = magnitudes[i] * magnitudes[i] * mBinMap[i].weight;
        chroma[mBinMap[i].chromaBin] += energy;
        totalEnergy += energy;
    }

    // Normalize to 0-1
    if (totalEnergy > 1e-8f) {
        float maxChroma = 0.0f;
        for (int i = 0; i < 12; i++) {
            maxChroma = std::max(maxChroma, chroma[i]);
        }
        if (maxChroma > 0.0f) {
            for (int i = 0; i < 12; i++) {
                chroma[i] /= maxChroma;
            }
        }
    }
}
