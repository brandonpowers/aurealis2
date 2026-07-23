#pragma once

#include "../config.h"
#include <cstring>

// One complete analysis frame — produced by audio thread, consumed by UI thread.
// Fixed-size POD struct for lock-free ring buffer transport.
struct AnalysisFrame {
    float magnitudes[MAX_NUM_BINS];     // Log-scaled magnitude (0-1), mid channel
    float stereoWidth[MAX_NUM_BINS];    // -1 (full L) to +1 (full R) per bin
    float harmonicEnergy[MAX_NUM_BINS]; // 0-1 harmonic confidence per bin
    float transientEnergy;              // 0-1 global transient intensity
    float chroma[12];                   // Pitch class profile (C, Db, D, ... B)
    int   chordIndex;                   // Detected chord index (-1 = none)
    float chordConfidence;              // 0-1 confidence
    int   numBins;                      // Actual number of bins used this frame

    AnalysisFrame() { clear(); }

    void clear() {
        std::memset(magnitudes, 0, sizeof(magnitudes));
        std::memset(stereoWidth, 0, sizeof(stereoWidth));
        std::memset(harmonicEnergy, 0, sizeof(harmonicEnergy));
        transientEnergy = 0.0f;
        std::memset(chroma, 0, sizeof(chroma));
        chordIndex = -1;
        chordConfidence = 0.0f;
        numBins = DEFAULT_NUM_BINS;
    }
};
