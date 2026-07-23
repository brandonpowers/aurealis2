#include "ChordDetector.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <sstream>

// Base interval patterns (semitones from root) for each chord quality
static const std::vector<std::vector<int>> CHORD_INTERVALS = {
    {0, 4, 7},       // major
    {0, 3, 7},       // minor
    {0, 4, 7, 10},   // dom7
    {0, 3, 7, 10},   // min7
    {0, 4, 7, 11},   // maj7
    {0, 3, 6},       // dim
    {0, 4, 8},       // aug
    {0, 5, 7},       // sus4
    {0, 2, 7},       // sus2
};

ChordDetector::ChordDetector() {
    Init();
}

void ChordDetector::Init() {
    BuildTemplates();
}

void ChordDetector::BuildTemplates() {
    mTemplates.clear();

    int numQualities = static_cast<int>(CHORD_INTERVALS.size());

    for (int root = 0; root < 12; root++) {
        for (int q = 0; q < numQualities; q++) {
            ChordTemplate tmpl;
            std::memset(tmpl.pattern, 0, sizeof(tmpl.pattern));
            tmpl.root = root;
            tmpl.quality = q;

            for (int interval : CHORD_INTERVALS[q]) {
                int note = (root + interval) % 12;
                tmpl.pattern[note] = 1.0f;
            }

            mTemplates.push_back(tmpl);
        }
    }
}

ChordResult ChordDetector::Process(const float* chroma) {
    ChordResult best;
    best.index = -1;
    best.confidence = 0.0f;
    best.root = -1;
    best.quality = -1;

    // Check if there's enough energy to detect a chord
    float totalEnergy = 0.0f;
    for (int i = 0; i < 12; i++) {
        totalEnergy += chroma[i];
    }
    if (totalEnergy < 0.1f) {
        return best;  // Too quiet, no chord
    }

    // Normalize chroma for dot product comparison
    float chromaNorm[12];
    float normFactor = 0.0f;
    for (int i = 0; i < 12; i++) {
        normFactor += chroma[i] * chroma[i];
    }
    normFactor = std::sqrt(normFactor);
    if (normFactor < 1e-8f) return best;

    for (int i = 0; i < 12; i++) {
        chromaNorm[i] = chroma[i] / normFactor;
    }

    // Find best matching template via cosine similarity
    for (size_t t = 0; t < mTemplates.size(); t++) {
        const auto& tmpl = mTemplates[t];

        // Template norm (precomputable, but templates are binary so it's sqrt(numNotes))
        float tmplNorm = 0.0f;
        for (int i = 0; i < 12; i++) {
            tmplNorm += tmpl.pattern[i] * tmpl.pattern[i];
        }
        tmplNorm = std::sqrt(tmplNorm);

        // Dot product
        float dot = 0.0f;
        for (int i = 0; i < 12; i++) {
            dot += chromaNorm[i] * (tmpl.pattern[i] / tmplNorm);
        }

        if (dot > best.confidence) {
            best.confidence = dot;
            best.index = static_cast<int>(t);
            best.root = tmpl.root;
            best.quality = tmpl.quality;
        }
    }

    // Apply minimum confidence threshold
    if (best.confidence < mMinConfidence) {
        best.index = -1;
        best.root = -1;
        best.quality = -1;
        best.confidence = 0.0f;
    }

    return best;
}

std::string ChordResult::GetName() const {
    if (index < 0 || root < 0) return "";

    std::ostringstream ss;
    ss << NOTE_NAMES[root];

    int numQualities = static_cast<int>(CHORD_INTERVALS.size());
    if (quality >= 0 && quality < numQualities) {
        ss << CHORD_QUALITIES[quality];
    }

    return ss.str();
}

std::string ChordDetector::ChordName(int index) {
    if (index < 0) return "";

    int numQualities = static_cast<int>(CHORD_INTERVALS.size());
    int root = index / numQualities;
    int quality = index % numQualities;

    if (root < 0 || root >= 12 || quality < 0 || quality >= numQualities) return "";

    std::ostringstream ss;
    ss << NOTE_NAMES[root] << CHORD_QUALITIES[quality];
    return ss.str();
}
