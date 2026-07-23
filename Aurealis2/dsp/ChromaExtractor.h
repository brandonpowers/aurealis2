#pragma once

#include "../config.h"
#include <vector>

// Extracts a 12-bin pitch class profile (chroma vector) from magnitude spectrum.
// Folds all frequency bins into one octave using log2 frequency mapping.
// Based on MIDI note number: 12 * log2(freq/440) + 69
class ChromaExtractor {
public:
    ChromaExtractor();

    void Init(int numBins, float sampleRate, int fftSize);

    // Process magnitude spectrum, write 12-element chroma vector (0-1 normalized).
    void Process(const float* magnitudes, int numBins, float* chroma);

private:
    void BuildBinToChromaMap();

    int   mNumBins = DEFAULT_NUM_BINS;
    float mSampleRate = 44100.0f;
    int   mFFTSize = DEFAULT_FFT_SIZE;

    // Precomputed mapping: for each FFT bin, which chroma bin (0-11) and weight
    struct BinMapping {
        int   chromaBin;   // 0-11 (C, Db, D, ...)
        float weight;      // Cosine weighting for bin alignment
    };
    std::vector<BinMapping> mBinMap;
};
