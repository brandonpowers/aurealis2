// Test chord detection.
// Generate chroma profiles for known chords, verify detection.

#include "Aurealis2/dsp/ChordDetector.h"
#include "Aurealis2/config.h"
#include <cstdio>
#include <cstring>
#include <cmath>

int main() {
    printf("Test Chord Detection\n");

    ChordDetector detector;
    detector.Init();

    int passed = 0;
    int total = 0;

    // Test 1: C major chord (C, E, G) = chroma bins 0, 4, 7
    {
        float chroma[12] = {};
        chroma[0] = 1.0f;  // C
        chroma[4] = 0.9f;  // E
        chroma[7] = 0.8f;  // G

        ChordResult result = detector.Process(chroma);
        printf("C major: detected '%s' (confidence %.2f)\n",
               result.GetName().c_str(), result.confidence);

        total++;
        if (result.root == 0 && result.quality == 0) {  // C major
            printf("  PASS\n");
            passed++;
        } else {
            printf("  FAIL: expected Cmaj, got root=%d quality=%d\n", result.root, result.quality);
        }
    }

    // Test 2: A minor chord (A, C, E) = chroma bins 9, 0, 4
    {
        float chroma[12] = {};
        chroma[9] = 1.0f;  // A
        chroma[0] = 0.9f;  // C
        chroma[4] = 0.8f;  // E

        ChordResult result = detector.Process(chroma);
        printf("A minor: detected '%s' (confidence %.2f)\n",
               result.GetName().c_str(), result.confidence);

        total++;
        if (result.root == 9 && result.quality == 1) {  // A minor
            printf("  PASS\n");
            passed++;
        } else {
            printf("  FAIL: expected Amin, got root=%d quality=%d\n", result.root, result.quality);
        }
    }

    // Test 3: G dominant 7th (G, B, D, F) = chroma bins 7, 11, 2, 5
    {
        float chroma[12] = {};
        chroma[7]  = 1.0f;  // G
        chroma[11] = 0.9f;  // B
        chroma[2]  = 0.8f;  // D
        chroma[5]  = 0.7f;  // F

        ChordResult result = detector.Process(chroma);
        printf("G7: detected '%s' (confidence %.2f)\n",
               result.GetName().c_str(), result.confidence);

        total++;
        if (result.root == 7 && result.quality == 2) {  // G dom7
            printf("  PASS\n");
            passed++;
        } else {
            printf("  FAIL: expected Gdom7, got root=%d quality=%d\n", result.root, result.quality);
        }
    }

    // Test 4: Silence (no chord)
    {
        float chroma[12] = {};  // All zeros

        ChordResult result = detector.Process(chroma);
        printf("Silence: detected '%s' (confidence %.2f)\n",
               result.GetName().c_str(), result.confidence);

        total++;
        if (result.index == -1) {
            printf("  PASS\n");
            passed++;
        } else {
            printf("  FAIL: expected no chord, got index=%d\n", result.index);
        }
    }

    // Test 5: F major chord (F, A, C) = chroma bins 5, 9, 0
    {
        float chroma[12] = {};
        chroma[5] = 1.0f;  // F
        chroma[9] = 0.9f;  // A
        chroma[0] = 0.8f;  // C

        ChordResult result = detector.Process(chroma);
        printf("F major: detected '%s' (confidence %.2f)\n",
               result.GetName().c_str(), result.confidence);

        total++;
        if (result.root == 5 && result.quality == 0) {  // F major
            printf("  PASS\n");
            passed++;
        } else {
            printf("  FAIL: expected Fmaj, got root=%d quality=%d\n", result.root, result.quality);
        }
    }

    printf("\n%d/%d tests passed\n", passed, total);
    return (passed == total) ? 0 : 1;
}
