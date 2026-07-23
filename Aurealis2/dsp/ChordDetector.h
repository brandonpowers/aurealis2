#pragma once

#include "../config.h"
#include <vector>
#include <string>

// Template-matching chord detector.
// Compares 12-bin chroma vector against chord templates (major, minor, dom7, etc.)
// for all 12 root notes (= 108+ templates).
// Returns best matching chord index and confidence.
struct ChordResult {
    int   index;       // Chord index (root * numQualities + quality), -1 if none
    float confidence;  // 0-1 match confidence
    int   root;        // Root note (0=C, 1=Db, ... 11=B)
    int   quality;     // Quality index (0=maj, 1=min, 2=dom7, ...)

    std::string GetName() const;
};

class ChordDetector {
public:
    ChordDetector();

    void Init();

    // Process chroma vector (12 floats), return detected chord.
    ChordResult Process(const float* chroma);

    // Get chord name from index
    static std::string ChordName(int index);

private:
    void BuildTemplates();

    // Chord template: 12-element binary/weighted vector
    struct ChordTemplate {
        float pattern[12];
        int   root;
        int   quality;
    };

    std::vector<ChordTemplate> mTemplates;
    float mMinConfidence = 0.6f;  // Minimum confidence to report a chord
};
